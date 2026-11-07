export const atlasColors=['#f3bd69','#8bc8fa','#bb9ef0','#75d4b5','#eb99b0','#93cba0','#a3bff3','#d9ad85','#c4ca78','#80ced1','#b6a6d8','#e2bd88'];
export function atlasPosition(index:number,count:number){const places=[{x:470,y:128},{x:135,y:348},{x:245,y:492},{x:865,y:348},{x:755,y:492},{x:710,y:145}];return places[index%places.length];}

export function insightPositions(nodes:any[]){return Object.fromEntries(nodes.map((n,i)=>{const a=i*Math.PI*2/Math.max(1,nodes.length),p={x:500+Math.cos(a)*310,y:320+Math.sin(a)*210};return [n.id,p];}));}
export function readingDays(reads:any[],now=new Date()){const map=new Map<string,number>();for(const r of reads)for(const day of r.dates||[])map.set(day,(map.get(day)||0)+1);return Array.from({length:182},(_,i)=>{const d=new Date(now.getTime()-(181-i)*86400000),date=d.toISOString().slice(0,10);return {date,count:map.get(date)||0};});}
