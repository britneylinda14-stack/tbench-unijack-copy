import {frameDelta,insertionLoopAt,INSERTION_LOOP_MS} from './motion.js';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
 if (!link.hash) { event.preventDefault(); window.scrollTo({top:0,behavior:reducedMotion.matches?'instant':'smooth'}); return; }
 const target = document.querySelector(link.hash);
 if (target) { event.preventDefault(); target.scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'}); }
}));
let heroScene;
try {
 const {createProductScene}=await import('./product-scene.js');
 heroScene=await createProductScene(document.querySelector('#product-stage'));
 const pause=document.querySelector('#pause-motion');let paused=reducedMotion.matches;
 function updatePause(){pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Play animation':'Pause animation');pause.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l10 7-10 7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';heroScene.setPaused(paused);}
 updatePause();pause.addEventListener('click',()=>{paused=!paused;updatePause();});reducedMotion.addEventListener('change',e=>{paused=e.matches;updatePause();});
 document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));heroScene.setMode(button.dataset.view);
  document.querySelector('#callout-label').innerHTML={assembled:'UniJack ecosystem<span>PLATFORM · CONTROLLER · PERIPHERALS</span>',exploded:'One connected ecosystem<span>PLATFORM · CONTROLLER · PERIPHERALS</span>',routing:'ERAU routing fabric<span>ILLUSTRATIVE SIGNAL PATHS</span>'}[button.dataset.view];
 }));
 document.querySelector('#reset-scene').addEventListener('click',()=>{heroScene.reset();document.querySelector('[data-view="assembled"]').click();});
 // UI diagnostics intentionally expose website state only; no hardware state implied.
 window.uniJackScene=heroScene;
}catch(error){console.error('3D view unavailable',error);document.querySelector('#scene-hint').textContent='Product photograph · 3D unavailable in this browser';document.querySelectorAll('.scene-controls button').forEach(b=>b.disabled=true);document.querySelector('#stage-callout').hidden=true;}
const partCopy={all:['01—03','Built to come together.','The platform, controller and peripheral board form the core UniJack assembly. Explore each part, then bring the system together.'],base:['01','The shared platform.','UniJack connects the controller and peripheral sides of the ecosystem. Its ERAU routing fabric is described by TBench as configurable in software.'],mercury:['02','Meet Mercury.','The first controller module uses Infineon AURIX TC356. TBench publishes a maximum frequency of 300 MHz; hardware performance has not been independently validated here.'],peri:['03','Make the connection.','PeriBoard provides the peripheral side of the assembly. TBench describes its interface as open for custom extensions.']};
let assemblyScene,assemblyPromise,insertionFrame=0;
const assemblyElement=document.querySelector('#assembly-stage');
const insertion=document.querySelector('#insertion'),insertionValue=document.querySelector('#insertion-value'),playInsertion=document.querySelector('#play-insertion');
let loopRequested=true,loopNeedsReset=false,assemblyVisible=false,loopElapsed=0,loopLast=0;

function setInsertion(value){
 insertion.value=Math.round(value*100);
 insertionValue.textContent=value>=.99?'Connected':value<=.01?'Separate':`${Math.round(value*100)}%`;
 assemblyScene?.setInsertion(value);
}
function loopTick(now){
 insertionFrame=0;
 if(!assemblyScene||!loopRequested||reducedMotion.matches||!assemblyVisible||document.hidden)return;
 loopElapsed+=frameDelta(now,loopLast)*1000;loopLast=now;
 const step=insertionLoopAt(loopElapsed);setInsertion(step.value);
 assemblyElement.dataset.loopPhase=step.phase;
 assemblyElement.dataset.loopCycle=String(Math.floor(loopElapsed/INSERTION_LOOP_MS));
 insertionFrame=requestAnimationFrame(loopTick);
}
function syncInsertionLoop(){
 cancelAnimationFrame(insertionFrame);insertionFrame=0;loopLast=0;
 const running=assemblyScene&&loopRequested&&!reducedMotion.matches&&assemblyVisible&&!document.hidden;
 playInsertion.textContent=reducedMotion.matches?(Number(insertion.value)>=99?'Separate Mercury':'Connect Mercury'):
  loopRequested?'Pause assembly loop':loopNeedsReset?'Play assembly loop':'Resume assembly loop';
 assemblyElement.dataset.insertionLoop=assemblyElement.dataset.webgl==='unavailable'?'unavailable':!assemblyScene?'loading':
  reducedMotion.matches?'reduced-motion':!loopRequested?'paused':running?'playing':'offscreen';
 document.querySelector('#loop-status').textContent={
  unavailable:'Interactive assembly is unavailable in this browser.',loading:'Loading interactive assembly.',
  'reduced-motion':'Automatic assembly is disabled for reduced motion.',paused:'Automatic assembly loop paused.',
  playing:'Automatic assembly loop playing.',offscreen:'Automatic assembly will resume when visible.'
 }[assemblyElement.dataset.insertionLoop];
 if(running)insertionFrame=requestAnimationFrame(loopTick);
}
function pauseInsertionLoop(reset=false){loopRequested=false;loopNeedsReset=reset;syncInsertionLoop();}
function ensureAssembly(){
 if(assemblyScene)return Promise.resolve(assemblyScene);
 if(assemblyPromise)return assemblyPromise;
 assemblyPromise=(async()=>{
  try {
   const {createProductScene}=await import('./product-scene.js');
   assemblyScene=await createProductScene(assemblyElement,{autoRotate:false});
   window.uniJackAssembly=assemblyScene;syncInsertionLoop();return assemblyScene;
  }catch(error){
   console.error('Assembly view unavailable',error);
   document.querySelectorAll('[data-part], [data-inspect], #insertion, #play-insertion').forEach(el=>el.disabled=true);
   assemblyElement.querySelector('.assembly-note').textContent='Product photograph · interactive assembly unavailable in this browser';
   syncInsertionLoop();
  }
 })();return assemblyPromise;
}
function showPart(part){
 document.querySelectorAll('[data-inspect]').forEach(b=>b.setAttribute('aria-pressed','false'));
 document.querySelectorAll('[data-part]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.part===part)));
 assemblyScene?.setFocus(part);
 const copy=partCopy[part];document.querySelector('#part-number').textContent=copy[0];
 document.querySelector('#part-title').textContent=copy[1];document.querySelector('#part-description').textContent=copy[2];
}
const observer=new IntersectionObserver(entries=>{
 if(entries.some(e=>e.isIntersecting)){ensureAssembly();observer.disconnect();}
},{rootMargin:'300px'});observer.observe(assemblyElement);
// Advance visible time only, so returning to the section never skips an insertion.
const playbackObserver=new IntersectionObserver(entries=>{
 assemblyVisible=entries[0].isIntersecting;syncInsertionLoop();
});playbackObserver.observe(assemblyElement);
document.addEventListener('visibilitychange',syncInsertionLoop);
reducedMotion.addEventListener('change',syncInsertionLoop);
assemblyElement.addEventListener('pointerdown',event=>{if(event.target.tagName==='CANVAS')pauseInsertionLoop();});

document.querySelectorAll('[data-part]').forEach(button=>button.addEventListener('click',async()=>{
 pauseInsertionLoop(true);if(!await ensureAssembly())return;
 showPart(button.dataset.part);insertion.value=100;insertionValue.textContent='Connected';syncInsertionLoop();
}));
for(const event of ['pointerdown','keydown'])insertion.addEventListener(event,()=>pauseInsertionLoop(true));
insertion.addEventListener('input',async()=>{
 pauseInsertionLoop(true);const value=Number(insertion.value)/100;if(!await ensureAssembly())return;
 showPart('all');setInsertion(value);syncInsertionLoop();
});
playInsertion.addEventListener('click',async()=>{
 if(!await ensureAssembly())return;
 if(reducedMotion.matches){
  const wasConnected=Number(insertion.value)>=99;pauseInsertionLoop(true);showPart('all');
  setInsertion(wasConnected?0:1);syncInsertionLoop();return;
 }
 if(loopRequested){pauseInsertionLoop();return;}
 if(loopNeedsReset){showPart('all');setInsertion(1);loopElapsed=0;loopNeedsReset=false;}
 loopRequested=true;syncInsertionLoop();
});
document.querySelectorAll('[data-inspect]').forEach(button=>button.addEventListener('click',async()=>{
 pauseInsertionLoop(true);if(!await ensureAssembly())return;
 showPart(button.dataset.inspect==='underside'?'mercury':'base');
 assemblyScene.setInspection(button.dataset.inspect);button.setAttribute('aria-pressed','true');
 insertion.value=100;insertionValue.textContent='Connected';syncInsertionLoop();
}));
syncInsertionLoop();
const gateData={
 AND:{expression:'A & B',caption:'AND: output is on only when A and B are both on.',shape:'<path class="gate-shape" d="M255 75H275A30 30 0 0 1 275 135H255Z"/>'},
 NAND:{expression:'NOT (A & B)',caption:'NAND: the inverse of AND.',shape:'<path class="gate-shape" d="M255 75H275A30 30 0 0 1 275 135H255Z"/><circle class="gate-bubble" cx="310" cy="105" r="5"/>'},
 OR:{expression:'A OR B',caption:'OR: the output is on when A or B is on.',shape:'<path class="gate-shape" d="M253 75Q275 105 253 135Q282 137 309 105Q282 73 253 75Z"/>'},
 NOR:{expression:'NOT (A OR B)',caption:'NOR: the inverse of OR.',shape:'<path class="gate-shape" d="M253 75Q275 105 253 135Q282 137 309 105Q282 73 253 75Z"/><circle class="gate-bubble" cx="314" cy="105" r="5"/>'},
 XOR:{expression:'A XOR B',caption:'XOR: the output is on when exactly one of A and B is on.',shape:'<path class="gate-shape" d="M258 75Q279 105 258 135Q285 137 309 105Q285 73 258 75Z"/><path class="gate-shape" d="M248 75Q269 105 248 135"/>'},
 NOT:{expression:'NOT A',caption:'NOT: the output is the inverse of input A.',shape:'<path class="gate-shape" d="M255 75L304 105L255 135Z"/><circle class="gate-bubble" cx="310" cy="105" r="5"/>'}
};
const routingDescription=document.querySelector('#routing-description');
const signalDiagram=document.querySelector('.signal-diagram');
const logicOptions=document.querySelector('#logic-options');
const logicSelect=document.querySelector('#logic-gate');
function updateGate(){
 const gate=gateData[logicSelect.value];
 document.querySelector('#logic-gate-symbol').innerHTML=gate.shape;
 document.querySelector('#logic-expression').textContent=gate.expression;
 routingDescription.textContent='Signals A and B pass through ERAU. '+gate.caption;
 document.querySelector('#signal-output-direction').textContent=gate.expression;
 document.querySelector('#signal-input-direction').textContent=logicSelect.value==='NOT'?'A':'A / B';
 signalDiagram.setAttribute('aria-label','ERAU logical '+logicSelect.value+' operation: '+gate.expression);
}
document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{
 const mode=button.dataset.route;
 document.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 signalDiagram.dataset.signalMode=mode;
 logicOptions.hidden=mode!=='logic';
 if(mode==='logic'){updateGate();return;}
 document.querySelector('#signal-input-direction').textContent='IN / OUT';
 document.querySelector('#signal-output-direction').textContent='IN / OUT';
 const descriptions={route:'A signal passes through ERAU to a peripheral.',fanout:'One signal enters ERAU and can be directed to multiple peripheral signals.',loopback:'A signal returns to the module through an ERAU loop.'};
 routingDescription.textContent=descriptions[mode];
 signalDiagram.setAttribute('aria-label',descriptions[mode]);
}));
logicSelect.addEventListener('change',updateGate);
document.querySelector('#pause-motion').addEventListener('click',()=>{document.body.classList.toggle('motion-paused',document.querySelector('#pause-motion').getAttribute('aria-pressed')==='true');});

document.documentElement.dataset.signalReady='yes';
