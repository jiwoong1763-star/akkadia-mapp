export const CRITERIA = [
 {key:'time',label:'제작 시간',short:'시간',description:'현재 10레벨 구간의 평균 소요 시간에 비해, 재료를 얻는 시간이 짧을수록 높습니다.'},
 {key:'performance',label:'성능 · 지속성',short:'성능',description:'같은 무기·도구 종류 또는 방어구 부위 안에서 성능과 최대 내구도를 함께 비교합니다.'},
 {key:'convenience',label:'제작 편의성',short:'편의',description:'말단 재료의 희귀도와 드랍 기대 수량, 재료 종류 수, 요구 시설 레벨을 반영합니다.'},
 {key:'potential',label:'후속 제작 가능성',short:'확장',description:'이 아이템을 재료로 만드는 서로 다른 후속 아이템 수를 비교합니다. 수리·자기 순환·건축 결과는 제외합니다.'},
];
export const ROLES = {
 weapon:{label:'무기',color:'#f4aa73',glyph:'⚔',order:0}, armor:{label:'보호 장비',color:'#b99bfa',glyph:'◈',order:1},
 tool:{label:'채굴 · 채집 도구',color:'#65d6b0',glyph:'⌁',order:2},accessory:{label:'장신구',color:'#e4cf7b',glyph:'✦',order:3},
 material:{label:'재료',color:'#78b9f5',glyph:'◇',order:4},consumable:{label:'소모품',color:'#ec96bf',glyph:'◒',order:5},
};
export const DEFAULT_WEIGHTS=[25,25,25,25];
// A common scale across every floor: a C does not become S-sized in a C-only floor.
export const TIER_RULES = [
 {name:'S',min:85,max:100,volume:16,label:'85점 이상'},
 {name:'A',min:70,max:85,volume:8,label:'70–85점 미만'},
 {name:'B',min:55,max:70,volume:4,label:'55–70점 미만'},
 {name:'C',min:40,max:55,volume:2,label:'40–55점 미만'},
 {name:'D',min:25,max:40,volume:1,label:'25–40점 미만'},
];
export function sphereRadius(score,base=40){const rule=TIER_RULES.find(t=>score!=null&&score>=t.min);return rule?base*Math.cbrt(rule.volume):0;}
export function markWidth(score){return sphereRadius(score)*2;}

export function validWeights(v){return Array.isArray(v)&&v.length===4&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&v.reduce((a,b)=>a+b,0)===100;}
export function redistribute(weights,index,next){
 const previous=validWeights(weights)?weights:DEFAULT_WEIGHTS;const out=[...previous];next=Math.max(0,Math.min(100,Math.round(Number(next)||0)));out[index]=next;
 const remaining=100-next;const other=[0,1,2,3].filter(i=>i!==index);const sum=other.reduce((a,i)=>a+previous[i],0);
 const exact=other.map(i=>({i,v:sum?remaining*previous[i]/sum:remaining/3}));
 for(const {i,v} of exact)out[i]=Math.floor(v);
 let rest=100-out.reduce((a,b)=>a+b,0);exact.sort((a,b)=>(b.v%1)-(a.v%1)||a.i-b.i);
 for(let k=0;k<rest;k++)out[exact[k%exact.length].i]++;
 return out;
}
export function tier(score){return TIER_RULES.find(t=>score>=t.min)?.name||'E';}
export function evaluate(item,stage,weights){
 if(item.costG==null||!Number.isFinite(item.costG)||item.costG<=0)return {score:null,reason:'획득 비용이 미산정되어 순위에서 제외됩니다.'};
 const budget=Math.max(1,stage.intervalMeanSeconds||stage.meanSeconds);
 const components=[100/(1+item.costG/budget),item.performanceScore,item.convenienceScore,item.futureScore];
 const applicable=components.map((v,i)=>v!=null&&Number.isFinite(v)?weights[i]:0);const sum=applicable.reduce((a,b)=>a+b,0);
 if(!sum)return {score:null,components,effectiveWeights:[0,0,0,0],reason:'이 아이템에 적용 가능한 기준의 가중치가 모두 0%입니다.'};
 const effectiveWeights=applicable.map(v=>v/sum*100);const contributions=components.map((v,i)=>v==null?0:v*effectiveWeights[i]/100);const score=contributions.reduce((a,b)=>a+b,0);
 return {score,components,effectiveWeights,contributions,tier:tier(score),budgetRatio:item.costG/stage.meanSeconds,intervalRatio:item.costG/budget,missingCriteria:components.map((v,i)=>v==null?i:null).filter(i=>i!=null)};
}
export function candidateItems(items,stages,index,{mode='bands',role='all',query='',subtype='all'}={}){
 const stage=stages[index];const lower=mode==='bands'&&index>0?stages[index-1].meanSeconds:0;const q=query.trim().toLowerCase();
 return items.filter(i=>i.costG!=null&&i.costG>lower&&i.costG<=stage.meanSeconds&&(role==='all'||i.role===role)&&(subtype==='all'||i.group===subtype)&&(!q||[i.name,i.nameEn,i.key,String(i.id)].some(s=>s.toLowerCase().includes(q))));
}
export function rankItems(items,stage,weights){return items.map(item=>({item,...evaluate(item,stage,weights)})).filter(r=>r.score!=null&&r.tier!=='E').sort((a,b)=>b.score-a.score||a.item.costG-b.item.costG||a.item.id-b.item.id);}
export function firstAffordableStage(cost,stages){return cost==null?null:stages.findIndex(s=>cost<=s.meanSeconds);}
export function balancedPreview(ranked,count=30){
 if(ranked.length<=count)return ranked;
 const result=[];const ids=new Set();
 // Show every represented tier as well as role diversity in the 3D preview.
 for(const t of TIER_RULES)for(const r of ranked.filter(r=>tier(r.score)===t.name).slice(0,3))if(result.length<count){result.push(r);ids.add(r.item.id);}
 for(const role of Object.keys(ROLES))for(const r of ranked.filter(r=>r.item.role===role).slice(0,2))if(!ids.has(r.item.id)&&result.length<count){result.push(r);ids.add(r.item.id);}
 for(const r of ranked)if(!ids.has(r.item.id)&&result.length<count){result.push(r);ids.add(r.item.id);}
 return result.sort((a,b)=>b.score-a.score||a.item.id-b.item.id);
}
// Compatibility utility for external callers; visual markers use exact horizontal widths.
export function bubbleRadius(score,_maxScore,maxRadius=100.79368399158986){return sphereRadius(score)*maxRadius/sphereRadius(100);}
