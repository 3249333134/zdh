import { extractJson } from './ai.js'
import { applyMotionOperations } from './motion-operations.js'

export async function planMotionCommand({project,selectedId,time,message,call}) {
  const selected = project.clips.find(c=>c.id===selectedId)
  const context = {title:project.title,duration:project.duration,targetDuration:project.videoTargetDuration||30,time,markers:project.markers||[],selected,tracks:project.tracks,clips:project.clips.map(({code,...c})=>c),assets:project.assets.map(({id,name,kind,duration})=>({id,name,kind,duration}))}
  const system = `你操作当前 Motion 剪辑工程。返回严格JSON {reply,task,operations,instruction,targetDuration,mood}。
task只能是 edit-video（重新剪辑全片）,finish（自动剪辑全片、真实语音字幕与配乐）,music,subtitles,generate（动画，含选中动画重写）,translate,speech,export,undo,operations,answer。
明确要求完整制作、自动剪辑配乐字幕才用finish；只要求剪辑全片用edit-video。选中片段修改必须用operations，不得重新剪全片。operations为[{type,id,...}]，type只允许move(start),trim(duration),source(inPoint),volume(volume 0到1),delete,text(text),caption(text)。时间都是秒。可用多个操作。只能引用提供的id。选中视频有联动原声，系统会同步移动裁剪。换一个源区间用source，长度不变。只改一个片段不要改其他片段。
用户未给片段且存在选中片段时优先它；指定片段名称、序号或时间时准确匹配；歧义用answer提问，不猜测。caption是编辑标题，subtitles是真实语音转写。无素材先让用户导入。不假称已完成。mood为cinematic/chill/upbeat。instruction保留原始要求。translate的instruction填写目标语言。`
  const trackHelp='还支持operations中的split(time，工程时间秒)、duplicate（复制片段）、track(trackId,muted?,hidden?,locked?,name?)用于音轨静音、画面轨隐藏、轨道锁定与重命名。track不用片段id。'
  const transformHelp='还支持transform(id,x?,y?,width?,height?,rotation?[-360到360],opacity?[0到1],fit?[contain或cover])画面变换；fade(id,seconds[0到3])首尾淡化。timeline markers提供标记时间，可按标记定位但不能编造标记。'
  const answer=await call({system:system+trackHelp+transformHelp,user:JSON.stringify({message,context}),maxTokens:3000})
  const plan=extractJson(answer.text)
  if(!['edit-video','finish','music','subtitles','generate','translate','speech','export','undo','operations','answer'].includes(plan.task)) throw Error('助手没有返回可执行的操作，请重试')
  if(plan.task==='operations') {
    if(selectedId && /选中|这一段|这段/.test(message) && plan.operations?.some(op=>op.id && op.id!==selectedId)) throw Error('助手选择了其他片段，本次没有执行。请重试选中片段的修改')
    applyMotionOperations(project,plan.operations,selectedId)
  }
  return plan
}
