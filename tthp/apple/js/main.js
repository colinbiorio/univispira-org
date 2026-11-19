// main.js — the apple, and the universe in it.
//
// Colin, 18 November 2026: "Under an apple tree in a beautiful but simple
// orchard, a floating 3d-rendered apple ... When you click on it, a beautiful
// katana slices it in half ... the apple turns into a representation of the
// physical universe ... We zoom into, entering, the universe, until we arrive
// at the earth ... zoom into Wilmington, North Carolina ... a cutting board
// with an apple sitting on it ... a cubic planet ... a mirror ... 'Look
// around. You are not separate. You are in it. Just as it is in you.'"
// (TTHP, the Theory of the Holographic Principle: the part holds the whole.)
//
// This file makes the screen, the clock and the hands, and runs the chain
// (chain.js). Each world is a stage of its own (stages/*.js): a scene and a
// camera, drawn by the pipeline alone or mixed with the next one.
import * as THREE from 'three';
import { createPipeline, STYLE } from './engine/pipeline.js';
import { createInput } from './engine/input.js';
import { createSpin } from './engine/spin.js';
import { createLabels } from './engine/labels.js';
import { createUI } from './engine/ui.js';
import { createTime, ease } from './engine/time.js';
import { runChain } from './chain.js';

const root = document.getElementById('stage');
const holder = document.getElementById('canvas');
const params = new URLSearchParams(location.search);

let pipeline;
try { pipeline = createPipeline(holder); }
catch (e) {
  document.getElementById('veil').querySelector('.mark').textContent = 'this needs WebGL, which this browser does not offer';
  throw e;
}
const time = createTime();
const spin = createSpin();
const labels = createLabels(document.getElementById('labels'));
const ui = createUI(root);
const quality = params.get('quality') || (navigator.hardwareConcurrency <= 4 || /Mobi|Android/i.test(navigator.userAgent) ? 'lite' : 'high');

const ctx = {
  THREE, pipeline, renderer: pipeline.renderer, size: pipeline.size, time, ease, STYLE, labels, spin, ui, quality, el: holder, params,
  anim: (s, f, e) => time.anim(s, f, e),
  wait: (s) => time.wait(s),
  // where an asset lives (assets/ beside this page)
  asset: (p) => new URL('../assets/' + p, import.meta.url).href,
  // one world alone on the screen
  show(stage) { pipeline.show(stage); ctx.current = stage; },
  // from the world shown to another: { style, duration, focus: [x, y] in 0..1, during(k) }
  async transition(to, { style = 'fade', duration = 1.6, focus = null, easing = ease.inOut, during = null } = {}) {
    const from = pipeline.shown;
    if (!from || from === to) { ctx.show(to); return; }
    await time.anim(duration, (k, e) => { pipeline.blend(from, to, e, STYLE[style] ?? 0, focus); during?.(k, e); }, easing);
    ctx.show(to);
  },
  // the screen position (0..1, y down) of a world point as a stage's camera sees it
  screenOf(p, camera) { const v = p.clone().project(camera); return [v.x * 0.5 + 0.5, -v.y * 0.5 + 0.5]; },
  // a tap anywhere, or Space: the chain waits on this between its steps
  tapped: null,
  claimTap: null,     // a step may take taps for itself (a half flipped over); answer true to keep one
  drag: null,         // a step may take drags for itself (the board); else a drag turns what spin was given
  current: null,
};

let waiting = null;
ctx.tap = () => new Promise((r) => { waiting = r; });
function onTap(e) {
  if (ctx.claimTap?.(e)) return;
  if (waiting) { const w = waiting; waiting = null; w(e); }
  else ctx.onIdleTap?.(e);
}
createInput(holder, {
  onTap,
  onDragStart: (e) => { if (ctx.drag) ctx.drag.start?.(e); else spin.start(e.x, e.y, holder); },
  onDrag: (e) => { if (ctx.drag) ctx.drag.move?.(e); else spin.move(e.dx, e.dy); },
  onDragEnd: (e) => { if (ctx.drag) ctx.drag.end?.(e); else spin.end(); },
  onTwist: (da) => ctx.drag?.twist?.(da),
});

// the loop
let last = performance.now(), frames = 0, fpsT = 0;
ctx.fps = 60;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  time.tick(dt);
  const a = pipeline.shown, b = pipeline.incoming;
  a?.update?.(dt, time.now);
  if (b && b !== a) b.update?.(dt, time.now);
  spin.update(dt);
  labels.update(pipeline.size.w, pipeline.size.h);
  pipeline.render();
  frames++; fpsT += dt; if (fpsT >= 1) { ctx.fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => pipeline.resize());
pipeline.resize();
requestAnimationFrame(frame);

// for whoever checks it from outside (a test's browser, the console)
window.TTHP = {
  get state() { return ctx.state; },
  get busy() { return !waiting; },
  get fps() { return Math.round(ctx.fps); },
  tap: () => onTap({ x: innerWidth / 2, y: innerHeight / 2, key: true }),
  ctx,
};

runChain(ctx).catch((e) => { console.error('[tthp] the chain broke', e); });
