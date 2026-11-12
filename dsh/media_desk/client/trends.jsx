import React from 'react'
import { HotBadge, OriginalLink } from './card.jsx'
import {Dialog} from './ui.jsx'
import {getDesk,loadDesk,report,useDesk,openItem} from './desk.js'
import {insightRequest} from './audience.jsx'
export function TrendPanel(){
 const [data,setData]=React.useState(null),[form,setForm]=React.useState({}),[busy,setBusy]=React.useState(false),[url,setUrl]=React.useState(''),[auth,setAuth]=React.useState('')
 const items=useDesk(s=>s.state.items)
 const load=async()=>{const d=await insightRequest('trends');setData(d);setForm({enabled:d.enabled,time:d.time,limit:d.limit,keywords:d.keywords})}
 React.useEffect(()=>{load().catch(report)},[])
 const act=async(path,body)=>{setBusy(true);try{await insightRequest('trends/'+path,body);await load();await loadDesk();setAuth('')}catch(e){report(e)}finally{setBusy(false)}}
 if(!data)return <p>正在读取每日收集设置…</p>
 const run=data.runs[0],rows=items.filter(i=>i.trend?.day===run?.day)
 return <div className="md-trend-panel"><p className="md-muted">公开热门／热榜仅作为选题线索；话题热度不代表单条视频爆款。自动收集不调用文字、图片或视频模型。工作台关闭期间不后台采集，打开后补当天一次。</p><div className="md-task-field-grid"><label className="md-field"><span>每日时间（北京时间）</span><input type="time" value={form.time||'09:00'} onChange={e=>setForm({...form,time:e.target.value})}/></label><label className="md-field"><span>每个平台最多收集</span><input type="number" min="1" max="20" value={form.limit||8} onChange={e=>setForm({...form,limit:Number(e.target.value)})}/></label></div><label className="md-field"><span>优先关注关键词（逗号分隔；也会参考已保存的受众兴趣）</span><input value={form.keywords||''} onChange={e=>setForm({...form,keywords:e.target.value})} placeholder="例如：仿妆、摄影、账号运营"/></label><label><input type="checkbox" checked={form.enabled===true} onChange={e=>setForm({...form,enabled:e.target.checked})}/> 每日自动收集到灵感</label><div className="md-task-actions"><button className="md-btn" disabled={busy} onClick={()=>act('configure',form)}>保存每日安排</button><button className="md-btn is-primary" disabled={busy} onClick={()=>act('collect',{})}>{busy?'采集中…':'立即搜索热点并收集'}</button></div>
 <div className="md-trend-status">{['B站','小红书','抖音'].map(platform=>{const result=run?.results.find(r=>r.platform===platform);return <article key={platform}><strong>{platform}</strong><p>{result?(result.ok?'已读取 '+result.count+' 条来源':result.error):'等待首次采集'}</p>{result?.note?<small>{result.note}</small>:null}</article>})}</div>
 {run?<p className="md-muted">最近采集：{new Date(run.at).toLocaleString('zh-CN')} · 新增 {run.added} 条，更新 {run.updated} 条；同一来源不重复建立卡片。</p>:null}
 <details><summary>小红书授权来源</summary><p>公开发现页没有匿名笔记时，可连接你有权限使用的 JSON 数据源。格式为 items 数组，包含 title、url，可选 likes、views、publishedAt。只接受真实小红书链接；没有热度时标注为来源候选。</p><p>{data.sourceConfigured?'已连接：'+data.sourceHost:'尚未连接；不会冒充已抓到小红书爆款。'}</p><label className="md-field"><span>HTTPS JSON 地址</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://你的来源地址"/></label><label className="md-field"><span>Authorization（可选，保存在本机，不返回浏览器）</span><input type="password" autoComplete="off" value={auth} onChange={e=>setAuth(e.target.value)}/></label><button className="md-btn" disabled={busy||!url} onClick={()=>act('source',{url,authorization:auth})}>连接来源</button></details>
 <div className="md-trend-results">{rows.map(item=><article key={item.id}><button type="button" onClick={()=>openItem(item.id)}><strong>{item.title}</strong> <HotBadge item={item} /><small>{item.platform} · {item.trend.kind}{item.trend.publishedAt?' · 发布于 '+new Date(item.trend.publishedAt).toLocaleDateString('zh-CN'):''}{item.trend.match.length?' · 命中 '+item.trend.match.join('、'):''}</small></button><OriginalLink item={item}/></article>)}</div>
 </div>
}
export function useTrendUpdates(ready) {
  React.useEffect(() => {
    if (!ready) return
    let alive = true
    const tick = async () => {
      try {
        const data = await insightRequest('trends')
        if (alive && data.runs[0]?.id !== getDesk().state?.trends?.runs?.[0]?.id) await loadDesk()
      } catch {}
    }
    tick()
    const timer = setInterval(tick, 20000)
    return () => { alive = false; clearInterval(timer) }
  }, [ready])
}

export function TrendLauncher() {
  const [open, setOpen] = React.useState(false)
  const run = useDesk(s => s.state.trends?.runs?.[0])
  return <>
    <button className="md-trend-launcher md-btn" onClick={() => setOpen(true)}>每日热点{run ? ' · ' + run.added + ' 条新增' : ''}</button>
    {open ? <Dialog title="每日热点与爆款线索" width={840} onClose={() => setOpen(false)}><TrendPanel /></Dialog> : null}
  </>
}
