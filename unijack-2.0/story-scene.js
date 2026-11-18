import * as THREE from 'three';
import { buildDetailedModel } from './detailed-model.js';
import { setupStudioEnvironment } from './material-finish.js';
import { mercuryInsertionPose, poseAt, easeInOut, easeOut, frameDelta } from './motion.js';

// One renderer for the whole UniJack story. Story progress (0–1) sets every
// pose; the assembly controls can temporarily override it. Frames are drawn
// only while something is changing.
const MM = .05; // Authored millimetres to scene units.
const V = (x,y,z)=>new THREE.Vector3(x,y,z);
const EXPLODE = {mercury:V(0,46,-4), peri:V(30,20,0), components:12};
// Exits are lateral so they read as leaving frame in the top-down view.
const LEAVE = {mercury:V(-190,40,-150), peri:V(200,30,40)};
// Underside stop: Mercury lifts clear of the socket and turns its underside to the camera.
const FLIP = {lift:V(0,74,26), angle:-2.4};
// Annotation anchors: a point inside each part's resting bounds (fractions of x, y, z).
const ANCHORS = {base:['base',[.30,1,.66]], baseBack:['base',[.2,1,.14]], mercury:['mercury',[.5,1,.5]], peri:['peri',[.5,1,.42]],
 ports:['base',[.05,.8,.55]], aurix:['mercury',[.56,.5,.52]], underside:['mercury',[.5,0,.45]],
 socket:['base',[.25,.55,.86]], erau:['base',[.56,.35,.42]]};
const BOARD_LAYER = /^(FR4 cut edge|Teal solder mask|Photographic solder mask and silkscreen)$/;
const lerp = THREE.MathUtils.lerp;
function lerpAngle(a,b,t){let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return a+d*t;}

function contactShadow(){
 const size=256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
 g.addColorStop(0,'rgba(0,0,0,.62)');g.addColorStop(.55,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
 const texture=new THREE.CanvasTexture(canvas);
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,color:'#000'}));
 mesh.rotation.x=-Math.PI/2;mesh.renderOrder=-1;return mesh;
}

export async function createStoryScene(host,{lite=false,instant=false,timeline=null,onFrame=()=>{},shouldStop=()=>false}={}){
 let tl=timeline;
 // shouldStop() lets the page give up (and show the still photo) between the
 // heavy steps instead of blocking until the board is finished.
 const stopIfLate=()=>{if(shouldStop())throw new Error('cancelled');};
 performance.mark('uj:scene-start');
 // Phones get the 1024px photos, larger screens 2048px; both start on tiny previews.
 const source=await buildDetailedModel({full:lite||innerWidth<960?1024:2048,finishWidth:lite||innerWidth<960?768:1536,shouldStop});
 performance.mark('uj:model-built');stopIfLate();
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:lite?'low-power':'high-performance'});
 const maxRatio=lite?1.5:1.75;
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 renderer.shadowMap.enabled=!lite;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');canvas.className='stage-webgl';
 host.prepend(canvas);

 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.1,120);
 const disposeEnvironment=setupStudioEnvironment(scene,renderer);scene.environmentIntensity=.78;
 scene.add(new THREE.HemisphereLight('#dfe8ef','#0b1726',.34));
 const key=new THREE.DirectionalLight('#f5f8fb',2.05);key.position.set(-5,7,-3);
 if(!lite){key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-7,right:7,top:6,bottom:-6,near:.5,far:30});key.shadow.bias=-.00008;key.shadow.normalBias=.004;key.shadow.radius=2.5;}
 const fill=new THREE.DirectionalLight('#cfdcea',.55);fill.position.set(4.5,3,5);
 const under=new THREE.DirectionalLight('#dfe5eb',.32);under.position.set(-2.5,-5,2);
 // Brand rim: cyan from behind the board, strongest while the layers separate.
 const rim=new THREE.DirectionalLight('#74e2f4',.5);rim.position.set(6,2.2,-7);
 scene.add(key,fill,under,rim);

 const root=source.root;root.scale.setScalar(MM);scene.add(root);
 const base=root.getObjectByName('UniJack_baseboard'),mercury=root.getObjectByName('Mercury_module'),peri=root.getObjectByName('PeriBoard');
 const components=new THREE.Group();components.name='UniJack component layer';
 for(const mesh of [...base.children])if(!BOARD_LAYER.test(mesh.name))components.add(mesh);
 base.add(components);
 const rest={mercury:source.rest.mercury.clone(),peri:source.rest.peri.clone()};
 const shadow=contactShadow();scene.add(shadow);

 // Bounds for the key poses, measured once at rest and once fully exploded.
 function applyParts(m,pe,lift,tilt){
  mercury.position.copy(m);peri.position.copy(pe);components.position.y=lift;mercury.rotation.z=tilt;root.updateMatrixWorld(true);
 }
 applyParts(rest.mercury,rest.peri,0,0);
 const boxes={all:new THREE.Box3().setFromObject(root),base:new THREE.Box3().setFromObject(base),
  mercury:new THREE.Box3().setFromObject(mercury),peri:new THREE.Box3().setFromObject(peri)};
 applyParts(rest.mercury.clone().add(EXPLODE.mercury),rest.peri.clone().add(EXPLODE.peri),lite?0:EXPLODE.components,-.1);
 boxes.exploded=new THREE.Box3().setFromObject(root);
 applyParts(rest.mercury,rest.peri,0,0);
 // Local anchor points, taken at rest so they follow each part as it moves.
 const anchorLocal={};
 for(const [name,[part,f]] of Object.entries(ANCHORS)){const b=boxes[part],obj={base,mercury,peri}[part];
  const w=V(lerp(b.min.x,b.max.x,f[0]),lerp(b.min.y,b.max.y,f[1]),lerp(b.min.z,b.max.z,f[2]));anchorLocal[name]=[obj,obj.worldToLocal(w)];}
 mercury.position.copy(rest.mercury).add(FLIP.lift);mercury.rotation.z=FLIP.angle;root.updateMatrixWorld(true);
 boxes.flipped=new THREE.Box3().setFromObject(mercury);
 {const ins=mercuryInsertionPose(0);mercury.position.copy(rest.mercury);mercury.position.x+=ins.x;mercury.position.y+=ins.y;mercury.rotation.z=ins.angle;root.updateMatrixWorld(true);
  boxes.insertion=new THREE.Box3().setFromObject(mercury).union(boxes.mercury);}
 applyParts(rest.mercury,rest.peri,0,0);
 const footprint=boxes.all.getSize(new THREE.Vector3());
 shadow.scale.set(footprint.x*1.25,footprint.z*1.7,1);shadow.position.set(boxes.all.getCenter(new THREE.Vector3()).x,boxes.all.min.y-.02,0);

 const fov=THREE.MathUtils.degToRad(camera.fov);
 // Coverage is a share of the canvas: cw horizontally, ch vertically.
 function fit(box,az,el,cw,ch=cw){
  const center=box.getCenter(new THREE.Vector3()),back=V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
  let right=V(0,1,0).cross(back);if(right.lengthSq()<1e-8)right.set(1,0,0);right.normalize();
  const up=back.clone().cross(right),tan=Math.tan(fov/2);let distance=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
   const v=V(x,y,z).sub(center),depth=v.dot(back);
   distance=Math.max(distance,depth+Math.abs(v.dot(right))/(tan*camera.aspect*cw),depth+Math.abs(v.dot(up))/(tan*ch));
  }
  return {target:center,az,el,distance};
 }
 const az0=Math.atan2(-120,174),el0=Math.asin(147/Math.hypot(120,147,174)),yaw=THREE.MathUtils.degToRad(25);
 const dirKey=(box,d,cw,ch)=>fit(box,Math.atan2(d.x,d.z),Math.asin(d.y/d.length()),cw,ch);
 const mmBox=(a,b)=>new THREE.Box3(a.clone().multiplyScalar(MM),b.clone().multiplyScalar(MM));
 let keys={};
 // The board is the hero: ~80% of the width (max ~1200px) on desktop, nearly
 // full width on phones, inside the region below the text band (frame).
 const frameBox={top:0,bottom:0,hero:0};let steadyDy=0,regionRatio=1;
 // Hardware section: the board sits in its own region (left column on desktop, top panel on phones).
 const hwBox={x:0,y:0,w:0,h:0};let hwDx=0,hwDy=0;
 function layoutKeys(){
  const W=canvas.clientWidth||1,H=canvas.clientHeight||1,region=Math.max(H*.3,H-frameBox.top-frameBox.bottom);
  const narrowPhone=W<=600;
  const cw=narrowPhone?.77:lite?.94:Math.min(.8,1200/W),ch=region/H*(narrowPhone?.82:.96);
  steadyDy=frameBox.top+region/2-H/2;regionRatio=Math.min(1,region/H);
  const dc=lite?.92:.72; // close-ups
  keys={
   hero:fit(boxes.all,az0,el0,cw,ch),heroYaw:fit(boxes.all,az0+yaw,el0-.03,cw,ch),
   exploded:fit(boxes.exploded,az0+yaw+.16,el0+.07,cw,ch),
   ports:dirKey(mmBox(V(-87,0,-37),V(-48,16,40)),V(-61,48,69),dc,regionRatio*.85),
   chips:dirKey(mmBox(V(-30,0,-32),V(44,9,34)),V(-48,76,90),dc,regionRatio*.85),
   underside:fit(boxes.flipped,az0+yaw,el0+.04,lite?.6:.6,regionRatio*(lite?.6:.82)),
   insertion:fit(boxes.insertion,az0+.5,.58,lite?.62:.66,regionRatio*(lite?.62:.82)),
   topDown:fit(boxes.base,0,THREE.MathUtils.degToRad(88.5),cw*.78,ch*.86)
  };
  // Phones: close-ups never run under the caption or the control bar. The camera
  // backs off until the whole board fits the space left for it at that stop.
  if(lite&&tl){
   const withAll=b=>b.clone().union(boxes.all);
   for(const [name,box,stop] of [['ports',boxes.all,'ports'],['chips',boxes.all,'chips'],['underside',withAll(boxes.flipped),'underside'],['insertion',withAll(boxes.insertion),'separate']])fitVertical(keys[name],box,pads[stop]);
  }
  if(hwBox.w>0){
   const hw=hwBox.w/W*(lite?.94:.86),hh=hwBox.h/H*.8;hwDx=hwBox.x+hwBox.w/2-W/2;hwDy=hwBox.y+hwBox.h/2-H/2;
   Object.assign(keys,{'hw-all':fit(boxes.all,az0+yaw,el0-.03,hw,hh),'hw-out':fit(boxes.all,az0,el0,hw,hh),
    // The whole board stays inside its column at every card, so nothing reaches the cards.
    'hw-base':fit(boxes.all,az0+yaw+.1,el0+.03,hw,hh),'hw-mercury':fit(boxes.all,az0+yaw+.22,el0+.1,hw,hh),'hw-peri':fit(boxes.all,az0+yaw-.14,el0+.05,hw,hh)});
  }
 }
 let pads={};
 const probeCam=new THREE.PerspectiveCamera();
 function fitVertical(k,box,pad){
  const H=canvas.clientHeight||1,avail=Math.max(80,H-frameBox.top-frameBox.bottom-(pad?.above||0)-(pad?.below||0));
  probeCam.fov=camera.fov;probeCam.aspect=camera.aspect;probeCam.near=camera.near;probeCam.far=camera.far;probeCam.updateProjectionMatrix();
  for(let i=0;i<24;i++){
   probeCam.position.set(Math.sin(k.az)*Math.cos(k.el),Math.sin(k.el),Math.cos(k.az)*Math.cos(k.el)).multiplyScalar(k.distance).add(k.target);probeCam.up.set(0,1,0);probeCam.lookAt(k.target);probeCam.updateMatrixWorld();
   let min=1e9,max=-1e9;
   for(let c=0;c<8;c++){const v=V(c&1?box.max.x:box.min.x,c&2?box.max.y:box.min.y,c&4?box.max.z:box.min.z).project(probeCam);min=Math.min(min,v.y);max=Math.max(max,v.y);}
   const h=(max-min)/2*H;if(h<=avail)break;
   k.distance*=Math.min(1.5,Math.max(1.03,h/avail));
  }
 }
 // Framing without changing perspective: shift the projection.
 let appliedDx=NaN,appliedDy=NaN;
 function applyOffset(dy,dx=0){
  if(Math.abs(dy-appliedDy)<.25&&Math.abs(dx-appliedDx)<.25)return;appliedDy=dy;appliedDx=dx;
  const W=canvas.clientWidth||1,H=canvas.clientHeight||1;camera.setViewOffset(W,H,-dx,-dy,W,H);
 }
 function blendCam(a,b,t){return {target:a.target.clone().lerp(b.target,t),az:lerpAngle(a.az,b.az,t),el:lerp(a.el,b.el,t),distance:lerp(a.distance,b.distance,t)};}
 // Assembly-control views (part tabs, insertion slider) reuse the explorer framing.
 function overrideCamera(o){
  if(o.inspection==='ports'||o.inspection==='chips')return keys[o.inspection];
  if(o.inspection==='underside')return keys.underside;
  const c=o.focus==='all'?.7:.74;return fit(boxes[o.focus]||boxes.all,az0+yaw,el0,c,c*regionRatio);
 }

 const state={p:0,target:0,override:null,weight:0,weightTarget:0,dragYaw:0,dragPitch:0,yawVelocity:0,idle:!lite&&!instant,paused:false,active:true,time:0,intro:instant?1:0,introStart:0};
 const INTRO_MS=800;
 let frame=0,last=0,shadowDirty=true;
 const out={labels:[],anchors:{},bounds:null,baseRect:null,progress:0,phase:'story'};
 for(const name of Object.keys(ANCHORS))out.anchors[name]={x:0,y:0,on:false};
 const tmp=new THREE.Vector3(),mTarget=new THREE.Vector3(),pTarget=new THREE.Vector3(),corner=new THREE.Vector3();
 const partBox=new THREE.Box3();
 const NOPAD={above:0,below:0};
 const restPose={phase:'story',camA:'hero',camB:'hero',camT:0,hero:1,explode:{peri:0,mercury:0,components:0},insertion:1,flip:0,leave:0,dim:0};

 function pose(){
  const P=tl?poseAt(tl,state.p):restPose,o=state.override,w=state.weight;
  const still=P.stop==='routing-preview';
  const periT=P.explode.peri,mercT=P.explode.mercury,compT=lite?0:P.explode.components,leaveT=P.leave,flipT=easeInOut(P.flip);
  const ins=mercuryInsertionPose(P.insertion);
  mTarget.copy(rest.mercury).addScaledVector(EXPLODE.mercury,mercT).addScaledVector(LEAVE.mercury,leaveT).addScaledVector(FLIP.lift,flipT);
  mTarget.x+=ins.x;mTarget.y+=ins.y;
  pTarget.copy(rest.peri).addScaledVector(EXPLODE.peri,periT).addScaledVector(LEAVE.peri,leaveT);
  let tilt=-.1*mercT+ins.angle+FLIP.angle*flipT,lift=EXPLODE.components*compT;
  const hw=P.phase==='hardware';
  let cam=blendCam(keys[P.camA]||keys.hero,keys[P.camB]||keys.hero,P.camT);
  if(o&&w>0&&!hw&&!still){
   const oi=mercuryInsertionPose(o.insertion??1);
   const om=rest.mercury.clone();om.x+=oi.x;om.y+=oi.y;
   mTarget.lerp(om,w);pTarget.lerp(rest.peri,w);tilt=lerp(tilt,oi.angle,w);lift=lerp(lift,0,w);
   cam=blendCam(cam,overrideCamera(o),easeInOut(w));
  }
  const showAll=hw||still||!o||o.focus==='all'||w<.02;
  for(const [name,part] of [['base',base],['mercury',mercury],['peri',peri]])part.visible=showAll||o.focus===name;
  if(!mercury.position.equals(mTarget)||!peri.position.equals(pTarget)||components.position.y!==lift||mercury.rotation.z!==tilt)shadowDirty=true;
  mercury.position.copy(mTarget);peri.position.copy(pTarget);components.position.y=lift;mercury.rotation.z=tilt;
  shadow.material.opacity=(1-leaveT)*.9;shadow.visible=shadow.material.opacity>.01&&showAll;
  // Camera: story key + drag offset + a small idle drift at the top of the page.
  const idle=state.idle&&!state.paused&&!hw?Math.sin(state.time*.32)*.1*P.hero:0;
  const el=THREE.MathUtils.clamp(cam.el+(still?0:state.dragPitch),-.2,1.545);
  const az=cam.az+(still?0:state.dragYaw)+idle;
  // Reveal: the board rises and scales up into place; at the top of the page
  // it sits a little lower and lifts as the hero text leaves.
  const e=still?1:easeOut(state.intro),Hc=canvas.clientHeight||1;
  const heroT=P.hero;
  const heroDrop=Math.max(0,frameBox.hero-frameBox.top)*.62*heroT;
  const baseDy=hw?hwDy+Hc*.14*(1-e):steadyDy+heroDrop+Hc*.14*(1-e);
  applyOffset(baseDy,hw?hwDx:0);
  const distance=cam.distance*(1+.32*(1-e)+(!hw&&frameBox.hero>frameBox.top?.18*heroT:0));
  camera.position.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance).add(cam.target);
  camera.up.set(0,1,0);camera.lookAt(cam.target);
  const explodeT=Math.max(periT,mercT);
  rim.intensity=.5+1.4*explodeT*(1-leaveT);
  renderer.toneMappingExposure=.92-.5*P.dim;
  // Annotation anchors and the board's on-screen bounds, in canvas pixels.
  const W=canvas.clientWidth,H=canvas.clientHeight;camera.updateMatrixWorld();root.updateMatrixWorld(true);
  for(const [name,[obj,local]] of Object.entries(anchorLocal)){
   tmp.copy(local);obj.localToWorld(tmp);tmp.project(camera);
   const a=out.anchors[name];a.x=(tmp.x*.5+.5)*W;a.y=(-tmp.y*.5+.5)*H;a.on=obj.visible&&tmp.z<1;
  }
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(const part of [base,mercury,peri]){if(!part.visible||(part!==base&&leaveT>.5))continue;
   partBox.setFromObject(part);
   for(let k=0;k<8;k++){corner.set(k&1?partBox.max.x:partBox.min.x,k&2?partBox.max.y:partBox.min.y,k&4?partBox.max.z:partBox.min.z).project(camera);
    const sx=(corner.x*.5+.5)*W,sy=(-corner.y*.5+.5)*H;minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);}
  }
  // Phones: caption, board and annotations sit as one group, centred between
  // the header and the control bar. The pads are the space the caption and
  // labels need above and below the board at this stop.
  if(lite&&!hw&&P.phase==='story'&&minY<maxY){
   const a=pads[P.prev]||NOPAD,b=pads[P.stop]||NOPAD,above=lerp(a.above,b.above,P.camT),below=lerp(a.below,b.below,P.camT);
   const centre=frameBox.top+(H-frameBox.top-frameBox.bottom)/2;
   const delta=(centre-(minY-above+maxY+below)/2)*(1-heroT)*e;
   if(Math.abs(delta)>.25){applyOffset(baseDy+delta,0);minY+=delta;maxY+=delta;for(const a2 of Object.values(out.anchors))a2.y+=delta;}
  }
  out.bounds={left:minX,right:maxX,top:minY,bottom:maxY};
  out.progress=state.p;out.intro=e;out.phase=P.phase;out.stop=P.stop;
 }
 function baseRectAtTopDown(){
  // Where the base board lands on screen in the top-down key: the schematic
  // overlay is registered to this rectangle.
  const saved=camera.position.clone(),k=keys.topDown,b=boxes.base;applyOffset(steadyDy);
  camera.position.set(Math.sin(k.az)*Math.cos(k.el),Math.sin(k.el),Math.cos(k.az)*Math.cos(k.el)).multiplyScalar(k.distance).add(k.target);camera.lookAt(k.target);camera.updateMatrixWorld();
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;const W=canvas.clientWidth,H=canvas.clientHeight;
  for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z]){tmp.set(x,b.max.y,z).project(camera);const sx=(tmp.x*.5+.5)*W,sy=(-tmp.y*.5+.5)*H;minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);}
  camera.position.copy(saved);return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
 }

 function render(){
  pose();
  if(shadowDirty&&renderer.shadowMap.enabled){renderer.shadowMap.needsUpdate=true;shadowDirty=false;}
  renderer.render(scene,camera);
  canvas.dataset.frames=String(Number(canvas.dataset.frames||0)+1);
  onFrame(out);
 }
 function moving(){
  return state.intro<1||Math.abs(state.target-state.p)>1e-5||Math.abs(state.weightTarget-state.weight)>1e-4||Math.abs(state.yawVelocity)>1e-5||(state.idle&&!state.paused&&state.p<.08);
 }
 function tick(now){
  frame=0;if(!state.active)return;
  const dt=frameDelta(now,last);last=now;state.time+=dt;
  // Step the reveal per frame (capped) so a slow first frame cannot skip it.
  if(state.intro<1)state.intro=Math.min(1,state.intro+Math.min(dt,1/30)*1000/INTRO_MS);
  // Light smoothing (~33ms time constant): the board never trails the scrollbar.
  const k=instant?1:1-Math.exp(-30*dt);
  state.p+=(state.target-state.p)*k;if(Math.abs(state.target-state.p)<1e-5)state.p=state.target;
  const kw=instant?1:1-Math.exp(-9*dt);
  state.weight+=(state.weightTarget-state.weight)*kw;if(Math.abs(state.weightTarget-state.weight)<1e-4)state.weight=state.weightTarget;
  if(state.weight===0&&state.weightTarget===0)state.override=null;
  if(!dragging){state.dragYaw+=state.yawVelocity*dt;state.yawVelocity*=Math.exp(-5*dt);if(Math.abs(state.yawVelocity)<1e-4)state.yawVelocity=0;}
  render();
  if(moving()||dragging)request();
 }
 function request(){if(!frame&&state.active){if(!last)last=performance.now();frame=requestAnimationFrame(tick);}}

 // Horizontal drag turns the board; vertical gestures keep scrolling the page.
 let dragging=false,lastX=0,lastY=0,lastT=0;
 canvas.style.touchAction='pan-y';
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;lastY=e.clientY;lastT=e.timeStamp;state.yawVelocity=0;canvas.setPointerCapture(e.pointerId);host.dataset.dragging='true';request();});
 canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY,dt=Math.max(1,e.timeStamp-lastT)/1000;
  state.dragYaw-=dx*.006;if(e.pointerType==='mouse')state.dragPitch=THREE.MathUtils.clamp(state.dragPitch+dy*.004,-.5,.45);
  state.yawVelocity=-dx*.006/dt*.35;lastX=e.clientX;lastY=e.clientY;lastT=e.timeStamp;request();});
 const endDrag=()=>{if(!dragging)return;dragging=false;host.dataset.dragging='false';request();};
 canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);

 function resize(){
  const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  const ratio=Math.min(window.devicePixelRatio||1,maxRatio,Math.sqrt(3.2e6/(w*h)));
  renderer.setPixelRatio(Math.max(1,ratio));renderer.setSize(w,h,false);
  camera.aspect=w/h;appliedDy=NaN;camera.updateProjectionMatrix();layoutKeys();out.baseRect=baseRectAtTopDown();shadowDirty=true;render();
 }
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
 resize();
 // Warm-up while the canvas is still invisible: draw the exploded and
 // top-down poses once so no shader or shadow pass compiles mid-scroll.
 performance.mark('uj:first-render');
 if(shouldStop()){resizeObserver.disconnect();disposeEnvironment();renderer.dispose();canvas.remove();throw new Error('cancelled');}
 if(tl){const b=tl.byName,warm=instant?[0]:[b.exploded.end-.01,b.underside.end-.01,b.connected.start+.15,b.frame.end,tl.hardware.start+2,0];
  for(const p of warm){state.p=state.target=p;shadowDirty=true;render();}}
 host.dataset.webgl='ready';host.classList.add('ready');
 canvas.dataset.textures='preview';

 // Progressive textures: once the full photos are decoded and the reveal has
 // finished, swap them in under a 250ms crossfade of the last preview frame.
 function crossfadeSwap(apply){
  render();
  const snap=document.createElement('canvas');snap.width=canvas.width;snap.height=canvas.height;
  snap.getContext('2d').drawImage(canvas,0,0);
  snap.className='stage-webgl-snap';snap.setAttribute('aria-hidden','true');
  snap.style.cssText=`position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${getComputedStyle(canvas).opacity};transition:opacity 250ms cubic-bezier(.23,1,.32,1)`;
  canvas.after(snap);
  apply();shadowDirty=true;render();
  canvas.dataset.textures='full';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{snap.style.opacity='0';setTimeout(()=>snap.remove(),400);}));
 }
 // Heavy steps (texture upload, mask rebuild) wait for a pause in scrolling.
 let lastInput=0;
 addEventListener('scroll',()=>{lastInput=performance.now();},{passive:true});
 const settled=()=>state.intro>=1&&!dragging&&performance.now()-lastInput>300&&Math.abs(state.target-state.p)<1e-4&&Math.abs(state.weightTarget-state.weight)<1e-4;
 const whenSettled=async()=>{const t0=performance.now();while(!settled()&&performance.now()-t0<15000)await new Promise(r=>setTimeout(r,120));};
 source.upgradeTextures().then(async upgrade=>{
  await whenSettled();
  crossfadeSwap(upgrade.apply);
  await new Promise(r=>setTimeout(r,400));await whenSettled();
  for(const step of upgrade.refineSteps){await whenSettled();step();request();await new Promise(r=>setTimeout(r,300));}
 }).catch(error=>console.warn('Full product photos unavailable; keeping previews',error));
 Object.assign(canvas.dataset,{triangles:String(source.stats.triangles),materialBatches:String(source.stats.materialBatches)});

 return {
  canvas,
  setProgress(value,{jump=false}={}){const v=Math.max(0,value);if(v!==state.target)lastInput=performance.now();state.target=v;if(instant||jump)state.p=state.target;request();},
  // Jump straight to a position under a short crossfade (shortcuts, reduced motion).
  crossfadeTo(value,ms=200){
   render();const snap=document.createElement('canvas');snap.width=canvas.width;snap.height=canvas.height;
   snap.getContext('2d').drawImage(canvas,0,0);snap.className='stage-webgl-snap';snap.setAttribute('aria-hidden','true');
   snap.style.cssText=`position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${getComputedStyle(canvas).opacity};transition:opacity ${ms}ms cubic-bezier(.23,1,.32,1)`;
   canvas.after(snap);state.p=state.target=Math.max(0,value);lastInput=performance.now();render();
   requestAnimationFrame(()=>requestAnimationFrame(()=>{snap.style.opacity='0';setTimeout(()=>snap.remove(),ms+150);}));
  },
  setTimeline(value){tl=value;layoutKeys();request();},
  setGroupPads(value){pads=value;layoutKeys();request();},
  setHardwareFrame(x,y,w,h){if(hwBox.x===x&&hwBox.y===y&&hwBox.w===w&&hwBox.h===h)return;Object.assign(hwBox,{x,y,w,h});layoutKeys();request();},
  setOverride(o){
   if(o){state.override={focus:'all',inspection:'overview',insertion:1,...o};state.weightTarget=1;}
   else state.weightTarget=0;
   request();
  },
  hasOverride:()=>state.weightTarget>0,
  setFrame(top,bottom,hero=0){if(frameBox.top===top&&frameBox.bottom===bottom&&frameBox.hero===hero)return;frameBox.top=top;frameBox.bottom=bottom;frameBox.hero=hero;layoutKeys();out.baseRect=baseRectAtTopDown();request();},
  setPaused(value){state.paused=value;last=0;request();},
  setActive(value){state.active=value;if(value){last=0;request();}else{cancelAnimationFrame(frame);frame=0;}},
  resetView(){state.dragYaw=0;state.dragPitch=0;state.yawVelocity=0;request();},
  dock(element){if(canvas.parentElement===element)return;resizeObserver.unobserve(host);host=element;element.prepend(canvas);resizeObserver.observe(host);resize();},
  snapshot(){render();return canvas.toDataURL('image/webp',.9);},
  getState:()=>({progress:state.p,target:state.target,override:state.override,weight:state.weight,paused:state.paused,drawCalls:renderer.info.render.calls}),
  dispose(){cancelAnimationFrame(frame);resizeObserver.disconnect();disposeEnvironment();renderer.dispose();canvas.remove();}
 };
}
