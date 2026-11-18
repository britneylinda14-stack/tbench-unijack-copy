import {frameDelta,insertionLoopAt,INSERTION_LOOP_MS} from './motion.js';
import {story} from './story.js';
// Every control is wired before three.js loads. Scene calls are applied when
// the 3D view arrives; until then the copy and controls already respond.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
 if (!link.hash) { event.preventDefault(); window.scrollTo({top:0,behavior:reducedMotion.matches?'instant':'smooth'}); return; }
 const target = document.querySelector(link.hash);
 if (target) { event.preventDefault(); target.scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'}); }
}));
story.init();window.uniJackStory=story;
const whenScene = fn => story.loadScene().then(scene => scene && fn(scene));

// ---------- Stage controls ----------
const pause=document.querySelector('#pause-motion');let paused=reducedMotion.matches;
function updatePause(){pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Play animation':'Pause animation');pause.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l10 7-10 7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';story.scene?.setPaused(paused);}
updatePause();pause.addEventListener('click',()=>{paused=!paused;updatePause();});reducedMotion.addEventListener('change',e=>{paused=e.matches;updatePause();});
story.loadScene().then(scene=>scene?.setPaused(paused));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
 if(!story.on)dockTo('hero');
 story.goTo(button.dataset.view);
}));
document.querySelector('#reset-scene').addEventListener('click',()=>{story.scene?.resetView();clearOverride();if(!story.on){dockTo('hero');story.goTo('assembled');}});
story.loadScene().then(scene=>{
 if(!scene){document.querySelector('#scene-hint').textContent='Product photograph · 3D unavailable in this browser';document.querySelectorAll('.scene-controls button, [data-part], [data-inspect], #insertion, #play-insertion').forEach(b=>b.disabled=true);document.querySelector('#stage-callout').hidden=true;assemblyElement.querySelector('.assembly-note').textContent='Product photograph · interactive assembly unavailable in this browser';}
 // UI diagnostics intentionally expose website state only; no hardware state implied.
 window.uniJackScene=scene;syncInsertionLoop();
});

// ---------- Assembly controls (drive the same scene) ----------
const partCopy={all:['01—03','A connected hardware platform.','UniJack, Mercury and PeriBoard form the modular assembly. Select a component to see where it fits.'],base:['01','The UniJack base.','UniJack provides the base platform for controller and peripheral connections. ERAU enables configurable signal routing, as described by TBench.'],mercury:['02','Mercury controller module.','Mercury uses the Infineon AURIX TC356. TBench lists operation up to 300 MHz; confirm product specifications with TBench.'],peri:['03','PeriBoard expansion.','PeriBoard provides the peripheral interface for connected hardware and application-specific extensions.']};
const assemblyElement=document.querySelector('#assembly-stage');
const insertion=document.querySelector('#insertion'),insertionValue=document.querySelector('#insertion-value'),playInsertion=document.querySelector('#play-insertion');
let insertionFrame=0,loopRequested=false,loopNeedsReset=false,assemblyVisible=false,loopElapsed=0,loopLast=0;
const view={focus:'all',inspection:'overview',insertion:1,active:false};
const assemblyHost=document.createElement('div');assemblyHost.className='stage-canvas assembly-canvas';assemblyHost.setAttribute('aria-hidden','true');
if(!story.on)assemblyElement.prepend(assemblyHost);

// Without the scroll story (reduced motion, Save-Data) one renderer docks
// into whichever stage is in use and leaves a still frame behind.
let docked='hero';
function dockTo(where){
 const scene=story.scene;if(story.on||!scene||docked===where)return;
 const from=scene.canvas.parentElement,to=where==='hero'?document.querySelector('#product-stage .stage-canvas'):assemblyHost;
 from.style.backgroundImage=`url(${scene.snapshot()})`;from.classList.add('has-snapshot');
 scene.dock(to);to.classList.remove('has-snapshot');to.style.backgroundImage='';docked=where;
 assemblyElement.classList.toggle('ready',where==='assembly'||assemblyHost.classList.contains('has-snapshot'));
 if(where==='hero')scene.setOverride(null);else{scene.setProgress(.5);applyView();}
}
function applyView(){
 const scene=story.scene;if(!scene)return;
 if(!story.on&&view.active)dockTo('assembly');
 if(view.active&&!overrideStop)overrideStop=story.stop;
 scene.setOverride(view.active?{focus:view.focus,inspection:view.inspection,insertion:view.insertion}:null);
}
function clearOverride(){
 if(!view.active)return;
 Object.assign(view,{focus:'all',inspection:'overview',insertion:1,active:false});overrideStop='';
 loopRequested=false;loopNeedsReset=false;
 document.querySelectorAll('[data-inspect]').forEach(b=>b.setAttribute('aria-pressed','false'));
 showPart('all');insertion.value=100;insertionValue.textContent='Connected';
 story.scene?.setOverride(null);syncInsertionLoop();
}
// A part or insertion view belongs to the stop it was chosen at: scrolling on
// to another stop hands the board back to the story.
let overrideStop='';
story.onProgress(()=>{if(story.on&&view.active&&overrideStop&&story.stop!==overrideStop)clearOverride();});

function setInsertion(value){
 insertion.value=Math.round(value*100);
 insertionValue.textContent=value>=.99?'Connected':value<=.01?'Separate':`${Math.round(value*100)}%`;
 Object.assign(view,{focus:'all',inspection:'overview',insertion:Math.max(0,Math.min(1,value)),active:true});applyView();
}
function loopTick(now){
 insertionFrame=0;
 if(!story.scene||!loopRequested||reducedMotion.matches||!assemblyVisible||document.hidden)return;
 loopElapsed+=frameDelta(now,loopLast)*1000;loopLast=now;
 const step=insertionLoopAt(loopElapsed);setInsertion(step.value);
 assemblyElement.dataset.loopPhase=step.phase;
 assemblyElement.dataset.loopCycle=String(Math.floor(loopElapsed/INSERTION_LOOP_MS));
 insertionFrame=requestAnimationFrame(loopTick);
}
function syncInsertionLoop(){
 cancelAnimationFrame(insertionFrame);insertionFrame=0;loopLast=0;
 const scene=story.scene,unavailable=document.querySelector('#product-stage').dataset.webgl==='unavailable';
 const running=scene&&loopRequested&&!reducedMotion.matches&&assemblyVisible&&!document.hidden;
 playInsertion.textContent=reducedMotion.matches?(Number(insertion.value)>=99?'Separate Mercury':'Connect Mercury'):
  loopRequested?'Pause assembly loop':loopNeedsReset?'Play assembly loop':'Resume assembly loop';
 assemblyElement.dataset.insertionLoop=unavailable?'unavailable':!scene?'loading':
  reducedMotion.matches?'reduced-motion':!loopRequested?'paused':running?'playing':'offscreen';
 document.querySelector('#loop-status').textContent={
  unavailable:'Interactive assembly is unavailable in this browser.',loading:'Loading interactive assembly.',
  'reduced-motion':'Automatic assembly is disabled for reduced motion.',paused:'Automatic assembly loop paused.',
  playing:'Automatic assembly loop playing.',offscreen:'Automatic assembly will resume when visible.'
 }[assemblyElement.dataset.insertionLoop];
 if(running)insertionFrame=requestAnimationFrame(loopTick);
}
function pauseInsertionLoop(reset=false){loopRequested=false;loopNeedsReset=reset;syncInsertionLoop();}
function showPart(part){
 document.querySelectorAll('[data-inspect]').forEach(b=>b.setAttribute('aria-pressed','false'));
 document.querySelectorAll('[data-part]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.part===part)));
 const copy=partCopy[part];document.querySelector('#part-number').textContent=copy[0];
 document.querySelector('#part-title').textContent=copy[1];document.querySelector('#part-description').textContent=copy[2];
}
const playbackObserver=new IntersectionObserver(entries=>{
 assemblyVisible=entries[0].isIntersecting;syncInsertionLoop();
});playbackObserver.observe(assemblyElement);
if(!story.on){
 // Dock the renderer where the visitor is looking.
 const dockObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&e.intersectionRatio>.55)dockTo(e.target===assemblyElement?'assembly':'hero');},{threshold:[.55]});
 story.loadScene().then(scene=>{if(scene){dockObserver.observe(assemblyElement);dockObserver.observe(document.querySelector('#product-stage'));}});
}
document.addEventListener('visibilitychange',syncInsertionLoop);
reducedMotion.addEventListener('change',syncInsertionLoop);
assemblyElement.addEventListener('pointerdown',event=>{if(event.target.tagName==='CANVAS')pauseInsertionLoop();});

document.querySelectorAll('[data-part]').forEach(button=>button.addEventListener('click',()=>{
 pauseInsertionLoop(true);showPart(button.dataset.part);insertion.value=100;insertionValue.textContent='Connected';
 // Phones: copy and board take turns, so a part tab cuts to the Exploded stop to show the part.
 if(story.on&&story.compact){overrideStop='exploded';story.goTo('exploded');}
 Object.assign(view,{focus:button.dataset.part,inspection:'overview',insertion:1,active:button.dataset.part!=='all'||!story.on});
 if(!view.active)story.scene?.setOverride(null);else whenScene(applyView);syncInsertionLoop();
}));
for(const event of ['pointerdown','keydown'])insertion.addEventListener(event,()=>pauseInsertionLoop(true));
insertion.addEventListener('input',()=>{
 pauseInsertionLoop(true);const value=Number(insertion.value)/100;
 showPart('all');setInsertion(value);whenScene(applyView);syncInsertionLoop();
});
playInsertion.addEventListener('click',async()=>{
 if(!await story.loadScene())return;
 if(reducedMotion.matches){
  const wasConnected=Number(insertion.value)>=99;pauseInsertionLoop(true);showPart('all');
  setInsertion(wasConnected?0:1);syncInsertionLoop();return;
 }
 if(loopRequested){pauseInsertionLoop();return;}
 if(loopNeedsReset){showPart('all');setInsertion(1);loopElapsed=0;loopNeedsReset=false;}
 loopRequested=true;syncInsertionLoop();
});
document.querySelectorAll('[data-inspect]').forEach(button=>button.addEventListener('click',()=>{
 // In the scroll story each detail view is a stop: the button jumps to it.
 if(story.on){pauseInsertionLoop(true);clearOverride();story.goTo(button.dataset.inspect);return;}
 pauseInsertionLoop(true);
 showPart(button.dataset.inspect==='underside'?'mercury':'base');button.setAttribute('aria-pressed','true');
 Object.assign(view,{focus:button.dataset.inspect==='underside'?'mercury':'base',inspection:button.dataset.inspect,insertion:1,active:true});
 insertion.value=100;insertionValue.textContent='Connected';whenScene(applyView);syncInsertionLoop();
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
 const caption=document.querySelector('#erau-gate-caption');if(caption)caption.textContent=logicSelect.value;
 document.querySelector('#logic-expression').textContent=gate.expression;
 routingDescription.textContent=(logicSelect.value==='NOT'?'Input A passes through ERAU. ':'Inputs A and B pass through ERAU. ')+gate.caption;
 document.querySelector('#signal-output-direction').textContent='GROUPS Y';
 document.querySelector('#signal-input-direction').textContent='GROUPS X';
 signalDiagram.dataset.logicGate=logicSelect.value;
 const gateLabel=signalDiagram.querySelector('.erau-inline-gate-label');if(gateLabel)gateLabel.textContent=logicSelect.value+' / LOGIC';
 signalDiagram.setAttribute('aria-label','ERAU logical '+logicSelect.value+' operation: '+gate.expression+(logicSelect.value==='NOT'?' using one input A':' using inputs A and B'));
}
document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{
 const mode=button.dataset.route;
 document.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 signalDiagram.dataset.signalMode=mode;
 logicOptions.hidden=mode!=='logic';
 if(mode==='logic'){updateGate();return;}
 document.querySelector('#signal-input-direction').textContent='GROUPS X';
 document.querySelector('#signal-output-direction').textContent='GROUPS Y';
 const descriptions={route:'Channels follow parallel direct routes through ERAU between module and peripherals; routing is bi-directional.',cross:'Cross-route connections are shown without Group X1 CH3.',fanout:'One source signal (Group X1 CH0) branches to multiple peripheral channels.',loopback:'A single signal travels from a module channel through ERAU, curves around and returns on a lower path to the module input, as in Jens’s loop example.'};
 routingDescription.textContent=descriptions[mode];
 signalDiagram.setAttribute('aria-label',descriptions[mode]);
 const svg=signalDiagram.querySelector('.erau-map');if(svg)svg.setAttribute('aria-label',descriptions[mode]);
}));
logicSelect.addEventListener('change',updateGate);
document.querySelector('#pause-motion').addEventListener('click',()=>{document.body.classList.toggle('motion-paused',document.querySelector('#pause-motion').getAttribute('aria-pressed')==='true');});

document.documentElement.dataset.signalReady='yes';

// Accessible navigation for narrow screens.
const siteHeader=document.querySelector('.nav'),navigationToggle=document.querySelector('.nav-toggle');
if(siteHeader&&navigationToggle){
 const closeNavigation=()=>{siteHeader.dataset.menuOpen='false';navigationToggle.setAttribute('aria-expanded','false');navigationToggle.setAttribute('aria-label','Open navigation')};
 navigationToggle.addEventListener('click',()=>{const opening=siteHeader.dataset.menuOpen!=='true';siteHeader.dataset.menuOpen=String(opening);navigationToggle.setAttribute('aria-expanded',String(opening));navigationToggle.setAttribute('aria-label',opening?'Close navigation':'Open navigation')});
 siteHeader.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',closeNavigation));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&siteHeader.dataset.menuOpen==='true'){closeNavigation();navigationToggle.focus()}});
 document.addEventListener('click',event=>{if(!siteHeader.contains(event.target))closeNavigation()});
 window.matchMedia('(min-width:721px)').addEventListener('change',event=>{if(event.matches)closeNavigation()});
}
