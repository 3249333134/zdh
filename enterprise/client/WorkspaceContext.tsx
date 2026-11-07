import React,{createContext,useCallback,useContext,useRef,useState} from 'react';
export type WorkspaceState={view:'flow'|'home'|'knowledge'|'operations';flowMode:'design'|'run';intakeDraftId?:string;section?:string;settingsTab?:string;startVersionId?:string;projectId?:string;definitionId?:string;instanceId?:string;runId?:string;nodeId?:string;taskId?:string;wikiId?:string;wikiQuery?:string;wikiCategory?:string;sourceId?:string};
const initial:WorkspaceState={view:'flow',flowMode:'design'};
const Context=createContext<any>({available:false,state:initial,open:()=>{},select:()=>{},back:()=>{},bind:()=>{},canBack:false});
export const useWorkspace=()=>useContext(Context);
export function WorkspaceProvider({children}:any){const [state,setState]=useState<WorkspaceState>(initial),[history,setHistory]=useState<WorkspaceState[]>([]);const key=useRef('');
 const write=(value:WorkspaceState)=>{if(key.current)try{localStorage.setItem(key.current,JSON.stringify(value));}catch{}};
 const select=useCallback((patch:Partial<WorkspaceState>)=>setState(old=>{const next={...old,...patch};write(next);return next;}),[]);
 const open=useCallback((patch:Partial<WorkspaceState>)=>setState(old=>{setHistory(h=>[...h,old].slice(-30));const next={...old,...patch};write(next);return next;}),[]);
 const back=()=>setHistory(old=>{if(!old.length)return old;const next=old[old.length-1];setState(next);write(next);return old.slice(0,-1);});
 const bind=(server:string,actor:any,data:any)=>{const nextKey='enterprise.workspace.v1:'+server+':'+actor.id;if(key.current===nextKey)return;key.current=nextKey;let saved:any={};try{saved=JSON.parse(localStorage.getItem(nextKey)||'{}');}catch{}const next:any={...initial};if(data.projects.some((p:any)=>p.id===saved.projectId))next.projectId=saved.projectId;if(data.definitions.some((d:any)=>d.id===saved.definitionId))next.definitionId=saved.definitionId;const i=data.instances.find((i:any)=>i.id===saved.instanceId);if(i){next.instanceId=i.id;next.definitionId=i.version.definitionId;next.projectId=i.business?.projectId;const r=i.runs.find((r:any)=>r.id===saved.runId);if(r){next.runId=r.id;next.nodeId=r.nodeId;if(data.tasks.some((t:any)=>t.id===saved.taskId&&t.sourceInstanceId===i.id))next.taskId=saved.taskId;}next.flowMode=saved.flowMode==='design'?'design':'run';}setState(next);setHistory([]);};
 return <Context.Provider value={{available:true,state,open,select,back,bind,canBack:history.length>0}}>{children}</Context.Provider>;}

export function requestContext(state:any,data:any){const next={...state};const d=data.definitions.find((d:any)=>d.id===next.definitionId);if(!d){delete next.definitionId;delete next.nodeId;}else if(!d.nodes.some((n:any)=>n.id===next.nodeId))delete next.nodeId;return next;}
