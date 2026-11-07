import {businessProgress,upstreamResults,configureBusiness,initializeExamples,executeExample} from './progress.ts';
import {uploadSubmission,submissionVisible} from './submission-files.ts';
import {startWorkSuggestion,readWorkSuggestion,decideWorkSuggestion} from './work-plan-ai.ts';
import {workPlanState,workPlanCommand,workInstance} from './work-plan.ts';
import {starterCatalog,starterPreview,applyStarters,saveStarterModel,testStarterModel} from './starter-employees.ts';
import {workTemplates,enableWorkTemplates} from './work-templates.ts';
import {saveIntake,getIntake,readIntake,planIntake,confirmIntake,cancelIntake} from './intake.ts';
import {workWiki} from './work-outcomes.ts';
import {startConfigSuggestion,readConfigSuggestion,decideConfigSuggestion} from './flow-config.ts';
import {resolveFlowResources} from './flow-resources.ts';
import {workspaceContext,resourceImpact,saveWorkspaceLink,workspaceRelations,knowledgeBacklog} from './workspace.ts';
import {wikiState,saveWikiDraft,reviewWiki,wikiLint,startWikiJob,collectWikiJob,wikiExport,wikiHistory} from './wiki.ts';
import {knowledgeAtlas,atlasRead,atlasOriginal,saveKnowledgeTaxonomy} from './knowledge-atlas.ts';
import {knowledgeGraph} from './knowledge-graph.ts';
import {knowledgeEntries,indexKnowledge,reviewKnowledge,searchKnowledge} from './knowledge.ts';
import {captureOutputs,KnowledgeCollector} from './knowledge-inputs.ts';
import {zipSync} from 'fflate';
import {factoryState,saveFactoryProfile,saveFactoryKnowledge,reviewFactoryKnowledge,importFactoryRecords,scanFactory,decideFactory,analyzeFactory,factoryReceipt,factoryReceiptText} from './factory.ts';
import {actionCatalog,proposeAction,decideAction,startCopilot} from './actions.ts';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {EnterpriseService,requireRole,required,canSee} from './service.ts';
import {DomainError,type Actor} from './types.ts';
import {extractDocument,reportDocx} from '../../workbench/documents.mjs';
import {installSample} from './sample.ts';
import {digest} from './security.ts';
import {validateDefinition,currentRuns} from './engine.ts';
import {reportText,visibleTo} from './business.ts';
import {weeklyDraft,confirmWeekly} from './weekly.ts';
const limits=new Map<string,{count:number;until:number}>();
async function bytes(req:IncomingMessage,limit=12*1024*1024){const chunks:Buffer[]=[];let count=0;for await(const chunk of req){count+=chunk.length;if(count>limit)throw new DomainError(413,'请求内容过大');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
async function json(req:IncomingMessage){try{return JSON.parse((await bytes(req,64*1024*1024)).toString('utf8')||'{}');}catch(e){if(e instanceof DomainError)throw e;throw new DomainError(400,'请求格式无效');}}
const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
export function createApi(service:EnterpriseService,dataRoot:string,bootstrapToken:string,options:{folderRoot?:string}={}){
  const collector=new KnowledgeCollector(service,dataRoot,options.folderRoot);
  return Object.assign(createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost'),path=url.pathname,method=req.method;
      if(path==='/health'){send(res,200,{ok:true,apiVersion:2,workbenchVersion:'0.22',capabilities:['work-assistance-v1','business-actions-v1','manufacturing-v1','pipeline-canvas-v1','knowledge-v1','knowledge-inputs-v1','knowledge-graph-v1','live-operations-v1','knowledge-atlas-v1','knowledge-taxonomy-v1','llm-wiki-v1','flow-workspace-v1','flow-config-ai-v1','intake-planning-v1','task-groups-v1','starter-employees-v1','handling-guidance-v1','work-plan-v1','task-progress-v1','submission-files-v1','upstream-results-v1','business-examples-v1']});return;}
      if(path==='/api/bootstrap'&&method==='GET'){send(res,200,{required:!(await service.store.db.query('SELECT id FROM users LIMIT 1')).rows.length});return;}
      if(path==='/api/bootstrap'&&method==='POST'){if(!bootstrapToken||req.headers['x-setup-token']!==bootstrapToken)throw new DomainError(403,'初始化代码不正确');send(res,201,await service.bootstrap(await json(req)));return;}
      if(path==='/api/login'&&method==='POST'){
        const key=req.socket.remoteAddress||'unknown',now=Date.now();if(limits.size>10000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);const bucket=limits.get(key);if(bucket&&bucket.until>now&&bucket.count>=20)throw new DomainError(429,'登录尝试过多，请 15 分钟后重试');limits.set(key,{count:(bucket&&bucket.until>now?bucket.count:0)+1,until:bucket&&bucket.until>now?bucket.until:now+900000});const input=await json(req);send(res,200,await service.login(required(input.login,'账号',100),required(input.password,'密码',256)));return;
      }
      const token=(req.headers.authorization||'').replace(/^Bearer /,'');const actor=await service.authenticate(token);
      if(path==='/api/actions/catalog'){send(res,200,actionCatalog(actor));return;}
      if(path==='/api/actions/proposals'){
        if(method==='POST')send(res,201,await proposeAction(service,actor,await json(req)));
        else send(res,200,(await service.store.list('actionProposals')).filter(p=>p.actorId===actor.id));return;
      }
      const actionDecision=path.match(/^\/api\/actions\/proposals\/([^/]+)\/decision$/);if(actionDecision&&method==='POST'){const body=await json(req);send(res,200,await decideAction(service,actor,actionDecision[1],body.decision));return;}
      if(path==='/api/flow-config/proposals'&&method==='POST'){send(res,201,await startConfigSuggestion(service,actor,await json(req),String(req.headers['idempotency-key']||'')));return;}
      const configProposal=path.match(/^\/api\/flow-config\/proposals\/([^/]+)(\/decision)?$/);if(configProposal){send(res,200,configProposal[2]&&method==='POST'?await decideConfigSuggestion(service,actor,configProposal[1],await json(req)):await readConfigSuggestion(service,actor,configProposal[1]));return;}
      if(path==='/api/copilot'&&method==='POST'){send(res,201,await startCopilot(service,actor,await json(req),String(req.headers['idempotency-key']||'')));return;}
      if(path==='/api/workspace/context'&&method==='GET'){send(res,200,await workspaceContext(service,actor,Object.fromEntries(url.searchParams)));return;}
      if(path==='/api/workspace/impact'&&method==='GET'){send(res,200,await resourceImpact(service,actor,url.searchParams.get('kind')||'',url.searchParams.get('id')||''));return;}
      if(path==='/api/workspace/relations'&&method==='GET'){send(res,200,await workspaceRelations(service,actor,{kind:url.searchParams.get('kind'),id:url.searchParams.get('id')}));return;}
      if(path==='/api/workspace/links'&&method==='POST'){send(res,200,await saveWorkspaceLink(service,actor,await json(req)));return;}
      if(path==='/api/wiki/backlog'&&method==='GET'){send(res,200,await knowledgeBacklog(service,actor,url.searchParams.get('projectId')||''));return;}
      if(path==='/api/wiki'&&method==='GET'){send(res,200,await wikiState(service,actor,url.searchParams.get('query')||''));return;}
      if(path==='/api/wiki/drafts'&&method==='POST'){send(res,201,await service.store.tx(async db=>{await service.store.lock(db);return saveWikiDraft(service,actor,await json(req),db);}));return;}
      if(path==='/api/wiki/jobs'&&method==='POST'){send(res,201,await startWikiJob(service,actor,await json(req),String(req.headers['idempotency-key']||'')));return;}
      if(path==='/api/wiki/lint'&&method==='POST'){send(res,200,await wikiLint(service,actor));return;}
      if(path==='/api/wiki/export'&&method==='GET'){res.writeHead(200,{'content-type':'application/zip','cache-control':'no-store'});res.end(Buffer.from(zipSync(await wikiExport(service,actor))));return;}
      const wikiVersions=path.match(/^\/api\/wiki\/pages\/([^/]+)\/history$/);if(wikiVersions&&method==='GET'){send(res,200,await wikiHistory(service,actor,wikiVersions[1]));return;}
      const wikiDecision=path.match(/^\/api\/wiki\/drafts\/([^/]+)\/review$/);if(wikiDecision&&method==='POST'){send(res,200,await reviewWiki(service,actor,wikiDecision[1],(await json(req)).decision));return;}
      const wikiCollect=path.match(/^\/api\/wiki\/jobs\/([^/]+)\/collect$/);if(wikiCollect&&method==='POST'){send(res,200,await collectWikiJob(service,actor,wikiCollect[1]));return;}
      if(path==='/api/knowledge/atlas'&&method==='GET'){send(res,200,await knowledgeAtlas(service,collector,actor,{view:url.searchParams.get('view')||'',category:url.searchParams.get('category')||'',departmentId:url.searchParams.get('departmentId')||'',kind:url.searchParams.get('kind')||'file',root:url.searchParams.get('root')||'',direct:url.searchParams.get('direct')==='true',query:url.searchParams.get('query')||'',page:Number(url.searchParams.get('page'))}));return;}
      if(path==='/api/knowledge/atlas/taxonomy'&&method==='POST'){send(res,200,await saveKnowledgeTaxonomy(service,actor,await json(req)));return;}
      if(path==='/api/knowledge/atlas/original'&&method==='GET'){const file=await atlasOriginal(collector,actor,url.searchParams.get('id')||'');res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(file.bytes);return;}
      if(path==='/api/knowledge/atlas/read'&&method==='POST'){const body=await json(req);send(res,200,await atlasRead(service,collector,actor,required(body.id,'来源',300)));return;}
      if(path==='/api/knowledge/graph'){send(res,200,await knowledgeGraph(service,collector,actor,{path:url.searchParams.get('path')||'',kind:url.searchParams.get('kind')||'',query:url.searchParams.get('query')||''}));return;}
      if(path==='/api/knowledge/inputs/state'){send(res,200,await collector.state(actor));return;}
      if(path==='/api/knowledge/inputs/sync'&&method==='POST'){send(res,202,await collector.enable(actor));return;}
      if(path==='/api/knowledge/inputs'){if(url.searchParams.get('kind')==='output')await captureOutputs(service);send(res,200,await collector.list(actor,url.searchParams.get('kind')||'',String(url.searchParams.get('query')||'').slice(0,200),url.searchParams.get('status')||'',Math.min(10000,Math.max(0,parseInt(url.searchParams.get('page')||'0')||0))));return;}
      const inputPath=path.match(/^\/api\/knowledge\/inputs\/([^/]+)(\/promote)?$/);if(inputPath){const id=decodeURIComponent(inputPath[1]);if(inputPath[2]&&method==='POST')send(res,201,await collector.promote(actor,id));else if(method==='GET')send(res,200,await collector.preview(actor,id));else throw new DomainError(405,'操作不支持');return;}
      const knowledgePreview=path.match(/^\/api\/knowledge\/([^/]+)\/preview$/);if(knowledgePreview&&method==='GET'){const info=(await knowledgeEntries(service,actor)).find(e=>e.id===knowledgePreview[1]);if(!info)throw new DomainError(404,'知识不存在或无权访问');const entry=await service.store.get('knowledgeEntries',info.id);send(res,200,(entry.chunks||[]).slice(0,30).map((c:any)=>({...c,id:info.id+':'+c.index,name:info.name,category:info.category,version:info.version,materialId:info.materialId,chunk:c.index+1})));return;}
      if(path==='/api/knowledge'&&method==='GET'){send(res,200,await knowledgeEntries(service,actor));return;}
      if(path==='/api/knowledge'&&method==='POST'){send(res,201,await indexKnowledge(service,actor,await json(req)));return;}
      const entryReview=path.match(/^\/api\/knowledge\/([^/]+)\/review$/);if(entryReview&&method==='POST'){send(res,200,await reviewKnowledge(service,actor,entryReview[1],(await json(req)).status));return;}
      if(path==='/api/knowledge/search'&&method==='POST'){const b=await json(req);send(res,200,await searchKnowledge(service,actor,b.query,undefined,b.category||''));return;}
      if(path==='/api/knowledge/ask'&&method==='POST'){const b=await json(req),employee=await service.store.get('employees',b.employeeId);if(!employee?.enabled||!visibleTo(actor,employee)||!employee.allowedTools?.includes('read_context'))throw new DomainError(403,'请选择有业务读取权限的数字员工');if(!employee.modelId||!(await service.store.db.query('SELECT id FROM models WHERE id=$1',[employee.modelId])).rows.length)throw new DomainError(409,'模型尚未配置，请在管理与设置配置模型并分配给数字员工');const hits=await searchKnowledge(service,actor,b.query,{materialIds:employee.materialIds});if(!hits.records.length)throw new DomainError(409,'该员工授权资料中没有已发布的匹配知识，请先入库发布并在岗位卡勾选资料');send(res,201,await startCopilot(service,actor,{employeeId:employee.id,prompt:'知识库问答：'+required(b.query,'问题',200)+'。仅回答这个知识问题。必须使用 business_query 的 kind=knowledge 检索已发布知识并在回答中标注资料名称、版本和片段；无依据就说不知道。不要提出任何业务变更。'},String(req.headers['idempotency-key']||'')));return;}
      const factoryKey=String(req.headers['idempotency-key']||'');
      if(path==='/api/factory/state'){send(res,200,await factoryState(service,actor));return;}
      if(path==='/api/factory/profile'&&method==='POST'){send(res,200,await saveFactoryProfile(service,actor,await json(req),factoryKey));return;}
      if(path==='/api/factory/records'&&method==='POST'){send(res,201,await importFactoryRecords(service,actor,await json(req),factoryKey));return;}
      if(path==='/api/factory/scan'&&method==='POST'){const b=await json(req);send(res,200,await scanFactory(service,actor,b.scene,factoryKey));return;}
      if(path==='/api/factory/knowledge'&&method==='POST'){send(res,201,await saveFactoryKnowledge(service,actor,await json(req),factoryKey));return;}
      const knowledgeReview=path.match(/^\/api\/factory\/knowledge\/([^/]+)\/review$/);if(knowledgeReview&&method==='POST'){send(res,200,await reviewFactoryKnowledge(service,actor,knowledgeReview[1],await json(req),factoryKey));return;}
      const factoryCase=path.match(/^\/api\/factory\/cases\/([^/]+)\/commands$/);if(factoryCase&&method==='POST'){send(res,200,await decideFactory(service,actor,factoryCase[1],await json(req),factoryKey));return;}
      const factoryAnalysis=path.match(/^\/api\/factory\/cases\/([^/]+)\/analysis$/);if(factoryAnalysis&&method==='POST'){const b=await json(req);send(res,201,await analyzeFactory(service,actor,factoryAnalysis[1],b.employeeId,factoryKey));return;}
      const factoryFile=path.match(/^\/api\/factory\/receipts\/([^/]+)\/file$/);if(factoryFile){const r=await factoryReceipt(service,actor,factoryFile[1]);res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});res.end(Buffer.from(reportDocx(r.name,factoryReceiptText(r))));return;}
      const factoryPackage=path.match(/^\/api\/factory\/receipts\/([^/]+)\/package$/);if(factoryPackage){const r=await factoryReceipt(service,actor,factoryPackage[1]),entries:any={'签字回执与追溯依据.docx':new Uint8Array(reportDocx(r.name,factoryReceiptText(r)))};const refs=[...r.evidence.materials,...r.evidence.knowledge.map((k:any)=>k.material),...(r.execution?[r.execution.material]:[])];let total=0;for(const id of [...new Set(refs.map((m:any)=>m.id))]){const m=await service.store.get('materials',id as string);if(!m||!visibleTo(actor,m))throw new DomainError(403,'追溯包引用资料不可访问');let body:Buffer;if(m.hasOriginal===false)body=Buffer.from(m.text||'');else{if(!/^[a-f0-9-]{36}$/.test(m.id))throw new DomainError(400,'原始资料编号无效');body=await readFile(join(dataRoot,'attachments',m.id));if(createHash('sha256').update(body).digest('hex')!==m.sha256)throw new DomainError(409,'原始资料校验失败');}total+=body.length;if(total>50*1024*1024)throw new DomainError(413,'追溯原件合计不能超过50MB，请分别下载');const sourceName=String(m.name).replace(/[\\/<>:"|?*]/g,'_');entries['来源资料/'+Object.keys(entries).length+'-'+sourceName+(m.hasOriginal===false?'.txt':'')]=new Uint8Array(body);}res.writeHead(200,{'content-type':'application/zip'});res.end(Buffer.from(zipSync(entries)));return;}
      if(path==='/api/me'){send(res,200,actor);return;}
      if(path==='/api/state'){
        const kinds=['departments','components','employees','definitions','projects','tasks','feedback','preferences','materials','reports'];const state:any={actor,capabilities:['work-assistance-v1','business-actions-v1','manufacturing-v1','pipeline-canvas-v1','knowledge-v1','knowledge-inputs-v1','knowledge-graph-v1','live-operations-v1','knowledge-atlas-v1','knowledge-taxonomy-v1','llm-wiki-v1','flow-workspace-v1','flow-config-ai-v1','intake-planning-v1','task-groups-v1','starter-employees-v1','handling-guidance-v1','work-plan-v1','task-progress-v1','submission-files-v1','upstream-results-v1','business-examples-v1'],users:await service.users(actor),versions:await service.versions(actor),instances:(await service.instances(actor)).filter(i=>!i.intakePlanning&&!i.workPlanAssist),models:(await service.store.db.query('SELECT id,name,base_url,model FROM models')).rows};
        state.workPlanHeads=(await service.store.db.query("SELECT id,body->>'revision' AS revision,body->'pending'->>'id' AS pending FROM records WHERE kind='workPlans' AND id=ANY($1::text[])",[state.instances.map((i:any)=>i.id)])).rows.map((r:any)=>({instanceId:r.id,revision:Number(r.revision),pendingId:r.pending}));
        for(const kind of kinds)state[kind]=await service.records(actor,kind);
        state.materials=state.materials.map(({text,...m}:any)=>({...m,preview:String(text||'').slice(0,10000)}));
        Object.assign(state,await factoryState(service,actor));
        state.actionProposals=(await service.store.list('actionProposals')).filter(p=>p.actorId===actor.id);
        state.audit=actor.roles.includes('admin')?(await service.store.db.query('SELECT * FROM audit ORDER BY at DESC LIMIT 200')).rows:[];
        send(res,200,state);return;
      }
      if(path==='/api/changes'){
        const after=url.searchParams.get('after')||'';const end=Date.now()+18000;let revision='';
        do{const row=(await service.store.db.query('SELECT count(*) AS count,MAX(at) AS at FROM audit')).rows[0];revision=String(row.count)+':'+(row.at?new Date(row.at).toISOString():'');if(revision!==after||req.destroyed)break;await new Promise(resolve=>setTimeout(resolve,700));}while(Date.now()<end);
        send(res,200,{revision});return;
      }
      if(path==='/api/logout'&&method==='POST'){await service.store.db.query('DELETE FROM sessions WHERE token=$1',[digest(token)]);send(res,200,{ok:true});return;}
      if(path==='/api/work-templates'){send(res,200,method==='POST'?await enableWorkTemplates(service,actor):workTemplates);return;}
      if(path==='/api/intake-drafts'){send(res,200,method==='POST'?await saveIntake(service,actor,await json(req)):(await service.store.list('intakeDrafts')).filter(d=>d.creatorId===actor.id&&d.status!=='cancelled'));return;}
      const intake=path.match(/^\/api\/intake-drafts\/([^/]+)(?:\/(plan|confirm|cancel))?$/);if(intake){const [,id,op]=intake,key=String(req.headers['idempotency-key']||'');send(res,200,method==='GET'?await readIntake(service,actor,id):op==='plan'?await planIntake(service,actor,id,await json(req),key):op==='confirm'?await confirmIntake(service,actor,id,await json(req),key):op==='cancel'?await cancelIntake(service,actor,id):await saveIntake(service,actor,{...await json(req),id}));return;}
      const workWikiRoute=path.match(/^\/api\/instances\/([^/]+)\/work-wiki\/([^/]+)$/);if(workWikiRoute){send(res,200,await workWiki(service,actor,workWikiRoute[1],workWikiRoute[2],method==='POST'));return;}
      if(path==='/api/users'){send(res,200,method==='POST'?await service.saveUser(actor,await json(req)):await service.users(actor));return;}
      if(path==='/api/models'){
        if(method==='POST')requireRole(actor,'admin');send(res,200,method==='POST'?await service.saveModel(actor,await json(req)):(await service.store.db.query('SELECT id,name,base_url,model FROM models')).rows);return;
      }
      if(path==='/api/sample'&&method==='POST'){send(res,200,await installSample(service,actor));return;}
      if(path==='/api/versions'){send(res,200,await service.versions(actor));return;}
      if(path==='/api/instances'){
        if(method==='POST'){const body=await json(req);send(res,201,await service.start(actor,body.versionId,body.title,body.input??{},body.link,String(req.headers['idempotency-key']||'')||undefined));}else send(res,200,await service.instances(actor));return;
      }
      const command=path.match(/^\/api\/instances\/([^/]+)\/commands$/);if(command&&method==='POST'){send(res,200,await service.command(actor,command[1],String(req.headers['idempotency-key']||''),await json(req)));return;}
      const workSuggest=path.match(/^\/api\/instances\/([^/]+)\/work-plan\/suggestions$/);if(workSuggest&&method==='POST'){send(res,201,await startWorkSuggestion(service,actor,workSuggest[1],await json(req),String(req.headers['idempotency-key']||'')));return;}
      const suggestion=path.match(/^\/api\/work-plan-suggestions\/([^/]+)$/);if(suggestion){if(method==='GET')send(res,200,await readWorkSuggestion(service,actor,suggestion[1]));else if(method==='POST')send(res,200,await decideWorkSuggestion(service,actor,suggestion[1],(await json(req)).decision));return;}
      const planRevision=path.match(/^\/api\/instances\/([^/]+)\/work-plan\/revisions\/(\d+)$/);if(planRevision&&method==='GET'){await workInstance(service,actor,planRevision[1]);const revision=await service.store.get('workPlanRevisions',planRevision[1]+':'+Number(planRevision[2]));if(!revision)throw new DomainError(404,'计划修订不存在');send(res,200,revision);return;}
      const workPlan=path.match(/^\/api\/instances\/([^/]+)\/work-plan$/);if(workPlan){if(method==='GET')send(res,200,await workPlanState(service,actor,workPlan[1]));else if(method==='POST')send(res,200,await workPlanCommand(service,actor,workPlan[1],await json(req),String(req.headers['idempotency-key']||'')));else throw new DomainError(405,'不支持的请求');return;}
      if(path==='/api/business-progress'&&method==='GET'){send(res,200,await businessProgress(service,actor));return;}
      if(path==='/api/examples/initialize'&&method==='POST'){send(res,200,await initializeExamples(service,actor));return;}
      const business=path.match(/^\/api\/instances\/([^/]+)\/(upstream|business-settings|example-plan)$/);if(business){if(business[2]==='upstream'&&method==='GET')send(res,200,await upstreamResults(service,actor,business[1],url.searchParams.get('runId')||''));else if(business[2]==='business-settings'&&method==='POST')send(res,200,await configureBusiness(service,actor,business[1],await json(req)));else if(business[2]==='example-plan'&&method==='POST')send(res,200,await executeExample(service,actor,business[1],(await json(req)).runId));else throw new DomainError(405,'操作不支持');return;}
      const upload=path.match(/^\/api\/instances\/([^/]+)\/attachments$/);if(upload&&method==='POST'){send(res,201,await uploadSubmission(service.store,dataRoot,actor,upload[1],url.searchParams.get('runId')||'',url.searchParams.get('taskId')||undefined,Number(url.searchParams.get('generation')),Number(url.searchParams.get('round')||0),decodeURIComponent(String(req.headers['x-file-name']||'')),await bytes(req,10*1024*1024)));return;}
      const guidance=path.match(/^\/api\/instances\/([^/]+)\/guidance$/);if(guidance&&method==='GET'){send(res,200,await service.guidance(actor,guidance[1],url.searchParams.get('runId')||undefined));return;}
      const context=path.match(/^\/api\/instances\/([^/]+)\/context\/([^/]+)$/);if(context&&method==='GET'){send(res,200,await service.context(actor,context[1],context[2],url.searchParams.get('employeeId')||undefined));return;}
      if(path==='/api/starter-employees'&&method==='GET'){send(res,200,{catalog:starterCatalog,settings:await service.store.get('preferences','starter-employees')});return;}
      if(path==='/api/starter-employees/preview'&&method==='POST'){send(res,200,await starterPreview(service,actor,await json(req)));return;}
      if(path==='/api/starter-employees/apply'&&method==='POST'){send(res,200,await applyStarters(service,actor,await json(req)));return;}
      if(path==='/api/starter-employees/model'&&method==='POST'){send(res,200,await saveStarterModel(service,actor,(await json(req)).modelId));return;}
      if(path==='/api/starter-employees/model-test'&&method==='POST'){send(res,201,await testStarterModel(service,actor,(await json(req)).modelId));return;}
      const assistanceResult=path.match(/^\/api\/assistance\/([^/]+)$/);if(assistanceResult&&method==='GET'){send(res,200,await service.assistanceResult(actor,assistanceResult[1]));return;}
      const assist=path.match(/^\/api\/instances\/([^/]+)\/assist$/);if(assist&&method==='POST'){const input=await json(req);send(res,201,await service.assist(actor,assist[1],input.runId,input.employeeId,input.taskId));return;}
      const feedback=path.match(/^\/api\/instances\/([^/]+)\/feedback$/);if(feedback&&method==='POST'){send(res,201,await service.feedback(actor,feedback[1],await json(req),String(req.headers['idempotency-key']||'')));return;}
      const weekly=path.match(/^\/api\/projects\/([^/]+)\/weekly$/);if(weekly){send(res,200,method==='POST'?await confirmWeekly(service,actor,weekly[1],await json(req),String(req.headers['idempotency-key']||'')):await weeklyDraft(service,actor,weekly[1]));return;}
      const weeklyFile=path.match(/^\/api\/reports\/([^/]+)\/file$/);if(weeklyFile){const report=await service.store.get('reports',weeklyFile[1]);if(!report||!visibleTo(actor,report))throw new DomainError(404,'周报不存在');if(report.status!=='approved')throw new DomainError(409,'该周报尚未由负责人确认');res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});res.end(Buffer.from(reportDocx(report.title,report.body)));return;}
      const publish=path.match(/^\/api\/definitions\/([^/]+)\/publish$/);if(publish&&method==='POST'){send(res,200,await service.publish(actor,publish[1]));return;}
      const trial=path.match(/^\/api\/employees\/([^/]+)\/trial$/);if(trial&&method==='POST'){send(res,201,await service.trial(actor,trial[1],await json(req)));return;}
      const flowTrial=path.match(/^\/api\/definitions\/([^/]+)\/trial$/);if(flowTrial&&method==='POST'){send(res,200,await service.trialFlow(actor,flowTrial[1]));return;}
      const validate=path.match(/^\/api\/definitions\/([^/]+)\/validate$/);if(validate&&method==='POST'){requireRole(actor,'admin','manager');const d=await service.store.get('definitions',validate[1]);if(!d)throw new DomainError(404,'流程不存在');validateDefinition((await resolveFlowResources(service.store,service.store.db,actor,d)).definition);send(res,200,{valid:true});return;}
      const records=path.match(/^\/api\/(departments|components|employees|definitions|projects|tasks|feedback|preferences)$/);if(records){send(res,200,method==='POST'?await service.saveRecord(actor,records[1],await json(req)):await service.records(actor,records[1]));return;}
      if(path==='/api/materials'&&method==='GET'){send(res,200,(await service.records(actor,'materials')).map(({text,...m}:any)=>({...m,preview:String(text||'').slice(0,10000)})));return;}
      if(path==='/api/materials'&&method==='POST'){
        const name=required(decodeURIComponent(String(req.headers['x-file-name']||'')),'文件名',255),departmentId=String(req.headers['x-department-id']||actor.departmentId);if(!actor.roles.includes('admin')&&departmentId!==actor.departmentId)throw new DomainError(403,'不能上传到其他部门');
        const raw=await bytes(req,10*1024*1024),text=await extractDocument(name,raw),id=randomUUID(),folder=join(dataRoot,'attachments');await mkdir(folder,{recursive:true,mode:0o700});await writeFile(join(folder,id),raw,{mode:0o600});
        const record:any={id,name,text,departmentId,projectId:String(req.headers['x-project-id']||''),familyId:id,visibility:req.headers['x-visibility']==='enterprise'?'enterprise':'department',version:1,sha256:createHash('sha256').update(raw).digest('hex'),size:raw.length,creatorId:actor.id,createdAt:new Date().toISOString()};
        try{await service.store.tx(async db=>{await service.store.lock(db);const previousId=String(req.headers['x-previous-material']||'');if(previousId){const previous=await service.store.get('materials',previousId,db);if(!previous||previous.departmentId!==departmentId||!actor.roles.includes('admin')&&previous.departmentId!==actor.departmentId)throw new DomainError(403,'没有更新此资料版本的权限');record.familyId=previous.familyId||previous.id;record.version=1+Math.max(...(await service.store.list('materials',db)).filter((m:any)=>(m.familyId||m.id)===record.familyId).map((m:any)=>m.version||1));}if(record.projectId){const project=await service.store.get('projects',record.projectId,db);if(!project||!actor.roles.includes('admin')&&project.departmentId!==actor.departmentId&&!(project.teamIds||[]).includes(actor.id))throw new DomainError(403,'没有关联项目的权限');}await service.store.put('materials',record,db);await service.store.audit(actor.id,'material.upload',id,{name,version:record.version},db);});}catch(e){await unlink(join(folder,id));throw e;}send(res,201,record);return;
      }
      const file=path.match(/^\/api\/materials\/([^/]+)\/file$/);if(file){let m=(await service.records(actor,'materials')).find((r:any)=>r.id===file[1]);if(!m){const staged=await service.store.get('materials',file[1]);if(await submissionVisible(service.store,actor,staged))m=staged;}if(!m)throw new DomainError(404,'资料不存在');if(m.hasOriginal===false){if(m.inputId){res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end(m.text);return;}throw new DomainError(404,'旧版迁移仅包含正文，请补充原始文件');}const raw=await readFile(join(dataRoot,'attachments',m.id));res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(m.name)}`});res.end(raw);return;}
      const report=path.match(/^\/api\/instances\/([^/]+)\/report$/);if(report){const i=(await service.instances(actor)).find(i=>i.id===report[1]);if(!i)throw new DomainError(404,'实例不存在');const formal=url.searchParams.get('mode')==='formal';const users=await service.users(actor);const content=reportText(i,formal,new Map(users.map(u=>[u.id,u.name])));res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});res.end(Buffer.from(reportDocx(i.title,content)));return;}
      if(path==='/api/audit'){requireRole(actor,'admin','manager');const visible=new Set((await service.instances(actor)).map(i=>i.id));const rows=(await service.store.db.query('SELECT * FROM audit ORDER BY at DESC LIMIT 500')).rows;send(res,200,actor.roles.includes('admin')?rows:rows.filter(r=>r.actor_id===actor.id||visible.has(r.entity_id)));return;}
      if(path==='/api/backup'&&method==='GET'){
        requireRole(actor,'admin');const records=(await service.store.db.query("WITH wiki_inputs AS (SELECT DISTINCT body->>'inputId' AS id FROM records WHERE kind='wikiRaw' UNION SELECT jsonb_array_elements_text(COALESCE(body->'sourceIds','[]'::jsonb)) AS id FROM records WHERE kind IN ('intakeDrafts','intakeRevisions')), wiki_docs AS (SELECT body->>'documentId' AS id FROM records WHERE kind='knowledgeInputs' AND id IN (SELECT id FROM wiki_inputs)) SELECT kind,id,body FROM records WHERE kind!='knowledgeJobs' AND (kind!='knowledgeDocuments' OR id IN (SELECT id FROM wiki_docs)) AND NOT (kind='knowledgeInputs' AND body->>'kind'='file' AND id NOT IN (SELECT id FROM wiki_inputs))")).rows,files=[];for(const m of records.filter(r=>r.kind==='materials'&&r.body.hasOriginal!==false))files.push({id:m.id,base64:(await readFile(join(dataRoot,'attachments',m.id))).toString('base64')});send(res,200,{format:'enterprise-v2',version:1,records,files,versions:(await service.store.db.query('SELECT * FROM flow_versions')).rows,instances:(await service.store.db.query('SELECT * FROM instances')).rows});return;
      }
      if(path==='/api/migrate'&&method==='POST'){send(res,200,await service.migrate(actor,await json(req)));return;}
      if(path==='/api/restore'&&method==='POST'){
        requireRole(actor,'admin');const {backup}=await json(req);
        if(backup?.format!=='enterprise-v2'||backup.version!==1||!Array.isArray(backup.records)||!Array.isArray(backup.versions)||!Array.isArray(backup.instances)||!Array.isArray(backup.files))throw new DomainError(400,'备份格式不兼容');
        const allowed=['departments','components','employees','definitions','projects','tasks','feedback','preferences','materials','legacy','migrations','reports','actionProposals','factoryProfiles','factoryRecords','factoryCases','factoryKnowledge','factoryReceipts','factorySchedules','knowledgeEntries','knowledgeInputs','knowledgeDocuments','knowledgeJobs','wikiPages','wikiDrafts','wikiRevisions','wikiLogs','wikiRaw','workspaceLinks','flowConfigProposals','intakeDrafts','intakeRevisions','workWikiReceipts','workPlans','workPlanRevisions','workPlanSuggestions','nodeReworks'];
        const staged=join(dataRoot,'restore-'+randomUUID());await mkdir(staged,{recursive:true,mode:0o700});
        try{
          for(const r of backup.records){if(!allowed.includes(r.kind)||typeof r.id!=='string'||r.body?.id!==r.id)throw new DomainError(400,'备份记录无效');}
          if(new Set(backup.records.map((r:any)=>r.kind+':'+r.id)).size!==backup.records.length||new Set(backup.files.map((f:any)=>f.id)).size!==backup.files.length)throw new DomainError(400,'备份记录或附件编号重复');
          for(const m of backup.records.filter((r:any)=>r.kind==='materials'&&r.body.hasOriginal!==false))if(!backup.files.some((f:any)=>f.id===m.id))throw new DomainError(400,'备份缺少原始附件');
          for(const f of backup.files){if(!/^[a-f0-9-]{36}$/.test(f.id)||typeof f.base64!=='string')throw new DomainError(400,'备份附件无效');const m=backup.records.find((r:any)=>r.kind==='materials'&&r.id===f.id);if(!m)throw new DomainError(400,'附件没有业务索引');const raw=Buffer.from(f.base64,'base64');if(createHash('sha256').update(raw).digest('hex')!==m.body.sha256)throw new DomainError(400,'附件校验失败');await writeFile(join(staged,f.id),raw,{mode:0o600});}
          for(const v of backup.versions)validateDefinition(v.body.definition);
          const folder=join(dataRoot,'backups');await mkdir(folder,{recursive:true});await writeFile(join(folder,'before-restore-'+Date.now()+'.json'),JSON.stringify({records:(await service.store.db.query('SELECT * FROM records')).rows,versions:(await service.store.db.query('SELECT * FROM flow_versions')).rows,instances:(await service.store.db.query('SELECT * FROM instances')).rows}),{mode:0o600});
          await service.store.tx(async db=>{await service.store.lock(db);if((await db.query("SELECT id FROM instances WHERE body->>'status'='running' LIMIT 1")).rows.length)throw new DomainError(409,'存在运行中的流程，不能恢复');
            for(const v of backup.versions)if(v.id!==v.body.id||v.definition_id!==v.body.definitionId)throw new DomainError(400,'流程版本索引不一致');
            for(const i of backup.instances){if(i.id!==i.body.id||!['running','completed','cancelled'].includes(i.body.status)||!Array.isArray(i.body.runs))throw new DomainError(400,'实例结构或索引无效');if(!backup.versions.some((v:any)=>v.id===i.body.version.id&&JSON.stringify(v.body)===JSON.stringify(i.body.version)))throw new DomainError(400,'实例引用版本缺失或不一致');if(i.body.status==='running')for(const r of currentRuns(i.body))if(r.status==='running'){r.status='unknown';r.error='从备份恢复的执行结果未知，请核实后重试';r.leaseUntil=undefined;}}
            // Content-addressed names are new UUIDs; preserve old files so rollback and pre-restore backups remain usable.
            await mkdir(join(dataRoot,'attachments'),{recursive:true});for(const f of backup.files){const dest=join(dataRoot,'attachments',f.id);try{const existing=await readFile(dest);if(createHash('sha256').update(existing).digest('hex')!==createHash('sha256').update(Buffer.from(f.base64,'base64')).digest('hex'))throw new DomainError(409,'已有附件编号冲突');}catch(e:any){if(e.code==='ENOENT')await rename(join(staged,f.id),dest);else throw e;}}
            await db.query('DELETE FROM records');await db.query('DELETE FROM instances');await db.query('DELETE FROM flow_versions');await db.query('DELETE FROM commands');
            for(const r of backup.records)await service.store.put(r.kind,r.body,db);for(const v of backup.versions)await db.query('INSERT INTO flow_versions VALUES($1,$2,$3,$4)',[v.id,v.definition_id,v.number,JSON.stringify(v.body)]);for(const i of backup.instances)await db.query('INSERT INTO instances(id,body) VALUES($1,$2)',[i.id,JSON.stringify(i.body)]);await service.store.audit(actor.id,'backup.restore','enterprise',{},db);
          });
        }finally{const {rm}=await import('node:fs/promises');await rm(staged,{recursive:true,force:true});}
        send(res,200,{ok:true});return;
      }
      throw new DomainError(404,'接口不存在');
    }catch(error){const status=error instanceof DomainError?error.status:500;if(status===500)console.error('请求处理失败',error instanceof Error?error.message:'unknown');send(res,status,{error:status===500?'服务处理失败，请查看服务端记录':(error as Error).message});}
  }),{knowledgeCollector:collector});
}
