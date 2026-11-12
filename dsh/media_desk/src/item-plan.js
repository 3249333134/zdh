import { createHash } from 'node:crypto'
import { productionSpec } from './production-spec.js'
export const confirmedItemPlan = (workflow, itemId) => workflow?.proposals.find(row =>
 row.sourceItemId === itemId && row.projectId && workflow.projects.some(project => project.id === row.projectId))

export function itemProposal(item) {
 const p=item.production
 if (p?.status!=='done' || item.workflowProjectId) return null
 const spec=productionSpec(item.productionSpec || p.spec || {durationSec:Math.max(10,p.durationSec || (p.shots||[]).reduce((n,s)=>n+(Number(s.seconds)||0),0) || 60),shotCount:p.shots?.length || 6})
 const shots=p.shots || [], signature=createHash('sha256').update(JSON.stringify([4,p.title,p.article,shots.map(s=>[s.title,s.shot,s.description,s.visual,s.voice,s.prompt,s.seconds,s.framing,s.scale]),spec])).digest('hex').slice(0,20)
 const id='item-plan:'+item.id+':'+signature, title=p.title || item.title
 const task=(key,name,module,kind,dependencies,description,deliverable,estimateMin=30)=>({id:key,title:name,group:title,video:title,module,kind,executor:'me',estimateMin,dependencies,description,deliverable,acceptance:'交付物实际保存并可供下一步使用；缺少素材时标记受阻，不虚报完成。',spec})
 const tasks=[task('check','核对成稿与制作规格','content','script',[],`沿用已有成稿，不重复生成。核对目标时长 ${spec.durationSec} 秒、${spec.shotCount} 个镜头，逐段检查口播与事实。`,'确认后的脚本、口播及勘误清单',20),task('board','分镜落入影策画布','drama','text',['check'],'把现有分镜保存到影策画布，逐镜明确景别、机位、镜头运动、时长、人物与道具；已有参考图继续复用。','实际关联的影策项目与分镜画布',40)]
 const shootIds=[]
 for(let i=0;i<spec.shotCount;i++) {const shot=shots[i]||{},key='shot'+(i+1),source=spec.shotSources?.[i]||'shoot';shootIds.push(source==='ai'?key+'-video':key);const method=source==='screen'?'录屏：设定画面比例，隐藏通知与隐私，按脚本演示并留转场余量':source==='local'?'本地素材：检索已导入素材，核对授权、清晰度、比例、时长和字幕安全区':source==='ai'?'AI 制作：在影策核对提示词和参考图，再明确确认生成；已有可用成图直接复用':'实拍：列出人物、道具、地点，固定机位、对焦与曝光；先试拍，检查收音、光线和构图，再拍正式镜头并留前后余量';tasks.push(task(key,`镜头 ${i+1} · ${shot.title||shot.shot||'画面制作'}`,'drama',source==='ai'?'images':'shoot',['board'],[method,shot.description||shot.visual,shot.voice?'口播／旁白：'+shot.voice:'',shot.prompt,`镜头时长：${shot.seconds||Math.round(spec.durationSec/spec.shotCount)} 秒；景别：${shot.framing||shot.scale||shot.shot||'按画面意图核定'}`].filter(Boolean).join('\n'),'绑定此镜头的实际本地素材或生成结果，并说明使用段落',source==='ai'?20:40)); if(source==='ai')tasks.push({...task(key+'-video',`镜头 ${i+1} · 视频制作`,'drama','video',[key],`复用镜头 ${i+1} 已有参考图和画面提示词，先核对时长与镜头运动，再在影策明确确认视频生成；也可改为实拍或录屏并绑定可用视频。不要把静态分镜图当作已拍摄素材。`,'可读取的镜头视频，已绑定本地素材索引',30),executionMode:'ai-video',executor:'ai'})}
 tasks.push(task('edit','剪辑、字幕与导出','autoclip','edit',shootIds,'按分镜顺序整理素材，核对口播、节奏、转场、字幕安全区和音量；先看草稿再确认导出。','实际 AutoClip 项目、剪辑草稿和可播放导出文件',60),task('publish','发布准备与人工发布','content','publish',['edit'],'沿用成稿标题、简介和封面；核对成片、画面比例、字幕、版权及平台要求，人工发布后登记链接。','标题、简介、封面、成片、检查清单及发布结果',20),task('review','发布效果复盘','insights','review',['publish'],'收集实际播放、点击、互动与反馈，归纳可复用做法；无数据时记录待补，不编造表现。','有事实依据的复盘与改进清单',30))
 for (const row of tasks) if (row.kind === 'images') { row.executor = 'ai'; row.executionMode = 'ai-image' }
 return {id,sourceItemId:item.id,sourceSignature:signature,title:'制作：'+title,goal:'将已成稿选题制作并发布：'+title,summary:'复用已有脚本与参考图，逐镜安排制作、拍摄、素材绑定、剪辑与发布。确认后同步排期。',tasks,status:'draft',createdAt:new Date().toISOString()}
}
export function collectItemPlans(state) {
 state.workflow ||= {revision:0,projects:[],tasks:[],proposals:[],receipts:[]}
 let count=0
 for(const item of state.items||[]) {if(confirmedItemPlan(state.workflow,item.id))continue;const proposal=itemProposal(item);if(proposal&&!state.workflow.proposals.some(p=>p.id===proposal.id)){state.workflow.proposals=state.workflow.proposals.filter(p=>p.sourceItemId!==item.id||p.status!=='draft');state.workflow.proposals.push(proposal);count++}}
 if(count)state.workflow.revision++
 return count
}
