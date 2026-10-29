import {ROLES} from './scoring.mjs';
import {packFloor,drawOverview,drawFlat} from './scene.mjs';
import {bindGraphToScene,drawInPlaceGraph} from './inplace.mjs';
export {packFloor} from './scene.mjs';
const TAU=Math.PI*2;
const NODE_RADIUS=88,FLAT_SCALE=.9,SCENE_SCALE=.58;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function polygon(ctx,points){ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](points[i].x,points[i].y);ctx.closePath();}
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}

export class Atlas {
 constructor(canvas,{onStage,onItem,onExplore,onBackground,onRecipe,onZoom,onHover}){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.callbacks={onStage,onItem,onExplore,onBackground,onRecipe,onZoom,onHover};this.mode='3d';this.stage=0;this.layers=[];this.rows=[];this.hits=[];this.icons=new Map();this.zoom=1;this.pan={x:0,y:0};this.yaw=0;this.pitch=.62;this.focusStage=0;this.overviewFit=false;this.hover=null;this.drag=null;this.pointers=new Map();this.points=[];
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
  this.onWindowResize=()=>this.syncHeight();globalThis.addEventListener('resize',this.onWindowResize);
  canvas.addEventListener('pointerdown',e=>this.down(e));canvas.addEventListener('pointermove',e=>this.move(e));canvas.addEventListener('pointerup',e=>this.up(e));canvas.addEventListener('pointercancel',e=>this.cancel(e));canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.hover=null;this.callbacks.onHover(null);this.draw();}});canvas.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.zoom*Math.exp(-e.deltaY*.0015),this.local(e));},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
 }
 resize(){const r=this.canvas.getBoundingClientRect();const widthChanged=this.width!==r.width;this.width=r.width;this.height=r.height;const dpr=Math.min(2,devicePixelRatio||1);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);if(widthChanged){this.pack();this.syncHeight();}this.draw();}
 local(e){const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 set({mode,stage,layers,rows,rawRows=[],graph=null}){
  const changed=this.mode!==mode||this.stage!==stage||this.rows!==rows,entering=this.mode==='3d'&&mode==='2d',exiting=this.mode==='2d'&&mode==='3d';
  const enteringGraph=this.mode!=='graph'&&mode==='graph',exitingGraph=this.mode==='graph'&&mode!=='graph',changingRoot=mode==='graph'&&this.graph?.rootId!==graph?.rootId;
  if(enteringGraph){this.graphOverview={camera:this.cameraState()};this.graphScene=this.scene3d;this.graphFitted=false;}
  if(exitingGraph&&this.graphOverview){this.applyCamera(this.graphOverview.camera);this.callbacks.onZoom(this.zoom);this.graphFade=null;}
  if(mode==='graph'){
   if(enteringGraph||changingRoot)this.graphFade={image:this.capture(),start:performance.now(),duration:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:500};
   this.graph=bindGraphToScene(graph,this.graphScene,this.graphSelection,this.graph?.placedNodes);
  }else this.graph=null;
  this.rawRows=rawRows;
  const twoDCamera=exiting?this.cameraState():null,twoDGeometry=exiting?this.flatGeometry():null;
  if(entering&&this.scene3d){this.overview={image:this.capture(),scene:this.scene3d,camera:this.cameraState()};this.zoom=1;this.pan={x:0,y:0};this.flatFitted=true;this.callbacks.onZoom(1);}
  if(exiting&&this.overview){this.applyCamera(this.overview.camera);this.callbacks.onZoom(this.zoom);}
  if(this.mode==='3d'&&mode==='3d'&&this.stage!==stage){this.focusStage=stage;this.overviewFit=false;this.pan={x:0,y:0};}
  this.mode=mode;this.stage=stage;this.layers=layers;this.rows=rows;
  if(changed){this.pack();this.syncHeight();if(entering){const b=this.layoutBounds;this.zoom=Math.min((this.width-64)/(b.maxx-b.minx),(this.height-130)/(b.maxy-b.miny))/FLAT_SCALE;this.callbacks.onZoom(this.zoom);}this.hover=null;this.callbacks.onHover(null);}
  if((entering||exiting)&&this.overview?.scene.stages[stage]){
   this.transition={start:performance.now(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:1150,reverse:exiting,overview:this.overview,stage,flat:twoDGeometry||this.flatGeometry(),flatCamera:twoDCamera||this.cameraState()};
   this.canvas.dataset.transition=entering?'unfolding':'folding';this.canvas.setAttribute('aria-busy','true');
  }
  else if(this.transition){this.transition=null;this.canvas.dataset.transition='idle';this.canvas.setAttribute('aria-busy','false');}
  this.draw();
 }
 syncHeight(){this.canvas.parentElement.style.height=Math.max(560,Math.min(1100,(globalThis.innerHeight||900)-48))+'px';}
 cameraState(){return {zoom:this.zoom,pan:{...this.pan},yaw:this.yaw,pitch:this.pitch,focusStage:this.focusStage||0,overviewFit:!!this.overviewFit,graphFitted:!!this.graphFitted,flatFitted:!!this.flatFitted,rawFitted:!!this.rawFitted};}
 applyCamera(camera){this.zoom=camera.zoom;this.pan={...camera.pan};this.yaw=camera.yaw;this.pitch=camera.pitch;this.focusStage=camera.focusStage||0;this.overviewFit=!!camera.overviewFit;this.graphFitted=!!camera.graphFitted;this.flatFitted=!!camera.flatFitted;this.rawFitted=!!camera.rawFitted;}
 capture(){const copy=this.canvas.ownerDocument.createElement('canvas');copy.width=this.canvas.width;copy.height=this.canvas.height;copy.getContext('2d').drawImage(this.canvas,0,0);return copy;}
 flatTransform(){const scale=FLAT_SCALE*this.zoom,b=this.layoutBounds,first=this.points[0];return {scale,ox:(this.flatFitted?this.width/2:this.width*.5)+this.pan.x-(this.flatFitted?(b.minx+b.maxx)/2:first?.iconX||0)*scale,oy:(this.flatFitted?this.height/2:this.height*.5)+this.pan.y-(this.flatFitted?(b.miny+b.maxy)/2:first?.y||0)*scale};}
 fitAll(){if(this.transition)return;this.pan={x:0,y:0};if(this.mode==='graph'){this.graphFitted=true;this.zoom=1;}else if(this.mode==='3d'){this.rawFitted=false;this.overviewFit=true;this.zoom=1;}else{this.flatFitted=true;const b=this.layoutBounds;this.zoom=Math.min((this.width-64)/(b.maxx-b.minx),(this.height-130)/(b.maxy-b.miny))/FLAT_SCALE;}this.callbacks.onZoom(this.zoom);this.draw();}

 flatGeometry(){if(!this.layoutBounds)return null;const {scale,ox,oy}=this.flatTransform(),{minx,maxx,miny,maxy}=this.layoutBounds;return {poly:[{x:ox+minx*scale,y:oy+miny*scale},{x:ox+maxx*scale,y:oy+miny*scale},{x:ox+maxx*scale,y:oy+maxy*scale},{x:ox+minx*scale,y:oy+maxy*scale}],nodes:this.points.map(p=>({row:p.row,rank:p.rank,x:ox+p.iconX*scale,y:oy+p.y*scale,r:p.r*scale}))};}
 reset(){if(this.mode==='graph'&&this.graphOverview){this.applyCamera(this.graphOverview.camera);this.graphFitted=false;this.callbacks.onZoom(this.zoom);this.draw();return;}this.transition=null;this.canvas.dataset.transition='idle';this.canvas.setAttribute('aria-busy','false');this.zoom=1;this.pan={x:0,y:0};this.yaw=0;this.pitch=.62;this.graphFitted=false;this.flatFitted=false;this.rawFitted=false;this.overviewFit=false;this.focusStage=this.stage;this.callbacks.onZoom(1);this.draw();}
 setZoom(z,anchor){if(this.transition)return;z=clamp(z,.005,5);let local;if(anchor&&this.mode==='2d'){const t=this.flatTransform();local={x:(anchor.x-t.ox)/t.scale,y:(anchor.y-t.oy)/t.scale};}this.zoom=z;if(local){const t=this.flatTransform();this.pan.x+=anchor.x-(t.ox+local.x*t.scale);this.pan.y+=anchor.y-(t.oy+local.y*t.scale);}this.callbacks.onZoom(z);this.draw();}
 down(e){if(this.transition)return;this.canvas.setPointerCapture(e.pointerId);const p=this.local(e);this.pointers.set(e.pointerId,p);if(this.pointers.size===2){const pp=[...this.pointers.values()];this.pinch={distance:Math.hypot(pp[0].x-pp[1].x,pp[0].y-pp[1].y),zoom:this.zoom};this.drag=null;return;}this.drag={...p,startX:p.x,startY:p.y,moved:false,rotate:e.altKey||e.button===2||this.dragMode==='rotate',button:e.button};this.canvas.classList.add('dragging');}
 move(e){const p=this.local(e);if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,p);
  if(this.pointers.size===2&&this.pinch){const pp=[...this.pointers.values()];this.setZoom(this.pinch.zoom*Math.hypot(pp[0].x-pp[1].x,pp[0].y-pp[1].y)/Math.max(1,this.pinch.distance));return;}
  if(this.transition)return;
  if(this.drag){const dx=p.x-this.drag.x,dy=p.y-this.drag.y;this.drag.moved ||=Math.hypot(p.x-this.drag.startX,p.y-this.drag.startY)>4;if(this.drag.moved){if((this.mode==='3d'||this.mode==='graph')&&this.drag.rotate){this.yaw+=dx*.005;this.pitch=clamp(this.pitch+dy*.003,.25,1.15);}else{this.pan.x+=dx;this.pan.y+=dy;}this.callbacks.onHover(null);this.draw();}this.drag.x=p.x;this.drag.y=p.y;return;}
  const h=this.pick(p);const key=h?(h.type==='item'?'i'+h.row.item.id:h.type==='recipe'?'r'+h.recipe.recipeId:'s'+h.index):null;if(key!==this.hover){this.hover=key;this.draw();}this.canvas.style.cursor=h?'pointer':'grab';this.callbacks.onHover(h?{...h,x:p.x,y:p.y}:null);
 }
 up(e){const p=this.local(e),d=this.drag;this.pointers.delete(e.pointerId);if(this.pointers.size<2)this.pinch=null;this.drag=null;this.canvas.classList.remove('dragging');if(!this.transition&&d&&!d.moved&&d.button!==2){const h=this.pick(p);if(h?.type==='stage')this.callbacks.onStage(h.index);else if(h?.type==='raw-stage')this.focusRaw();else if(h?.type==='item'){if(this.mode==='3d'){this.graphSelection=h.sourceNode;if(h.sourceNode){this.canvas.dataset.selectionX=String(h.sourceNode.center.x);this.canvas.dataset.selectionY=String(h.sourceNode.center.y);}this.callbacks.onExplore?.(h.row.item.id);}else this.callbacks.onItem(h.row.item.id);}else if(h?.type==='recipe')this.callbacks.onRecipe?.(h.recipe.recipeId);else if(this.mode==='graph')this.callbacks.onBackground?.();}}
 focusRaw(){if(this.mode!=='3d')return;this.focusStage=-1;this.rawFitted=true;this.overviewFit=false;this.pan={x:0,y:0};this.zoom=1;this.callbacks.onZoom(1);this.draw();}

 cancel(e){this.pointers.delete(e.pointerId);this.drag=null;this.pinch=null;this.canvas.classList.remove('dragging');}
 pick(p){const label=this.hits.find(h=>h.label&&p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h);if(label)return label;return [...this.hits].reverse().find(h=>h.rect?p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h:h.poly?inside(p.x,p.y,h.poly):Math.hypot(h.x-p.x,h.y-p.y)<=h.r+3)||null;}

 floor(rows){
  this.packingCache ||=new WeakMap();if(this.packingCache.has(rows))return this.packingCache.get(rows);
  this.geometryCache ||=new Map();const key=rows.map(r=>r.item.id+':'+(r.fixedRadius?'raw':r.score?.toFixed(6))).join('|');let layout=this.geometryCache.get(key);
  if(layout){const byId=new Map(rows.map(r=>[r.item.id,r]));layout={bounds:layout.bounds,points:layout.points.map(p=>({...p,row:byId.get(p.row.item.id)}))};}
  else{layout=packFloor(rows);this.geometryCache.set(key,layout);if(this.geometryCache.size>32)this.geometryCache.delete(this.geometryCache.keys().next().value);}
  this.packingCache.set(rows,layout);return layout;
 }
 pack(){const floor=this.floor(this.rows||[]);this.points=floor.points;this.layoutBounds=floor.bounds;this.layoutHeight=floor.bounds.maxy-floor.bounds.miny;this.floorLayouts=(this.layers||[]).map(rows=>this.floor(rows));this.rawLayout=this.floor(this.rawRows||[]);}

 icon(item){if(!this.icons.has(item.id)){const im=new Image();im.onload=()=>this.draw();im.src=item.icon;this.icons.set(item.id,im);}return this.icons.get(item.id);}
 draw(){if(this.drawFrame)return;this.drawFrame=requestAnimationFrame(()=>{this.drawFrame=null;this.paint();});}
 paint(){if(!this.width||!this.height)return;const c=this.ctx;c.clearRect(0,0,this.width,this.height);this.hits=[];this.grid();
  this.canvas.dataset.camera=JSON.stringify(this.cameraState());
  if(this.transition){const t=this.transition.duration?(performance.now()-this.transition.start)/this.transition.duration:1;if(t<1){this.drawTransition(t);this.draw();return;}this.transition=null;this.canvas.dataset.transition='idle';this.canvas.setAttribute('aria-busy','false');}
  if(this.mode==='graph'){const fade=this.graphFade,t=fade?(fade.duration?Math.min(1,(performance.now()-fade.start)/fade.duration):1):1;if(fade&&t<1){c.save();c.globalAlpha=1-t;c.drawImage(fade.image,0,0,this.width,this.height);c.restore();}this.graphEdgeAlpha=t;this.drawGraph();if(t<1)this.draw();else this.graphFade=null;}else this.mode==='3d'?this.draw3d():this.draw2d();
 }
 drawTransition(time){
  const c=this.ctx,t=this.transition,ease=time*time*(3-2*time),p=t.reverse?1-ease:ease,source=t.overview.scene.stages[t.stage],target=t.flat;if(!target)return;
  const lerp=(a,b)=>a+(b-a)*p,mix=(a,b)=>({x:lerp(a.x,b.x),y:lerp(a.y,b.y)});c.save();c.globalAlpha=1-p;c.drawImage(t.overview.image,0,0,this.width,this.height);c.restore();
  c.save();
  const byId=new Map(source.nodes.map(n=>[n.row.item.id,n])),origin=source.poly.reduce((a,b)=>({x:a.x+b.x/4,y:a.y+b.y/4}),{x:0,y:0});
  for(const node of target.nodes){const from=byId.get(node.row.item.id),color=ROLES[node.row.item.role].color,center=mix(from?.center||origin,{x:node.x,y:node.y}),radius=lerp(from?.radius||0,node.r);c.globalAlpha=from?Math.min(1,p*5):p;
   const ring=Array.from({length:32},(_,i)=>{const a=i/32*TAU;return mix(from?.ring[i]||origin,{x:node.x+Math.cos(a)*node.r,y:node.y+Math.sin(a)*node.r});});polygon(c,ring);c.fillStyle=color+'45';c.fill();c.strokeStyle=color;c.lineWidth=1.5;c.stroke();
   const image=this.icon(node.row.item);if(image.complete&&image.naturalWidth&&radius>7){c.globalAlpha*=p;c.imageSmoothingEnabled=false;c.drawImage(image,center.x-radius*.67,center.y-radius*.67,radius*1.34,radius*1.34);}
  }c.restore();
  if(p>.72){c.save();c.globalAlpha=(p-.72)/.28;const current=this.cameraState();this.applyCamera(t.flatCamera);this.draw2d();this.applyCamera(current);c.restore();}
 }
 grid(){const c=this.ctx,w=this.width,h=this.height;c.strokeStyle='#68886a0a';c.lineWidth=1;for(let x=-h;x<w+h;x+=45){c.beginPath();c.moveTo(x,0);c.lineTo(x+h*.45,h);c.stroke();}for(let y=0;y<h;y+=42){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}}
 draw3d(){drawOverview.call(this);}
 draw2d(){drawFlat.call(this);}
 drawGraph(){drawInPlaceGraph.call(this);}
 destroy(){this.resizeObserver.disconnect();globalThis.removeEventListener('resize',this.onWindowResize);if(this.drawFrame)cancelAnimationFrame(this.drawFrame);}
}
