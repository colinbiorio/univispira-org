// cosmos.js — the flight through space between worlds.
//
// It begins inside a nebula (the chain has just zoomed into a universe made of glowing plasma, so the
// first sight is the inside of one), gathers speed out of it past stars near enough to move against
// the far ones, drifts close by a ringed giant, a rock and an ice moon, sees a star go supernova (a
// flare, a shell of plasma rushing out, its light running through the gas round it and over the
// worlds), and slows into where it was going: the Earth, a blue-white point beside a yellow sun; the
// cubic planet (cubeworld.js takes it from there); or a sun, filling more and more of the view.
import * as THREE from 'three';
import { noise3D } from './cube/bake.js';
import { makeSky, makeFarStars, makeStarLayer, makeNebula, makeGlow } from './cube/space.js';
import { makeGasGiant, makeRocky, makeIcy, makeStar, makeEarthDot, makeSupernova } from './cube/bodies.js';
import { createCubeBody, CUBE } from './cube/planet.js';
import { smooth, lerp, clamp01 } from './cube/glsl.js';

const CUBE_SCALE = 1 / 50;   // the cube planet as the flight sees it (its own world is in metres)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export async function createCosmos(ctx) {
  const { renderer } = ctx;
  const lite = ctx.quality === 'lite';
  const noise = noise3D(renderer, lite);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(60, ctx.size.w / ctx.size.h, 0.3, 40000);

  // ---- space itself
  const sky = makeSky(noise); scene.add(sky.mesh);
  const far = makeFarStars(lite ? 9000 : 22000); scene.add(far.points);
  const near = makeStarLayer({ count: lite ? 900 : 1800, box: 560, lum: 1, seed: 3 });
  const mid = makeStarLayer({ count: lite ? 2600 : 6000, box: 2400, lum: 24, seed: 5, streak: 0.4 });
  scene.add(near.mesh, mid.mesh);
  const neb = makeNebula(ctx, noise); scene.add(neb.comp);
  neb.U.uA.value.set(0, 0, -60, 300);
  const glows = [];
  // the nebula's own stars, lighting the gas round them
  [
    { p: [-70, 30, -190], c: [0.65, 0.8, 1.0], i: 1.6 },
    { p: [95, -28, -120], c: [1.0, 0.78, 0.5], i: 1.1 },
    { p: [-30, -45, -330], c: [1.0, 0.55, 0.75], i: 1.3 },
    { p: [40, 60, 40], c: [0.45, 1.0, 0.9], i: 0.9 },
  ].forEach((s, k) => {
    neb.U.uLightP.value[k].set(s.p[0], s.p[1], s.p[2], s.i);
    neb.U.uLightC.value[k].setRGB(s.c[0], s.c[1], s.c[2]);
    const g = makeGlow({ color: new THREE.Color(s.c[0], s.c[1], s.c[2]), size: 9, intensity: 3.2, rays: 1 });
    g.uniforms.uMinPx.value = 14; g.mesh.position.set(s.p[0], s.p[1], s.p[2]);
    scene.add(g.mesh); glows.push(g);
  });

  // ---- the worlds on the way
  const giant = makeGasGiant(noise, { radius: 52 });
  const rocky = makeRocky({ radius: 13, hue: 1 });
  const icy = makeIcy({ radius: 19 });
  scene.add(giant.group, rocky.group, icy.group);
  const sn = makeSupernova(noise);
  scene.add(sn.group, sn.flare); glows.push(sn.star);

  // ---- where the flight can end
  const earth = makeEarthDot({ radius: 0.08 });
  const sunE = makeStar(noise, { radius: 5, intensity: 4, glowI: 1.0 });
  const bigStar = makeStar(noise, { radius: 30, intensity: 1.35, glowI: 0.3, color: new THREE.Color(1.0, 0.8, 0.5) });
  const cube = createCubeBody(ctx, { noise, soilTop: true });
  const cubeG = new THREE.Group(); cube.group.position.y = CUBE.HALF; cubeG.add(cube.group); cubeG.scale.setScalar(CUBE_SCALE);
  const sunC = makeStar(noise, { radius: 16, intensity: 4, glowI: 0.9 });
  scene.add(earth.group, sunE.group, bigStar.group, cubeG, sunC.group);
  glows.push(earth.glow, sunE.glow, bigStar.glow, sunC.glow);
  // the cube turned so the eye, coming down -z, sees its soil face above and two faces below it
  const Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(CUBE.ARRIVE, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))).invert();
  cubeG.quaternion.copy(Q);
  const sunW = CUBE.SUN.clone().applyQuaternion(Q);

  // ---- the way: a gentle curve down -z, straightening at the end; speed by a table
  const P = { mode: 'idle', s: 0, s0: 0, u: 0, S: 1100, seconds: 10, toward: 'earth', sights: new Set(['stars', 'planets', 'supernova']), idleT: 0, arrT: 0, uX: 0.41, follow: null, endView: 34, jump: true };
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3(), dest = new THREE.Vector3(), snPos = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, -1), prevVP = new THREE.Matrix4(), curVP = new THREE.Matrix4();
  let table = buildTable();
  function buildTable() {
    const N = 480, tab = new Float32Array(N + 1); let acc = 0;
    for (let i = 0; i <= N; i++) {
      tab[i] = acc;
      const u = i / N;
      const a = smooth(0, 0.17, u), burst = Math.exp(-Math.pow((u - 0.25) / 0.075, 2)), arrive = Math.pow(1 - smooth(0.6, 1.0, u), 1.6);
      acc += (0.04 + a * (1 + burst)) * arrive / N;
    }
    for (let i = 0; i <= N; i++) tab[i] /= tab[N];
    return tab;
  }
  const sway = (s) => 1 - smooth(P.s0 + P.S * 0.5, P.s0 + P.S * 0.92, s);
  const pathAt = (s, out) => { const w = sway(s); return out.set(Math.sin(s / 230) * 46 * w, (Math.sin(s / 170 + 0.8) * 20 - 14.35) * w, -s); };
  const sAt = (u) => { const N = table.length - 1, x = clamp01(u) * N, i = Math.min(N - 1, Math.floor(x)); return P.s0 + P.S * lerp(table[i], table[i + 1], x - i); };

  function layout() {
    const planets = P.sights.has('planets'), nova = P.sights.has('supernova');
    pathAt(sAt(0.37), tmp); giant.group.position.copy(tmp).add(tA.set(170, -50, -30)); giant.group.visible = planets;
    pathAt(sAt(0.5), tmp); rocky.group.position.copy(tmp).add(tA.set(-44, 19, -6)); rocky.group.visible = planets;
    pathAt(sAt(0.585), tmp); icy.group.position.copy(tmp).add(tA.set(54, 28, 0)); icy.group.visible = planets;
    pathAt(Math.min(P.s0 + P.S - 30, sAt(P.uX) + 420), tmp); snPos.copy(tmp).add(tA.set(-240, 80, 0));
    sn.group.position.copy(snPos); sn.group.visible = sn.flare.visible = nova;
    neb.U.uB.value.set(snPos.x, snPos.y, snPos.z, 190); neb.U.uBOn.value = nova ? 1 : 0;
    neb.U.uSN.value.set(snPos.x, snPos.y, snPos.z, 0); neb.U.uSNI.value = 0;
    P.endView = P.toward === 'earth' ? 34 : P.toward === 'sun' ? 92 : 68;
    pathAt(P.s0 + P.S, dest); dest.z -= P.endView;
    earth.group.visible = sunE.group.visible = P.toward === 'earth';
    bigStar.group.visible = P.toward === 'sun';
    cubeG.visible = sunC.group.visible = P.toward === 'cube';
    earth.group.position.copy(dest);
    sunE.group.position.copy(dest).add(tA.set(64, 20, -430));
    earth.mat.uniforms.uL.value.copy(sunE.group.position).sub(dest).normalize();
    bigStar.group.position.copy(dest);
    cubeG.position.copy(dest);
    sunC.group.position.copy(dest).addScaledVector(sunW, 2600);
  }

  function pose(u, s) {
    pathAt(s, camera.position);
    pathAt(s + 90, look);
    // the eye turns a little toward the supernova as it goes, then settles on where it is going
    if (P.sights.has('supernova')) {
      const g = 0.3 * smooth(P.uX - 0.015, P.uX + 0.06, u) * (1 - smooth(P.uX + 0.16, P.uX + 0.3, u));
      if (g > 0) { tmp.copy(snPos).sub(camera.position).normalize().multiplyScalar(90).add(camera.position); look.lerp(tmp, g); }
    }
    look.lerp(dest, smooth(0.52, 0.9, u));
    // a little bank on the curves
    pathAt(s - 60, tA); pathAt(s + 60, tB);
    const curve = (tA.x + tB.x - 2 * camera.position.x) / 3600;
    camera.up.set(0, 1, 0).applyAxisAngle(zAxis, clamp(-curve * 60, -0.07, 0.07));
    camera.lookAt(look);
  }
  function resetIdle() {
    P.mode = 'idle'; P.idleT = 0; P.s = 0; P.s0 = 0; P.S = 1100; P.u = 0; P.follow = null; P.jump = true;
    table = buildTable(); layout(); sn.set(-5);
  }

  let lastT = -1;
  function update(dt, t) {
    // a long gap: the stage was away, so it begins again inside the nebula
    if (lastT >= 0 && t - lastT > 0.35 && P.mode !== 'fly') resetIdle();
    lastT = t;
    if (P.follow) P.follow(camera, dt, t);
    else if (P.mode === 'fly') pose(P.u, sAt(P.u));
    else if (P.mode === 'arrived') {
      P.arrT += dt;
      pathAt(P.s0 + P.S, camera.position);
      if (P.toward === 'sun') camera.position.copy(dest).add(tmp.set(0, 0, Math.max(bigStar.radius * 1.12, P.endView * Math.exp(-P.arrT * 0.08))));
      else camera.position.z -= Math.min(P.arrT, 40) * 0.12;
      camera.up.set(0, 1, 0); camera.lookAt(dest);
    } else {
      P.idleT += dt;
      P.s = 34 * (1 - Math.exp(-P.idleT / 9));
      pose(0, P.s);
    }
    camera.updateMatrixWorld();

    // the supernova, on its own clock
    const nova = P.sights.has('supernova');
    const tau = P.mode === 'fly' ? (P.u - P.uX) * P.seconds : P.mode === 'arrived' ? (1 - P.uX) * P.seconds + P.arrT : -5;
    const flash = nova ? sn.set(tau) : 0;
    const snL = (o) => flash * 1.2 * Math.pow(300 / Math.max(50, o.position.distanceTo(snPos)), 2);
    for (const b of [giant, rocky, icy]) b.mat.uniforms.uSN.value.set(snPos.x, snPos.y, snPos.z, snL(b.group));
    neb.U.uSN.value.w = sn.lightFront(tau);
    neb.U.uSNI.value = nova ? flash * 1.6 + (tau > 0 ? 0.35 * Math.exp(-tau / 4) : 0) : 0;
    if (nova) {
      tmp.copy(snPos).project(camera);
      const front = tmp.z < 1 && Math.abs(tmp.x) < 3 && Math.abs(tmp.y) < 3;
      sn.flare.material.uniforms.uAt.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      sn.flare.material.uniforms.uI.value = flash * (front ? 0.5 : 0.12);
      sn.flare.material.uniforms.uAspect.value = ctx.size.w / ctx.size.h;
    }
    // the worlds stop the nebula's rays (it is marched to them, not through them)
    const occ = neb.U.uOcc.value;
    [giant, rocky, icy].forEach((b, k) => { if (b.group.visible) occ[k].set(b.group.position.x, b.group.position.y, b.group.position.z, b.radius); else occ[k].w = 0; });
    // before the flight the worlds ahead are hidden in the gas
    const showWorlds = P.sights.has('planets') && P.mode !== 'idle';
    giant.group.visible = rocky.group.visible = icy.group.visible = showWorlds;
    const f1 = Math.min(1, flash);
    stage.bloom.strength = 0.6 + 0.6 * f1;
    stage.bloom.radius = 0.45 + 0.2 * f1;
    stage.bloom.threshold = 1.0 - 0.45 * f1;       // the gas itself does not glow over everything: only stars, and the flash
    stage.exposure = 0.88 + 0.22 * f1;

    // the worlds turn
    giant.update(t); rocky.update(t); icy.update(t); sunE.update(t); bigStar.update(t); sunC.update(t);
    if (cubeG.visible) cube.update(t, sunW);

    // stars: where the eye is, and where it was a frame ago (their streaks)
    curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (P.jump) { prevVP.copy(curVP); P.jump = false; }
    const W = ctx.size.w * ctx.size.scale, H = ctx.size.h * ctx.size.scale;
    for (const L of [near, mid]) {
      L.uniforms.uCam.value.copy(camera.position); L.uniforms.uRes.value.set(W, H);
      L.uniforms.uPx.value = ctx.size.scale; L.uniforms.uPrevVP.value.copy(prevVP);
    }
    prevVP.copy(curVP);
    far.uniforms.uPx.value = ctx.size.scale;
    for (const g of glows) g.uniforms.uRes.value.set(W, H);

    // the nebula, marched at half size before the frame is drawn
    neb.render(renderer, camera);
  }

  const stage = { scene, camera, bloom: { strength: 0.75, radius: 0.48, threshold: 0.6 }, exposure: 1.0, update };

  async function fly({ toward = 'earth', seconds = 8, sights = ['stars', 'planets', 'supernova'] } = {}) {
    if (P.mode !== 'idle') resetIdle();      // a second flight from where the last ended begins again at the start
    P.toward = toward; P.seconds = Math.max(3, seconds); P.sights = new Set(sights);
    P.s0 = P.s; P.S = 1100; table = buildTable(); layout();
    P.mode = 'fly'; P.u = 0;
    await ctx.anim(P.seconds, (k) => { P.u = k; }, ctx.ease.linear);
    P.mode = 'arrived'; P.arrT = 0;
  }

  // made ready now, so the first frame does not stall: every program compiled once
  for (const o of [giant.group, rocky.group, icy.group, sn.group, sn.flare, earth.group, sunE.group, bigStar.group, cubeG, sunC.group]) o.visible = true;
  sn.outer.visible = sn.inner.visible = true;
  renderer.compile(scene, camera);
  resetIdle(); update(0, 0); lastT = -1;

  return {
    stage, fly, camera,
    // the cubic planet as the flight sees it (for the cube world to take over): where, how turned, how scaled, its sun
    cubeFrame: { position: cubeG.position, quaternion: Q, scale: CUBE_SCALE, sun: sunW },
    // the cube world may steer this camera for a moment while the two cross-fade; null gives it back
    follow(fn) { P.follow = fn; },
  };
}
