// orchard.js — under an apple tree, an apple; the katana; the universe it becomes.
//
// States: 'orchard' (the apple floating, turning slowly), 'halves' (cut along a
// plane chosen at random; the halves apart, left and right at one height,
// their faces to the eye, each named "apple"), 'whole' (the cut run backward;
// one apple, "apple"), 'universe' (the apple has become the universe; the
// orchard gone to dark). Drags turn what is shown (the apple, either half, the
// universe).
import * as THREE from 'three';
import { createOrchardWorld } from './apple/orchard-world.js';
import { createApple } from './apple/apple.js';
import { createKatana, LENGTH } from './apple/katana.js';
import { createUniverse } from './apple/universe.js';

const CENTRE = new THREE.Vector3(0, 1.22, 0);

export async function createOrchard(ctx) {
  const { ease } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 9000);
  // on a narrow screen the eye stands further back, so that both halves, side by side, are in view
  const HOME = { base: new THREE.Vector3(0, 1.32, 3.25), pos: new THREE.Vector3(0, 1.32, 3.25), look: CENTRE.clone().add(new THREE.Vector3(0, -0.02, 0)) };
  function frame() {
    const aspect = Math.max(0.3, ctx.size.w / Math.max(1, ctx.size.h)), back = Math.max(1, 1.3 / aspect);
    HOME.pos.copy(HOME.look).add(HOME.base.clone().sub(HOME.look).multiplyScalar(back));
  }
  frame();
  camera.position.copy(HOME.pos); camera.lookAt(HOME.look);
  const world = createOrchardWorld(scene, ctx.renderer, { quality: ctx.quality });
  const apple = createApple({ quality: ctx.quality, envMap: world.env });
  const holder = new THREE.Group(); holder.position.copy(CENTRE); scene.add(holder);   // the bob and the slow turn
  holder.add(apple.root);
  const katana = createKatana({ envMap: world.env }); katana.root.visible = false;
  scene.add(katana.root); scene.add(katana.trail);
  const universe = createUniverse(ctx, { apple });
  universe.group.visible = false; holder.add(universe.group);
  // a flash along the seam when the halves are made whole
  const seam = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  seam.visible = false; holder.add(seam);

  let state = 'orchard', busy = false;
  const stage = {
    scene, camera,
    resize() { const was = HOME.pos.clone(); frame(); if (!busy && camera.position.distanceTo(was) < 1e-3) { camera.position.copy(HOME.pos); camera.lookAt(HOME.look); } },
    bloom: { strength: 0.28, radius: 0.5, threshold: 2.2 },
    exposure: 0.82,
    update(dt, t) {
      world.update(dt, t);
      if (!busy) {
        holder.position.y = CENTRE.y + Math.sin(t * 1.25) * 0.022;
        if (state === 'orchard' || state === 'whole') holder.rotation.y += dt * 0.16;
        if (state === 'halves' && apple.halves) for (const h of [apple.halves.a, apple.halves.b]) h.position.y = h.userData.restY + Math.sin(t * 1.25 + h.userData.phase) * 0.018;
      }
      if (universe.group.visible) universe.update(dt, t);
    },
  };
  const v = new THREE.Vector3(), up = new THREE.Vector3();
  const camUp = () => up.setFromMatrixColumn(camera.matrixWorld, 1);
  const below = (obj, r = 0.5) => () => obj.getWorldPosition(v).addScaledVector(camUp(), -r);

  function restWhole() {
    apple.uncut(); apple.root.quaternion.identity(); apple.root.position.set(0, 0, 0);
    apple.root.visible = true; apple.skinMat.userData.uniforms.uCrack.value = 0; apple.skinMat.userData.uniforms.uDissolve.value = 0;
    universe.group.visible = false; universe.setMorph(0);
    world.group.visible = true; scene.background = null; world.sky.visible = true;
    world.sun.intensity = 2.6; world.hemi.intensity = 0.55; scene.environmentIntensity = 1;
    world.setSunElevation(21);
    stage.exposure = 0.82; stage.bloom = { strength: 0.28, radius: 0.5, threshold: 2.2 };
    holder.position.copy(CENTRE);
    camera.position.copy(HOME.pos); camera.lookAt(HOME.look);
  }

  // ---- the cut
  function cutPlane() {
    // a plane through the apple at random; the blade moves across the screen within it
    let n = new THREE.Vector3().randomDirection();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), upv = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const a0 = Math.random() * Math.PI * 2;
    let m = right.clone().multiplyScalar(Math.cos(a0)).addScaledVector(upv, Math.sin(a0));
    m.addScaledVector(n, -m.dot(n));
    if (m.lengthSq() < 0.05) { n = new THREE.Vector3().randomDirection(); m = right.clone().addScaledVector(n, -right.dot(n)); }
    m.normalize();
    const a = new THREE.Vector3().crossVectors(m, n).normalize();   // the blade's length lies along a
    return { n, m, a };
  }
  function placeKatana({ n, m, a }, s, backward = false) {
    // the blade's middle crosses the apple's middle; s from -1 to 1 is how far along its stroke
    const centre = apple.root.getWorldPosition(new THREE.Vector3());
    const edge = backward ? m.clone().negate() : m.clone();          // the edge (local -y) leads the stroke
    const y = edge.clone().negate();
    const z = new THREE.Vector3().crossVectors(a, y).normalize();
    katana.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, y, z));
    // a slight arc to the stroke: the blade turns a little about the plane's normal as it goes
    katana.root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(n, s * 0.16 * (backward ? -1 : 1)));
    katana.root.position.copy(centre).addScaledVector(a, -LENGTH * 0.47).addScaledVector(m, s * 1.75 * (backward ? -1 : 1));
  }
  async function stroke(plane, backward, onCross) {
    katana.clearTrail(); katana.root.visible = true;
    placeKatana(plane, -1.5, backward);
    // it comes in from beyond and is poised; then the stroke, fast, on through
    await ctx.anim(0.34, (k, e) => placeKatana(plane, -1.5 + 0.3 * e, backward), ease.out);
    await ctx.wait(0.14);
    let crossed = false;
    await ctx.anim(0.2, (k, e) => {
      const s = -1.2 + 2.6 * e; placeKatana(plane, s, backward); katana.record();
      if (!crossed && s >= 0) { crossed = true; onCross(); }
    }, ease.inOut);
    await ctx.anim(0.45, (k, e) => { placeKatana(plane, 1.4 + 1.2 * e, backward); katana.record(); }, ease.out);
    katana.root.visible = false;
    await ctx.anim(0.3, () => katana.record(), ease.linear);
    katana.clearTrail();
  }
  function shake(seconds = 0.35, amp = 0.012) {
    const base = camera.position.clone();
    return ctx.anim(seconds, (k) => { const f = (1 - k) * amp; camera.position.set(base.x + (Math.random() - 0.5) * f, base.y + (Math.random() - 0.5) * f, base.z); }, ease.linear).then(() => camera.position.copy(base));
  }

  async function slice() {
    busy = true; ctx.spin.set([], null); ctx.labels.clear({ how: 'fade' });
    const plane = cutPlane();
    const inv = apple.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const nLocal = plane.n.clone().applyQuaternion(inv);
    let H = null;
    await stroke(plane, false, () => {
      H = apple.cut(nLocal, (Math.random() - 0.5) * 0.04);
      for (const h of [H.a, H.b]) { h.userData.cutPos = h.position.clone(); h.userData.cutQuat = h.quaternion.clone(); }
      shake();
    });
    // which goes left: the one whose middle is left of the other on the screen
    const sa = H.a.getWorldPosition(new THREE.Vector3()).project(camera).x, sb = H.b.getWorldPosition(new THREE.Vector3()).project(camera).x;
    const [left, right] = sa <= sb ? [H.a, H.b] : [H.b, H.a];
    await part(H, left, right, plane);
    state = 'halves'; busy = false;
    ctx.spin.set([{ object: left, hit: left }, { object: right, hit: right }], camera);
    ctx.labels.show('a', { text: 'apple', at: below(left, 0.42), camera: () => camera, gap: 70 });
    await ctx.labels.show('b', { text: 'apple', at: below(right, 0.42), camera: () => camera, gap: 70, delay: 160 });
  }
  // the halves fall apart a little, then go to their places, faces turned to the eye
  async function part(H, left, rightH, plane) {
    const rootQ = apple.root.getWorldQuaternion(new THREE.Quaternion()), rootQi = rootQ.clone().invert();
    const toLocal = (wv) => wv.clone().applyQuaternion(rootQi);
    const nL = toLocal(plane.n), tilt = toLocal(plane.a);
    const startA = H.a.position.clone(), startB = H.b.position.clone(), qa0 = H.a.quaternion.clone(), qb0 = H.b.quaternion.clone();
    await ctx.anim(0.55, (k, e) => {
      H.a.position.copy(startA).addScaledVector(nL, 0.055 * e); H.b.position.copy(startB).addScaledVector(nL, -0.055 * e);
      H.a.quaternion.copy(qa0).premultiply(new THREE.Quaternion().setFromAxisAngle(tilt, 0.12 * e));
      H.b.quaternion.copy(qb0).premultiply(new THREE.Quaternion().setFromAxisAngle(tilt, -0.12 * e));
    }, ease.out);
    // the places: left and right of the middle, one height, each face toward the eye and a little toward the other
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const mid = apple.root.getWorldPosition(new THREE.Vector3());
    const toEye = camera.position.clone().sub(mid).normalize();
    const goals = [[left, -1], [rightH, 1]].map(([h, side]) => {
      const pos0 = h.position.clone(), q0 = h.quaternion.clone();
      const posGoal = apple.root.worldToLocal(mid.clone().addScaledVector(right, side * 0.74));
      // its face looks along -normal in the half's own frame; turn it toward the eye, leaning in toward the middle
      const face = h.userData.normal.clone().negate().applyQuaternion(h.quaternion).normalize();
      const want = toLocal(toEye.clone().addScaledVector(right, -side * 0.45).normalize());
      const qGoal = new THREE.Quaternion().setFromUnitVectors(face, want).multiply(h.quaternion);
      h.userData.phase = side > 0 ? 1.7 : 0;
      return { h, pos0, q0, posGoal, qGoal };
    });
    await ctx.anim(1.7, (k, e) => {
      for (const g of goals) { g.h.position.lerpVectors(g.pos0, g.posGoal, e); g.h.quaternion.slerpQuaternions(g.q0, g.qGoal, e); }
    }, ease.inOut);
    for (const g of goals) g.h.userData.restY = g.h.position.y;
  }

  async function unslice() {
    busy = true; ctx.spin.set([], null);
    await ctx.labels.clear({ how: 'fade' });
    const H = apple.halves; if (!H) { state = 'whole'; busy = false; return; }
    const from = [H.a, H.b].map((h) => ({ h, p: h.position.clone(), q: h.quaternion.clone() }));
    // back together, the gap closing last
    await ctx.anim(1.4, (k, e) => { for (const f of from) { f.h.position.lerpVectors(f.p, f.h.userData.cutPos, e); f.h.quaternion.slerpQuaternions(f.q, f.h.userData.cutQuat, e); } }, ease.inOut);
    // the blade runs back through the seam, and the seam is gone
    const n = H.normal.clone().applyQuaternion(apple.root.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const m = right.clone().addScaledVector(n, -right.dot(n)); if (m.lengthSq() < 0.05) m.set(0, 1, 0).addScaledVector(n, -n.y); m.normalize();
    const plane = { n, m, a: new THREE.Vector3().crossVectors(m, n).normalize() };
    const seamN = H.normal.clone();
    await stroke(plane, true, () => {
      apple.uncut();
      seam.visible = true; seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), seamN.applyQuaternion(apple.root.quaternion));
      ctx.anim(0.7, (k) => { seam.material.opacity = (1 - k) * 0.9; seam.scale.setScalar(1 + k * 0.15); }, ease.out).then(() => { seam.visible = false; });
    });
    state = 'whole'; busy = false;
    ctx.spin.set([{ object: apple.root }], camera);
    await ctx.labels.show('one', { text: 'apple', at: below(apple.root, 0.52), camera: () => camera, gap: 74 });
  }

  // ---- the apple becomes the universe
  async function toUniverse() {
    busy = true; ctx.spin.set([], null);
    ctx.labels.hide('one', { how: 'fade' });     // "universe" comes when the universe has fully appeared
    await universe.becomeFrom(apple, {
      darken: (k) => {   // the sun sets fast: gold, red, the blue hour, night, and nothing
        world.setSunElevation(THREE.MathUtils.lerp(21, -16, Math.min(1, k * 1.08)));
        world.sun.intensity = 2.6 * Math.pow(1 - k, 1.6); world.hemi.intensity = 0.55 * Math.pow(1 - k, 2);
        scene.environmentIntensity = Math.pow(1 - k, 2);
        if (k > 0.985) { world.group.visible = false; world.sky.visible = false; scene.background = new THREE.Color(0x000000); }
      },
      bloom: (k) => { stage.bloom = { strength: 0.28 + 0.57 * k, radius: 0.5 + 0.2 * k, threshold: 2.2 - 1.6 * k }; stage.exposure = 0.82 + 0.03 * k; },
    });
    await ctx.labels.show('one', { text: 'universe', at: below(universe.group, 0.72), camera: () => camera, gap: 80 });
    state = 'universe'; busy = false;
    ctx.spin.set([{ object: universe.spinner }], camera);
  }

  return {
    stage, apple, universe, world, holder, home: HOME,
    async arrive(name) {
      restWhole();
      state = name;
      if (name === 'orchard') { ctx.spin.set([{ object: apple.root }], camera); return; }
      if (name === 'halves') { state = 'orchard'; await slice(); return; }
      if (name === 'whole') { ctx.spin.set([{ object: apple.root }], camera); ctx.labels.show('one', { text: 'apple', at: below(apple.root, 0.52), camera: () => camera }); return; }
      if (name === 'universe') {
        apple.root.visible = false; universe.group.visible = true; universe.setMorph(1);
        world.group.visible = false; world.sky.visible = false; scene.background = new THREE.Color(0x000000); world.sun.intensity = 0; world.hemi.intensity = 0;
        stage.exposure = 0.85; stage.bloom = { strength: 0.85, radius: 0.7, threshold: 0.6 };
        ctx.spin.set([{ object: universe.spinner }], camera);
        ctx.labels.show('one', { text: 'universe', at: below(universe.group, 0.72), camera: () => camera, gap: 80 });
      }
    },
    slice, unslice, toUniverse,
    universeCentre: () => universe.group.getWorldPosition(new THREE.Vector3()),
    // the eye goes into the universe (while the pipeline zooms into the next world)
    async diveIn() {
      busy = true; ctx.labels.clear();
      const p0 = camera.position.clone(), target = universe.group.getWorldPosition(new THREE.Vector3());
      await ctx.anim(2.4, (k, e) => { camera.position.lerpVectors(p0, target, e * 0.96); universe.setRush(e); }, ease.inExpo);
      camera.position.copy(HOME.pos); camera.lookAt(HOME.look); universe.setRush(0); busy = false;
    },
  };
}
