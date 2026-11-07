import { Service } from '@deepseek-ai/cordis';
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WorkbenchStore } from './store.mjs';
import { extractDocument, reportDocx } from './documents.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

export const name = 'enterprise-workbench';
export const inject = ['typert'];
export function apply(ctx) {
  // Node's bundled roots alone omit enterprise CAs installed in Windows.
  // Preserve the public roots and add the system store; verification remains enabled.
  setDefaultCACertificates([...getCACertificates('default'),...getCACertificates('system')]);
  const connectionFile=join(process.env.ENTERPRISE_DATA_HOME || join(homedir(),'.enterprise-dsh'),'enterprise-server.json');
  let serverUrl='',cloudToken='',cloudActor;
  try{serverUrl=JSON.parse(readFileSync(connectionFile,'utf8')).url||'';}catch{}
  async function cloud(request){
    if(request.operation==='status')return {url:serverUrl,actor:cloudActor};
    if(request.operation==='disconnect'){cloudToken='';cloudActor=undefined;return {ok:true};}
    if(request.operation==='connect'){
      const url=new URL(request.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('请输入有效的企业服务器地址，不包含路径或账号');
      const check=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(10000)});const info=await check.json();if(!check.ok||info.apiVersion!==2)throw new Error('服务器不是兼容的企业工作台服务');serverUrl=url.origin;cloudToken='';cloudActor=undefined;mkdirSync(join(connectionFile,'..'),{recursive:true});writeFileSync(connectionFile,JSON.stringify({url:serverUrl}));return {url:serverUrl};
    }
    if(!serverUrl)throw new Error('请先连接企业服务器');
    if(typeof request.path!=='string'||!/^\/api\/[a-zA-Z0-9_/?=&.%:-]+$/.test(request.path)||request.path.includes('..'))throw new Error('请求路径无效');
    const headers={'content-type':'application/json',...(cloudToken?{authorization:'Bearer '+cloudToken}:{}),...(request.key?{'idempotency-key':request.key}:{}),...(request.setupToken?{'x-setup-token':request.setupToken}:{})};
    let body=request.body===undefined?undefined:JSON.stringify(request.body);
    if(request.file){if(request.file.base64.length>14000000)throw new Error('文件过大');body=Buffer.from(request.file.base64,'base64');headers['content-type']='application/octet-stream';headers['x-file-name']=encodeURIComponent(request.file.name);headers['x-department-id']=request.file.departmentId||cloudActor?.departmentId||'';headers['x-visibility']=request.file.visibility||'department';headers['x-previous-material']=request.file.previousId||'';headers['x-project-id']=request.file.projectId||'';}
    const response=await fetch(new URL(request.path,serverUrl),{method:request.method||'GET',headers,body,signal:AbortSignal.timeout(30000)});
    if(request.binary&&response.ok)return {base64:Buffer.from(await response.arrayBuffer()).toString('base64')};
    const result=await response.json();if(!response.ok){if(response.status===401){cloudToken='';cloudActor=undefined;}throw new Error(result.error||'企业服务请求失败');}
    if(request.path==='/api/login'){cloudToken=result.token;cloudActor=result.actor;return {actor:result.actor};}
    return result;
  }
  const store = new WorkbenchStore(join(process.env.ENTERPRISE_DATA_HOME || join(homedir(),'.enterprise-dsh'),'business','workbench.sqlite'));
  ctx.effect(() => () => store.close());
  ctx.provide('enterpriseStore', store);
  class BusinessRemote extends Service {
    constructor(scope) {
      super(scope,'enterprise');
      this.typertRemote = bindTypertRemote(this,'enterprise');
    }
    async dispatch(request) {
      // Only admitted human Remote calls may mutate authoritative business data.
      if (!this.ctx.invocation || this.ctx.invocation.peer.principal.kind !== 'owner') throw new Error('此操作仅允许从本机工作台发起');
      switch (request.action) {
        case 'cloud': return cloud(request);
        case 'snapshot': return store.snapshot();
        case 'project': return store.createProject(request.input);
        case 'task': return store.createTask(request.input);
        case 'status': store.updateTask(request.id,request.status); return {ok:true};
        case 'review': return store.review(request.id,request.decision,request.body,request.note);
        case 'material': return store.addMaterial(request.input);
        case 'csv': return { text:store.taskCsv(request.id) };
        case 'import': {
          if(typeof request.base64!=='string'||request.base64.length>14000000)throw new Error('文件过大');
          const body=await extractDocument(request.name,Buffer.from(request.base64,'base64'));
          return store.addMaterial({project_id:request.project_id,name:request.name,body});
        }
        case 'docx': {
          const draft=store.snapshot().drafts.find(d=>d.id===request.id);
          const review=store.snapshot().reviews.find(r=>r.draft_id===request.id&&r.decision==='approved');
          if(!draft||!review)throw new Error('请先审核通过报告');
          return {base64:Buffer.from(reportDocx(store.project(draft.project_id).title,review.edited)).toString('base64')};
        }
        case 'backup': return store.exportBackup();
        case 'restore': {
          if(JSON.stringify(request.backup).length>20000000)throw new Error('备份不能超过 20 MB');
          const folder=join(process.env.ENTERPRISE_DATA_HOME || join(homedir(),'.enterprise-dsh'),'backups');
          mkdirSync(folder,{recursive:true});
          writeFileSync(join(folder,`before-restore-${Date.now()}.json`),JSON.stringify(store.exportBackup()),'utf8');
          store.restoreBackup(request.backup);
          return {ok:true};
        }
        default: throw new Error('不支持的工作台操作');
      }
    }
  }
  ctx.plugin(BusinessRemote);
  ctx.effect(() => ctx.typert.register({
    package:'@enterprise/dsh-workbench',face:'host',schemas:[],model:{services:[],events:[],objects:[]},
    invocations:[{id:'@enterprise/dsh-workbench#enterprise/dispatch',service:'enterprise',namespace:'enterprise',method:'dispatch',invocation:{kind:'direct'},parameters:[{name:'request',wire:'request',source:'json',codec:{mode:'src-json'}}],result:{mode:'src-json'}}]
  }));
}
