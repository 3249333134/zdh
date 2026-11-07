import React,{useEffect,useRef} from 'react';
import {randomUnit as rand} from './ops-geometry.ts';
export interface OpsFieldModel{nodes:any[];agents:any[];runs:any[];edges:any[];night:boolean;motion:boolean;onPick:(node:any)=>void;}
const W=1600,H=800;
export function fieldPoint(i:number){return {x:18+rand(i+3)*560,y:30+rand(i+73)*740};}
export function bandX(y:number,outer=false){const ry=outer?930:760,rx=outer?1060:815;return -64+rx*Math.sqrt(Math.max(0,1-((y-400)/ry)**2));}
export function hubPoint(i:number){const y=[164,402,642][i%3];return {x:bandX(y)-13,y};}
function groupFor(node:any,model:OpsFieldModel){return ['human','approval'].includes(node.kind)?1:node.agentId?0:2;}
export function OpsField(model:OpsFieldModel){
 const canvas=useRef<HTMLCanvasElement>(null),state=useRef(model),clock=useRef(0),redraw=useRef<(()=>void)|null>(null);state.current=model;
 useEffect(()=>{const el=canvas.current;if(!el)return;const ctx=el.getContext('2d',{alpha:false});if(!ctx)return;let timer=0,last=0,time=clock.current,visible=true,width=0,height=0,stopped=false;const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const paint=()=>{const stamp=performance.now();if(stopped||!visible||document.hidden)return;const m=state.current,animate=m.motion&&!reduce.matches&&m.runs.some(r=>r.status==='running');if(last&&animate)time+=Math.min(80,stamp-last)/1000;last=stamp;clock.current=time;
   const rect=el.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.8);if(!rect.width||!rect.height)return;if(width!==Math.round(rect.width*dpr)||height!==Math.round(rect.height*dpr)){width=el.width=Math.round(rect.width*dpr);height=el.height=Math.round(rect.height*dpr);}ctx.setTransform(width/W,0,0,height/H,0,0);const ink=m.night?'#c7cec8':'#242922',muted=m.night?'#9ba59c':'#747c6e',paper=m.night?'#0d120f':'#eeefe7';ctx.fillStyle=paper;ctx.fillRect(0,0,W,H);
   const line=(a:{x:number;y:number},b:{x:number;y:number},alpha:number,offset=0)=>{ctx.globalAlpha=alpha;ctx.strokeStyle=ink;ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x+offset,b.y);ctx.stroke();};
   const nodes=m.nodes.slice(0,140),current=new Map(m.runs.map(r=>[r.nodeId,r]));
   // Each repeated strand is a visual ribbon for one configured relationship, not another task.
   nodes.forEach((node,i)=>{const a=fieldPoint(i),b=hubPoint(groupFor(node,m)),r=current.get(node.id);for(let strand=0;strand<5;strand++)line({x:a.x+strand*.9,y:a.y+0},b,.08+rand(i+strand)*.13,strand*.5);for(const e of m.edges.filter(e=>e.from===node.id)){const target=nodes.findIndex(n=>n.id===e.to);if(target>=0)line(a,fieldPoint(target),.32);}
    const moving=r?.status==='running';if(moving){const t=(time*(.06+rand(i)*.12)+rand(i+45))%1;ctx.globalAlpha=.75;ctx.fillStyle=ink;ctx.fillRect(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,2.2,1.7);}ctx.globalAlpha=.6;ctx.fillStyle=ink;ctx.fillStyle=r?.status==='waiting'?'#a57b24':r?.status==='failed'||r?.status==='unknown'?'#a8402d':ink;ctx.fillRect(a.x-1.5,a.y-1.5,4,4);
   });
   // Fisheye dispatch band; the inner and outer ellipses intentionally have different curvature.
   ctx.globalAlpha=1;ctx.fillStyle=paper;ctx.beginPath();ctx.moveTo(bandX(0),0);for(let y=0;y<=H;y+=4)ctx.lineTo(bandX(y),y);ctx.lineTo(bandX(H,true),H);for(let y=H;y>=0;y-=4)ctx.lineTo(bandX(y,true),y);ctx.closePath();ctx.fill();
   for(const outer of [false,true])for(let lane=0;lane<4;lane++){ctx.strokeStyle=muted;ctx.globalAlpha=lane===0?.75:.2;ctx.lineWidth=lane===0?.9:.5;ctx.beginPath();for(let y=0;y<=H;y+=4){const x=bandX(y,outer)+(outer?1:-1)*lane*6;y===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
   for(let i=0;i<145;i++){const y=i*H/145,x=bandX(y,true),tilt=(y-400)*.00063;ctx.save();ctx.translate(x-10,y);ctx.rotate(tilt);ctx.globalAlpha=.6;ctx.fillStyle=ink;ctx.fillRect(0,0,i%5===0?9:4,1);if(i%5===0){ctx.font='8px Consolas,monospace';ctx.fillText(String(i).padStart(3,'0'),-23,2);}ctx.restore();}
   const agents=m.agents.slice(0,14);agents.forEach((agent,i)=>{const y=26+(i+.5)*742/Math.max(1,agents.length),x=bandX(y)+22,assigned=nodes.filter(n=>n.agentId===agent.id||agent.human&&['human','approval'].includes(n.kind)),busy=assigned.some(n=>current.get(n.id)?.status==='running'),tilt=(y-400)*.0009;ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.fillStyle=ink;ctx.globalAlpha=.95;ctx.fillRect(-3,-11,110,12);ctx.fillStyle=paper;ctx.font='bold 10px Consolas,"Microsoft YaHei",sans-serif';ctx.fillText(String(i+1).padStart(2,'0')+' / '+agent.name,1,-2);ctx.fillStyle=ink;ctx.globalAlpha=.7;ctx.font='8px Consolas,monospace';ctx.fillText('NODES '+assigned.length+' / '+(busy?'RUNNING':assigned.some(n=>current.get(n.id)?.status==='waiting')?'WAITING':'CONFIGURED'),1,14);ctx.fillText('scope / '+(agent.human?'human gate':'authorized'),1,26);ctx.restore();
    const bx=x+148,by=y-24;assigned.slice(0,25).forEach((n,k)=>{const r=current.get(n.id);ctx.globalAlpha=r?.status==='running'?.4+.4*Math.sin(time*5):.75;ctx.fillStyle=r?.status==='waiting'?'#a57b24':r?.status==='failed'||r?.status==='unknown'?'#a8402d':ink;ctx.fillRect(bx+(k%5)*6,by+Math.floor(k/5)*6,4,4);});
   });
   // One lane per persisted execution record; blocked nodes never generate traffic.
   m.runs.filter(r=>!['blocked','skipped','cancelled'].includes(r.status)).forEach((run,index)=>{
    const node=nodes.find(n=>n.id===run.nodeId);if(!node)return;const y0=60+index*680/Math.max(1,m.runs.filter(r=>!['blocked','skipped','cancelled'].includes(r.status)).length-1),start=bandX(y0,true)+12;
    ctx.fillStyle=run.status==='waiting'?'#a57b24':run.status==='failed'||run.status==='unknown'?'#a8402d':ink;ctx.globalAlpha=.85;ctx.font='10px Consolas,"Microsoft YaHei",sans-serif';ctx.fillText(node.name.slice(0,18),start+5,y0-12);
    for(let k=0;k<12;k++){const active=run.status==='running',progress=(rand(index*17+k+822)+(active?time*(.08+rand(k)*.08):0))%1,x=start+progress*(W-start),y=y0+(k-6)*2;ctx.globalAlpha=active?.45:.16;ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=k%4===0?1.5:.7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(Math.min(W-10,x+20+rand(k+5)*100),y);ctx.stroke();}
   });
   [0,1,2].forEach(i=>{const p=hubPoint(i);ctx.globalAlpha=1;ctx.fillStyle=ink;ctx.fillRect(p.x-112,p.y-18,112,14);ctx.fillStyle=paper;ctx.font='bold 9px Consolas,"Microsoft YaHei",sans-serif';ctx.fillText(['AI / 数字员工','HUMAN / 人工岗位','FLOW / 流程控制'][i],p.x-108,p.y-8);ctx.fillStyle=ink;ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;

  };
  // A bounded clock keeps Electron canvas playback independent of compositor RAF throttling.
  const restart=()=>{window.clearInterval(timer);last=0;if(visible&&!document.hidden){paint();if(state.current.motion&&!reduce.matches&&state.current.runs.some(r=>r.status==='running'))timer=window.setInterval(paint,34);}};
  const resize=new ResizeObserver(restart);resize.observe(el);const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;restart();});observer.observe(el);reduce.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);redraw.current=restart;restart();return()=>{redraw.current=null;stopped=true;window.clearInterval(timer);resize.disconnect();observer.disconnect();reduce.removeEventListener('change',restart);document.removeEventListener('visibilitychange',restart);};
 },[model.motion,model.night]);
 useEffect(()=>{redraw.current?.();},[model.nodes,model.runs]);
 return <div className="or-field" role="group" aria-label="任务到岗位与执行的可交互调度图"><canvas ref={canvas} aria-hidden="true"/><svg viewBox="0 0 1600 800" preserveAspectRatio="none" aria-label="可选任务与调度枢纽">{model.nodes.slice(0,140).map((n,i)=>{const p=fieldPoint(i);return <g className="or-target" key={n.id} role="button" tabIndex={0} aria-label={'流程节点：'+n.name} onClick={()=>model.onPick(n)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();model.onPick(n);}}}><title>{n.name}</title><circle cx={p.x} cy={p.y} r="10"/></g>;})}</svg></div>;
}
