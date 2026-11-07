import {startFactoryPatrol} from '../enterprise/lib/factory.js';
// Persistent single-computer service. Enterprise deployments still use main.ts + PostgreSQL.
import {PGlite} from '@electric-sql/pglite';
import {Store} from '../enterprise/lib/db.js';
import {EnterpriseService} from '../enterprise/lib/service.js';
import {createApi} from '../enterprise/lib/http.js';
import {DshExecutor,Scheduler} from '../enterprise/lib/worker.js';
import {installSample} from '../enterprise/lib/sample.js';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=resolve('local-enterprise-data');await mkdir(root,{recursive:true});
const configFile=join(root,'local-secrets.json');let config;
try{config=JSON.parse(await readFile(configFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;config={key:randomBytes(32).toString('hex'),bootstrap:randomBytes(24).toString('hex'),password:randomBytes(18).toString('base64url')};await writeFile(configFile,JSON.stringify(config),{mode:0o600,flag:'wx'});}
const databaseName=config.databaseDirectory||'postgres';if(!/^postgres(?:-[a-zA-Z0-9]+)*$/.test(databaseName))throw new Error('本机数据库目录配置无效');
const database=new PGlite(join(root,databaseName));
let tail=Promise.resolve();async function acquire(){const before=tail;let release;tail=new Promise(r=>release=r);await before;return release;}
const store=new Store({query:async(sql,params)=>{const release=await acquire();try{return await database.query(sql,params);}finally{release();}},connect:async()=>{const release=await acquire();return {query:(sql,params)=>database.query(sql,params),release};}});
await store.initialize();const service=new EnterpriseService(store,config.key);
if(!(await store.db.query('SELECT id FROM users LIMIT 1')).rows.length){await service.bootstrap({name:'本机管理员',login:'admin',password:config.password});const {actor}=await service.login('admin',config.password);await installSample(service,actor);await service.publish(actor,'project-delivery');}
const scheduler=new Scheduler(store,new DshExecutor(store,config.key,root,resolve('upstream/deepseek-harness-master')));scheduler.start();
const stopFactoryPatrol=startFactoryPatrol(service);
const api=createApi(service,root,config.bootstrap,{folderRoot:process.env.ENTERPRISE_KNOWLEDGE_ROOT||'D:/prj'});api.requestTimeout=30000;
api.on('error',async e=>{console.error('本机服务无法启动：'+e.message);await stopFactoryPatrol();await scheduler.stop();await database.close();process.exit(1);});
api.listen(18080,'127.0.0.1',()=>console.log('LOCAL_ENTERPRISE_READY http://127.0.0.1:18080'));
let stopping=false;async function stop(){if(stopping)return;stopping=true;api.closeAllConnections();api.close();await stopFactoryPatrol();await api.knowledgeCollector.close();await scheduler.stop();await store.db.query('CHECKPOINT');await database.close();console.log('LOCAL_ENTERPRISE_STOPPED');process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
const stopRequest=join(root,'stop-request');const stopTimer=setInterval(async()=>{try{await readFile(stopRequest);await unlink(stopRequest);await stop();}catch(e){if(e.code!=='ENOENT')console.error('本机服务正常停机失败：'+e.message);}},1000);stopTimer.unref();
