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
