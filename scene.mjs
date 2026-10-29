import {ROLES,sphereRadius,tier} from './scoring.mjs';
const sceneTau=Math.PI*2;
function trace(ctx,p){ctx.beginPath();p.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](v.x,v.y));ctx.closePath();}
const sceneColor=item=>ROLES[item.role]?.color||'#8cbaa0';

// Orthographic spheres keep their circular silhouette during camera rotation.
export function drawSphere(c,x,y,r,color,image,selected=false){
 if(r<.3)return;c.save();c.beginPath();c.ellipse(x,y+r*.88,r*.83,r*.22,0,0,sceneTau);c.fillStyle='#00000065';c.fill();
 const light=c.createRadialGradient(x-r*.34,y-r*.4,r*.03,x+r*.18,y+r*.2,r*1.16);light.addColorStop(0,'#f1fff5');light.addColorStop(.17,color);light.addColorStop(.64,color+'c8');light.addColorStop(1,'#07130e');
 c.beginPath();c.arc(x,y,r,0,sceneTau);c.fillStyle=light;c.fill();c.strokeStyle=selected?'#f2ffd8':color+'d0';c.lineWidth=selected?3:1.2;c.stroke();
 c.save();c.beginPath();c.arc(x,y,r-1,0,sceneTau);c.clip();c.beginPath();c.ellipse(x,y+r*.12,r*.96,r*.37,-.16,0,Math.PI);c.strokeStyle='#ffffff30';c.lineWidth=Math.max(.7,r*.016);c.stroke();
 if(image?.complete&&image.naturalWidth&&r>6){c.imageSmoothingEnabled=false;c.drawImage(image,x-r*.54,y-r*.54,r*1.08,r*1.08);}
 c.restore();c.beginPath();c.ellipse(x-r*.33,y-r*.52,r*.24,r*.1,-.5,0,sceneTau);c.fillStyle='#ffffff65';c.fill();c.restore();
}

export function packFloor(rows){
 const points=rows.map((row,i)=>{const raw=!!row.fixedRadius,r=raw?40:sphereRadius(row.score);return {row,rank:i+1,raw,tail:0,r,w:r*2+18,h:r*2+18,tier:raw?null:tier(row.score)};}).filter(p=>p.r>0);
 const grid=new Map(),cell=110,gap=22,maxR=Math.max(40,...points.map(p=>p.r)),key=(x,y)=>x+','+y;
 for(const p of [...points].sort((a,b)=>b.r-a.r||a.rank-b.rank)){
  for(let trial=0;trial<50000;trial++){const angle=trial*2.399963229728653,reach=22*Math.sqrt(trial),x=Math.cos(angle)*reach*1.8,y=Math.sin(angle)*reach*.72,gx=Math.floor(x/cell),gy=Math.floor(y/cell),range=Math.ceil((p.r+maxR+gap)/cell);let free=true;
   for(let dx=-range;dx<=range&&free;dx++)for(let dy=-range;dy<=range&&free;dy++)for(const other of grid.get(key(gx+dx,gy+dy))||[])if(Math.hypot(other.x-x,other.y-y)<p.r+other.r+gap){free=false;break;}
   if(!free)continue;p.x=x;p.iconX=x;p.y=y;const k=key(gx,gy);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);break;
  }
 }
 if(!points.length)return {points,bounds:{minx:-180,maxx:180,miny:-70,maxy:70}};
 const minx=Math.min(...points.map(p=>p.x-p.r)),maxx=Math.max(...points.map(p=>p.x+p.r)),miny=Math.min(...points.map(p=>p.y-p.r)),maxy=Math.max(...points.map(p=>p.y+p.r)),cx=(minx+maxx)/2,cy=(miny+maxy)/2;
 for(const p of points){p.x-=cx;p.iconX=p.x;p.y-=cy;}
 return {points,bounds:{minx:minx-cx-28,maxx:maxx-cx+28,miny:miny-cy-28,maxy:maxy-cy+28}};
}

export function drawOverview(){
 const c=this.ctx,w=this.width,h=this.height,C=Math.cos(this.yaw),S=Math.sin(this.yaw),P=Math.sin(this.pitch),Q=Math.cos(this.pitch);
 const raw=(x,y,z)=>({x:x*C-z*1.7*S,y:-y*Q+(x*S+z*1.7*C)*P,d:(x*S+z*1.7*C)*Q+y*P});
 let elevation=0;const shelves=this.floorLayouts.map((layout,index)=>{if(index){const a=this.floorLayouts[index-1].bounds,b=layout.bounds;elevation+=((a.maxy-a.miny+b.maxy-b.miny)/2)*1.7*Math.tan(.62)+95;}return {index,y:elevation,layout};});
 if(this.rawLayout?.points.length){const a=this.rawLayout.bounds,b=this.floorLayouts[0]?.bounds;const gap=((a.maxy-a.miny+(b?b.maxy-b.miny:0))/2)*1.7*Math.tan(.62)+95;shelves.unshift({index:-1,y:-gap,layout:this.rawLayout});}
 if(!shelves.length)return;const focus=shelves.find(s=>s.index===(this.focusStage??0))||shelves[0],rawOnly=this.focusStage===-1&&this.rawFitted,fitted=!!this.overviewFit||!!rawOnly;
 const projectedBounds=s=>{const b=s.layout.bounds,out=[];for(const x of [b.minx,b.maxx])for(const z of [b.miny,b.maxy])out.push(raw(x,s.y,z));return out;};
 const bounds=(fitted?(rawOnly?[focus]:shelves):[focus]).flatMap(projectedBounds),minx=Math.min(...bounds.map(p=>p.x)),maxx=Math.max(...bounds.map(p=>p.x)),miny=Math.min(...bounds.map(p=>p.y)),maxy=Math.max(...bounds.map(p=>p.y));
 const scale=(fitted?Math.min((w-110)/(maxx-minx),(h-190)/(maxy-miny+140)):Math.min(1.65,(w-110)/(maxx-minx),(h*.8)/(maxy-miny+140)))*this.zoom;
 const targetWorld=fitted?{x:C*(minx+maxx)/2+S*(miny+maxy)/2/P,y:0,z:(-S*(minx+maxx)/2+C*(miny+maxy)/2/P)/1.7}:{x:0,y:focus.y,z:0},f=raw(targetWorld.x,targetWorld.y,targetWorld.z),anchorY=fitted?.52:.55,ox=w*.53+this.pan.x-f.x*scale,oy=h*anchorY+this.pan.y-f.y*scale;
 const project=(x,y,z)=>{const p=raw(x,y,z);return {x:ox+p.x*scale,y:oy+p.y*scale,d:p.d};};
 this.scene3d={width:w,height:h,stages:[],raw:null,projection:{scale,zoom:this.zoom,pan:{...this.pan},targetWorld,depthScale:1.7,anchorXRatio:.53,anchorYRatio:anchorY}};
 Object.assign(this.canvas.dataset,{layerItemCounts:JSON.stringify(this.floorLayouts.map(f=>f.points.length)),rawItemCount:String(this.rawLayout?.points.length||0),sizeMode:fitted?'fit':'readable',gradeLabels:'none',shelfFrames:'cluster',markerShape:'sphere',volumeRatio:'2'});
 let visible=0,rawVisible=0;const labels=[];
 for(const shelf of shelves){const {index,y,layout}=shelf,b=layout.bounds,cx=(b.minx+b.maxx)/2,cz=(b.miny+b.maxy)/2,rx=(b.maxx-b.minx)*.64,rz=(b.maxy-b.miny)*.69;
  const poly=[project(b.minx,y,b.miny),project(b.maxx,y,b.miny),project(b.maxx,y,b.maxy),project(b.minx,y,b.maxy)],scene={poly,nodes:[]};if(index<0)this.scene3d.raw=scene;else this.scene3d.stages[index]=scene;
  const ordered=[...layout.points].sort((a,b)=>raw(a.iconX,y,a.y).d-raw(b.iconX,y,b.y).d);
  for(const p of ordered){const world={x:p.iconX,y:y+80,z:p.y},center=project(world.x,world.y,world.z),radius=p.r*scale,ring=Array.from({length:32},(_,k)=>({x:center.x+Math.cos(k/32*sceneTau)*radius,y:center.y+Math.sin(k/32*sceneTau)*radius})),sourceNode={row:p.row,center,ring,radius,world,worldRadius:p.r,tail:0,layerIndex:index};scene.nodes.push(sourceNode);
   if(center.x+radius<0||center.x-radius>w||center.y+radius<0||center.y-radius>h)continue;visible++;if(index<0&&center.x-radius>=0&&center.x+radius<=w&&center.y-radius>=0&&center.y+radius<=h)rawVisible++;
   this.hits.push({type:'item',row:p.row,x:center.x,y:center.y,r:radius,raw:p.raw,sourceNode});drawSphere(c,center.x,center.y,radius,sceneColor(p.row.item),null,this.hover==='i'+p.row.item.id);
  }
  const labelPoint=project(b.minx-15,y,0);labels.push({index,x:Math.max(10,labelPoint.x-10),y:labelPoint.y,layout});
 }
 for(const label of labels){if(label.y<85||label.y>h-72)continue;const {index,y,layout}=label,small=fitted&&!rawOnly;c.font=small?'600 13px Segoe UI':'600 19px Segoe UI';const text=index<0?'기초 재료':'Lv. '+((index+1)*10),lw=c.measureText(text).width,x=Math.max(10,label.x-lw-14),rh=small?28:48;
 c.fillStyle='#0c1c15e8';c.fillRect(x-5,y-17,lw+12,rh);c.fillStyle='#dbe6d0';c.textAlign='left';c.textBaseline='middle';c.fillText(text,x,y);if(!small){c.font='11px Malgun Gothic';c.fillStyle='#a3b398';c.fillText(layout.points.length+'개'+(index<0?' · 같은 크기':''),x,y+20);}c.strokeStyle='#8ca37d55';c.lineWidth=1;c.beginPath();c.moveTo(x+lw+8,y);c.lineTo(label.x+12,y);c.stroke();this.hits.push({type:index<0?'raw-stage':'stage',index,label:true,x:x-5,y:y-17,w:lw+12,h:rh});}

 Object.assign(this.canvas.dataset,{visibleItems:String(visible),rawFittedItems:String(rawVisible),itemImages:'hidden',displayedRoles:JSON.stringify([...new Set(shelves.flatMap(s=>s.layout.points.map(p=>p.row.item.role)))])});
}

export function drawFlat(){
 const c=this.ctx,{scale,ox,oy}=this.flatTransform();let fitted=0;Object.assign(this.canvas.dataset,{gradeLabels:'none',markerShape:'sphere',renderedItems:String(this.points.length)});
 for(const p of this.points){const x=ox+p.iconX*scale,y=oy+p.y*scale,r=p.r*scale;if(x-r>=0&&x+r<=this.width&&y-r>=0&&y+r<=this.height)fitted++;this.hits.push({type:'item',row:p.row,x,y,r});if(x+r<0||x-r>this.width||y+r<0||y-r>this.height)continue;drawSphere(c,x,y,r,sceneColor(p.row.item),this.icon(p.row.item),this.hover==='i'+p.row.item.id);}
 this.canvas.dataset.fittedItems=String(fitted);
}
