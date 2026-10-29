// Recipe links are read from the complete local recipe catalog, never inferred from prices.
export function createPathIndex(model){
 const items=new Map(model.items.map(i=>[i.id,i])),known=new Map(Object.values(model.lookup).map(i=>[i.id,i]));
 const recipes=model.recipes.filter(r=>r.enabled!==false&&!['anvil','enhancement_table'].includes(r.facilityType)&&!r.outputs.some(o=>r.inputs.some(i=>i&&i.itemId===o.itemId)));
 const incoming=new Map(),outgoing=new Map();for(const r of recipes){for(const o of r.outputs){if(!incoming.has(o.itemId))incoming.set(o.itemId,[]);incoming.get(o.itemId).push(r);}for(const id of new Set(r.inputs.filter(Boolean).map(i=>i.itemId))){if(!outgoing.has(id))outgoing.set(id,[]);outgoing.get(id).push(r);}}
 const usefulIds=new Set(items.keys()),queue=[...usefulIds];for(let i=0;i<queue.length;i++)for(const recipe of incoming.get(queue[i])||[])for(const input of recipe.inputs.filter(Boolean))if(!usefulIds.has(input.itemId)){usefulIds.add(input.itemId);queue.push(input.itemId);}
 const rawIds=new Set(model.items.filter(i=>i.role==='material').map(i=>i.id));for(const item of model.items)for(const leaf of item.materialBreakdown||[])if(known.has(leaf.itemId))rawIds.add(leaf.itemId);
 const getItem=id=>items.get(id)||{...known.get(id),id,name:known.get(id)?.name||'아이템 '+id,nameEn:known.get(id)?.key||'',icon:known.get(id)?.icon,role:'material',itemType:known.get(id)?.type||'material',rarity:known.get(id)?.rarity||'normal',costG:known.get(id)?.costG??null,contextOnly:true};
 const sourceIds=new Set(model.items.flatMap(i=>i.materialBreakdown||[]).map(i=>i.itemId));
 for(const item of model.items)if(item.selected&&item.selected.kind!=='recipe')sourceIds.add(item.id);
 return {items,known,recipes,incoming,outgoing,usefulIds,rawIds,sourceIds,getItem,rawItems:[...rawIds].map(getItem).sort((a,b)=>a.id-b.id)};
}

// Compare recipes for the same output. Performance and future uses are identical;
// minimize acquisition G, then facility level and ingredient variety on ties.
export function recipeUnitCost(index,recipe,outputId){
 const output=recipe.outputs.find(o=>o.itemId===outputId);if(!output?.quantity)return null;let total=0;
 for(const input of recipe.inputs.filter(Boolean)){const cost=index.getItem(input.itemId).costG;if(cost==null||!Number.isFinite(cost))return null;total+=cost*input.quantity;}
 return total/output.quantity;
}

export function buildValueGraph(index,rootId,{grades=new Map()}={}){
 rootId=Number(rootId);const chosen=new Map(),lowerChoices=new Map(),cost=id=>index.getItem(id).costG;
 const lower=(id,ancestors=new Set())=>{
  if(ancestors.has(id))return false;if(lowerChoices.has(id))return true;
  const item=index.getItem(id),options=[...(index.incoming.get(id)||[])];
  if(index.sourceIds.has(id)||!options.length){lowerChoices.set(id,null);return true;}
  const preferred=item.selected?.kind==='recipe'?item.selected.recipeId:null;
  options.sort((a,b)=>(a.recipeId===preferred?-1:b.recipeId===preferred?1:0)||((recipeUnitCost(index,a,id)??Infinity)-(recipeUnitCost(index,b,id)??Infinity))||(a.requiredFacilityLevel||0)-(b.requiredFacilityLevel||0)||new Set(a.inputs.filter(Boolean).map(i=>i.itemId)).size-new Set(b.inputs.filter(Boolean).map(i=>i.itemId)).size||a.recipeId.localeCompare(b.recipeId));
  const next=new Set([...ancestors,id]);for(const recipe of options){const savedChosen=new Map(chosen),savedLower=new Map(lowerChoices);if(recipe.inputs.filter(Boolean).every(i=>lower(i.itemId,next))){chosen.set(recipe.recipeId,recipe);lowerChoices.set(id,recipe);return true;}chosen.clear();for(const entry of savedChosen)chosen.set(...entry);lowerChoices.clear();for(const entry of savedLower)lowerChoices.set(...entry);}
  lowerChoices.set(id,null);return true;
 };lower(rootId);
 const lowerRecipeIds=new Set(chosen.keys()),plans=new Map(),rootCost=cost(rootId);
 if(rootCost!=null&&Number.isFinite(rootCost))plans.set(rootId,{id:rootId,cost:rootCost,steps:0,lineage:new Set([rootId]),recipe:null,parent:null});
 // Relax hyperedges: at least one input must originate from the selected root.
 // Immutable parent plans and lineage guards prevent conversion cycles.
 for(let pass=0;pass<index.known.size+1;pass++){let changed=false;
  for(const recipe of index.recipes){const inputs=new Map();for(const i of recipe.inputs.filter(Boolean))inputs.set(i.itemId,(inputs.get(i.itemId)||0)+i.quantity);let total=0,priced=true;
   for(const [id,q] of inputs){const unit=cost(id);if(unit==null||!Number.isFinite(unit)){priced=false;break;}total+=unit*q;}if(!priced)continue;
   for(const output of recipe.outputs){if(output.itemId===rootId||!index.usefulIds.has(output.itemId))continue;
    for(const [via,quantity] of inputs){const parent=plans.get(via);if(!parent||parent.lineage.has(output.itemId))continue;
     const value=(total-cost(via)*quantity+parent.cost*quantity)/output.quantity,steps=parent.steps+1,old=plans.get(output.itemId),epsilon=1e-8;
     if(old&&(value>old.cost+epsilon||Math.abs(value-old.cost)<=epsilon&&(steps>old.steps||steps===old.steps&&((recipe.requiredFacilityLevel||0)>(old.recipe.requiredFacilityLevel||0)||(recipe.requiredFacilityLevel||0)===(old.recipe.requiredFacilityLevel||0)&&recipe.recipeId>=old.recipe.recipeId))))continue;
     plans.set(output.itemId,{id:output.itemId,cost:value,steps,recipe,parent,lineage:new Set([...parent.lineage,output.itemId])});changed=true;
    }
   }
  }if(!changed)break;
 }
 const targets=[...plans.values()].filter(p=>p.id!==rootId&&index.getItem(p.id).role!=='material'&&['S','A'].includes(grades.get(p.id))).sort((a,b)=>a.steps-b.steps||a.cost-b.cost||a.id-b.id),seen=new Set();
 const retain=plan=>{if(!plan?.recipe||seen.has(plan.id))return;seen.add(plan.id);retain(plan.parent);chosen.set(plan.recipe.recipeId,plan.recipe);};for(const target of targets)retain(target);
 const recipes=[...chosen.values()],incoming=new Map(),outgoing=new Map();for(const r of recipes){for(const o of r.outputs){if(!incoming.has(o.itemId))incoming.set(o.itemId,[]);incoming.get(o.itemId).push(r);}for(const id of new Set(r.inputs.filter(Boolean).map(i=>i.itemId))){if(!outgoing.has(id))outgoing.set(id,[]);outgoing.get(id).push(r);}}
 const graph=buildCraftGraph({...index,recipes,incoming,outgoing},rootId,{depth:'all',direction:'both'});
 graph.strategy='lowest-cost';graph.targetIds=targets.map(t=>t.id);graph.lowerChoices=[...lowerChoices].map(([id,r])=>({itemId:id,recipeId:r?.recipeId||null,unitG:r?recipeUnitCost(index,r,id):cost(id)}));graph.counts.lowerRecipes=lowerRecipeIds.size;graph.counts.recommendedTargets=targets.length;
 return graph;
}

export function buildCraftGraph(index,rootId,{depth='all',direction='both',grades=null}={}){
 rootId=Number(rootId);const limit=depth==='all'?Infinity:Math.max(1,Number(depth)||2),up=new Map([[rootId,0]]),down=new Map([[rootId,0]]),selected=new Map();
 const walk=(direction,dist)=>{const queue=[rootId];for(let q=0;q<queue.length;q++){const id=queue[q],d=dist.get(id);if(d>=limit)continue;for(const recipe of (direction==='up'?index.incoming:index.outgoing).get(id)||[]){
   // Building results stay out of recommendations; block ingredients remain valid context.
   if(direction==='down'&&!recipe.outputs.some(o=>index.usefulIds.has(o.itemId)))continue;
   selected.set(recipe.recipeId,recipe);const next=direction==='up'?recipe.inputs.filter(Boolean).map(i=>i.itemId):recipe.outputs.filter(o=>index.usefulIds.has(o.itemId)).map(o=>o.itemId);
   for(const nextId of next)if(!dist.has(nextId)){dist.set(nextId,d+1);queue.push(nextId);}
  }}};
 if(direction!=='downstream')walk('up',up);
 const upstreamRecipes=new Map(selected);
 if(direction!=='upstream')walk('down',down);
 if(grades&&direction!=='upstream'){
  // Prune final B/C/D branches only after traversing the entire graph. A low-grade
  // intermediate must survive whenever it leads to an S/A result.
  const downstreamRecipes=[...selected.values()].filter(r=>!upstreamRecipes.has(r.recipeId)),keep=new Set(),needed=new Set();
  for(const id of down.keys())if(id!==rootId&&['S','A'].includes(grades.get(id))&&index.getItem(id).role!=='material')needed.add(id);
  const queue=[...needed];for(let q=0;q<queue.length;q++){const id=queue[q];if(id===rootId)continue;for(const recipe of downstreamRecipes)if(recipe.outputs.some(o=>o.itemId===id)){
   keep.add(recipe.recipeId);for(const input of recipe.inputs.filter(Boolean))if(down.has(input.itemId)&&!needed.has(input.itemId)){needed.add(input.itemId);queue.push(input.itemId);}
  }}
  for(const key of selected.keys())if(!upstreamRecipes.has(key)&&!keep.has(key))selected.delete(key);
  for(const id of down.keys())if(id!==rootId&&!needed.has(id))down.delete(id);
 }
 // Downstream traces only uses of the selected root. Show direct coingredients
 // for complete recipe quantities, but do not branch into their unrelated trees.
 // Selecting a target in upstream mode expands every ingredient tree in full.
 const levels=new Map([[rootId,0]]),relations=new Map([[rootId,'root']]);for(const [id,d] of up)if(id!==rootId){levels.set(id,-d);relations.set(id,'input');}for(const [id,d] of down)if(id!==rootId&&!levels.has(id)){levels.set(id,d);relations.set(id,'output');}
 for(const r of selected.values())for(const input of r.inputs.filter(Boolean))if(!levels.has(input.itemId)){const outputLevel=Math.min(...r.outputs.map(o=>levels.get(o.itemId)??1));levels.set(input.itemId,outputLevel-1);relations.set(input.itemId,'companion');}
 const nodes=[...levels].map(([id,level])=>({id:'i'+id,type:'item',item:index.getItem(id),level,relation:relations.get(id),r:id===rootId?68:43}));
 const nodeById=new Map(nodes.map(n=>[n.item.id,n])),columns=new Map();for(const node of nodes){if(!columns.has(node.level))columns.set(node.level,[]);columns.get(node.level).push(node);}
 for(const [level,column] of columns){column.sort((a,b)=>(a.item.id===rootId?-1:b.item.id===rootId?1:0)||a.item.id-b.item.id);column.forEach((node,i)=>{if(node.item.id===rootId){node.x=0;node.y=0;node.z=0;return;}const offset=level===0?i-1:i,rows=Math.min(7,column.length),col=Math.floor(offset/7),row=offset%7;node.x=level===0?-180-Math.floor(offset/3)*180:level*420+(level<0?-1:1)*col*190;node.y=0;node.z=level===0?240+(offset%3)*190:(row-(rows-1)/2)*158;});}
 const root=nodeById.get(rootId),rootZ=root?.z||0;for(const n of nodes)n.z-=rootZ;
 const hubs=[],edges=[],hubColumns=new Map();
 for(const recipe of selected.values()){
  const outputs=recipe.outputs.map(o=>nodeById.get(o.itemId)).filter(Boolean);if(!outputs.length)continue;
  const inputs=new Map();for(const input of recipe.inputs.filter(Boolean))if(nodeById.has(input.itemId))inputs.set(input.itemId,(inputs.get(input.itemId)||0)+input.quantity);
  const output=outputs[0],hub={id:'r'+recipe.recipeId,type:'recipe',recipe,relation:output.level<=0?'input':'output',x:output.x-170,y:0,z:output.z,r:15};
  const key=hub.x;if(!hubColumns.has(key))hubColumns.set(key,[]);hubColumns.get(key).push(hub);hubs.push(hub);
  for(const [id,quantity] of inputs)edges.push({from:'i'+id,to:hub.id,quantity,recipeId:recipe.recipeId,relation:hub.relation});for(const out of recipe.outputs)if(nodeById.has(out.itemId))edges.push({from:hub.id,to:'i'+out.itemId,quantity:out.quantity,recipeId:recipe.recipeId,relation:hub.relation});
 }
 for(const column of hubColumns.values()){column.sort((a,b)=>a.z-b.z||a.id.localeCompare(b.id));const slots=new Map();for(const hub of column){const key=Math.round(hub.z/10),index=slots.get(key)||0;slots.set(key,index+1);hub.x-=index*40;hub.z+=70;}}
 const all=[...nodes,...hubs];return {rootId,root:index.getItem(rootId),depth,direction,items:nodes,recipes:hubs,nodes:all,edges,counts:{inputs:[...relations.values()].filter(v=>v==='input').length,outputs:[...relations.values()].filter(v=>v==='output').length,companions:[...relations.values()].filter(v=>v==='companion').length,recipes:hubs.length},bounds:{minx:Math.min(...all.map(n=>n.x-n.r-90)),maxx:Math.max(...all.map(n=>n.x+n.r+90)),minz:Math.min(...all.map(n=>n.z-n.r-50)),maxz:Math.max(...all.map(n=>n.z+n.r+50))}};
}
