import {randomUUID,createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {assertPublicUrl} from './harvest.js'
export const chinaDay=(now=Date.now())=>new Date(+now+8*3600000).toISOString().slice(0,10)
const chinaMinute=now=>{const d=new Date(+now+8*3600000);return d.getUTCHours()*60+d.getUTCMinutes()}
export const emptyTrends=()=>({enabled:true,time:'09:00',limit:8,keywords:'',runs:[],lastDay:null,lastAttemptAt:null})
const string=(v,n=1200)=>typeof v==='string'?v.trim().slice(0,n):''
const headers={'user-agent':'Mozilla/5.0','accept':'application/json,text/html','referer':'https://www.douyin.com/'}
export function normalizeTrend(row,platform){
 const title=string(row.title||row.word||row.display_title,200).replace(/<[^>]*>/g,''),raw=row.url||row.link||row.arcurl||(platform==='B站'&&row.bvid?'https://www.bilibili.com/video/'+row.bvid:platform==='抖音'&&row.word?'https://www.douyin.com/search/'+encodeURIComponent(row.word):'')
 let url;try{url=new URL(raw)}catch{return null}
 const hosts={'B站':['bilibili.com','b23.tv'],'抖音':['douyin.com'],'小红书':['xiaohongshu.com','xhslink.com']}
 if(url.protocol!=='https:'||url.username||url.password||!hosts[platform]?.some(h=>url.hostname===h||url.hostname.endsWith('.'+h))||!title)return null
 // 清除追踪参数，但保留小红书原始链接可能需要的公开访问参数。
 for(const k of [...url.searchParams.keys()])if(/^utm_|^spm|^from$/i.test(k))url.searchParams.delete(k)
 const number=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null
 return {title,url:url.href,platform,author:string(row.owner?.name||row.author||row.user?.nickname,120),publishedAt:row.pubdate?new Date(Number(row.pubdate)*1000).toISOString():row.publishedAt&&Number.isFinite(Date.parse(row.publishedAt))?new Date(row.publishedAt).toISOString():null,views:number(row.stat?.view??row.views),likes:number(row.stat?.like??row.likes),heat:number(row.hot_value??row.heat),rank:number(row.position??row.rank),kind:platform==='B站'?'热门视频':platform==='抖音'?'热榜话题':'来源候选',sourceUrl:platform==='B站'?'https://www.bilibili.com/v/popular/all/':platform==='抖音'?'https://www.douyin.com/hot':'https://www.xiaohongshu.com/explore'}
}
export class TrendService{
 constructor(store,{fetchImpl=fetch,now=()=>Date.now(),validate=assertPublicUrl}={}){this.store=store;this.fetch=fetchImpl;this.now=now;this.validate=validate;this.pending=null;this.file=join(store.root,'trends-source.json')}
 async read(){const state=await this.store.read();let source;try{source=JSON.parse(await readFile(this.file,'utf8'))}catch{}return {...emptyTrends(),...state.trends,sourceConfigured:!!source?.url,sourceHost:source?.url?new URL(source.url).hostname:''}}
 async source(body){
  const url=new URL(body.url);if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/key|token|secret|auth/i.test(k)))throw new Error('请使用不带密钥参数的 HTTPS 数据源地址，密钥放在授权框')
  await this.validate(url.href);await writeFile(this.file,JSON.stringify({url:url.href,authorization:string(body.authorization,2000)}),{mode:0o600});return this.read()
 }
 async configure(body){if(body.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))throw new Error('时间格式应为 HH:mm');return this.store.mutate('',s=>{s.trends={...emptyTrends(),...s.trends,...(typeof body.enabled==='boolean'?{enabled:body.enabled}:{}),...(body.time?{time:body.time}:{}),...(body.keywords!==undefined?{keywords:string(body.keywords,500)}:{}),limit:Math.min(20,Math.max(1,Number(body.limit)||s.trends?.limit||8))};return s.trends},{undoable:false})}
 async request(url,extra={}){const r=await this.fetch(url,{headers:{...headers,...extra},redirect:'error',signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('来源返回 '+r.status);const text=await r.text();if(text.length>5*1024*1024)throw new Error('来源数据过大');if(!text.trim())throw new Error('来源暂无公开数据或需要授权');return JSON.parse(text)}
 async collect(force=false){
  if(this.pending)return this.pending
  const settings=await this.read();if(this.pending)return this.pending;const now=this.now(),day=chinaDay(now),target=settings.time.split(':').reduce((n,v)=>n*60+Number(v),0)
  if(!force&&(!settings.enabled||settings.lastDay===day||chinaMinute(now)<target))return {skipped:true}
  if(force&&settings.lastAttemptAt&&now-Date.parse(settings.lastAttemptAt)<60000)throw new Error('刚刚已采集，请稍后再试')
  this.pending=(async()=>{
   await this.store.mutate('',s=>{s.trends={...emptyTrends(),...s.trends,lastAttemptAt:new Date(now).toISOString()}},{undoable:false})
   const sources=[['B站',async()=>{const j=await this.request('https://api.bilibili.com/x/web-interface/popular?pn=1&ps=50',{'referer':'https://www.bilibili.com/'});if(j.code!==0)throw new Error('B站公开热门暂不可用');const rows=j.data?.list||[];const keyword=settings.keywords.split(/[,，、\n]/).map(k=>k.trim()).find(Boolean);if(keyword){try{const searched=await this.request('https://api.bilibili.com/x/web-interface/search/type?search_type=video&order=click&keyword='+encodeURIComponent(keyword),{'referer':'https://www.bilibili.com/'});if(searched.code===0)rows.unshift(...(searched.data?.result||[]));else rows.note='关键词搜索暂不可用，当前使用公开热门列表'}catch{rows.note='关键词搜索暂不可用，当前使用公开热门列表'}}return rows}],['抖音',async()=>{const j=await this.request('https://www.douyin.com/aweme/v1/web/hot/search/list/');if(j.status_code!==0)throw new Error('抖音热榜暂不可用');return j.data?.word_list||[]}],['小红书',async()=>{let config;try{config=JSON.parse(await readFile(this.file,'utf8'))}catch{throw new Error('匿名发现页暂无内容，请连接授权 JSON 数据源；未伪造热门笔记')};await this.validate(config.url);const j=await this.request(config.url,config.authorization?{authorization:config.authorization}:{});const rows=Array.isArray(j)?j:j.items||j.data?.items||j.data?.notes||j.notes||[];if(!Array.isArray(rows)||!rows.length)throw new Error('授权来源没有返回笔记');return rows}]]
   const results=await Promise.all(sources.map(async([platform,read])=>{try{const input=await read(),rows=input.map(r=>normalizeTrend(r,platform)).filter(Boolean);if(!rows.length)throw new Error('来源没有可核对的结果');return {platform,rows:rows.slice(0,settings.limit*3),ok:true,...(input.note?{note:input.note}:{})}}catch(e){return {platform,rows:[],ok:false,error:e.message}}}))
   const keywords=settings.keywords.split(/[,，、\n]/).map(v=>v.trim()).filter(Boolean),profile=(await this.store.read()).profiles
   const preferences=[...keywords,...String(profile?.audience?.interests||'').split(/[,，、\n]/).map(v=>v.trim()).filter(Boolean)]
   const saved=await this.store.mutate('',s=>{
    let added=0,updated=0;const at=new Date(now).toISOString()
    for(const result of results)for(const row of result.rows.sort((a,b)=>preferences.filter(k=>b.title.includes(k)).length-preferences.filter(k=>a.title.includes(k)).length).slice(0,settings.limit)){
     const key=createHash('sha256').update(row.platform+new URL(row.url).origin+new URL(row.url).pathname).digest('hex'),existing=s.items.find(i=>i.trend?.key===key)
     const facts={...row,key,collectedAt:at,day,match:preferences.filter(k=>row.title.includes(k))}
     if(existing){existing.trend=facts;updated++;continue}
     const metric=[row.views!==null?'播放 '+row.views:null,row.likes!==null?'点赞 '+row.likes:null,row.heat!==null?'来源热度 '+row.heat:null].filter(Boolean).join(' · ')
     s.items.push({id:'trend-'+randomUUID(),kind:'web',title:row.title,body:[row.kind+' · '+row.platform,metric,row.author?'作者：'+row.author:'','采集于 '+at,'选题提示：先核对原文，再结合自己的账号定位改编；热榜话题不代表单条视频爆款。'].filter(Boolean).join('\n'),source:row.url,url:row.url,platform:row.platform,tags:['每日灵感',row.kind,...facts.match],status:'idea',createdAt:at,trend:facts,sample:false});added++
    }
    const run={id:randomUUID(),day,at,added,updated,results:results.map(({rows,...r})=>({...r,count:rows.length}))};s.trends={...emptyTrends(),...s.trends,lastDay:day,runs:[run,...(s.trends?.runs||[])].slice(0,60)};return run
   },{undoable:false});return saved
  })().finally(()=>{this.pending=null});return this.pending
 }
 start(){const tick=()=>this.collect().catch(()=>{});tick();const timer=setInterval(tick,60000);timer.unref?.();return()=>clearInterval(timer)}
}
