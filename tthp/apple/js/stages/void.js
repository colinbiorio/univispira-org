// void.js — the end of the chain: the universe on black, flowing endlessly, turned by a drag.
//
// Behind it, far stars, so that turning it shows that it turns. When the next
// tap comes, one point in it flares (somewhere at random among its outer
// stars), and the way back begins there (hexworld.js).
import * as THREE from 'three';
import { createUniverse } from './apple/universe.js';

export async function createVoid(ctx) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 500);
  const HOME = new THREE.Vector3(0, 0, 3.3);
  camera.position.copy(HOME); camera.lookAt(0, 0, 0);
  const universe = createUniverse(ctx, { seed: 29 });
  universe.setMorph(1);
  universe.group.scale.setScalar(1.05);
  scene.add(universe.group);
  // far stars
  const N = ctx.quality === 'lite' ? 2500 : 6000, p = new Float32Array(N * 3), c = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 120); p.set([v.x, v.y, v.z], i * 3);
    const b = 0.25 + Math.random() * 0.9, warm = Math.random(); c.set([b * (0.85 + 0.15 * warm), b * 0.9, b * (1.05 - 0.2 * warm)], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  scene.add(stars);
  // the point that flares, where the way back begins
  const disc = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,245,215,0.8)'); g.addColorStop(0.5, 'rgba(255,200,120,0.15)'); g.addColorStop(1, 'rgba(255,180,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); })();
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(3, 2.3, 1.45), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  flare.visible = false; universe.spinner.add(flare);

  const stage = {
    scene, camera,
    bloom: { strength: 0.85, radius: 0.7, threshold: 0.6 },
    exposure: 0.85,
    update(dt, t) { universe.update(dt, t); stars.rotation.y += dt * 0.002; },
  };
  return {
    stage, universe,
    async present() {
      camera.position.copy(HOME); camera.lookAt(0, 0, 0); camera.fov = 36; camera.updateProjectionMatrix();
      flare.visible = false; universe.setRush(0);
      ctx.spin.set([{ object: universe.spinner }], camera);
    },
    // a point flares somewhere among its outer stars; the eye goes to it (answers its place on the screen, 0..1)
    async flareAndDive(seconds = 2.2) {
      ctx.spin.set([], null);
      const dir = new THREE.Vector3().randomDirection();
      // in front, not behind the heart: the side toward the eye
      if (dir.z < 0) dir.z = -dir.z;
      flare.position.copy(dir.multiplyScalar(0.55 + Math.random() * 0.25));
      flare.visible = true; flare.scale.setScalar(0.02);
      await ctx.anim(0.9, (k, e) => { flare.material.opacity = e; flare.scale.setScalar(0.02 + 0.16 * e * (1 + 0.15 * Math.sin(k * 40))); }, ctx.ease.out);
      const at = flare.getWorldPosition(new THREE.Vector3());
      const p0 = camera.position.clone(), q0 = camera.quaternion.clone();
      const look = new THREE.Matrix4().lookAt(p0, at, camera.up), q1 = new THREE.Quaternion().setFromRotationMatrix(look);
      await ctx.anim(seconds, (k, e) => {
        camera.quaternion.slerpQuaternions(q0, q1, Math.min(1, e * 2.2));
        camera.position.lerpVectors(p0, at, e * 0.97);
        flare.scale.setScalar(0.18 + 0.4 * e);
      }, ctx.ease.inExpo);
      return ctx.screenOf(at, camera);
    },
  };
}
