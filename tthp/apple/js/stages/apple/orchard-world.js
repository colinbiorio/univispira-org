// orchard-world.js — the orchard around the apple: sky, light, grass, the apple tree, the rows beyond.
//
// A physical sky (three's Sky) at the late-afternoon hour, its light also the
// reflections in the apple's wax and the blade's steel (a PMREM of the same
// sky); a warm sun that casts shadows; grass in blades near the eye, swaying;
// one old apple tree, gnarled, its branches over the eye, leaves in clusters
// and apples hanging; rows of trees going away into the haze; motes of dust
// in the light.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const rand = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 21), THREE.MathUtils.degToRad(38));

export function makeSky(scene, renderer) {
  const sky = new Sky(); sky.scale.setScalar(4500);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.6; u.rayleigh.value = 2.1; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(SUN_DIR).multiplyScalar(4000);
  scene.add(sky);
  // the same sky as light: reflections and image-based fill
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(4500);
  sky2.material.uniforms.turbidity.value = 3.6; sky2.material.uniforms.rayleigh.value = 2.1;
  sky2.material.uniforms.mieCoefficient.value = 0.003; sky2.material.uniforms.mieDirectionalG.value = 0.8;
  sky2.material.uniforms.sunPosition.value.copy(u.sunPosition.value);
  envScene.add(sky2);
  // a ground under the reflected sky, so the apple's underside reflects grass, not more sky
  const gnd = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2b3a1a, side: THREE.BackSide }));
  envScene.add(gnd);
  const env = pm.fromScene(envScene, 0.02).texture;
  pm.dispose(); sky2.material.dispose(); gnd.geometry.dispose(); gnd.material.dispose();
  return { sky, env };
}

function grassTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, r = rand(5);
  for (let i = 0; i < S * S; i++) {
    const v = r();
    d[i * 4] = 52 + v * 40; d[i * 4 + 1] = 82 + v * 52; d[i * 4 + 2] = 24 + v * 22; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 2600; k++) { x.strokeStyle = `rgba(${90 + r() * 70},${120 + r() * 70},${40 + r() * 30},0.5)`; x.lineWidth = 1; const px = r() * S, py = r() * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 4, py - 6 - r() * 8); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.anisotropy = 8;
  return t;
}

function leafCardTexture() {
  // a few leaves on one card, alpha-cut
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d'), r = rand(11);
  for (let k = 0; k < 7; k++) {
    const cx = S * (0.2 + r() * 0.6), cy = S * (0.2 + r() * 0.6), a = r() * Math.PI * 2, L = S * (0.18 + r() * 0.12);
    x.save(); x.translate(cx, cy); x.rotate(a);
    const g = x.createLinearGradient(0, -L, 0, L); g.addColorStop(0, '#3f7a24'); g.addColorStop(1, '#2a5418');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, -L); x.bezierCurveTo(L * 0.45, -L * 0.5, L * 0.42, L * 0.4, 0, L); x.bezierCurveTo(-L * 0.42, L * 0.4, -L * 0.45, -L * 0.5, 0, -L); x.fill();
    x.strokeStyle = 'rgba(170,210,110,0.5)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -L); x.lineTo(0, L); x.stroke();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function barkTexture() {
  const W = 256, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data, r = rand(3);
  const cols = new Float32Array(W); for (let i = 0; i < W; i++) cols[i] = r();
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    const furrow = Math.abs(Math.sin((i / W) * Math.PI * 9 + Math.sin(y * 0.02 + i * 0.05) * 1.6));
    const v = 0.45 + 0.4 * furrow + 0.15 * cols[(i + (y >> 3)) % W];
    const k = (y * W + i) * 4; d[k] = 70 * v + 10; d[k + 1] = 58 * v + 8; d[k + 2] = 46 * v + 6; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// a tree: branches as tapered tubes (recursively), leaves in instanced cards at the twig ends, apples hanging
function makeTree({ seed = 1, height = 3.2, spread = 2.6, leaves = 1600, apples = 26, lite = false, barkMat, leafMat, appleMat }) {
  const r = rand(seed), tree = new THREE.Group();
  const branchGeos = [], tips = [];
  function branch(start, dir, len, radius, depth) {
    const pts = [start.clone()]; let p = start.clone(), d = dir.clone();
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      d.add(new THREE.Vector3((r() - 0.5) * 0.5, (r() - 0.35) * 0.35, (r() - 0.5) * 0.5)).normalize();
      p = p.clone().addScaledVector(d, len / segs); pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, lite ? 8 : 14, 1, lite ? 6 : 9, false);
    const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3(), ring = (lite ? 6 : 9) + 1, n = lite ? 8 : 14;
    for (let s = 0; s <= n; s++) { const t = s / n; curve.getPointAt(t, c); const rr = radius * (1 - 0.55 * t); for (let k = 0; k < ring; k++) { const i = s * ring + k; v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(rr); pos.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z); } }
    g.computeVertexNormals(); branchGeos.push(g);
    if (depth <= 0 || radius < 0.012) { tips.push({ p, d }); return; }
    const kids = depth >= 3 ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
    for (let k = 0; k < kids; k++) {
      const t = 0.45 + r() * 0.55, at = curve.getPointAt(t);
      const nd = curve.getTangentAt(t).add(new THREE.Vector3((r() - 0.5) * 1.6, 0.2 + r() * 0.5, (r() - 0.5) * 1.6)).normalize();
      branch(at, nd, len * (0.55 + r() * 0.2), radius * (0.48 + r() * 0.12), depth - 1);
    }
    tips.push({ p, d });
  }
  // the trunk leans a little and splits low, as old apple trees do
  branch(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0.12, 1, 0.05).normalize(), height * 0.42, 0.16, 0);
  const crown = new THREE.Vector3(0.12 * height * 0.42, height * 0.4, 0.03);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + r() * 0.8;
    branch(crown, new THREE.Vector3(Math.cos(a) * 0.9, 0.55 + r() * 0.4, Math.sin(a) * 0.9).normalize(), spread * (0.55 + r() * 0.25), 0.09, lite ? 2 : 3);
  }
  const merged = mergeTubes(branchGeos);
  const wood = new THREE.Mesh(merged, barkMat); wood.castShadow = true; wood.receiveShadow = true; tree.add(wood);
  // leaves: cards around the twig ends, facing every way
  const card = new THREE.PlaneGeometry(0.42, 0.42);
  const inst = new THREE.InstancedMesh(card, leafMat, leaves); inst.castShadow = true; inst.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pp = new THREE.Vector3();
  for (let i = 0; i < leaves; i++) {
    const tip = tips[Math.floor(r() * tips.length)];
    pp.copy(tip.p).add(new THREE.Vector3((r() - 0.5) * 0.7, (r() - 0.3) * 0.5, (r() - 0.5) * 0.7));
    e.set(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2); q.setFromEuler(e);
    const sc = 0.7 + r() * 0.6; s.set(sc, sc, sc);
    m.compose(pp, q, s); inst.setMatrixAt(i, m);
    const shade = 0.75 + r() * 0.4; inst.setColorAt(i, new THREE.Color(shade, shade * (0.95 + r() * 0.1), shade * 0.85));
  }
  tree.add(inst);
  // apples hanging below the outer twigs
  if (apples) {
    const ag = new THREE.SphereGeometry(0.055, 14, 10); ag.scale(1, 0.9, 1);
    const ai = new THREE.InstancedMesh(ag, appleMat, apples); ai.castShadow = true;
    for (let i = 0; i < apples; i++) {
      const tip = tips[Math.floor(r() * tips.length)];
      pp.copy(tip.p).add(new THREE.Vector3((r() - 0.5) * 0.5, -0.12 - r() * 0.15, (r() - 0.5) * 0.5));
      m.compose(pp, q.identity(), s.setScalar(0.85 + r() * 0.35)); ai.setMatrixAt(i, m);
    }
    tree.add(ai);
  }
  return tree;
}
function mergeTubes(geos) {
  let count = 0; for (const g of geos) count += g.index ? g.index.count : g.attributes.position.count;
  const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i) * 4); }
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    base += p.count; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  m.setIndex(idx); return m;
}

// grass blades near the eye, swaying in the wind
function makeGrass(count, radius, lite) {
  const blade = new THREE.PlaneGeometry(0.035, 0.32, 1, 4); blade.translate(0, 0.16, 0);
  { const p = blade.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.32; p.setX(i, p.getX(i) * (1 - y * 0.85)); } }
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f8f2e, roughness: 0.85, side: THREE.DoubleSide });
  mat.userData.time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vTip;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h = position.y / 0.32; vTip = h;
        float wind = sin(uTime * 1.6 + wpos.x * 0.8 + wpos.z * 0.5) * 0.5 + sin(uTime * 2.7 + wpos.x * 2.1) * 0.25;
        transformed.x += wind * 0.08 * h * h; transformed.z += wind * 0.04 * h * h;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTip;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.45, 1.15, vTip); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.38), smoothstep(0.75, 1.0, vTip) * 0.35);');
  };
  const inst = new THREE.InstancedMesh(blade, mat, count); inst.receiveShadow = true;
  const r = rand(9), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    p.set(Math.cos(a) * d, 0, Math.sin(a) * d + 0.5);         // to under the eye, which stands far back on a narrow screen
    e.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3); q.setFromEuler(e);
    const k = 0.6 + r() * 0.9; s.set(k, k * (0.7 + r() * 0.6), k);
    m.compose(p, q, s); inst.setMatrixAt(i, m);
    const c = 0.8 + r() * 0.4; inst.setColorAt(i, new THREE.Color(c, c, c * 0.9));
  }
  inst.userData.centre = new THREE.Vector3(0, 0, 0.5); inst.userData.radius = radius;
  return { mesh: inst, mat };
}

export function createOrchardWorld(scene, renderer, { quality = 'high' } = {}) {
  const lite = quality === 'lite';
  const group = new THREE.Group(); scene.add(group);
  const { sky, env } = makeSky(scene, renderer);
  scene.environment = env;
  scene.fog = new THREE.Fog(0xb4c8d8, 26, 150);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(14);
  sun.castShadow = true; sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a4a22, 0.55); scene.add(hemi);
  // the ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95, color: 0xb9c79a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);
  // hills far off
  const hills = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 96, 96), new THREE.MeshStandardMaterial({ color: 0x6f8c4a, roughness: 1 }));
  { const p = hills.geometry.attributes.position, rr = rand(21); const offs = Array.from({ length: 6 }, () => [rr() * 6, rr() * 6]);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), d = Math.hypot(x, y); let h = 0; offs.forEach(([a, b], k) => { h += Math.sin(x * 0.012 * (k + 1) + a) * Math.cos(y * 0.011 * (k + 1) + b) * (9 / (k + 1)); }); p.setZ(i, Math.max(0, h + 4) * THREE.MathUtils.smoothstep(d, 60, 160)); }
    hills.geometry.computeVertexNormals(); }
  hills.rotation.x = -Math.PI / 2; hills.position.y = -0.05; group.add(hills);
  // the trees
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.92, color: 0xd8cfc4 });
  const leafMat = new THREE.MeshStandardMaterial({ map: leafCardTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, color: 0xd6e0c4 });
  const littleApples = new THREE.MeshPhysicalMaterial({ color: 0xa3141c, roughness: 0.35, clearcoat: 0.6 });
  const near = makeTree({ seed: 7, height: 3.6, spread: 3.0, leaves: lite ? 1600 : 3200, apples: 36, lite, barkMat, leafMat, appleMat: littleApples });
  near.position.set(1.55, 0, -1.7); near.rotation.y = -0.6; group.add(near);
  const rows = new THREE.Group(); group.add(rows);
  const rowTrees = [];
  const variants = [11, 23, 31].map((sd) => makeTree({ seed: sd, height: 2.8, spread: 2.2, leaves: lite ? 500 : 900, apples: 10, lite: true, barkMat, leafMat, appleMat: littleApples }));
  const rr = rand(41);
  for (let row = -3; row <= 3; row++) for (let k = 0; k < (lite ? 7 : 10); k++) {
    const x = row * 5.5 + (rr() - 0.5) * 0.6, z = -7 - k * 5 + (rr() - 0.5) * 0.8;
    if (Math.abs(x - 1.5) < 2.2 && z > -9) continue;
    const t = variants[(row + k + 30) % 3].clone(); t.position.set(x, 0, z); t.rotation.y = rr() * Math.PI * 2; t.scale.setScalar(0.85 + rr() * 0.3);
    rows.add(t); rowTrees.push(t);
  }
  // grass
  const grass = makeGrass(lite ? 11000 : 32000, 6.5, lite); group.add(grass.mesh);
  // dust in the light
  const NM = lite ? 160 : 360, mp = new Float32Array(NM * 3), mr = rand(51);
  for (let i = 0; i < NM; i++) { mp[i * 3] = (mr() - 0.5) * 6; mp[i * 3 + 1] = 0.3 + mr() * 2.6; mp[i * 3 + 2] = (mr() - 0.5) * 4 - 0.5; }
  const motesGeo = new THREE.BufferGeometry(); motesGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ size: 0.022, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2d0, opacity: 0.75 }));
  group.add(motes);
  const base = mp.slice();

  const fogDay = scene.fog.color.clone(), sunDay = sun.color.clone();
  // the sun's height in degrees: the sky, the sunlight and the fog follow it (to below the horizon: night)
  function setSunElevation(deg) {
    const d = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - deg), THREE.MathUtils.degToRad(38));
    sky.material.uniforms.sunPosition.value.copy(d).multiplyScalar(4000);
    sun.position.copy(d).multiplyScalar(14);
    const k = THREE.MathUtils.clamp((21 - deg) / 37, 0, 1);
    sun.color.copy(sunDay).lerp(new THREE.Color(1.0, 0.42, 0.18), Math.min(1, k * 1.6));
    scene.fog.color.copy(fogDay).lerp(new THREE.Color(0.18, 0.1, 0.12), Math.min(1, k * 1.3)).lerp(new THREE.Color(0, 0, 0), THREE.MathUtils.smoothstep(k, 0.6, 1));
  }
  return {
    group, sky, sun, hemi, env, fog: scene.fog, ground, setSunElevation,
    trees: [near, ...rowTrees], grassMesh: grass.mesh,      // for the orchard's copy, small, on the six-sided planet (hexworld.js)
    update(dt, t) {
      grass.mat.userData.time.value = t;
      for (let i = 0; i < NM; i++) { mp[i * 3] = base[i * 3] + Math.sin(t * 0.21 + i) * 0.15; mp[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.17 + i * 1.7) * 0.12; }
      motesGeo.attributes.position.needsUpdate = true;
      near.rotation.z = Math.sin(t * 0.4) * 0.004;
    },
  };
}
