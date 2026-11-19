// spin.js — turn a thing any way at all, and let it keep turning a little.
//
// A drag turns the thing under the finger (or the first one offered) about
// the axis across the drag, in the eye's own frame, so up is always up and
// left is always left whatever way it already faces; let go, and it keeps the
// turn it was given, slowing.
import * as THREE from 'three';

export function createSpin() {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const right = new THREE.Vector3(), upv = new THREE.Vector3(), axis = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion();
  let targets = [], camera = null, held = null, last = 0;
  const velocity = new Map();   // object -> { axis, speed (rad/s) }

  function turn(obj, ax, angle) {
    // a turn about a world axis, written into the object's own (parent-relative) rotation
    q.setFromAxisAngle(ax, angle);
    if (obj.parent) { obj.parent.getWorldQuaternion(pq); q.premultiply(pq.clone().invert()).multiply(pq); }
    obj.quaternion.premultiply(q);
  }
  return {
    // what may be turned now, and the eye it is seen through ([] for nothing)
    set(list, cam) { targets = list || []; camera = cam; held = null; for (const k of [...velocity.keys()]) if (!targets.some((t) => t.object === k)) velocity.delete(k); },
    get active() { return targets.length > 0; },
    start(x, y, el) {
      if (!targets.length || !camera) return false;
      held = targets[0];
      if (targets.length > 1) {
        const r = el.getBoundingClientRect();
        ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        let best = null, bd = Infinity;
        for (const t of targets) {
          const hit = ray.intersectObject(t.hit || t.object, true)[0];
          if (hit && hit.distance < bd) { bd = hit.distance; best = t; }
        }
        if (!best) {   // nothing under the finger: the one nearest it on the screen
          const p = new THREE.Vector3();
          for (const t of targets) { t.object.getWorldPosition(p).project(camera); const d = Math.hypot(p.x - ndc.x, (p.y - ndc.y)); if (d < bd) { bd = d; best = t; } }
        }
        held = best || targets[0];
      }
      velocity.delete(held.object); last = performance.now();
      return true;
    },
    move(dx, dy) {
      if (!held || !camera) return;
      right.setFromMatrixColumn(camera.matrixWorld, 0); upv.setFromMatrixColumn(camera.matrixWorld, 1);
      axis.copy(upv).multiplyScalar(dx).addScaledVector(right, dy);
      const len = Math.hypot(dx, dy); if (len < 1e-6) return;
      axis.normalize();
      const angle = len * 0.0085;
      turn(held.object, axis, angle);
      const now = performance.now(), dt = Math.max(8, now - last) / 1000; last = now;
      const v = velocity.get(held.object) || { axis: axis.clone(), speed: 0 };
      v.axis.lerp(axis, 0.5).normalize(); v.speed = v.speed * 0.4 + (angle / dt) * 0.6;
      velocity.set(held.object, v);
      held.onTurn?.();
    },
    end() {
      if (held && performance.now() - last > 90) velocity.delete(held.object);   // held still before letting go: no fling
      held = null;
    },
    update(dt) {
      for (const [obj, v] of velocity) {
        if (held && held.object === obj) continue;
        turn(obj, v.axis, v.speed * dt);
        v.speed *= Math.exp(-1.6 * dt);
        if (v.speed < 0.02) velocity.delete(obj);
      }
    },
  };
}
