import {ActionMenu} from './ActionMenu.tsx';
import {InspectorProvider,InspectorFrame,useInspector} from './Inspector.tsx';
import {FlowConfigAssistant} from './FlowConfigAssistant.tsx';
import {WorkspaceProvider,useWorkspace} from './WorkspaceContext.tsx';
import {BusinessCommand} from './BusinessCommand.tsx';
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {shellStyles} from './shell-styles.ts';
import {BusinessAssistantContext} from './AssistantContext.tsx';

export function WorkbenchShell(props:any){return <WorkspaceProvider><InspectorProvider><ShellBody {...props}/></InspectorProvider></WorkspaceProvider>;}
function ShellBody({renderMain,renderSidebar,renderAuxiliary,renderOverlays,renderBottom,auxiliaryShown,panels,selection,navigate,newSession,openPlugins}:any){
  const workspace=useWorkspace(),inspector=useInspector();
  const available=useSyncExternalStore<any[]>(panels.subscribe,panels.getSnapshot);
  const activePanel=useSyncExternalStore<any>(selection.subscribe,selection.getSnapshot).activePanelId;
  const selected=activePanel||'enterprise';
  const [workspaceMode,setWorkspaceMode]=useState('text'),[flowWidth,setFlowWidth]=useState(400);
  const [workspaceRequest,setWorkspaceRequest]=useState<{page:string;sequence:number}>();
  const requestWorkspace=(page:string)=>{workspace.open({view:page==='business'?'home':page==='knowledge'?'knowledge':page==='operations'?'operations':'flow',section:undefined});navigate('enterprise');};
  useEffect(()=>{inspector.setOpen(!!(workspace.state.view==='flow'&&workspace.state.flowMode==='run'&&workspace.state.runId||workspace.state.view==='knowledge'&&workspace.state.wikiId));inspector.setAiMode(workspace.state.view==='flow'&&workspace.state.flowMode==='design'?'flow':'business');},[workspace.state.view,workspace.state.flowMode]);
  const [opened,setOpened]=useState<string[]>(['enterprise']);
  const [businessTask,setTask]=useState<any>(null),[gateway,setGateway]=useState<any>(null),[commandMode,setCommandMode]=useState('business');
  const pageIds=[...new Set([...opened,selected])].filter(id=>available.some(p=>p.id===id));
  const [drawer,setDrawer]=useState(false),[message,setMessage]=useState(''),[width,setWidth]=useState(()=>{try{return Math.max(340,Math.min(560,Number(localStorage.getItem('enterprise.console.width'))||400));}catch{return 400;}});
  const frame=useRef<HTMLDivElement>(null),consoleRef=useRef<HTMLElement>(null),drag=useRef<any>(null),navigation=useRef<HTMLElement>(null);
  const flowFocused=workspaceMode==='flow'&&selected==='enterprise';
  const knowledgeFocused=selected==='enterprise'&&workspaceMode==='knowledge';
  const operationsFocused=selected==='enterprise'&&workspaceMode==='operations';
  const canvasFocused=flowFocused||knowledgeFocused||operationsFocused;
  const activeWidth=canvasFocused?flowWidth:width;
  const title=operationsFocused?'协作大屏':knowledgeFocused?'企业知识库':available.find((p:any)=>p.id===selected)?.label||'企业工作台';
  useEffect(()=>{setDrawer(false);},[activePanel]);
  useEffect(()=>{setOpened(current=>current.includes(selected)?current:[...current,selected]);},[selected]);
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setDrawer(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
  useEffect(()=>{try{localStorage.setItem('enterprise.console.width',String(width));}catch{}},[width]);
  useEffect(()=>{navigation.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[selected]);
  const focusConsole=()=>{inspector.setOpen(true);inspector.setTab('assistant');inspector.setAiMode('personal');setCommandMode('personal');const input=consoleRef.current?.querySelector<HTMLElement>('.es-command-content [contenteditable="true"],.es-command-content textarea');input?.focus();};
  const resize=(value:number)=>(canvasFocused?setFlowWidth:setWidth)(Math.round(Math.max(340,Math.min(560,(frame.current?.clientWidth||1200)*.48,value))));
  const copyDraft=async()=>{const input=consoleRef.current?.querySelector<HTMLElement>('.es-command-content [contenteditable="true"],.es-command-content textarea');const text=input instanceof HTMLTextAreaElement?input.value:input?.innerText||'';try{if(!text.trim()){setMessage('AI 命令台中还没有草稿');return;}await navigator.clipboard.writeText(text);setMessage('草稿已复制');}catch{setMessage('复制未完成，请在输入框内选择文字后复制');}};
  return <BusinessAssistantContext.Provider value={{setTask,setGateway,setWorkspaceMode,workspaceRequest,requestWorkspace}}><div className="es-frame" data-panel-open={inspector.open} data-workbench-mode={flowFocused?'flow':knowledgeFocused?'knowledge':operationsFocused?'operations':'text'} ref={frame} style={{'--es-console-width':activeWidth+'px'} as React.CSSProperties}>
    <style>{shellStyles+unifiedShellStyles}</style>
    <header className="es-bar"><div className="es-brand"><span className="es-mark" aria-hidden="true">企</span><strong>企业人机协作工作台</strong></div><div className="es-actions"><button onClick={()=>setDrawer(true)} aria-expanded={drawer}>会话与工作区</button><ActionMenu label="应用">{available.filter(p=>p.id!=='enterprise').map(p=><button key={p.id} onClick={()=>navigate(p.id)}>{p.label}</button>)}<button onClick={openPlugins}>插件管理</button>{[['map','企业业务地图'],['factory','制造业务'],['projects','项目与任务'],['components','组件库'],['employees','数字员工']].map(([id,label])=><button key={id} onClick={()=>{workspace.open({view:'home',section:id});navigate('enterprise');}}>{label}</button>)}</ActionMenu><ActionMenu label="设置">{[['departments','组织'],['users','账号与权限'],['models','模型服务'],['home','首页配置'],['migration','旧版迁移'],['backup','备份恢复'],['audit','操作审计']].map(([id,label])=><button key={id} onClick={()=>{workspace.open({view:'home',section:'settings',settingsTab:id});navigate('enterprise');}}>{label}</button>)}</ActionMenu>{!flowFocused&&<button onClick={()=>inspector.showAI()}>助手</button>}</div></header>
    <nav className="es-tabs" ref={navigation} aria-label="工作台插件导航">{[['flow','流程工作台'],['business','企业总览'],['knowledge','企业知识库'],['operations','协作中心']].map(([id,label])=><button key={id} aria-current={selected==='enterprise'&&workspace.state.view===(id==='business'?'home':id)?'page':undefined} onClick={()=>requestWorkspace(id)}>{label}</button>)}</nav>
    <div className="es-workspace">
      <section className="es-page" aria-label={'插件页面：'+title}><div className="es-page-heading" hidden={canvasFocused}><strong>{title}</strong><span>业务与插件工作区</span></div><div className="es-page-content">{pageIds.map(id=><div key={id} className="es-page-instance" hidden={id!==selected}>{renderMain(id)}</div>)}</div></section>
      <div hidden={!inspector.open} className="es-divider" role="separator" aria-label="调整 AI 命令台宽度" aria-orientation="vertical" aria-valuemin={340} aria-valuemax={560} aria-valuenow={activeWidth} tabIndex={0}
        title="按住拖动调整宽度，也可用左右方向键调整"
        onPointerDown={e=>{e.preventDefault();drag.current={x:e.clientX,width:consoleRef.current?.getBoundingClientRect().width||activeWidth};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(drag.current)resize(drag.current.width+drag.current.x-e.clientX);}}
        onPointerUp={e=>{drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}}
        onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();resize(e.key==='Home'?340:e.key==='End'?560:activeWidth+(e.key==='ArrowLeft'?20:-20));}}}/>
      <div className="es-command unified-shell-panel" hidden={!inspector.open} ref={consoleRef}><InspectorFrame><div className="inspector-assistant-menu"><ActionMenu label="助手选项"><button onClick={()=>inspector.setAiMode(workspace.state.view==='flow'&&workspace.state.flowMode==='design'?'flow':'business')}>当前业务助手</button><button onClick={focusConsole}>个人 DSH 对话</button></ActionMenu></div><div hidden={inspector.aiMode!=='flow'||inspector.contextKind==='knowledge'||workspace.state.view==='knowledge'}><FlowConfigAssistant/></div><div hidden={inspector.aiMode!=='business'||inspector.contextKind==='knowledge'||workspace.state.view==='knowledge'}>{gateway?<BusinessCommand {...gateway}/>:<p>登录企业服务后使用业务助手。</p>}</div><div className="es-command-content" hidden={inspector.aiMode!=='personal'}><div className="es-command-heading"><button onClick={()=>Promise.resolve(newSession()).then(focusConsole)}>新对话</button><button onClick={copyDraft}>复制草稿</button></div>{renderMain('conversation')}</div></InspectorFrame></div>
    {drawer&&<div className="es-drawer-layer"><button className="es-drawer-mask" aria-label="关闭会话与工作区" onClick={()=>setDrawer(false)}/><aside className="es-drawer" aria-label="会话与工作区"><div className="es-drawer-heading"><strong>会话与工作区</strong><button onClick={()=>setDrawer(false)}>返回工作台</button></div><div className="es-drawer-body">{renderSidebar()}</div></aside></div>}
      <div className="es-auxiliary" data-open={auxiliaryShown||undefined}>{renderAuxiliary()}</div>
    </div>
    {message&&<div className="es-notice" role="status">{message}<button onClick={()=>setMessage('')}>关闭提示</button></div>}
    {renderBottom()}
    <div className="es-overlays">{renderOverlays()}</div>
  </div></BusinessAssistantContext.Provider>;
}

const unifiedShellStyles=`.es-frame{container-type:inline-size}.es-frame .es-bar{padding-right:156px!important}.inspector-assistant-menu{padding:8px 12px;border-bottom:1px solid #e0e8f0}.es-actions{display:flex;gap:6px}.es-tabs button{font-size:14px}.es-frame[data-workbench-mode] .es-workspace{grid-template-columns:minmax(0,1fr) 10px var(--es-console-width)}.es-frame[data-panel-open=false] .es-workspace{grid-template-columns:minmax(0,1fr)}.es-command.unified-shell-panel{padding:0;border:0;overflow:visible;background:transparent;border-radius:0;min-width:0}.es-command.unified-shell-panel>.unified-inspector{width:100%}.es-workspace>[hidden]{display:none!important}.es-frame[data-panel-open=false] .es-workspace{grid-template-columns:minmax(0,1fr)}.es-frame[data-panel-open=false] .es-divider{display:none}.es-frame .es-page-heading{display:none}.es-frame .es-workspace{position:relative}.es-frame .es-business-console{padding:14px}.es-frame .es-business-console h3{font-size:15px}.es-command-content[hidden]{display:none!important}@container(max-width:959px){.es-frame[data-workbench-mode] .es-workspace{grid-template-columns:minmax(0,1fr)}.es-frame .es-divider{display:none}.es-frame .unified-shell-panel{position:absolute;right:0;top:0;bottom:0;width:min(var(--es-console-width),94%);z-index:800;box-shadow:-8px 8px 30px #173e6333}}`;
