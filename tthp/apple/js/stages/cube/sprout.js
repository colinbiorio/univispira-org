// cube/sprout.js — the seedling. The stem comes up bent in a hook (the way a bean's does, its tip and
// folded seed leaves dragged up behind it, still in the soil), the hook opens and pulls them out, they
// part and spread, and the first true leaves unfold between them. The stem is a tube rebuilt along
// its curve every frame; the leaves are cupped, translucent cards drawn once on a canvas.
import * as THREE from 'three';
import { rng, smooth, lerp } from './glsl.js';
import { patch } from './patch.js';

const NS = 48, NR = 12;

function leafGeometry(w, l, cup, arch) {
  const g = new THREE.PlaneGeometry(1, 1, 10, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i) + 0.5, x = u * w;
    p.setXYZ(i, x, v * l, cup * x * x / w - arch * v * v * l);
  }
  g.computeVertexNormals();
  return g;
}

function leafTexture(kind) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rng(kind === 'cot' ? 3 : 9);
  // the outline: a fleshy oval for a seed leaf; a pointed, toothed blade for a true leaf
  const hw = (v) => {
    if (kind === 'cot') return v < 0.1 ? 0.05 + v * 0.6 : 0.47 * Math.pow(Math.sin(Math.PI * Math.min(1, (v - 0.04) / 0.98)), 0.62);
    const base = v < 0.08 ? 0.03 + v * 0.4 : 0.44 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, (v - 0.05) / 0.95), 0.85)), 0.95);
    const tooth = v > 0.18 && v < 0.94 ? 0.035 * (1 - ((v * 13) % 1)) : 0;
    return Math.max(0, base + tooth * (base > 0.05 ? 1 : 0));
  };
  g.beginPath();
  for (let i = 0; i <= 200; i++) { const v = i / 200; g.lineTo(S / 2 + hw(v) * S, S - v * S); }
  for (let i = 200; i >= 0; i--) { const v = i / 200; g.lineTo(S / 2 - hw(v) * S, S - v * S); }
  g.closePath();
  const grad = g.createLinearGradient(0, S, 0, 0);
  if (kind === 'cot') { grad.addColorStop(0, 'rgb(150,170,80)'); grad.addColorStop(0.35, 'rgb(118,160,62)'); grad.addColorStop(1, 'rgb(104,150,56)'); }
  else { grad.addColorStop(0, 'rgb(70,118,42)'); grad.addColorStop(1, 'rgb(58,108,36)'); }
  g.fillStyle = grad; g.fill();
  g.save(); g.clip();
  // veins: a midrib, and the side veins running out to the edge
  g.strokeStyle = kind === 'cot' ? 'rgba(190,205,120,0.55)' : 'rgba(150,185,95,0.7)'; g.lineWidth = kind === 'cot' ? 3 : 4;
  g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, S * 0.06); g.stroke();
  g.lineWidth = 1.6;
  for (let k = 1; k < (kind === 'cot' ? 6 : 10); k++) {
    const v = k / (kind === 'cot' ? 6 : 10) * 0.85 + 0.05, y = S - v * S;
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(S / 2, y); g.quadraticCurveTo(S / 2 + sd * hw(v) * S * 0.5, y - S * 0.07, S / 2 + sd * hw(v + 0.08) * S * 0.92, y - S * 0.14); g.stroke(); }
  }
  // the texture of a living surface: mottling and a darker rim
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '30,60,20' : '200,220,140'},${0.04 + R() * 0.05})`; g.fillRect(R() * S, R() * S, 2 + R() * 3, 2 + R() * 3); }
  g.restore();
  g.strokeStyle = kind === 'cot' ? 'rgba(80,110,40,0.6)' : 'rgba(40,80,25,0.6)'; g.lineWidth = 2; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createSprout(ctx, { sunU, bend = new THREE.Vector3(1, 0, 0.35) } = {}) {
  const group = new THREE.Group();
  const vcount = (NS + 1) * (NR + 1);
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), col = new Float32Array(vcount * 3), idx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + 1, c = a + NR + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.05, 0), 0.2);
  const stemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, envMapIntensity: 0.9 });
  const stem = new THREE.Mesh(geo, stemMat);
  stem.castShadow = stem.receiveShadow = true;
  group.add(stem);

  const translucent = (m, name) => patch(m, name, {
    uniforms: sunU, fragmentHead: 'uniform vec3 uSunV; uniform vec3 uSunC;',
    lightsEnd: 'reflectedLight.directDiffuse += diffuseColor.rgb * uSunC * max(0.0, -dot(normal, uSunV)) * 0.45;',
  });
  const cotMat = translucent(new THREE.MeshStandardMaterial({ map: leafTexture('cot'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.36, metalness: 0, envMapIntensity: 0.9 }), 'cot');
  const trueMat = translucent(new THREE.MeshStandardMaterial({ map: leafTexture('true'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.48, metalness: 0, envMapIntensity: 0.8 }), 'trueleaf');
  const cotGeo = leafGeometry(0.019, 0.028, 0.45, 0.12), trueGeo = leafGeometry(1, 2.3, 0.35, 0.18);
  const leaf = (g, m) => { const l = new THREE.Mesh(g, m); l.castShadow = true; l.receiveShadow = true; group.add(l); return l; };
  const cots = [leaf(cotGeo, cotMat), leaf(cotGeo, cotMat)], trues = [leaf(trueGeo, trueMat), leaf(trueGeo, trueMat)];

  const bendDir = bend.clone().setY(0).normalize(), up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, bendDir).normalize();
  const cp = [], tip = new THREE.Vector3(), tipT = new THREE.Vector3();
  for (let i = 0; i <= NS; i++) cp.push(new THREE.Vector3());
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N2 = new THREE.Vector3(), c3 = new THREE.Color();
  const red = new THREE.Color(0.2, 0.055, 0.05), green = new THREE.Color(0.12, 0.27, 0.05), light = new THREE.Color(0.24, 0.42, 0.1), pale = new THREE.Color(0.40, 0.42, 0.14);

  // the stem along a curve whose bending sits in its top hookLen: phi radians there in all
  function buildStem(L, phi, hookLen, depth, sway, hook) {
    const ds = L / NS; let x = 0, y = -depth, ang = 0;
    for (let i = 0; i <= NS; i++) {
      const s = i * ds;
      cp[i].set(x, y, ang);
      const k = (s > L - hookLen ? phi / hookLen : 0) + sway / L;
      const a2 = ang + k * ds * 0.5;
      x += Math.sin(a2) * ds; y += Math.cos(a2) * ds; ang += k * ds;
    }
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, [x0, y0, a0] = [cp[i].x, cp[i].y, cp[i].z];
      P.copy(bendDir).multiplyScalar(x0).addScaledVector(up, y0);
      T.copy(bendDir).multiplyScalar(Math.sin(a0)).addScaledVector(up, Math.cos(a0));
      N2.crossVectors(T, side);
      const r = 0.0016 * (1 + 0.12 * Math.sin(Math.PI * s)) * (1 - 0.25 * smooth(0.86, 1, s)) * (i === NS ? 0.6 : 1);
      c3.copy(red).lerp(green, smooth(-0.004, 0.014, y0)).lerp(light, smooth(0.6, 1, s) * 0.5).lerp(pale, smooth(0.55, 1, s) * hook * 0.8);
      for (let j = 0; j <= NR; j++) {
        const a = j / NR * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (i * (NR + 1) + j) * 3;
        const nx = side.x * ca + N2.x * sa, ny = side.y * ca + N2.y * sa, nz = side.z * ca + N2.z * sa;
        pos[k] = P.x + nx * r; pos[k + 1] = P.y + ny * r; pos[k + 2] = P.z + nz * r;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
        col[k] = c3.r; col[k + 1] = c3.g; col[k + 2] = c3.b;
      }
      if (i === NS) { tip.copy(P); tipT.copy(T); }
    }
    geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = geo.attributes.color.needsUpdate = true;
  }

  // the leaves at the tip: seed leaves spread along the bend, true leaves across it
  const A = new THREE.Vector3(), D = new THREE.Vector3(), along = new THREE.Vector3(), nrm = new THREE.Vector3(), X = new THREE.Vector3(), m4 = new THREE.Matrix4();
  function placeLeaf(mesh, at, t, spread, sign, alpha, scale) {
    D.copy(spread).addScaledVector(t, -spread.dot(t)).normalize();
    A.crossVectors(t, D).normalize();
    along.copy(t).applyAxisAngle(A, sign * alpha);
    nrm.copy(D).multiplyScalar(-sign).applyAxisAngle(A, sign * alpha);
    X.crossVectors(along, nrm).normalize();
    m4.makeBasis(X, along, nrm);
    mesh.quaternion.setFromRotationMatrix(m4);
    mesh.position.copy(at);
    mesh.scale.setScalar(Math.max(1e-4, scale));
    mesh.visible = scale > 1e-3;
  }
  const at2 = new THREE.Vector3(), sideT = new THREE.Vector3();
  function leaves(tipP, tipDir, cotA, trueK, trueA, inter, cotScale = 1) {
    for (let i = 0; i < 2; i++) placeLeaf(cots[i], tipP, tipDir, side, i ? 1 : -1, cotA, cotScale);
    at2.copy(tipP).addScaledVector(tipDir, inter);
    sideT.crossVectors(tipDir, side).normalize();
    for (let i = 0; i < 2; i++) placeLeaf(trues[i], at2, tipDir, sideT, i ? 1 : -1, trueA, 0.018 * trueK * cotScale);
  }

  const out = {
    group, tip, tipT,
    // t: seconds into its own life (about 6.5)
    pose(t) {
      stem.visible = true;
      const L = t < 2.4 ? lerp(0.006, 0.034, smooth(0.6, 2.4, t)) : t < 3.9 ? lerp(0.034, 0.06, smooth(2.4, 3.9, t)) : lerp(0.06, 0.077, smooth(3.9, 6.0, t));
      const phi = Math.PI * (1 - smooth(2.3, 3.9, t)) * 0.97 + 0.08 * (1 - smooth(3.9, 5.6, t));
      const hook = 1 - smooth(2.3, 4.2, t);
      buildStem(L, phi, 0.026, 0.012, 0.05 * Math.sin(t * 1.1) * smooth(3.5, 5, t), hook);
      const k = smooth(3.4, 4.9, t), cotA = (75 * Math.PI / 180) * (k + 0.12 * Math.sin(Math.PI * k) * (1 - k));
      const tk = smooth(4.6, 6.3, t);
      leaves(tip, tipT, cotA, tk, (10 + 40 * smooth(4.9, 6.4, t)) * Math.PI / 180, 0.009 * smooth(4.5, 6.0, t));
    },
    // while the tree grows from it: no stem of its own, the leaves riding the trunk's tip and falling away
    ride(H, g) {
      stem.visible = false;
      tip.set(0, H, 0);
      const k = 1 - smooth(0.06, 0.2, g);
      leaves(tip, up, 75 * Math.PI / 180, 1, 48 * Math.PI / 180, 0.009, k);
    },
    hide() { group.visible = false; },
    show() { group.visible = true; },
  };
  out.pose(0);
  return out;
}
