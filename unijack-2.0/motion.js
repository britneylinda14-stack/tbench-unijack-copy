// A requestAnimationFrame timestamp can precede a synchronous performance.now().
export function frameDelta(now, last) {
 if (!Number.isFinite(now) || !Number.isFinite(last) || !last) return 1 / 60;
 return Math.max(0, Math.min((now - last) / 1000, .05));
}
export function cyclePosition(value) { return ((value % 1) + 1) % 1; }

// Choreography for the illustrative Mercury assembly view. Keeping it outside
// the renderer means the loop's endpoints and cycle boundary stay testable.
export const INSERTION_LOOP_MS = 7200;
export function insertionLoopAt(elapsedMs) {
 const time=Math.max(0,elapsedMs)%INSERTION_LOOP_MS;
 const smooth=value=>value*value*(3-2*value);
 if(time<1000)return {value:1,phase:'connected'};
 if(time<2600)return {value:1-smooth((time-1000)/1600),phase:'separating'};
 if(time<3200)return {value:0,phase:'separate'};
 if(time<5600)return {value:smooth((time-3200)/2400),phase:'inserting'};
 return {value:1,phase:'connected'};
}

// An illustrative card-edge sequence: approach while tilted, then lower about
// the contact edge. This is presentation choreography, not measured socket travel.
export function mercuryInsertionPose(amount,edgeX=-17.5,edgeY=.7){
 const value=Math.max(0,Math.min(1,amount));
 const smooth=t=>t*t*(3-2*t);
 const approach=smooth(Math.min(1,value/.7));
 const angle=.32*(1-smooth(Math.max(0,(value-.7)/.3)));
 return {angle,x:24*(1-approach)+edgeX*(1-Math.cos(angle))+edgeY*Math.sin(angle),
  y:14*(1-approach)+edgeY*(1-Math.cos(angle))-edgeX*Math.sin(angle)};
}

// =====================================================================
// STORY PACING — tune the scroll story here.
// Every length is in screens of scroll (1 = one viewport height).
//   move = the board or camera moves to the stop
//   draw = the stop's annotations draw in (nothing else moves)
//   hold = nothing moves, so the annotations can be read
//   read = the copy arrives before the pose changes. On narrow screens it
//          also gets a moment to itself before the board returns.
// Phones use the `phone` column below 960px wide.
// =====================================================================
export const PACING = {
 desktop: {
  assembled: {move:.20, draw:.08, hold:.20},
  exploded:  {read:.25, move:.28, draw:.08, hold:.20},
  'routing-preview': {move:.27, draw:.08, hold:.52},
  ports:     {read:.25, move:.20, draw:.08, hold:.20},
  chips:     {move:.18, draw:.08, hold:.20},
  underside: {move:.22, draw:.08, hold:.20},
  insertion: {move:.12,                                    // camera to the socket
              separate:{move:.15, draw:.05, hold:.18},     // Mercury lifts out
              connect: {move:.15, draw:.05, hold:.18}},    // Mercury seats again
  routing:   {read:.25, move:.20, draw:.08, hold:.20},
  schematic: {frame:{read:.25, draw:.34, hold:.08},        // outline and headings
              group:{draw:.08, hold:.10},                  // each of the five colour groups
              finalHold:.20},                              // finished drawing
  handoff:   .30                                           // drawing settles into the explorer
 },
 phone: {
  assembled: {move:.20, draw:.06, hold:.20},
  exploded:  {read:.64, move:.22, draw:.06, hold:.18},
  'routing-preview': {move:.25, draw:.06, hold:.52},
  ports:     {read:.64, move:.16, draw:.06, hold:.18},
  chips:     {move:.15, draw:.06, hold:.18},
  underside: {move:.18, draw:.06, hold:.18},
  insertion: {move:.10,
              separate:{move:.12, draw:.04, hold:.16},
              connect: {move:.12, draw:.04, hold:.16}},
  routing:   {read:.64, move:.16, draw:.06, hold:.18},
  schematic: {frame:{read:.48, draw:.24, hold:.06},
              group:{draw:.07, hold:.09},
              finalHold:.18},
  handoff:   .25
 }
};

// Board state at the end of each stop's move. Values carry forward.
const START = {cam:'hero', hero:1, explode:0, insertion:1, flip:0, leave:0, dim:0};
const ROUTING = {cam:'topDown', leave:1};
const TARGET = {
 assembled:{cam:'heroYaw', hero:0}, exploded:{cam:'exploded', explode:1},
 'routing-preview':{...ROUTING, explode:0}, ports:{cam:'ports', leave:0},
 chips:{cam:'chips'}, underside:{cam:'underside', flip:1}, insertion:{cam:'insertion', flip:0},
 separate:{insertion:0}, connected:{insertion:1}, routing:ROUTING, frame:{dim:1}
};
export const SCHEMATIC_GROUPS = ['route','cross','loopback','fanout','logic'];

// Flattens PACING into one list of stops with absolute positions (screens).
export function buildTimeline(pacing){
 const list = [];
 const add = (name, {read=0, move=0, draw=0, hold=0}, extra = {}) => list.push({name, read, move, draw, hold, ...extra});
 for (const n of ['assembled','exploded','routing-preview','ports','chips','underside']) add(n, pacing[n]);
 add('insertion', {move:pacing.insertion.move});
 add('separate', pacing.insertion.separate);
 add('connected', pacing.insertion.connect);
 add('routing', pacing.routing);
 add('frame', pacing.schematic.frame, {schematic:true});
 for (const g of SCHEMATIC_GROUPS) add('group-' + g, pacing.schematic.group, {schematic:true, group:g});
 add('final', {hold:pacing.schematic.finalHold}, {schematic:true});
 let at = 0, state = {...START};
 for (const stop of list) {
  stop.from = state; stop.to = {...state, ...(TARGET[stop.name] || {})};
  state = stop.to;
  stop.start = at; stop.readEnd = at + stop.read; stop.moveEnd = stop.readEnd + stop.move; stop.drawEnd = stop.moveEnd + stop.draw; stop.end = at = stop.drawEnd + stop.hold;
 }
 const byName = Object.fromEntries(list.map(s => [s.name, s]));
 return {stops:list, byName, story:at, handoff:pacing.handoff, end:at + pacing.handoff,
  // Hardware section: a separate stretch after the explorer (stage hidden in between).
  hardware:{start:at + pacing.handoff + 2, stops:['hw-all','hw-base','hw-mercury','hw-peri','hw-out']}};
}
export function stopAt(tl, s){
 const list = tl.stops;
 for (let i = list.length - 1; i >= 0; i--) if (s >= list[i].start) return list[i];
 return list[0];
}
// Board pose at story position s (screens).
export function poseAt(tl, s){
 const hw = tl.hardware;
 if (s >= hw.start - 1) {
  const x = Math.max(0, Math.min(hw.stops.length - 1, s - hw.start)), i = Math.min(hw.stops.length - 2, Math.floor(x));
  return {phase:'hardware', camA:hw.stops[i], camB:hw.stops[i+1], camT:easeInOut(x - i), hero:0, explode:{peri:0,mercury:0}, insertion:1, flip:0, leave:0, dim:0};
 }
 const stop = stopAt(tl, s), t = stop.move ? clamp01((s - stop.readEnd) / stop.move) : (s >= stop.readEnd ? 1 : 0), e = easeInOut(t);
 const a = stop.from, b = stop.to, mix = k => a[k] + (b[k] - a[k]) * e;
 // The two modules start separating a few percent apart so it reads as one movement.
 const ex = w => a.explode + (b.explode - a.explode) * easeInOut(span(t, w));
 const dim = stop.name === 'frame' ? easeInOut(clamp01((s - stop.moveEnd) / (stop.draw || 1))) : stop.schematic ? 1 : a.dim;
 const prev = tl.stops[tl.stops.indexOf(stop) - 1];
 const preview = stop.name === 'routing-preview' ? e : prev?.name === 'routing-preview' ? 1 - e : 0;
 return {phase:'story', stop:stop.name, prev:prev ? prev.name : stop.name, camA:a.cam, camB:b.cam, camT:e, hero:mix('hero'),
  explode:{peri:ex([0,.8]), mercury:ex([.06,.86])},
  insertion:mix('insertion'), flip:mix('flip'), leave:mix('leave'), dim, preview};
}
// Draw-in (0–1) and exit (0–1) of a stop's annotations at position s. They
// leave at the end of their own stop, so only one stop's annotations ever show.
export const EXIT = .04;
export function annotationState(tl, stop, s){
 const drawFrom = stop.draw ? stop.moveEnd : Math.max(stop.readEnd, stop.moveEnd - .1), drawTo = stop.draw ? stop.drawEnd : stop.moveEnd;
 const draw = clamp01((s - drawFrom) / Math.max(.001, drawTo - drawFrom));
 const exit = clamp01((s - (stop.end - EXIT)) / EXIT);
 return {draw, exit, visible: s >= drawFrom && s < stop.end};
}

export const clamp01=value=>Math.min(1,Math.max(0,value));
export const span=(progress,[from,to])=>clamp01((progress-from)/(to-from));

// CSS cubic-bezier() evaluated in JS so scrubbed motion uses the same curves
// as the stylesheet tokens (--ease-in-out, --ease-out).
export function cubicBezier(x1,y1,x2,y2){
 const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
 const sampleX=t=>((ax*t+bx)*t+cx)*t,sampleY=t=>((ay*t+by)*t+cy)*t,slope=t=>(3*ax*t+2*bx)*t+cx;
 return x=>{
  if(x<=0)return 0;if(x>=1)return 1;
  let t=x;
  for(let i=0;i<8;i++){const error=sampleX(t)-x,d=slope(t);if(Math.abs(error)<1e-6||Math.abs(d)<1e-6)break;t-=error/d;}
  if(t<0||t>1||Math.abs(sampleX(t)-x)>1e-4){let lo=0,hi=1;t=x;for(let i=0;i<30;i++){if(sampleX(t)<x)lo=t;else hi=t;t=(lo+hi)/2;}}
  return sampleY(t);
 };
}
export const easeInOut=cubicBezier(.77,0,.175,1);
export const easeOut=cubicBezier(.23,1,.32,1);
