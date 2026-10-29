import {ROLES} from './scoring.mjs';
import {drawSphere} from './scene.mjs';
const inTau=Math.PI*2;
function inTrace(c,points){c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.closePath();}
const inColor=item=>ROLES[item.role]?.color||'#8cbaa0';

export function bindGraphToScene(graph,scene,selection,previous=[]){
 const entries=[...(scene?.raw?.nodes||[]),...(scene?.stages||[]).flatMap(s=>s?.nodes||[])],byId=new Map();
 for(const entry of entries){const id=entry.row.item.id;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(entry);}
 const chosen=selection?.row?.item.id===graph.rootId?selection:byId.get(graph.rootId)?.[0],rootWorld=chosen?.world||previous.find(n=>n.item?.id===graph.rootId)?.world||{x:0,y:0,z:0};
 const old=new Map(previous.filter(n=>n.type==='item').map(n=>[n.item.id,n]));
 const items=graph.items.map(n=>{const source=n.item.id===graph.rootId&&chosen?chosen:[...(byId.get(n.item.id)||[])].sort((a,b)=>Math.abs(a.world.y-rootWorld.y)-Math.abs(b.world.y-rootWorld.y))[0];
  if(source)return {...n,world:{...source.world},r:source.worldRadius,tail:source.tail||0,original:true};
  if(old.has(n.item.id)){const prior=old.get(n.item.id);return {...n,world:{...prior.world},r:prior.r,tail:prior.tail||0,original:prior.original};}
  return {...n,world:n.item.id===graph.rootId?{...rootWorld}:{x:rootWorld.x+n.x,y:rootWorld.y+n.level*240,z:rootWorld.z+n.z},r:n.r||40,tail:0,original:false};
 });
 const positions=new Map(items.map(n=>[n.item.id,n])),slots=new Map(),recipes=graph.recipes.map(n=>{const inputs=[...new Set(n.recipe.inputs.filter(Boolean).map(i=>i.itemId))].map(id=>positions.get(id)?.world).filter(Boolean),outputs=n.recipe.outputs.map(o=>positions.get(o.itemId)?.world).filter(Boolean),mean=points=>({x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length,z:points.reduce((s,p)=>s+p.z,0)/points.length}),a=inputs.length?mean(inputs):rootWorld,b=outputs.length?mean(outputs):rootWorld,key=n.recipe.outputs.map(o=>o.itemId).join(','),slot=slots.get(key)||0;slots.set(key,slot+1);return {...n,world:{x:(a.x+b.x)/2+slot*28,y:(a.y+b.y)/2+30,z:(a.z+b.z)/2+slot*20},r:14};});
 return {...graph,placedNodes:[...items,...recipes],projection:scene?.projection};
}

export function drawInPlaceGraph(){
 const graph=this.graph;if(!graph)return;const c=this.ctx,w=this.width,h=this.height,C=Math.cos(this.yaw),S=Math.sin(this.yaw),P=Math.sin(this.pitch),Q=Math.cos(this.pitch),raw=p=>({x:p.x*C-p.z*(this.graph.projection?.depthScale||1)*S,y:-p.y*Q+(p.x*S+p.z*(this.graph.projection?.depthScale||1)*C)*P,d:(p.x*S+p.z*(this.graph.projection?.depthScale||1)*C)*Q+p.y*P}),nodes=graph.placedNodes||graph.nodes.map(n=>({...n,world:{x:n.x,y:n.y,z:n.z}})),mapped=nodes.map(n=>({...n,base:raw(n.world)})),meta=graph.projection;
 const minx=Math.min(...mapped.map(n=>n.base.x-n.r)),maxx=Math.max(...mapped.map(n=>n.base.x+n.r)),miny=Math.min(...mapped.map(n=>n.base.y-n.r)),maxy=Math.max(...mapped.map(n=>n.base.y+n.r));
 const fitTop=w<620?240:155,fitBottom=h-(w<620?175:145);const scale=this.graphFitted?Math.min((w-90)/(maxx-minx||1),Math.max(80,fitBottom-fitTop)/(maxy-miny||1))*this.zoom:(meta?.scale||.92)*(this.zoom/(meta?.zoom||1)),target=raw(meta?.targetWorld||{x:0,y:0,z:0});
 const ox=this.graphFitted?w/2+this.pan.x-(minx+maxx)/2*scale:w*(meta?.anchorXRatio??.53)+(this.pan.x-(meta?.pan.x||0))-target.x*scale,oy=this.graphFitted?(fitTop+fitBottom)/2+this.pan.y-(miny+maxy)/2*scale:h*(meta?.anchorYRatio??.55)+(this.pan.y-(meta?.pan.y||0))-target.y*scale;
 const positions=new Map(mapped.map(n=>[n.id,{...n,x:ox+n.base.x*scale,y:oy+n.base.y*scale,r:n.r*scale}]));this.graphScreenPositions=positions;
 Object.assign(this.canvas.dataset,{selectedItem:String(graph.rootId),relatedItems:String(graph.items.length),relatedRecipes:String(graph.recipes.length),relatedItemIds:JSON.stringify(graph.items.map(n=>n.item.id)),relatedRecipeIds:JSON.stringify(graph.recipes.map(n=>n.recipe.recipeId)),recommendedTargetIds:JSON.stringify(graph.targetIds||[]),lowerRecipeCount:String(graph.counts?.lowerRecipes||0),sceneKind:'in-place-relations',markerShape:'sphere',pathDirection:graph.direction,pathDepth:'all',pathStrategy:graph.strategy||'complete'});
 const root=positions.get('i'+graph.rootId);if(root){this.canvas.dataset.graphRootX=String(root.x);this.canvas.dataset.graphRootY=String(root.y);}
 c.save();c.globalAlpha=this.graphEdgeAlpha??1;
 for(const edge of graph.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,from={x:a.x+ux*(a.r+3),y:a.y+uy*(a.r+3)},to={x:b.x-ux*(b.r+4),y:b.y-uy*(b.r+4)};
 c.strokeStyle=edge.relation==='input'?'#9be4c7c8':'#ffcb8ac8';c.lineWidth=2;c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();const angle=Math.atan2(to.y-from.y,to.x-from.x);c.beginPath();c.moveTo(to.x,to.y);c.lineTo(to.x-Math.cos(angle-.5)*9,to.y-Math.sin(angle-.5)*9);c.lineTo(to.x-Math.cos(angle+.5)*9,to.y-Math.sin(angle+.5)*9);c.closePath();c.fillStyle=c.strokeStyle;c.fill();
 if(scale>.5&&graph.edges.length<100){c.font='11px Segoe UI';c.textAlign='center';c.fillStyle='#d5e5c8';c.fillText('×'+edge.quantity,(from.x+to.x)/2,(from.y+to.y)/2-5);}}
 c.restore();
 for(const n of [...positions.values()].sort((a,b)=>a.base.d-b.base.d)){
  if(n.x+n.r<0||n.x-n.r>w||n.y+n.r<0||n.y-n.r>h)continue;
  if(n.type==='recipe'){const r=Math.max(6,n.r),poly=Array.from({length:6},(_,k)=>({x:n.x+Math.cos(k/6*inTau)*r,y:n.y+Math.sin(k/6*inTau)*r}));inTrace(c,poly);c.fillStyle='#433c24';c.fill();c.strokeStyle='#e4ce8c';c.lineWidth=1.8;c.stroke();this.hits.push({type:'recipe',recipe:n.recipe,x:n.x,y:n.y,r});continue;}
  this.canvas.dataset.itemImages='hidden';drawSphere(c,n.x,n.y,n.r,inColor(n.item),null,n.item.id===graph.rootId||this.hover==='i'+n.item.id);
  if(n.r>13){const name=n.item.name.length>23?n.item.name.slice(0,22)+'…':n.item.name;c.font='12px Malgun Gothic';c.textAlign='center';const width=c.measureText(name).width;c.fillStyle='#0b1914e8';c.fillRect(n.x-width/2-5,n.y+n.r+6,width+10,20);c.fillStyle='#e3eed5';c.fillText(name,n.x,n.y+n.r+20);}
  this.hits.push({type:'item',row:{item:n.item,score:null},x:n.x,y:n.y,r:n.r,relation:n.relation});
 }
}
