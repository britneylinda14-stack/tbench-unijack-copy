import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { buildDetailedModel } from './detailed-model.js';
import { setupStudioEnvironment } from './material-finish.js';
import { frameDelta, cyclePosition, mercuryInsertionPose } from './motion.js';

const MM = .05; // Authored millimetres to showroom units; proportions stay intact.
let reviewedModel;
async function cloneReviewedModel() {
 // Compile geometry once. Independent transforms share immutable rendering assets.
 reviewedModel ??= buildDetailedModel();
 const source = await reviewedModel;
 const root = source.root.clone(true);
 root.scale.setScalar(MM);
 return {root, base:root.getObjectByName('UniJack_baseboard'),
  mercury:root.getObjectByName('Mercury_module'), peri:root.getObjectByName('PeriBoard'),
  rest:source.rest, stats:source.stats};
}

function makeRouting() {
 const flow=new THREE.Group(),particles=[];
 const pathMaterial=new THREE.MeshBasicMaterial({color:'#74e2f4',transparent:true,opacity:.45,depthTest:false,depthWrite:false});
 const dotMaterial=new THREE.MeshBasicMaterial({color:'#e4fcff',depthTest:false,depthWrite:false});
 const dotGeometry=new THREE.SphereGeometry(.036,8,6);
 for(let i=0;i<16;i++) {
  const z=-1.37+i*.177;
  const curve=new THREE.CatmullRomCurve3([
   new THREE.Vector3(-.30,.12,z),new THREE.Vector3(.15,.12,z),new THREE.Vector3(.48,.12,z*.55),
   new THREE.Vector3(1.33,.12,z*.55),new THREE.Vector3(2.18,.13,z),new THREE.Vector3(2.89,.35,z)]);
  const path=new THREE.Mesh(new THREE.TubeGeometry(curve,32,.011,4,false),pathMaterial);
  const dot=new THREE.Mesh(dotGeometry,dotMaterial);
  path.renderOrder=10;dot.renderOrder=11;flow.add(path,dot);
  particles.push({dot,curve,offset:i*.061});
 }
 flow.visible=false;
 return {flow,particles,dispose(){flow.children.forEach(n=>n.geometry.dispose());pathMaterial.dispose();dotMaterial.dispose();}};
}

export async function createProductScene(container,{autoRotate=true,onReady=()=>{}}={}) {
 let renderer,model;
 container.setAttribute('aria-busy','true');container.dataset.webgl='loading';
 try {
  // Inspection views stop drawing once settled; retain their last frame for
  // browser compositing, viewport changes and user screenshots.
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  model=await cloneReviewedModel();
 } catch(error) {
  renderer?.dispose();container.classList.add('no-webgl');
  container.dataset.webgl='unavailable';container.setAttribute('aria-busy','false');throw error;
 }
 renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio,1.5),2));
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 renderer.domElement.setAttribute('aria-hidden','true');container.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,100);
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;controls.enableZoom=false;
 controls.minPolarAngle=.04;controls.maxPolarAngle=Math.PI-.04;controls.autoRotateSpeed=.38;
 controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
 const disposeEnvironment=setupStudioEnvironment(scene,renderer);
 scene.add(new THREE.HemisphereLight('#eef3f7','#25282d',.24));
 for(const [color,intensity,position] of [
  ['#fff6ed',2.15,[-5,7,-3]],['#d5e0ed',.65,[4.5,3,5]],['#e0e5eb',.45,[-2.5,-5,2]]]) {
  const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);
  if(intensity>2){
   light.castShadow=true;light.shadow.mapSize.set(2048,2048);
   Object.assign(light.shadow.camera,{left:-6,right:6,top:5,bottom:-5,near:.5,far:25});
   light.shadow.bias=-.00006;light.shadow.normalBias=.003;light.shadow.radius=2;
  }
  scene.add(light);
 }
 scene.add(model.root);model.root.updateMatrixWorld(true);
 const bounds={all:new THREE.Box3().setFromObject(model.root)};
 for(const part of ['base','mercury','peri'])bounds[part]=new THREE.Box3().setFromObject(model[part]);
 const routing=makeRouting();scene.add(routing.flow);
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let mode='assembled',focus='all',inspection='overview',insertion=1,paused=reduced.matches;
 let visible=false,active=!document.hidden,disposed=false,frame=0,last=0,elapsed=0,settling=0,dragging=false;
 const targetMercury=new THREE.Vector3(),targetPeri=new THREE.Vector3();
 function syncState() {
  Object.assign(container.dataset,{mode,focus,inspection,insertion:String(insertion),paused:String(paused)});
 }
 function pose(snap=false,delta=1/60) {
  targetMercury.copy(model.rest.mercury);targetPeri.copy(model.rest.peri);
  const insertPose=mercuryInsertionPose(insertion);
  if(mode==='exploded'){targetMercury.add(new THREE.Vector3(2,36,-4));targetPeri.add(new THREE.Vector3(24,16,0));}
  else {targetMercury.x+=insertPose.x;targetMercury.y+=insertPose.y;}
  const tilt=mode==='exploded'?-.10:insertPose.angle;
  if(model.mercury.position.distanceToSquared(targetMercury)>1e-10||model.peri.position.distanceToSquared(targetPeri)>1e-10||Math.abs(model.mercury.rotation.z-tilt)>1e-7)renderer.shadowMap.needsUpdate=true;
  const alpha=snap||reduced.matches?1:1-Math.exp(-7*delta);
  model.mercury.position.lerp(targetMercury,alpha);model.peri.position.lerp(targetPeri,alpha);
  model.mercury.rotation.z=THREE.MathUtils.lerp(model.mercury.rotation.z,tilt,alpha);
  for(const part of ['base','mercury','peri']){
   const show=focus==='all'||focus===part;if(model[part].visible!==show)renderer.shadowMap.needsUpdate=true;model[part].visible=show;
  }
  routing.flow.visible=mode==='routing';
 }
 // Fit all eight bounding-box corners, including tall phone viewports.
 function fit(box,direction=new THREE.Vector3(-120,147,174),coverage=.73) {
  const center=box.getCenter(new THREE.Vector3()),back=direction.clone().normalize();
  const right=new THREE.Vector3(0,1,0).cross(back).normalize(),up=back.clone().cross(right);
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
   const v=new THREE.Vector3(x,y,z).sub(center),depth=v.dot(back);
   distance=Math.max(distance,depth+Math.abs(v.dot(right))/(tan*camera.aspect*.87),depth+Math.abs(v.dot(up))/(tan*coverage));
  }
  controls.target.copy(center);camera.position.copy(center).addScaledVector(back,distance);controls.update();
 }
 function frameView() {
  if(inspection==='ports'||inspection==='chips') {
   const box=inspection==='ports'?new THREE.Box3(new THREE.Vector3(-87,0,-37),new THREE.Vector3(-48,16,40)):
    new THREE.Box3(new THREE.Vector3(-30,0,-32),new THREE.Vector3(44,9,34));
   box.min.multiplyScalar(MM);box.max.multiplyScalar(MM);
   fit(box,inspection==='ports'?new THREE.Vector3(-61,48,69):new THREE.Vector3(-48,76,90),.65);
  } else if(inspection==='underside')fit(bounds.mercury,new THREE.Vector3(-15,-95,65),.68);
  else if(mode==='routing')fit(bounds.all,new THREE.Vector3(0,1,.025),.63);
  else if(mode==='exploded') {
   const box=bounds.all.clone();box.max.add(new THREE.Vector3(1.2,1.8,0));fit(box,undefined,.65);
  } else fit(bounds[focus],undefined,autoRotate?.62:.71);
 }
 function schedule() {if(!frame&&!disposed&&visible&&active)frame=requestAnimationFrame(draw);}
 function wake() {
  settling=60;active=!document.hidden;
  // A viewport/media change can invalidate a queued browser frame. Restart
  // the request so resizing a settled inspection never leaves a blank canvas.
  cancelAnimationFrame(frame);frame=0;schedule();
 }
 function draw(now) {
  frame=0;if(disposed||!visible||!active)return;
  const delta=frameDelta(now,last);last=now;if(!paused)elapsed+=delta;
  controls.autoRotate=autoRotate&&!paused&&!dragging&&focus==='all'&&mode!=='routing';
  controls.update(delta);pose(false,delta);
  if(routing.flow.visible)for(const p of routing.particles)p.dot.position.copy(p.curve.getPoint(cyclePosition(elapsed*.16+p.offset)));
  renderer.render(scene,camera);
  container.dataset.frames=String(Number(container.dataset.frames||0)+1);
  container.dataset.drawCalls=String(renderer.info.render.calls);
  if(controls.autoRotate||(!paused&&mode==='routing')||dragging||settling-->0)schedule();
 }
 const resize=()=>{
  const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);frameView();wake();
 };
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;container.dataset.visible=String(visible);if(visible){last=0;wake();}},{rootMargin:'80px'});observer.observe(container);
 function setPaused(value){paused=value;syncState();wake();}
 const reducedChange=e=>setPaused(e.matches);reduced.addEventListener('change',reducedChange);
 const pageVisibility=()=>{active=!document.hidden;container.dataset.pageActive=String(active);cancelAnimationFrame(frame);frame=0;if(active){last=0;wake();}};document.addEventListener('visibilitychange',pageVisibility);
 controls.addEventListener('start',()=>{dragging=true;wake();});
 controls.addEventListener('end',()=>{dragging=false;wake();});
 controls.addEventListener('change',schedule);
 function setMode(value){mode=value;focus='all';inspection='overview';insertion=1;syncState();frameView();wake();}
 function setFocus(value){focus=value;mode='assembled';inspection='overview';insertion=1;pose(true);syncState();frameView();wake();}
 function setInspection(value){focus=value==='underside'?'mercury':'base';mode='assembled';inspection=value;insertion=1;pose(true);syncState();frameView();wake();}
 function reset(){setFocus('all');}
 function setInsertion(value){mode='assembled';focus='all';inspection='overview';insertion=Math.max(0,Math.min(1,value));syncState();wake();}
 pose(true);syncState();resize();
 Object.assign(container.dataset,{webgl:'ready',model:'detailed-v2',finish:'studio-v3',shadows:'soft',triangles:String(model.stats.triangles),materialBatches:String(model.stats.materialBatches)});
 container.setAttribute('aria-busy','false');container.classList.add('ready');onReady();
 return {setMode,setPaused,setFocus,setInspection,reset,setInsertion,
  getState:()=>({mode,paused,focus,inspection,insertion,drawCalls:renderer.info.render.calls}),
  dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();resizeObserver.disconnect();
   reduced.removeEventListener('change',reducedChange);document.removeEventListener('visibilitychange',pageVisibility);
  controls.dispose();routing.dispose();disposeEnvironment();scene.traverse(n=>n.shadow?.dispose());renderer.dispose();renderer.domElement.remove();container.classList.remove('ready');}
 };
}
