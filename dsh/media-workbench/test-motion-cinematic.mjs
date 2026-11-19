import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { designedSceneCode } from '../media_desk/src/motion-design.js'
import service from './motion-editor.cjs'
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.join(root,'data')
const options={data,ffmpegBin:path.resolve(root,'../.local-runtimes/ffmpeg/ffmpeg-9.0.2-essentials_build/bin')}
const state=JSON.parse(await fs.readFile(path.join(data,'dsh/media-desk/state.json'),'utf8'))
const item=state.items.find(item=>/哈利/.test(item.title));if(!item)throw Error('未找到原稿')
const created=await service({action:'motion-editor-create'},options)
const attached=await service({action:'motion-editor-source',id:created.id,itemId:item.id},options)
if(attached.assets.length<3)throw Error('成稿素材未正确关联')
const repeat=await service({action:'motion-editor-source',id:created.id,itemId:item.id},options)
if(repeat.assets.length!==attached.assets.length)throw Error('成稿素材重复导入')
const designs=[
 {layout:'poster',title:'魔法\n遇见科技',highlight:'第七颗子弹',subtitle:'当哈利用上麻瓜的枪，邓布利多沉默了',imageId:attached.assets[0].id},
 {layout:'metric',value:'7',title:'还没打出去的子弹',subtitle:'另一种力量，改变了故事的想象。'},
 {layout:'compare',title:'两种力量，同一场选择',left:'魔杖',right:'手枪',subtitle:'把魔法还给神秘，还是把真实带进幻想？',imageId:attached.assets[1].id},
 {layout:'statement',title:'最强的武器\n是放下偏见',subtitle:'承认另一种力量，也是一种勇气。',imageId:attached.assets[2].id},
]
const p={...attached,title:'电影感叙事 · 魔法与科技（预览）',script:item.production.article,visualStyle:'cinematic',generationMode:'designed',width:1280,height:720,fps:24,duration:16,
 clips:designs.map((design,i)=>({id:randomUUID(),type:'animation',title:design.title.replace('\n',' · '),start:i*4,duration:4,layer:1,design,code:designedSceneCode(design,{assets:attached.assets,style:'cinematic',index:i})}))}
await service({action:'motion-editor-save',id:p.id,project:p},options)
const job=await service({action:'motion-editor-render',id:p.id},options)
console.log(JSON.stringify({id:p.id,renderId:job.id,images:p.assets.length}))
let status
for(let n=0;n<240;n++){await new Promise(r=>setTimeout(r,500));status=await service({action:'motion-editor-status',id:p.id,renderId:job.id},options);if(status.state!=='rendering')break}
console.log(JSON.stringify(status));if(status.state!=='done')throw Error('电影感预览未完成')
console.log(path.join(data,'motion-editor',p.id,job.id,'video.mp4'))
