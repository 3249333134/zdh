import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),workspace=path.resolve(root,'../..')
const project=JSON.parse(await fs.readFile(path.join(root,'../media-workbench/data/motion-editor/23d9104c-3496-43e2-af44-44097e2f3073/project.json'),'utf8'))
const css=await fs.readFile(path.join(root,'client/motion-editor.css'),'utf8')
const publicProject={...project,assets:project.assets.map(({path,...a})=>a),previewUrls:Object.fromEntries(project.assets.map(a=>[a.id,'/asset/'+a.id]))}
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {MotionTimeline} from ${JSON.stringify(path.join(root,'client/motion-timeline.jsx'))};function App(){const[p,setP]=React.useState(${JSON.stringify(publicProject)}),[selected,select]=React.useState(''),[time,seek]=React.useState(0),[zoom,setZoom]=React.useState(90);return <div className="me"><h2>Motion · 多轨自由剪辑</h2><p>多段视频、原声、字幕和动画都可继续编辑</p><MotionTimeline project={p} selected={selected} onSelect={select} time={time} onSeek={seek} playing={false} onPlay={()=>{}} zoom={zoom} onZoom={setZoom} onChange={v=>setP(old=>typeof v==='function'?v(old):v)} onPreview={setP} onCommit={(old,v)=>setP(v)} onUndo={()=>{}} onRedo={()=>{}} canUndo={false} canRedo={false} busy={false} onImport={()=>{}} onWaveforms={()=>{}}/></div>}createRoot(document.getElementById('root')).render(<App/>);`
const result=await build({stdin:{contents:source,resolveDir:workspace,loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'transform',jsxFactory:'React.createElement',define:{'process.env.NODE_ENV':'"production"'}})
const js=result.outputFiles[0].contents
const server=http.createServer(async(req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');res.end(js);return}
 if(req.url?.startsWith('/asset/')){const a=project.assets.find(a=>'/asset/'+a.id===req.url);if(!a){res.writeHead(404).end();return}const b=await fs.readFile(a.path);res.setHeader('content-type','video/mp4');res.end(b);return}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><style>body{margin:0;background:#080d13}'+css+'</style><div id="root"></div><script src="/bundle.js"></script></html>')
})
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port))
