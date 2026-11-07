import React from 'react';
import {EnterpriseApp} from '../enterprise/client/App.tsx';
import {WorkbenchShell} from '../enterprise/client/Shell.tsx';
export const inject=['slots','layout','uiWorkspace','connection','theme','locale'];
export function apply(ctx){
  const local=async request=>{const result=await ctx.connection.rpc.call('/api','enterprise/dispatch',{args:{request}});if(!result.ok)throw new Error(result.error?.message||'工作台连接失败');return result.value;};
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'enterprise',inject:()=>({embedded:true,call:request=>local({action:'cloud',...request}),openChat:()=>ctx.layout.selectPanel(null),openPlugins:()=>ctx.get('pluginNavigation')?.openList(),localBackup:()=>local({action:'backup'})})},EnterpriseApp));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'enterprise',order:-100,label:()=> '企业工作台'},({size=20})=>React.createElement('span',{style:{fontSize:size},'aria-hidden':true},'▦')));
  ctx.layout.selectPanel('enterprise');
  let snapshot=[];const listeners=new Set();const label=value=>typeof value==='function'?value():value;
  const refresh=()=>{const metadata=ctx.slots.entries('sidebar.panellist');const seen=new Set();const next=ctx.slots.entries('main').filter(e=>{const key=e.options.key;if(!key||key==='conversation'||seen.has(key))return false;seen.add(key);return true;}).map(e=>({id:e.options.key,label:label(metadata.find(m=>m.options.id===e.options.key)?.options.label)||label(e.options.label)||e.options.key})).sort((a,b)=>a.id==='enterprise'?-1:b.id==='enterprise'?1:0);if(JSON.stringify(next)!==JSON.stringify(snapshot)){snapshot=next;for(const fn of listeners)fn();}};
  ctx.effect(()=>{const off=[ctx.slots.subscribe('main',refresh),ctx.slots.subscribe('sidebar.panellist',refresh),ctx.locale.subscribe(refresh)];refresh();return()=>off.forEach(fn=>fn());});
  const panels={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  ctx.slots.inject('shell.workbench',()=>ctx.slots.register({name:'shell.workbench',inject:()=>({panels,selection:ctx.layout.panelInfo,navigate:key=>ctx.layout.selectPanel(key),newSession:()=>ctx.uiWorkspace.startSession(),openPlugins:()=>ctx.get('pluginNavigation')?.openList()})},WorkbenchShell));
  ctx.theme.setTheme('light');
}
