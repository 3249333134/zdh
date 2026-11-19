import React from 'react'
import catalog from './motion-catalog.json'
export function MotionTemplatePanel({project,selectedId,onSelect,onOriginal,busy,job}) {
 const chosen=catalog.find(t=>t.id===selectedId)||catalog[0]
 const [seconds,setSeconds]=React.useState(30)
 return <div className="me-template-panel"><select aria-label="当前剪辑模板" value={chosen.id} onChange={e=>onSelect(e.target.value)}>{catalog.map(t=><option value={t.id} key={t.id}>{t.title}</option>)}</select><img src={'media-desk/motion-cover/'+chosen.id+(/\.[a-z]+$/i.exec(new URL(chosen.poster).pathname)?.[0]||'.jpg')} alt={chosen.title}/><h3>{chosen.title}</h3><p>{chosen.summary}</p><p>原包已导入 · {chosen.version} · {chosen.ratio}</p><label>成片目标（秒）<input type="number" min="8" max="84" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label><button className="me-primary" disabled={busy||!project.clips.some(c=>c.type==='video')||!Number.isFinite(seconds)||seconds<8||seconds>84} onClick={()=>onOriginal(chosen,seconds)}>应用原版模板到时间线</button><p className="me-help">用当前视频与本期文案渲染原版动效，完成后加入独立画面轨和声音轨。支持 8–84 秒；片段可继续裁剪、移动和调音量。</p>{job&&<p role="status">{job}</p>}<p className="me-help">模板来自 motiontemplates/all，已通过原包完整性校验。其他尚不可制作的目录项已移除。</p></div>
}
