import { PACING, SCHEMATIC_GROUPS, buildTimeline, stopAt, poseAt, annotationState, span, easeInOut, easeOut, clamp01 } from './motion.js';

// Scroll story controller. One scroll position (in screens) drives the board,
// the annotations, the text band and the schematic. three.js is loaded later;
// everything here works without it, so the page is usable before (or without)
// the 3D view.
const root = document.documentElement;
const storyOn = root.dataset.story === 'on';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-width: 959px)');
const stage = document.querySelector('#product-stage');
const $ = s => document.querySelector(s);
const header = $('#tb-unified-header');
const sections = {
 proof: $('.beat-proof'), platform: $('#platform'), assembly: $('.assembly-section'),
 routing: $('#routing'), beatRouting: $('.beat-routing'), beatStats: $('.beat-stats'),
 panel: $('#routing .routing-panel'), graphic: $('#routing .approved-routing-graphic'),
 products: $('#products'), cards: $('#products .product-cards')
};
const callout = $('#callout-label');
const CALLOUTS = {
 assembled:'UniJack ecosystem<span>PLATFORM · CONTROLLER · PERIPHERALS</span>',
 exploded:'One connected ecosystem<span>PLATFORM · CONTROLLER · PERIPHERALS</span>',
 routing:'ERAU routing fabric<span>ILLUSTRATIVE SIGNAL PATHS</span>'
};
// Shortcut buttons → the stop they jump to.
const SHORTCUT = {assembled:'assembled', exploded:'exploded', routing:'routed', ports:'ports', chips:'chips', underside:'underside', insertion:'separate'};
const ASSEMBLY_STOPS = new Set(['ports','chips','underside','insertion','separate','connected']);
const INSERTION_STOPS = new Set(['insertion','separate','connected']);

let tl = buildTimeline(compact.matches ? PACING.phone : PACING.desktop);
// One screen = the small viewport height (100svh), so Safari's collapsing
// address bar and toolbar never rescale the story.
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
document.documentElement.append(probe);
const screenH = () => probe.offsetHeight || innerHeight;
let scene = null, lastFrame = null, sceneLoading = null, vh = screenH(), vw = innerWidth;
let sRaw = 0, sShown = 0, handoffT = 0, handoff = {from:0, to:1}, ticking = false, staticView = 'assembled';
let currentView = '', currentStop = '', hwX = -1, hwRange = null;
const listeners = new Set();

// Canvas host.
const host = document.createElement('div');
host.className = 'stage-canvas';
host.setAttribute('aria-hidden', 'true');
stage.prepend(host);

// ---------- Annotations ----------
// Every word below already exists on the page (see the storyboard sources).
// The layer is decorative (aria-hidden); the same words are in the document.
const ANNOTATIONS = {
 assembled:{caption:['UniJack ecosystem','PLATFORM · CONTROLLER · PERIPHERALS'], items:[
  {at:'baseBack', name:'UniJack base platform', d:[-120,-100], m:['below',0,1,0]},
  {at:'mercury', name:'Mercury controller', d:[-120,-110], m:['above',0,-1,0]},
  {at:'peri', name:'PeriBoard expansion', d:[130,-100], m:['above',0,-1,40]}]},
 exploded:{caption:['One connected ecosystem'], items:[
  {at:'baseBack', tag:'01 / PLATFORM', name:'UniJack™', d:[-150,-30], m:['below',0,1,0]},
  {at:'mercury', tag:'02 / CONTROLLER', name:'Mercury Module', d:[-130,-90], m:['above',0,1,0]},
  {at:'peri', tag:'03 / EXPANSION', name:'PeriBoard', d:[130,-90], m:['above',0,-1,52]}]},
 ports:{items:[{at:'ports', name:'Ports', d:[-130,-90], m:['above',0]}]},
 chips:{caption:['Chip detail'], items:[{at:'aurix', tag:'AURIX TC356', name:'Up to 300 MHz*', d:[-190,-170], m:['above',0]}]},
 underside:{caption:['Mercury underside'], items:[{at:'underside', tag:'02 / CONTROLLER', name:'Mercury Module', d:[160,-80], m:['above',0]}]},
 insertion:{caption:['Mercury insertion'], items:[]},
 separate:{caption:['Mercury insertion'], items:[{at:'socket', name:'Separate', d:[-170,-60], m:['above',0,1,0]}]},
 connected:{caption:['Mercury insertion'], items:[{at:'socket', name:'Connected', d:[-170,-60], m:['above',0,1,0]}]},
 routing:{caption:['ERAU routing fabric','ILLUSTRATIVE SIGNAL PATHS'], items:[{at:'erau', name:'ERAU signal routing', d:[250,-120], m:['above',0]}]},
 'hw-base':{items:[{at:'base', name:'UniJack™', d:[80,-190], m:['below',0]}]},
 'hw-mercury':{items:[{at:'mercury', name:'Mercury Module', d:[90,-160], m:['above',0]}]},
 'hw-peri':{items:[{at:'peri', name:'PeriBoard', d:[90,-150], m:['above',0]}]}
};
// The schematic key, as written in the drawing.
const KEY_TEXT = {route:'Direct Route', cross:'Cross Route', loopback:'Loop', fanout:'Fan-out', logic:'Logic Operation'};
for (const g of SCHEMATIC_GROUPS) ANNOTATIONS['group-' + g] = {items:[{key:g, name:KEY_TEXT[g], m:['below',0]}]};
// Space the caption and the label lanes need above and below the board on
// phones; the scene centres board + caption + labels as one group with these.
const CAPTION_H = 48;
function groupPads(){
 const out = {};
 for (const [name, a] of Object.entries(ANNOTATIONS)) {
  const lane = side => { const it = (a.items || []).filter(i => (i.m?.[0] || 'above') === side && !i.key); return it.length ? 18 + Math.max(...it.map(i => i.m?.[3] || 0)) + (it.some(i => i.tag) ? 40 : 28) : 0; };
  out[name] = {above:(a.caption ? CAPTION_H + 8 : 0) + lane('above'), below:lane('below'), lane:lane('above')};
 }
 return out;
}
// Lead first; the others follow at shrinking gaps.
const STAGGER = [0, .12, .2];
const PADS = groupPads();

const SVGNS = 'http://www.w3.org/2000/svg';
const layer = document.createElement('div');
layer.className = 'story-annotations'; layer.setAttribute('aria-hidden', 'true');
const lines = document.createElementNS(SVGNS, 'svg'); lines.setAttribute('class', 'anno-lines');
const captionEl = document.createElement('div'); captionEl.className = 'anno-caption';
layer.append(lines, captionEl);
const pool = [];
function item(i){
 if (pool[i]) return pool[i];
 const g = document.createElementNS(SVGNS, 'g'), path = document.createElementNS(SVGNS, 'path'), ring = document.createElementNS(SVGNS, 'circle'), dot = document.createElementNS(SVGNS, 'circle');
 path.setAttribute('class', 'anno-leader'); path.setAttribute('pathLength', '1');
 ring.setAttribute('class', 'anno-ring'); ring.setAttribute('r', '7'); dot.setAttribute('class', 'anno-dot'); dot.setAttribute('r', '3');
 g.append(path, ring, dot); lines.append(g);
 const label = document.createElement('div'); label.className = 'anno-label';
 const tag = document.createElement('span'); tag.className = 'anno-tag';
 const name = document.createElement('span'); name.className = 'anno-name';
 label.append(tag, name); layer.append(label);
 return pool[i] = {g, path, ring, dot, label, tag, name, text:''};
}
function hideFrom(n){ for (let i = n; i < pool.length; i++) { pool[i].g.style.display = 'none'; pool[i].label.style.display = 'none'; } }
let captionText = '';
function setCaption(lines2, o, rise){
 const text = lines2 ? lines2.join('|') : '';
 if (text !== captionText) {
  captionText = text; captionEl.w = 0;
  captionEl.innerHTML = lines2 ? `<span class="anno-name">${lines2[0]}</span>${lines2[1] ? `<span class="anno-tag">${lines2[1]}</span>` : ''}` : '';
 }
 captionEl.style.opacity = lines2 ? o.toFixed(3) : '0';
 captionEl.style.transform = `translate3d(-50%,${(rise).toFixed(1)}px,0)`;
}
// Caption runs: consecutive stops with the same caption share one entrance.
function captionRun(stopName){
 const c = ANNOTATIONS[stopName]?.caption; if (!c) return null;
 const list = tl.stops, i = list.findIndex(s => s.name === stopName);
 let a = i, b = i;
 while (a > 0 && ANNOTATIONS[list[a-1].name]?.caption?.join() === c.join()) a--;
 while (b < list.length - 1 && ANNOTATIONS[list[b+1].name]?.caption?.join() === c.join()) b++;
 return {caption:c, first:list[a], last:list[b]};
}

// Label placement. Each label tries a few positions and takes the first one
// where no leader line crosses any label and no two labels overlap.
const PHONE_ROWS = [0, 40, 80], DESK = [[1,1,1],[1,1,1.45],[-1,1,1],[1,-1,1],[-1,-1,1],[-1,1,1.45],[1,-1,1.45],[-1,-1,1.45]];
function geometry(it, spec, anchor, frame, v){
 const W = vw;
 let ex, ey, side, sx;
 if (spec.key && !compact.matches) {
  // Desktop: the drawing's own key is the label; the leader runs from the path up to it.
  const L = legendPoint(spec.key) || {x:anchor.x, y:anchor.y - 60};
  ex = anchor.x; ey = L.y; sx = L.x; side = L.x >= anchor.x ? 1 : -1;
 } else if (compact.matches) {
  // Phones: labels sit in a lane above or below the board, never over it.
  const [lane, dx = 0, forced = 0, row = 0] = spec.m || ['above'], b = frame.bounds;
  const top = (captionText ? frame.captionY + CAPTION_H + 10 : frame.top + 16), bottom = frame.bottom - 24, r = row + PHONE_ROWS[v >> 1];
  ey = lane === 'above' ? Math.max(top, Math.min(anchor.y - 28, (b ? b.top : anchor.y) - 18) - r) : Math.min(bottom, Math.max(anchor.y + 28, (b ? b.bottom : anchor.y) + 18) + r);
  const s0 = forced || (anchor.x + dx < W / 2 ? 1 : -1);
  ex = anchor.x + dx; side = v & 1 ? -s0 : s0;
 } else {
  const k = frame.scale, m = DESK[v];
  ex = anchor.x + spec.d[0] * k * m[0] * m[2]; ey = anchor.y + spec.d[1] * k * m[1] * m[2]; side = spec.d[0] * m[0] >= 0 ? 1 : -1;
 }
 if (sx === undefined) sx = ex + side * 12;
 const lw = it.w || 120, lh = it.h || 20, gutter = 12;
 const want = side > 0 ? sx + 6 : sx - 6 - lw, lx = Math.max(gutter, Math.min(W - gutter - lw, want));
 return {ax:anchor.x, ay:anchor.y, ex, ey, sx, side, lx, ly:ey - lh / 2, lw, lh, clamped:Math.abs(lx - want) > .5};
}
const VARIANTS = () => compact.matches ? PHONE_ROWS.length * 2 : DESK.length;
function segHitsRect(x1, y1, x2, y2, r){
 // Liang–Barsky clip of the segment against the rectangle.
 let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
 for (const [p, q] of [[-dx, x1 - r.x], [dx, r.x + r.w - x1], [-dy, y1 - r.y], [dy, r.y + r.h - y1]]) {
  if (p === 0) { if (q < 0) return false; continue; }
  const t = q / p;
  if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
 }
 return true;
}
const rectsHit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function conflicts(g, placed, frame){
 if (g.clamped) return true;
 const R = {x:g.lx - 4, y:g.ly - 4, w:g.lw + 8, h:g.lh + 8};
 if (R.y < frame.top - 4 || R.y + R.h > frame.limit) return true;
 if (segHitsRect(g.ax, g.ay, g.ex, g.ey, R)) return true;
 for (const p of placed) {
  if (p.rect && rectsHit(R, p.rect)) return true;
  for (const q of p.segs) if (segHitsRect(q[0], q[1], q[2], q[3], R)) return true;
  if (p.rect) for (const q of [[g.ax, g.ay, g.ex, g.ey], [g.ex, g.ey, g.sx, g.ey]]) if (segHitsRect(q[0], q[1], q[2], q[3], p.rect)) return true;
 }
 return false;
}
function solve(it, spec, anchor, frame, placed){
 let g = geometry(it, spec, anchor, frame, 0);
 if (spec.key && !compact.matches) return g;
 for (let v = 0; v < VARIANTS(); v++) {
  const c = v ? geometry(it, spec, anchor, frame, v) : g;
  if (!conflicts(c, placed, frame)) { g = c; break; }
 }
 placed.push({segs:[[g.ax, g.ay, g.ex, g.ey], [g.ex, g.ey, g.sx, g.ey]], rect:{x:g.lx - 4, y:g.ly - 4, w:g.lw + 8, h:g.lh + 8}});
 return g;
}
function placeItem(it, g, d){
 const {ax, ay, ex, ey, sx, side} = g;
 it.path.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${sx.toFixed(1)} ${ey.toFixed(1)}`);
 const dotT = easeOut(span(d, [0, .3])), lineT = easeOut(span(d, [.2, .75])), labelT = easeOut(span(d, [.55, 1]));
 const stepped = layer.classList.contains('is-stepped');
 it.dot.setAttribute('cx', ax.toFixed(1)); it.dot.setAttribute('cy', ay.toFixed(1));
 it.ring.setAttribute('cx', ax.toFixed(1)); it.ring.setAttribute('cy', ay.toFixed(1));
 it.dot.style.opacity = dotT.toFixed(3); it.ring.style.opacity = (dotT * .35).toFixed(3);
 it.dot.style.transform = stepped ? '' : `scale(${(.6 + .4 * dotT).toFixed(3)})`;
 it.dot.style.transformOrigin = `${ax}px ${ay}px`;
 it.path.style.strokeDashoffset = stepped ? '0' : (1 - lineT).toFixed(3);
 it.path.style.opacity = stepped ? lineT.toFixed(3) : (lineT > 0 ? '1' : '0');
 // The label sits at the end of the shoulder and slides 4px off it.
 it.label.style.transform = `translate3d(${(g.lx + (stepped ? 0 : side * 4 * (1 - labelT))).toFixed(1)}px,${g.ly.toFixed(1)}px,0)`;
 it.label.style.opacity = labelT.toFixed(3);
 it.label.dataset.side = side > 0 ? 'right' : 'left';
}
function setItemText(it, spec){
 const text = (spec.tag || '') + '|' + spec.name;
 if (it.text === text) return;
 it.text = text; it.tag.textContent = spec.tag || ''; it.tag.hidden = !spec.tag; it.name.textContent = spec.name;
 it.label.classList.toggle('is-single', !spec.tag);
 it.label.dataset.side = 'right'; it.w = it.h = 0;
}
// Frame geometry for annotation placement (viewport pixels).
function annoFrame(){
 const r = stage.getBoundingClientRect(), c = host.getBoundingClientRect(), f = frameNow, b = lastFrame?.bounds;
 const bounds = b ? {left:b.left + c.left, right:b.right + c.left, top:b.top + c.top, bottom:b.bottom + c.top} : null;
 const scale = b ? Math.max(.55, Math.min(1.15, (b.right - b.left) / 900)) : 1;
 if (hwActive() && hwRegion) return {top:hwRegion.y, bottom:hwRegion.y + hwRegion.h, limit:hwRegion.y + hwRegion.h, bounds, scale, offX:c.left, offY:c.top};
 return {top:r.top + f.top, bottom:r.top + r.height - f.bottom, limit:r.top + r.height - f.bottom + (compact.matches ? 0 : 4), bounds, scale, offX:c.left, offY:c.top};
}
function drawAnnotations(){
 if (!storyOn || !lastFrame || !scene || stage.dataset.visible === 'false' || currentStop === 'routed') { layer.style.visibility = 'hidden'; return; }
 const s = lastFrame.progress;
 const frame = annoFrame();
 // Phones: the caption sits directly above the group (labels, then board).
 frame.captionY = frame.top + 4;
 if (compact.matches && frame.bounds && lastFrame.phase !== 'hardware') {
  const st = stopAt(tl, s).name;
  frame.captionY = Math.max(frame.top + 4, frame.bounds.top - (PADS[st]?.lane || 0) - CAPTION_H - 8);
 }
 let n = 0;
 const placed = [], stageBottom = stage.getBoundingClientRect().bottom;
 // The caption is an obstacle too.
 if (captionText && lastFrame.phase !== 'hardware') { if (!captionEl.w) captionEl.w = captionEl.offsetWidth; placed.push({segs:[], rect:{x:vw / 2 - captionEl.w / 2 - 6, y:frame.captionY - 4, w:captionEl.w + 12, h:CAPTION_H}}); }
 const addItems = (specs, base, drawOf) => {
  specs.forEach((spec, k) => {
   let anchor;
   if (spec.key) anchor = keyAnchor(spec.key); else { const a = lastFrame.anchors[spec.at]; anchor = a && a.on ? {x:a.x + frame.offX, y:a.y + frame.offY} : null; }
   if (!anchor) return;
   const d = drawOf(k);
   if (d <= 0) return;
   const it = item(n++); setItemText(it, spec);
   const f = spec.key ? {...frame, bounds:overlay.getBoundingClientRect(), bottom:stageBottom - 8, limit:stageBottom - 8} : frame;
   it.g.style.display = ''; it.label.style.display = '';
   it.g.style.opacity = it.label.style.visibility = '';
   // Label size is measured once per text change, not every frame.
   if (!it.w) { it.w = it.label.offsetWidth; it.h = it.label.offsetHeight; }
   placeItem(it, solve(it, spec, anchor, f, placed), d);
   const fade = base.toFixed(3); it.g.style.opacity = fade; it.label.style.opacity = (parseFloat(it.label.style.opacity) * base).toFixed(3);
   if (spec.key && !compact.matches) { it.label.style.display = 'none'; }
  });
 };
 if (lastFrame.phase === 'hardware') {
  layer.dataset.band = 'light';
  const x = s - tl.hardware.start;
  for (const [i, name] of [[1,'hw-base'],[2,'hw-mercury'],[3,'hw-peri']]) {
   const d = clamp01(1 - Math.abs(x - i) / .35);
   if (d > 0) addItems(ANNOTATIONS[name].items, 1, k => clamp01((d - STAGGER[k]) / .8));
  }
  setCaption(null, 0, 0);
 } else {
  layer.dataset.band = 'dark';
  // The current stop, and the previous one while it exits.
  const stop = stopAt(tl, s), i = tl.stops.indexOf(stop);
  // Only the current stop's annotations are ever on screen.
  if (ANNOTATIONS[stop.name]) {
   const a = annotationState(tl, stop, s);
   const items = INSERTION_STOPS.has(stop.name) && scene.hasOverride()
    ? [{...ANNOTATIONS.connected.items[0], name: insertionValue.textContent}]
    : ANNOTATIONS[stop.name].items;
   if (a.visible) addItems(items, 1 - a.exit, k => clamp01((a.draw - STAGGER[k]) / .8));
  }
  // Caption for the current run of stops.
  const run = captionRun(stop.name);
  if (run) {
   const first = annotationState(tl, run.first, s), last = annotationState(tl, run.last, s);
   const o = easeOut(first.draw) * (1 - last.exit);
   setCaption(run.caption, o, 4 * (1 - easeOut(first.draw)));
  } else setCaption(null, 0, 0);
  captionEl.style.top = `${Math.round(frame.captionY)}px`;
 }
 hideFrom(n);
 layer.style.visibility = '';
}

// ---------- Schematic overlay (assets/erau-routing-approved.svg) ----------
const overlay = document.createElement('div');
overlay.className = 'story-schematic';
overlay.setAttribute('aria-hidden', 'true');
let overlayGroups = null, overlayBox = null, overlaySvg = null;
const TRACE_KIND = {'#ff862f':'route','#ff852f':'route','#ff842a':'route','#2fdc64':'cross','#30dc62':'cross','#ffe11d':'loopback','#ffe61d':'loopback','#129cf4':'fanout','#0d9ff4':'fanout'};
const KEY_POINT = {}, KEY_LEGEND = {};
async function loadSchematic(){
 try {
  const response = await fetch(new URL('./assets/erau-routing-approved.svg?v=unijack-2.0-fanout-horizontal', import.meta.url));
  if (!response.ok) throw new Error(response.status);
  const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  svg.querySelectorAll('title,desc').forEach(n => n.remove());
  svg.removeAttribute('role'); svg.removeAttribute('aria-labelledby');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  // Keep ids unique next to the inline explorer drawing.
  svg.querySelectorAll('[id]').forEach(n => n.id = 'story-' + n.id);
  svg.querySelectorAll('[fill="url(#grid)"]').forEach(n => n.setAttribute('fill', 'url(#story-grid)'));
  const style = svg.querySelector('style');
  if (style) style.textContent = style.textContent.replace(/(^|})\s*text\{/, '$1.story-schematic text{').replace(/\.(heading|small|legend|ch|region|terminal|trace|core|coretxt|gate)\b/g, '.story-schematic .$1');
  const groups = {route:[], cross:[], loopback:[], fanout:[], logic:[], rest:[], legend:{}};
  // Key entries (sample line + text) light up one group at a time.
  const legend = svg.querySelector('.legend');
  if (legend) [...legend.children].forEach(el => {
   const kind = el.hasAttribute('stroke-dasharray') ? 'logic' : TRACE_KIND[el.getAttribute('stroke') || el.getAttribute('fill')];
   if (kind) (groups.legend[kind] ??= []).push(el);
  });
  svg.querySelectorAll('.trace').forEach(el => {
   if (el.closest('.legend')) return;
   const dashed = el.hasAttribute('stroke-dasharray');
   const kind = dashed ? 'logic' : TRACE_KIND[el.getAttribute('stroke')];
   if (!kind) return;
   el.dataset.kind = kind;
   if (!dashed) { el.setAttribute('pathLength', '1'); el.style.strokeDasharray = '1 1'; }
   groups[kind].push(el);
  });
  // Everything that is not a trace fades in as one drawing.
  [...svg.children].forEach(el => { if (!/^(defs|style)$/.test(el.tagName) && !el.matches('.trace')) groups.rest.push(el); });
  overlay.append(svg);
  overlaySvg = svg; overlayGroups = groups;
  root.dataset.schematic = 'ready';
  update(true);
 } catch (error) {
  console.warn('Story schematic unavailable', error);
  root.dataset.schematic = 'unavailable';
 }
}
// Screen position of a point in the drawing.
function svgToScreen(p){
 const m = overlaySvg?.getScreenCTM(); if (!m || !p) return null;
 return new DOMPoint(p.x, p.y).matrixTransform(m);
}
function legendPoint(g){
 if (!KEY_LEGEND[g]) {
  const text = overlayGroups?.legend[g]?.find(n => n.tagName === 'text'); if (!text) return null;
  const b = text.getBBox(); if (!b.width) return null;
  KEY_LEGEND[g] = {x:b.x + b.width / 2, y:b.y + b.height + 8};
 }
 return svgToScreen(KEY_LEGEND[g]);
}
// Leader target: a point along the group's first path. Measured on first use,
// once the drawing is rendered (WebKit cannot measure a hidden path).
function keyAnchor(g){
 if (!KEY_POINT[g]) {
  const el = overlayGroups?.[g]?.[0]; if (!el) return null;
  try { const len = el.getTotalLength(); if (!len) return null; const pt = el.getPointAtLength(len * (g === 'logic' ? .35 : .5)); KEY_POINT[g] = {x:pt.x, y:pt.y}; } catch { return null; }
 }
 const pt = svgToScreen(KEY_POINT[g]); if (!pt) return null;
 return {x:pt.x, y:pt.y, key:g};
}

// ---------- Layout: spacer heights from the timeline ----------
const docTop = el => el.getBoundingClientRect().top + scrollY;
const setH = (el, px) => { const v = `${Math.max(0, Math.round(px))}px`; if (el && el.style.height !== v) el.style.height = v; };
let frameNow = {top:0, bottom:0, hero:0};
function measure(){
 vh = screenH(); vw = innerWidth;
 if (!storyOn) return;
 tl = buildTimeline(compact.matches ? PACING.phone : PACING.desktop);
 scene?.setTimeline(tl);
 const b = tl.byName, px = s => s * vh;
 // Section tops sit where their chapter starts, so in-page links land on it.
 sections.proof.style.height = '0px';
 setH(sections.proof, px(b.exploded.start) - docTop(sections.proof));
 setH(sections.platform, px(b.ports.start - b.exploded.start));
 setH(sections.assembly, px(b.routing.start - b.ports.start));
 setH(sections.beatRouting, px(b['group-route'].start - b.routing.start));
 setH(sections.beatStats, px(tl.story - b['group-route'].start));
 // The explorer drawing arrives at the top of the screen as the handoff ends.
 sections.panel.style.marginTop = '0px';
 const want = px(tl.story + tl.handoff) + vh * .16, have = docTop(sections.graphic);
 sections.panel.style.marginTop = `${Math.max(0, Math.round(want - have))}px`;
 handoff = {from:px(tl.story), to:Math.max(px(tl.story) + 40, docTop(sections.graphic) - vh * .16)};
 measureText();
 measureHardware();
 placeSnaps();
}

// ---------- Scroll snap: native CSS, proximity. One marker per hold and per
// phone text moment; the browser settles on one when scrolling ends nearby.
const snaps = document.createElement('div');
snaps.className = 'story-snaps'; snaps.setAttribute('aria-hidden', 'true');
// Snapping is off from the top of the page until just before the first snap
// point, so the hero never pulls the page forward and scrolling back up to it
// is never pulled back down.
let snapFrom = Infinity;
function setSnap(s){
 const snap = PACING.snap && s > snapFrom ? 'on' : 'off';
 if (root.dataset.snap !== snap) root.dataset.snap = snap;
}
function placeSnaps(){
 const at = [];
 // No snap point on the first stop: the hero scrolls freely.
 for (const st of tl.stops.slice(1)) {
  if (st.read) at.push(st.start + st.read / 2);
  if (st.hold) at.push(st.drawEnd + Math.min(.04, st.hold * .25));
 }
 snapFrom = at.length ? at[0] - .08 : Infinity;
 // Snap positions are measured from below the page's scroll padding.
 const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
 while (snaps.children.length < at.length) snaps.append(document.createElement('i'));
 [...snaps.children].forEach((el, i) => { el.style.display = i < at.length ? '' : 'none'; if (i < at.length) el.style.top = `${Math.round(at[i] * vh + pad)}px`; });
}

// ---------- Text band: copy scrolls through a band above the board ----------
const TEXT = [
 {at:'exploded', els:['#platform .story-text']},
 {at:'ports', els:['.assembly-copy > .eyebrow', '.assembly-copy > .part-tabs', '.assembly-copy > .part-text']},
 {at:'routing', els:['.beat-routing .story-text']},
 {at:'frame', els:['.beat-stats .story-text']}
].map(t => ({...t, els:t.els.map(s => $(s)).filter(Boolean), rest:[], height:0}));
const heroText = [...document.querySelectorAll('.hero > .hero-copy, .hero > .hero-bottom')];
let band = {top:0, bottom:0};
function measureText(){
 for (const t of TEXT) {
  t.els.forEach(el => { el.style.transform = 'none'; el.style.opacity = ''; el.style.maskImage = el.style.webkitMaskImage = ''; el.dataset.live = ''; });
  t.rest = t.els.map(el => { const r = el.getBoundingClientRect(); return {top:r.top, height:r.height}; });
  t.top = Math.min(...t.rest.map(r => r.top)); t.height = Math.max(...t.rest.map(r => r.top + r.height)) - t.top;
 }
 const headerBottom = header.getBoundingClientRect().bottom;
 const tallest = Math.max(...TEXT.map(t => t.height));
 band.top = headerBottom + (compact.matches ? 10 : 18);
 band.bottom = band.top + Math.min(tallest + 8, vh * .4);
}
// Phones: text and board take turns. During a stop's "read" stretch its copy
// sits centred between the local nav and the controls, fully visible and never
// masked; the board is faded out and returns as the copy leaves.
const READ_FADE = .07;
let boardShown = 1;
function readText(){
 const areaTop = band.top, areaBottom = stage.getBoundingClientRect().bottom - frameNow.bottom;
 let board = 1;
 for (const t of TEXT) {
  const st = tl.byName[t.at], read = st.read || 0;
  const o = read ? smooth(clamp01((sRaw - st.start) / READ_FADE)) * smooth(clamp01((st.readEnd - sRaw) / READ_FADE)) : 0;
  board = Math.min(board, 1 - o);
  // After the stats, the drawing's outline comes in directly: the board stays out until it does.
  if (t.at === 'frame' && read && sRaw > st.start + read / 2 && sRaw < st.drawEnd) board = Math.min(board, clamp01((sRaw - st.moveEnd) / (st.draw || 1)));
  const rising = sRaw < st.start + read / 2;
  const top = areaTop + Math.max(0, (areaBottom - areaTop - t.height) / 2);
  t.els.forEach((el, i) => {
   el.style.maskImage = el.style.webkitMaskImage = '';
   if (o <= 0) { if (el.dataset.live !== 'off') { el.style.transform = 'translate3d(0,-200vh,0)'; el.style.opacity = '0'; el.dataset.live = 'off'; } return; }
   const dy = top - t.top + (1 - o) * (rising ? 12 : -8);
   el.style.transform = `translate3d(0,${dy.toFixed(1)}px,0)`;
   el.style.opacity = o.toFixed(3);
   el.dataset.live = String(o > .5);
  });
 }
 boardShown = board;
 const h = 1 - smooth(clamp01(scrollY / (vh * .16)));
 heroText.forEach(el => { el.style.opacity = h.toFixed(3); el.style.pointerEvents = h > .5 ? '' : 'none'; });
}
function travelText(){
 if (compact.matches) { readText(); return; }
 boardShown = 1;
 const FADE = 28;
 // Desktop: each block scrolls up into the band, rests there while its chapter
 // runs (so the copy and the part tabs can be read and used), then scrolls out
 // as the next chapter's copy arrives.
 const bandH = band.bottom - band.top;
 TEXT.forEach((t, k) => {
  const start = tl.byName[t.at].start, next = TEXT[k + 1], end = (next ? tl.byName[next.at].start : tl.story) - .06;
  const rest = Math.max(0, (bandH - t.height) / 2);
  const y = sRaw < end ? rest + Math.max(0, bandH - rest - (sRaw - start) * vh) : rest - (sRaw - end) * vh; // group top, relative to the band top
  const visible = y < band.bottom - band.top && y > -t.height;
  t.els.forEach((el, i) => {
   if (!visible) { if (el.dataset.live !== 'off') { el.style.transform = 'translate3d(0,-200vh,0)'; el.dataset.live = 'off'; } return; }
   const restTop = t.rest[i].top, h = t.rest[i].height;
   const dy = band.top + y + (restTop - t.top) - restTop;
   el.style.transform = `translate3d(0,${dy.toFixed(1)}px,0)`; el.style.opacity = '';
   // The fade sits just outside the band, so resting copy is never touched by it.
   const top = restTop + dy, a = band.top - FADE - top, b = band.bottom + FADE - top;
   const mask = `linear-gradient(to bottom,transparent ${a.toFixed(0)}px,#000 ${(a + FADE).toFixed(0)}px,#000 ${(b - FADE).toFixed(0)}px,transparent ${b.toFixed(0)}px)`;
   el.style.maskImage = el.style.webkitMaskImage = mask;
   const mid = top + h / 2;
   el.dataset.live = String(mid > band.top && mid < band.bottom);
  });
 });
 const h = 1 - smooth(clamp01(scrollY / (vh * .16)));
 heroText.forEach(el => { el.style.opacity = h.toFixed(3); el.style.pointerEvents = h > .5 ? '' : 'none'; });
}
const smooth = t => t * t * (3 - 2 * t);
// Keyboard focus moving into band text brings it to the middle of the band.
function revealOnFocus(event){
 const t = TEXT.find(t => t.els.some(el => el.contains(event.target)));
 if (!t || t.els.some(el => el.contains(event.target) && el.dataset.live === 'true')) return;
 const st = tl.byName[t.at];
 if (compact.matches) { scrollTo({top:(st.start + st.read / 2) * vh, behavior:'instant'}); return; }
 const bandH = band.bottom - band.top, y = Math.max(0, (bandH - t.height) / 2);
 scrollTo({top:(tl.byName[t.at].start + (bandH - y) / vh) * vh, behavior:'instant'});
}

// ---------- Board framing ----------
const PHONE_FOOT = 152; // control bar (or insertion panel) and the caption line under it
function computeFrame(){
 const stageTop = stage.getBoundingClientRect().top;
 const heroEnd = $(compact.matches ? '.hero-bottom' : '.hero-actions');
 const heroBottom = heroEnd.getBoundingClientRect().bottom + scrollY - stageTop; // position at scroll 0
 // Phones: no band is reserved; the board is centred between the local nav and the control bar.
 if (compact.matches) return {top:8, bottom:PHONE_FOOT, hero:Math.round(heroBottom + 8)};
 return {top:Math.round(band.bottom - stageTop + 16), bottom:24, hero:Math.round(heroBottom + 24)};
}
function frameScene(){
 if (!storyOn) return;
 frameNow = computeFrame();
 stage.style.setProperty('--routed-top', frameNow.top + 'px');
 placeGlow(frameNow);
 scene?.setFrame(frameNow.top, frameNow.bottom, frameNow.hero);
}
// Loading glow (and the still image, if it is needed) sit where the board
// will land on the first screen, using the same framing as the scene.
function placeGlow(f){
 const W = stage.clientWidth, H = stage.clientHeight, region = Math.max(H * .3, H - f.top - f.bottom);
 const lowered = f.hero > f.top;
 const y = f.top + region / 2 + (lowered ? (f.hero - f.top) * .62 : 0);
 const w = (compact.matches ? W * .94 : Math.min(W * .8, 1200)) / (lowered ? 1.18 : 1);
 stage.style.setProperty('--glow-y', `${Math.round(y)}px`);
 stage.style.setProperty('--glow-w', `${Math.round(w)}px`);
 // The still photo fits between the hero copy and the stage controls.
 const room = Math.max(120, H - f.hero - (compact.matches ? 104 : 92));
 const stillH = Math.min(w / 1.78, room);
 stage.style.setProperty('--still-top', `${Math.round(f.hero + (room - stillH) / 2)}px`);
 stage.style.setProperty('--still-h', `${Math.round(stillH)}px`);
 stage.style.setProperty('--still-w', `${Math.round(Math.min(w, stillH * 1.78))}px`);
}

// ---------- Hardware section: the board returns beside the cards ----------
let hwRegion = null, hwMarks = null;
const cards = () => [...(sections.cards?.children || [])];
function measureHardware(){
 if (!storyOn || !sections.cards) return;
 const list = cards(); if (list.length < 3) return;
 const line = .5;
 hwMarks = list.map(c => docTop(c) + c.offsetHeight / 2 - vh * line);
 hwRange = {from:docTop(sections.cards) - vh * .95, to:docTop(sections.cards) + sections.cards.offsetHeight};
}
// Desktop only: on phones the cards scroll normally with their photos.
const hwActive = () => storyOn && !compact.matches && hwRange && scrollY > hwRange.from && scrollY < hwRange.to;
// 0 = entering, 1–3 = the three cards (with holds), 4 = leaving.
function hardwareX(y){
 const m = hwMarks;
 if (y <= m[0]) return clamp01((y - (m[0] - vh * .55)) / (vh * .45));
 for (let i = 0; i < m.length - 1; i++) if (y <= m[i+1]) { const t = (y - m[i]) / (m[i+1] - m[i]); return i + 1 + easeInOut(clamp01((t - .3) / .4)); }
 return 3 + clamp01((y - m[2]) / (vh * .5));
}
function layoutHardware(){
 if (!hwActive()) { if (hwRegion) { hwRegion = null; stage.dataset.phase = 'story'; stage.style.removeProperty('--hw-shift'); } return; }
 stage.dataset.phase = 'hardware';
 const cr = sections.cards.getBoundingClientRect(), headerBottom = header.getBoundingClientRect().bottom;
 const st = stage.getBoundingClientRect();
 const h = vh - headerBottom - 48, top = Math.min(Math.max(headerBottom + 24, cr.top), cr.bottom - h);
 const r = {x:0, y:top, w:Math.round(vw * .56), h};
 // The board never spreads over the cards: the canvas fades out at the region's edge.
 stage.style.setProperty('--hw-right', `${Math.round(r.x + r.w - st.left)}px`);
 stage.style.setProperty('--hw-top', `${Math.round(r.y - st.top)}px`);
 stage.style.setProperty('--hw-bottom', `${Math.round(r.y + r.h - st.top)}px`);
 hwRegion = r;
 // Entering: the board rises in as the cards arrive.
 const enter = easeOut(clamp01((vh - cr.top) / (vh * .45)));
 stage.style.setProperty('--hw-in', enter.toFixed(3));
 scene?.setHardwareFrame(r.x - st.left, r.y - st.top, r.w, r.h);
}

// ---------- Render the non-3D parts of the stage ----------
function viewFor(stop){ return stop === 'assembled' ? 'assembled' : stop === 'exploded' ? 'exploded' : (stop === 'routed' || stop === 'routing' || tl.byName[stop]?.schematic) ? 'routing' : ''; }
function setStop(stop){
 if (stop === currentStop) return;
 currentStop = stop;
 root.dataset.stop = stop;
 root.dataset.chapter = ASSEMBLY_STOPS.has(stop) ? 'assembly' : 'story';
 root.dataset.controls = INSERTION_STOPS.has(stop) ? 'insertion' : ASSEMBLY_STOPS.has(stop) ? 'detail' : 'view';
 const view = viewFor(stop);
 document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
 document.querySelectorAll('[data-inspect]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.inspect === stop)));
 if (view && view !== currentView) { currentView = view; if (callout) callout.innerHTML = CALLOUTS[view]; stage.dataset.stageView = view; }
}
// The insertion slider shows the scroll-driven insertion during its stops.
const insertion = $('#insertion'), insertionValue = $('#insertion-value');
function syncInsertion(pose){
 if (!insertion || scene?.hasOverride()) return;
 const v = Math.round(pose.insertion * 100);
 if (v === Number(insertion.value)) return;
 insertion.value = String(v);
 insertionValue.textContent = v >= 99 ? 'Connected' : v <= 1 ? 'Separate' : `${v}%`;
}
function stageRegion(){ return host.getBoundingClientRect(); }
function layoutOverlay(){
 if (!overlayGroups) return;
 const region = stageRegion(), rect = lastFrame?.baseRect;
 let width, x, y;
 if (storyOn && rect && !compact.matches) {
  const room = region.height - frameNow.top - frameNow.bottom - 8;
  width = Math.min(rect.width, room * 1672/941); x = region.left + rect.x + (rect.width - width)/2; y = region.top + rect.y + rect.height/2 - width*941/1672/2;
 }
 else { width = Math.min(region.width * .92, 1100); x = region.left + (region.width - width)/2; const top = region.top + frameNow.top, bottom = region.bottom - 56; y = storyOn ? top + Math.max(0, (bottom - top - width*941/1672) / 2) : region.top + (region.height - width*941/1672)/2; }
 overlayBox = {x, y: storyOn ? y : y - region.top, width, height: width*941/1672, left: x - region.left};
 overlay.style.width = width + 'px'; overlay.style.height = overlayBox.height + 'px';
}
// Rasterise the drawing once, almost transparent, so its first real frame
// during the story does not pay for the initial paint.
let prewarmed = false;
function prewarmOverlay(){
 if (prewarmed || !storyOn || !overlayGroups || !overlayBox || !scene) return;
 prewarmed = true;
 overlay.style.opacity = '.004';
 overlay.style.transform = `translate3d(${overlayBox.x}px,${overlayBox.y}px,0)`;
 overlayGroups.rest.forEach(el => el.style.opacity = '1');
 requestAnimationFrame(() => requestAnimationFrame(() => update(true)));
}
// Frame first, then one colour group at a time; each group stays drawn.
function drawSchematic(s, h, fullDrawing = false){
 if (!overlayGroups) return;
 const b = tl.byName, fr = b.frame;
 const frameT = fullDrawing ? 1 : easeInOut(clamp01((s - fr.moveEnd) / (fr.draw || 1)));
 overlay.style.opacity = '1';
 overlayGroups.rest.forEach(el => { if (!el.matches('.legend')) el.style.opacity = String(frameT); });
 const legendG = overlaySvg.querySelector('.legend'); if (legendG) legendG.style.opacity = String(frameT);
 const mode = sections.graphic?.closest('[data-signal-mode]')?.dataset.signalMode || 'route';
 const settle = easeInOut(span(h, [.1, .7]));
 const current = stopAt(tl, s), finished = fullDrawing || s >= b.final.start;
 for (const kind of SCHEMATIC_GROUPS) {
  const g = b['group-' + kind];
  const d = fullDrawing ? 1 : easeOut(clamp01((s - g.start) / (g.draw || 1)));
  const isCurrent = current === g, active = h > 0 ? kind === mode : (finished || isCurrent);
  // Earlier groups step back while the current one draws, then all return.
  const emphasis = h > 0 ? (kind === mode ? 1 : 1 - .82 * settle) : (finished || isCurrent ? 1 : .45);
  overlayGroups[kind].forEach(el => {
   if (kind === 'logic') el.style.opacity = String(d * emphasis);
   else { el.style.strokeDashoffset = String(1 - d); el.style.opacity = d > 0 ? String(emphasis) : '0'; }
   el.style.strokeWidth = h > 0 && active ? String(5.5 + 1.5 * settle) : '';
  });
  (overlayGroups.legend[kind] || []).forEach(el => el.style.opacity = String(finished || d > 0 ? (isCurrent || finished ? 1 : .55) : .3));
 }
 if (storyOn && overlayBox && compact.matches) {
  // Phones: the drawing stays in the pinned stage and fades as the explorer arrives.
  overlay.style.transform = `translate3d(${overlayBox.x}px,${overlayBox.y}px,0)`;
  overlay.style.opacity = String(frameT * (1 - easeInOut(span(h, [0, .55]))));
  root.style.setProperty('--handoff', '1');
 } else if (storyOn && overlayBox) {
  // Carry the drawing onto the explorer's own schematic, then hand over.
  let x = overlayBox.x, y = overlayBox.y, scale = 1;
  if (h > 0 && sections.graphic) {
   const target = sections.graphic.getBoundingClientRect(), t = easeInOut(span(h, [0, .85]));
   x += (target.left - x) * t; y += (target.top - y) * t; scale = 1 + (target.width / overlayBox.width - 1) * t;
  }
  overlay.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
  const swap = easeOut(span(h, [.72, 1]));
  overlay.style.opacity = String(frameT > 0 ? 1 - swap : 0);
  root.style.setProperty('--handoff', swap.toFixed(3));
 } else if (overlayBox) {
  overlay.style.transform = `translate3d(${overlayBox.left}px,${overlayBox.y}px,0)`;
  overlay.style.opacity = String(frameT);
 }
}

// ---------- Applications: the same leader line draws in under each tag ----------
const appTags = [...document.querySelectorAll('.application-number')];
function drawAppLines(){
 for (const el of appTags) {
  const r = el.getBoundingClientRect();
  if (r.top > vh || r.bottom < 0) continue;
  const t = reduced.matches ? (r.top < vh * .92 ? 1 : 0) : easeOut(clamp01((vh * .92 - r.top) / (vh * .22)));
  el.style.setProperty('--line', t.toFixed(3));
 }
}

// ---------- Reduced motion: the same stops, without travel between them ----------
function stepped(s){
 if (s >= tl.hardware.start - 1) return tl.hardware.start + Math.round(s - tl.hardware.start);
 let pick = tl.stops[0];
 for (const st of tl.stops) if (s >= st.readEnd + st.move * .5) pick = st;
 return Math.max(pick.start, (pick.hold ? pick.drawEnd : pick.end - .002)) + .001;
}
let lastSnap = -1;

function update(force = false){
 ticking = false;
 if (!storyOn) { drawSchematic(staticView === 'routing' ? 1e3 : 0, 0, staticView === 'routing'); drawAppLines(); return; }
 const y = scrollY;
 sRaw = y / vh;
 // Snapping only starts once the hero and its first stop are behind; near the top the page never pulls.
 setSnap(sRaw);
 const h = clamp01((y - handoff.from) / (handoff.to - handoff.from));
 layoutHardware();
 let s = sRaw;
 if (hwRegion) { s = tl.hardware.start + hardwareX(y); }
 else if (sRaw > tl.end) s = tl.end;
 const step = reduced.matches;
 if (step) s = stepped(s);
 if (!force && s === sShown && h === handoffT) { travelText(); stage.style.setProperty('--board', boardShown.toFixed(3)); drawAppLines(); return; }
 const jumped = step && s !== lastSnap && lastSnap >= 0;
 lastSnap = s; sShown = s; handoffT = h;
 const pose = poseAt(tl, s);
 const wasRouted = currentStop === 'routed';
 setStop(pose.phase === 'hardware' ? 'hardware' : pose.stop);
 stage.style.setProperty('--fade', hwRegion ? '1' : (1 - easeInOut(span(h, [0, .55]))).toFixed(3));
 stage.style.setProperty('--dim', pose.dim.toFixed(3));
 root.dataset.handoff = h >= 1 ? 'done' : 'pending';
 const visible = !!hwRegion || h < 1;
 const routed = currentStop === 'routed';
 stage.dataset.visible = String(visible);
 scene?.setActive(visible && !routed && !document.hidden);
 if (!visible || routed) layer.style.visibility = 'hidden';
 if (scene && !routed) {
  if (jumped && !wasRouted) scene.crossfadeTo(s);
  else scene.setProgress(s, {jump: wasRouted || !!hwRegion !== (lastFrame?.phase === 'hardware')});
 }
 if (!hwRegion) drawSchematic(s, h);
 syncInsertion(pose);
 travelText();
 stage.style.setProperty('--board', boardShown.toFixed(3));
 drawAppLines();
 layer.classList.toggle('is-stepped', step);
 if (!scene) drawAnnotations();
 listeners.forEach(fn => fn(s));
}
function requestUpdate(){ if (!ticking) { ticking = true; requestAnimationFrame(() => update()); } }

// ---------- Scene loading ----------
// If the board is not ready about 4s after the hero text first paints, the
// glow gives way to the still photograph for the rest of this visit.
const STILL_AFTER_MS = 4000, STILL = Symbol('still');
let abandoned = false, stillAt = Infinity;
const shouldStop = () => storyOn && (abandoned || performance.now() > stillAt);
// Fetch the still photo early when the board is slow, so it is ready in time.
// Phones use a small copy of the still and start fetching it with the page.
const PHONE_STILL = './assets/responsive/gallery-1-780.webp';
const phoneStill = () => storyOn && innerWidth < 600;
function prefetchStill(){
 if (scene || !storyOn) return;
 const img = stage.querySelector('.scene-fallback'), pre = new Image();
 if (phoneStill()) { img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.src = PHONE_STILL; pre.src = PHONE_STILL; return; }
 pre.sizes = img.sizes; pre.srcset = img.srcset; pre.src = img.src;
}
const stillDeadline = new Promise(resolve => {
 const arm = start => {
  stillAt = start + STILL_AFTER_MS;
  if (phoneStill()) prefetchStill(); else setTimeout(prefetchStill, Math.max(0, start + 1800 - performance.now()));
  setTimeout(() => resolve(STILL), Math.max(0, stillAt - performance.now()));
 };
 const fcp = performance.getEntriesByName('first-contentful-paint')[0];
 if (fcp) { arm(fcp.startTime); return; }
 try {
  new PerformanceObserver((list, observer) => {
   for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') { observer.disconnect(); arm(e.startTime); }
  }).observe({type: 'paint', buffered: true});
 } catch { arm(performance.now()); }
});
function showStill(){
 stage.dataset.webgl = 'unavailable'; stage.classList.add('no-webgl');
 const img = stage.querySelector('.scene-fallback');
 const shown = () => img.classList.add('is-loaded');
 if (img.complete && img.naturalWidth) shown(); else img.addEventListener('load', shown, {once: true});
}
function onFrame(frame){
 if (abandoned) return;
 lastFrame = frame;
 stage.style.setProperty('--intro', frame.intro.toFixed(3));
 drawAnnotations();
}
function loadScene(){
 if (sceneLoading) return sceneLoading;
 stage.dataset.webgl = 'loading';
 sceneLoading = (async () => {
  try {
   const creating = import('./story-scene.js').then(({createStoryScene}) => shouldStop() ? STILL : createStoryScene(host, {
    shouldStop,
    timeline: tl,
    lite: storyOn && compact.matches,
    instant: !storyOn || reduced.matches,
    onFrame
   }));
   const settle = creating.catch(error => { if (error?.message === 'cancelled') return STILL; throw error; });
   const winner = storyOn ? await Promise.race([settle, stillDeadline]) : await settle;
   if (winner === STILL) {
    abandoned = true;
    creating.then(late => late !== STILL && late?.dispose(), () => {});
    showStill();
    root.dataset.scene = 'unavailable'; root.dataset.still = 'timeout';
    return null;
   }
   scene = winner;
   scene.setGroupPads(PADS);
   scene.setTimeline(tl);
   stage.dataset.webgl = 'ready'; stage.classList.add('ready');
   frameScene();
   root.dataset.scene = 'ready';
   return scene;
  } catch (error) {
   console.error('3D view unavailable', error);
   showStill();
   root.dataset.scene = 'unavailable';
   return null;
  }
 })();
 return sceneLoading;
}

function relayout(){ measure(); frameScene(); layoutOverlay(); update(true); }
function init(){
 if (storyOn) { document.body.append(overlay, layer, snaps); } else stage.append(overlay);
 measure(); frameScene();
 addEventListener('scroll', requestUpdate, {passive: true});
 if (storyOn) document.addEventListener('focusin', revealOnFocus);
 let raf = 0;
 const queue = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); };
 addEventListener('resize', queue);
 compact.addEventListener('change', queue);
 reduced.addEventListener('change', () => { lastSnap = -1; update(true); });
 new ResizeObserver(queue).observe(document.body);
 document.fonts?.ready.then(queue);
 document.addEventListener('visibilitychange', () => scene?.setActive(!document.hidden && currentStop !== 'routed' && (!storyOn || handoffT < 1 || !!hwRegion)));
 loadSchematic().then(() => { layoutOverlay(); update(true); prewarmOverlay(); });
 update(true);
 if (root.dataset.saveData === 'on') return;
 // The board is the hero: start loading right after first paint.
 requestAnimationFrame(() => setTimeout(() => loadScene().then(s => { if (s) { layoutOverlay(); update(true); prewarmOverlay(); } }), 0));
}

// Scroll position (px) where a stop's annotations are fully drawn.
function scrollForStop(name, at = 'drawEnd'){
 const st = tl.byName[name]; if (!st) return 0;
 return (st[at] + (at === 'drawEnd' ? Math.min(.04, st.hold * .25) : 0)) * vh;
}
export const story = {
 on: storyOn,
 init,
 loadScene,
 get scene(){ return scene; },
 get progress(){ return sShown; },
 get stop(){ return currentStop; },
 get compact(){ return compact.matches; },
 get timeline(){ return tl; },
 onProgress(fn){ listeners.add(fn); return () => listeners.delete(fn); },
 // Buttons jump to their stop: adjacent stops scroll, farther ones cut with a crossfade.
 goTo(view){
  if (storyOn) {
   const name = SHORTCUT[view] || view, target = scrollForStop(name);
   const far = Math.abs(target - scrollY) > vh * 1.2;
   setSnap(target / vh);
   if (name === 'routed' || reduced.matches || far || compact.matches) {
    if (name !== 'routed' && currentStop !== 'routed') scene?.crossfadeTo(target / vh);
    scrollTo({top:target, behavior:'instant'});
   }
   else scrollTo({top:target, behavior:'smooth'});
   return;
  }
  staticView = view; setViewStatic(view);
 },
 inAssemblyRange(s = sShown){ const b = tl.byName; return s > b.ports.start - .05 && s < b.routing.start + .05; },
 scrollFor(name, at){ return scrollForStop(name, at); },
 measure,
 relayout
};
function setViewStatic(view){
 currentStop = ''; setStop(view);
 const b = tl.byName, p = view === 'routing' ? b.routing.end : view === 'exploded' ? b.exploded.end - .01 : 0;
 loadScene().then(s => { s?.setProgress(p, {jump:true}); layoutOverlay(); update(true); });
}
