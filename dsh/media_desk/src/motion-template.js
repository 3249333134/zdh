import { normalizeTimeline, tracksOf } from './motion-timeline.js'
import { validateEditor } from './motion-editor.js'
const uid=()=>globalThis.crypto.randomUUID()
export function templateRecipe(template) {
  if(!template?.id||!template.title)throw Error('请选择有效模板')
  const vlog=template.category==='life'||template.slug==='september'
  return {id:template.id,title:template.title,kind:vlog?'vlog':template.category==='talk'?'talk':'montage',duration:vlog?100:30,shot:vlog?5:4,chapters:vlog?['序章','途中','这一刻','尾声']:['开场','展开','重点','收尾']}
}
// Editable arrangement uses the catalog's structure; it does not impersonate its unavailable source package.
export function applyTemplateArrangement(project,template,targetDuration) {
  const recipe=templateRecipe(template),source=project.clips.filter(c=>c.type==='video'&&!c.templateOutput).sort((a,b)=>a.start-b.start)
  const available=source.reduce((n,c)=>n+c.duration,0)
  if(!source.length)throw Error('请先导入一段或多段视频')
  const requested=Number(targetDuration)
  if(!Number.isFinite(requested)||requested<3||requested>600)throw Error('模板编排时长需要在 3–600 秒之间')
  const duration=Math.floor(Math.min(available,requested)*project.fps)/project.fps
  if(duration<1)throw Error('视频素材时长不足')
  const clips=[];let cursor=0
  for(const c of source){let offset=0
    while(offset<c.duration-.05&&cursor<duration-.05){
      const length=Math.floor(Math.min(recipe.shot,c.duration-offset,duration-cursor)*project.fps)/project.fps
      if(length<1/project.fps)break
      const asset=project.assets.find(a=>a.id===c.assetId),linkedSound=project.clips.find(a=>a.type==='audio'&&c.linkId&&a.linkId===c.linkId)
      const video={...c,id:uid(),start:cursor,duration:length,inPoint:(c.inPoint||0)+offset,trackId:'video-main',volume:linkedSound?.volume??(asset?.hasAudio?1:0),linkId:undefined,templateId:template.id}
      clips.push(video);cursor+=length;offset+=length
    }
    if(cursor>=duration-.05)break
  }
  const finalDuration=Math.ceil(cursor*project.fps)/project.fps
  const labels=[project.title,...recipe.chapters.slice(1)]
  for(let i=0;i<4;i++){
    const start=Math.round(finalDuration*i/4*project.fps)/project.fps
    const length=Math.min(2.5,finalDuration-start,finalDuration/4)
    if(length<.3)continue
    clips.push({id:uid(),type:'text',title:`${template.title} · ${recipe.chapters[i]}`,text:String(labels[i]||recipe.chapters[i]).slice(0,35),start,duration:length,x:Math.round(project.width*.07),y:Math.round(project.height*.80),width:Math.round(project.width*.86),fontSize:Math.round(project.width*.035),color:'#ffffff',boxColor:'rgba(0,0,0,.42)',trackId:'captions',templateId:template.id})
  }
  const fresh=normalizeTimeline({...project,duration:finalDuration,clips,tracks:tracksOf(project).filter(t=>!t.id.startsWith('template-')),editTarget:'video',appliedTemplate:{id:template.id,title:template.title,mode:'arrangement'},editSummary:`已按「${template.title}」的${recipe.kind==='vlog'?'开场—过程—重点—收尾 Vlog':'分段叙事'}结构编排 ${finalDuration.toFixed(1)} 秒。视频、原声与章节标题可独立编辑。这是可编辑的结构编排，未调用原版 .motion 动效。`})
  return validateEditor(fresh)
}
