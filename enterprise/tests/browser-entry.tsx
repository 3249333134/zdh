import React from 'react';
import {createRoot} from 'react-dom/client';
import {EnterpriseApp} from '../client/App.tsx';
let token=sessionStorage.getItem('test-token')||'',actor=JSON.parse(sessionStorage.getItem('test-actor')||'null');
async function call(request:any){
  if(request.operation==='status')return {url:location.origin,actor};
  if(request.operation==='connect')return {url:location.origin};
  if(request.operation==='disconnect'){token='';actor=null;sessionStorage.clear();return {ok:true};}
  const headers:any={authorization:'Bearer '+token,'content-type':'application/json',...(request.key?{'idempotency-key':request.key}:{})};
  let body=request.body===undefined?undefined:JSON.stringify(request.body);if(request.file){headers['content-type']='application/octet-stream';headers['x-file-name']=encodeURIComponent(request.file.name);headers['x-department-id']=request.file.departmentId;body=Uint8Array.from(atob(request.file.base64),c=>c.charCodeAt(0));}
  const response=await fetch(request.path,{method:request.method||'GET',headers,body});
  if(request.binary&&response.ok){let b='';for(const x of new Uint8Array(await response.arrayBuffer()))b+=String.fromCharCode(x);return {base64:btoa(b)};}
  const value=await response.json();if(!response.ok)throw new Error(value.error);
  if(request.path==='/api/login'){token=value.token;actor=value.actor;sessionStorage.setItem('test-token',token);sessionStorage.setItem('test-actor',JSON.stringify(actor));return {actor};}return value;
}
createRoot(document.getElementById('root')!).render(<EnterpriseApp call={call} openChat={()=>{}} openPlugins={()=>{}} localBackup={async()=>({format:'enterprise-workbench',version:1,data:{projects:[],tasks:[],materials:[]}})}/>);
