// kitchen.js — the apple on the cutting board, its halves, and the universe over it.
//
// The kitchen and its board are the Earth's (earth.js: E.kitchen, E.board); this
// puts an apple on the board. "apple" becomes "universe"; it is cut by nothing
// (the cut's light without the blade); the halves tip over and lie face up,
// each named "universe". Then they are things on a board: a drag slides one
// (it keeps going a little, and pushes the other); a drag with Shift, the
// right button or two fingers spins it on its round side, rocking; a tap on a
// half turns it over onto its flat side and back; one pushed off the screen
// comes back in the middle of the board (the other moved aside if it is
// there). A tap anywhere else goes on: the halves come together, the apple is
// whole and rises, and becomes the universe again, over the board.
import * as THREE from 'three';
import { createApple, APPLE } from './apple/apple.js';
import { createUniverse } from './apple/universe.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function createKitchenApple(ctx) {
  const { ease } = ctx;
  let apple = null, universe = null, E = null, s = 1, halves = [], mode = 'none';
  const holder = new THREE.Group(); holder.name = 'kitchen-apple';
  const v = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xfff3dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  seam.visible = false;
  const glow = new THREE.PointLight(0xa08cff, 0, 0, 2);
  let glowK = 0;
  const glowTick = (t) => { glow.color.setHSL(0.72 + 0.09 * Math.sin(t * 0.23) + 0.04 * Math.sin(t * 0.61), 0.7, 0.62); glow.intensity = 1.6 * glowK * (0.85 + 0.15 * Math.sin(t * 0.9)); };

  function ensure(e) {
    if (apple) return;
    E = e;
    let env = E.kitchen.scene.environment;
    if (!env) { const pm = new THREE.PMREMGenerator(ctx.renderer); env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
    apple = createApple({ quality: ctx.quality, envMap: env });
    universe = createUniverse(ctx, { apple, seed: 11 });
    universe.group.visible = false;
    s = (E.board.width || 4) / 3.2;
    holder.scale.setScalar(s);
    holder.add(apple.root, universe.group, seam);
    universe.group.add(glow);          // its own light on the board when the room has gone dark
    E.board.group.add(holder);
    // the kitchen's frame goes on turning the universe while it floats here
    const up = E.kitchen.update?.bind(E.kitchen);
    E.kitchen.update = (dt, t) => { up?.(dt, t); tick(dt, t); if (universe.group.visible) { universe.update(dt, t); glowTick(t); } };
  }
  const camera = () => E.kitchen.camera;
  const sit = APPLE.bottom * -1;              // the apple's lowest point to its middle
  // just below it on the screen, whichever way the eye looking down is turned
  const camUp = new THREE.Vector3();
  const labelAt = (obj, r = 0.6) => () => obj.getWorldPosition(v).addScaledVector(camUp.setFromMatrixColumn(camera().matrixWorld, 1), -r * s);

  function restWhole() {
    apple.uncut(); for (const h of halves) holder.remove(h.g); halves = [];
    apple.root.visible = true; apple.root.position.set(0, sit, 0); apple.root.quaternion.identity();
    apple.root.rotation.y = 0.4;
    apple.skinMat.userData.uniforms.uCrack.value = 0; apple.skinMat.userData.uniforms.uDissolve.value = 0;
    universe.group.visible = false; universe.setMorph(0); E.dim?.(0); glowK = 0; glow.intensity = 0;
  }

  // ---- the halves as things on the board
  const R = 0.53;                             // a half's reach on the board, in apple units
  function layHalves(H, n) {
    // each half tipped over onto its round side, face up
    const out = [];
    for (const [g, sgn] of [[H.a, 1], [H.b, -1]]) {
      holder.attach(g);
      const cutQ = g.quaternion.clone(), cutP = g.position.clone();   // as it was cut, in place
      const face = g.userData.normal.clone().negate();               // its face looks along -normal (apple frame)
      const qUp = new THREE.Quaternion().setFromUnitVectors(face.clone().applyQuaternion(apple.root.quaternion).normalize(), new THREE.Vector3(0, 1, 0)).multiply(g.quaternion.clone());
      const h = { g, sgn, qUp, cutQ, cutP, yaw: 0, yawV: 0, tilt: new THREE.Vector2(), tiltV: new THREE.Vector2(), flip: 0, flipTo: 0, pos: new THREE.Vector2(), vel: new THREE.Vector2(), restY: 0, restYDown: 0, held: false };
      // how high its middle sits when it lies face up (round side down) and face down (flat side down), in the board's own units
      const baseY = holder.getWorldPosition(new THREE.Vector3()).y;
      g.quaternion.copy(qUp); g.position.set(0, 0, 0); holder.updateMatrixWorld(true);
      h.restY = -(new THREE.Box3().setFromObject(g).min.y - baseY) / s;
      g.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI).multiply(qUp)); holder.updateMatrixWorld(true);
      h.restYDown = -(new THREE.Box3().setFromObject(g).min.y - baseY) / s;
      g.quaternion.copy(cutQ); g.position.copy(cutP);
      out.push(h);
    }
    // apart along the cut's normal, on the board
    const nb = new THREE.Vector2(n.x, n.z); if (nb.lengthSq() < 1e-4) nb.set(1, 0); nb.normalize();
    out[0].pos.copy(nb).multiplyScalar(0.62); out[1].pos.copy(nb).multiplyScalar(-0.62);
    return out;
  }
  function pose(h) {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw);
    const qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(h.tilt.x, 0, h.tilt.y));
    const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), h.flip * Math.PI);
    h.g.quaternion.copy(qYaw).multiply(qTilt).multiply(qFlip).multiply(h.qUp);
    const lift = Math.sin(h.flip * Math.PI) * 0.35;                  // it hops as it turns over
    const y = h.restY + (h.restYDown - h.restY) * h.flip + lift;
    h.g.position.set(h.pos.x, y, h.pos.y);
  }
  function tick(dt) {
    if (mode !== 'split') return;
    for (const h of halves) {
      if (!h.held) {
        h.pos.addScaledVector(h.vel, dt); h.vel.multiplyScalar(Math.exp(-2.6 * dt));
      }
      h.yaw += h.yawV * dt; h.yawV *= Math.exp(-1.2 * dt);
      // the rocking settles: a spring with damping
      h.tiltV.addScaledVector(h.tilt, -38 * dt).multiplyScalar(Math.exp(-3.2 * dt)); h.tilt.addScaledVector(h.tiltV, dt);
      if (h.flip !== h.flipTo) { const d = h.flipTo - h.flip, st = Math.sign(d) * dt * 2.4; h.flip = Math.abs(st) >= Math.abs(d) ? h.flipTo : h.flip + st; }
    }
    // they do not pass through each other
    if (halves.length === 2) {
      const [a, b] = halves, d = new THREE.Vector2().subVectors(b.pos, a.pos), L = d.length(), min = R * 2;
      if (L < min && L > 1e-5) {
        d.multiplyScalar(1 / L); const push = (min - L) / 2;
        if (!a.held) a.pos.addScaledVector(d, -push * (b.held ? 2 : 1)); if (!b.held) b.pos.addScaledVector(d, push * (a.held ? 2 : 1));
        const rel = (b.vel.dot(d) - a.vel.dot(d)); if (rel < 0) { a.vel.addScaledVector(d, rel * 0.6); b.vel.addScaledVector(d, -rel * 0.6); }
      }
    }
    for (const h of halves) {
      pose(h);
      // pushed off the screen: back in the middle of the board
      h.g.getWorldPosition(v).project(camera());
      if (!h.held && (Math.abs(v.x) > 1.08 || Math.abs(v.y) > 1.08)) back(h);
    }
  }
  function back(h) {
    const other = halves.find((o) => o !== h);
    h.pos.set(0, 0); h.vel.set(0, 0); h.yawV = 0; h.tilt.set(0.25, -0.2); h.tiltV.set(0, 0);
    if (other && other.pos.length() < R * 2.2) { const away = other.pos.lengthSq() > 1e-4 ? other.pos.clone().normalize() : new THREE.Vector2(1, 0); other.vel.copy(away).multiplyScalar(2.2); }
    ctx.ui.hint('back on the board', 1600);
  }
  function halfAt(x, y) {
    const r = ctx.el.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera());
    let best = null, bd = Infinity;
    for (const h of halves) { const hit = ray.intersectObject(h.g, true)[0]; if (hit && hit.distance < bd) { bd = hit.distance; best = h; } }
    return best;
  }
  function boardPoint(x, y) {
    const r = ctx.el.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera());
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(E.board.group.getWorldQuaternion(new THREE.Quaternion()));
    const p0 = E.board.group.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!hit) return null;
    holder.worldToLocal(hit); return new THREE.Vector2(hit.x, hit.z);
  }
  // the hands, while the halves are on the board
  let grab = null;
  const drag = {
    start(e) {
      const h = halfAt(e.x, e.y); if (!h) { grab = null; return; }
      const spin = e.shift || e.button === 2 || e.alt;
      const p = boardPoint(e.x, e.y);
      grab = { h, spin, off: p ? h.pos.clone().sub(p) : new THREE.Vector2(), last: p, t: performance.now() };
      h.held = !spin; h.vel.set(0, 0);
    },
    move(e) {
      if (!grab) return;
      const h = grab.h;
      if (grab.spin) { h.yawV = e.dx * 0.12; h.yaw += e.dx * 0.012; h.tilt.x += e.dy * 0.004; h.tilt.y -= e.dx * 0.002; return; }
      const p = boardPoint(e.x, e.y); if (!p) return;
      const now = performance.now(), dt = Math.max(0.008, (now - grab.t) / 1000);
      const next = p.clone().add(grab.off);
      h.vel.copy(next).sub(h.pos).multiplyScalar(1 / dt).clampLength(0, 9);
      // dragged, it leans the way it is pulled
      h.tilt.x += (next.y - h.pos.y) * 0.5; h.tilt.y -= (next.x - h.pos.x) * 0.5;
      h.pos.copy(next); grab.t = now;
    },
    end() { if (grab) { grab.h.held = false; if (performance.now() - grab.t > 120) grab.h.vel.set(0, 0); } grab = null; },
    twist(da) { const h = grab?.h || halves[0]; if (h) { h.yawV = -da * 12; h.yaw -= da; } },
  };
  function claim(e) {
    if (mode !== 'split') return false;
    const h = halfAt(e.x, e.y); if (!h) return false;
    h.flipTo = h.flipTo > 0.5 ? 0 : 1;            // over onto its flat side, and back
    return true;
  }

  // for whoever checks it from outside
  ctx.debugKitchen = () => ({ mode, halves: halves.map((h) => ({ pos: [+h.pos.x.toFixed(2), +h.pos.y.toFixed(2)], flip: +h.flip.toFixed(2), flipTo: h.flipTo, screen: (() => { h.g.getWorldPosition(v).project(camera()); const r = ctx.el.getBoundingClientRect(); return [Math.round((v.x * 0.5 + 0.5) * r.width), Math.round((-v.y * 0.5 + 0.5) * r.height)]; })() })) });
  const api = {
    async place(e, what, { quiet = false } = {}) {
      ensure(e); restWhole(); mode = 'whole';
      if (what === 'split') { await api.split(e, { instant: true }); return; }
      if (what === 'universe') {
        mode = 'universe'; apple.root.visible = false;
        universe.group.visible = true; universe.setMorph(1); universe.group.position.set(0, 1.5, 0); universe.group.scale.setScalar(0.85); E.dim?.(1); glowK = 1;
        ctx.spin.set([{ object: universe.spinner }], camera());
        ctx.labels.show('one', { text: 'universe', at: labelAt(universe.group, 0.72), camera, gap: 34 });
        return;
      }
      if (!quiet) await api.settle(e);
    },
    async settle(e) {
      ensure(e); mode = 'whole';
      ctx.spin.set([{ object: apple.root }], camera());
      await ctx.labels.show('one', { text: 'apple', at: labelAt(apple.root, 0.62), camera, gap: 54 });
    },
    // "apple" becomes "universe", and it is cut by nothing
    async split(e, { instant = false } = {}) {
      ensure(e); ctx.spin.set([], null);
      if (!instant) await ctx.labels.change('one', 'universe', { how: 'wipe' });
      if (!instant) await ctx.wait(0.35);
      // a vertical plane through it, at a random turn
      const a = Math.random() * Math.PI;
      const nW = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const nLocal = nW.clone().applyQuaternion(apple.root.quaternion.clone().invert());
      if (!instant) {
        // the cut's light, with no blade: a bright sheet across the apple, opening and gone
        seam.visible = true; seam.position.set(0, sit, 0);
        seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nW);
        await ctx.anim(0.28, (k, ee) => { seam.scale.set(0.05 + 1.3 * ee, 1.25, 1); seam.material.opacity = 0.9 * ee; }, ease.out);
      }
      const H = apple.cut(nLocal, 0);
      const laid = layHalves(H, nW);
      // from where they were cut to lying face up, apart: they fall open
      halves = laid;
      if (!instant) {
        ctx.anim(0.5, (k, ee) => { seam.material.opacity = 0.9 * (1 - ee); seam.scale.x = 1.35 + ee * 0.4; }, ease.out).then(() => { seam.visible = false; });
        // from as they were cut to lying face up, apart: they fall open
        mode = 'falling';
        await ctx.anim(0.85, (k, ee) => {
          for (const h of halves) {
            pose(h); const qEnd = h.g.quaternion.clone(), pEnd = h.g.position.clone();
            h.g.quaternion.slerpQuaternions(h.cutQ, qEnd, ee);
            h.g.position.lerpVectors(h.cutP, pEnd, ee); h.g.position.y += Math.sin(Math.PI * ee) * 0.12;
          }
        }, ease.inOut);
        halves.forEach((h, i) => { h.tilt.set(0.18 * (i ? 1 : -1), 0.12); });
      } else for (const h of halves) pose(h);
      mode = 'split';
      ctx.drag = drag; ctx.claimTap = claim;
      ctx.labels.hide('one', { how: 'fade' });
      ctx.labels.show('ua', { text: 'universe', at: labelAt(halves[0].g, 0.6), camera, gap: 50 });
      ctx.labels.show('ub', { text: 'universe', at: labelAt(halves[1].g, 0.6), camera, gap: 50, delay: 140 });
      setTimeout(() => ctx.ui.hint(matchMedia('(pointer: coarse)').matches ? 'drag a half to move it  ·  two fingers spin it  ·  tap it to turn it over' : 'drag a half to move it  ·  shift-drag spins it  ·  tap it to turn it over', 6500), instant ? 200 : 900);
    },
    // together, whole, risen, and the universe over the board
    async toUniverse(e) {
      ensure(e); ctx.drag = null; ctx.claimTap = null; ctx.ui.unhint();
      await ctx.labels.clear({ how: 'fade' });
      mode = 'joining';
      // face up again, and to the middle
      for (const h of halves) { h.flipTo = 0; h.vel.set(0, 0); }
      const from = halves.map((h) => ({ pos: h.pos.clone(), yaw: h.yaw, flip: h.flip }));
      const homes = halves.map((h) => { const d = h.pos.lengthSq() > 1e-4 ? h.pos.clone().normalize() : new THREE.Vector2(h.sgn, 0); return d.multiplyScalar(0.62); });
      await ctx.anim(1.1, (k, ee) => { halves.forEach((h, i) => { h.pos.lerpVectors(from[i].pos, homes[i], ee); h.yaw = from[i].yaw * (1 - ee); h.flip = from[i].flip * (1 - ee); h.tilt.set(0, 0); pose(h); }); }, ease.inOut);
      // rise and close: each back to where it was in the apple, the apple lifted over the board
      const q1 = halves.map((h) => h.g.quaternion.clone()), p1 = halves.map((h) => h.g.position.clone());
      apple.root.position.set(0, 1.5, 0);
      const goalQ = halves.map((h) => h.cutQ.clone());
      const goalP = halves.map((h) => h.cutP.clone().add(new THREE.Vector3(0, 1.5 - sit, 0)));
      await ctx.anim(1.5, (k, ee) => { halves.forEach((h, i) => { h.g.quaternion.slerpQuaternions(q1[i], goalQ[i], ee); h.g.position.lerpVectors(p1[i], goalP[i], ee); }); }, ease.inOut);
      for (const h of halves) holder.remove(h.g);
      halves = []; apple.uncut(); apple.root.visible = true;
      seam.visible = true; seam.position.copy(apple.root.position);
      ctx.anim(0.6, (k) => { seam.material.opacity = 0.8 * (1 - k); seam.scale.set(1.2, 1.2, 1); }, ease.out).then(() => { seam.visible = false; });
      universe.group.position.copy(apple.root.position); universe.group.scale.setScalar(0.85);
      mode = 'universe';
      await universe.becomeFrom(apple, { darken: (k) => { E.dim?.(k); glowK = k; } });
      ctx.spin.set([{ object: universe.spinner }], camera());
      await ctx.labels.show('one', { text: 'universe', at: labelAt(universe.group, 0.72), camera, gap: 34 });
    },
    universeCentre: () => universe.group.getWorldPosition(new THREE.Vector3()),
    async diveIn() {
      const cam = camera(), p0 = cam.position.clone(), q0 = cam.quaternion.clone(), target = universe.group.getWorldPosition(new THREE.Vector3());
      await ctx.anim(2.4, (k, ee) => { cam.position.lerpVectors(p0, target, ee * 0.96); universe.setRush(ee); }, ease.inExpo);
      cam.position.copy(p0); cam.quaternion.copy(q0); universe.setRush(0);
    },
  };
  return api;
}
