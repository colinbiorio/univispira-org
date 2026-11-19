// city.js — Wilmington from a few kilometres up to one roof: the satellite
// ground (Sentinel-2, 16 Oct 2025) and, at its centre, a made-up neighbourhood
// of live oaks, pines, porches and pools (no real house, no real address),
// a deck of fair-weather cumulus to pass through, and the one roof with the
// skylight the eye goes in by.
//
// Units are metres; +x east, +y up, -z north; the origin is the skylight.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bake, bakeShingles } from './bake.js';

export const CLOUD_SIZE = 12000;         // the cumulus field covers 12 km square around the town
export const CLOUD_BASE = 800, CLOUD_TOP = 1800;

// ---- a seeded random
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- the cumulus field (density in r), baked once; the globe uses it too, so the deck is the same from both
const CLOUDS = /* glsl */`
  uniform float size;
  void main() {
    vec2 p = (vUv - 0.5) * size;
    float f = fbm(p / 1100.0 + 3.1) * 0.55 + fbm(p / 330.0 + 7.3) * 0.3 + fbm(p / 95.0 + 1.7) * 0.15;
    float c = smoothstep(0.5, 0.7, f);
    vec2 q = p - vec2(80.0, -40.0);
    float blob = 1.0 - length(q / vec2(640.0, 540.0)) + (fbm(p / 240.0 + 4.0) - 0.5) * 1.1 + (fbm(p / 70.0 + 9.0) - 0.5) * 0.3;
    c = max(c, smoothstep(0.0, 0.4, blob) * (0.5 + 0.2 * f));
    c *= smoothstep(0.5 * size, 0.38 * size, max(abs(p.x), abs(p.y)));
    gl_FragColor = vec4(c, c, c, 1.0);
  }`;
export function bakeCloudField(renderer, px) {
  return bake(renderer, px, px, CLOUDS, { uniforms: { size: { value: CLOUD_SIZE } }, srgb: false });
}

// shared: soft cloud shadows on everything lit by the sun (sampled where the sunbeam crosses the deck)
const cloudShadowUniforms = { tCloudField: { value: null }, sunXZ: { value: new THREE.Vector2(0, 0) }, shadowOn: { value: 1 } };
function withCloudShadow(mat, extra = null, key = 'base') {
  mat.customProgramCacheKey = () => 'tthp-earth-' + key;   // each variant its own program (the hook's source is the same for all)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cloudShadowUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPc;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wpc = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n wpc = instanceMatrix * wpc;\n#endif\n vWPc = (modelMatrix * wpc).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPc; uniform sampler2D tCloudField; uniform vec2 sunXZ; uniform float shadowOn;
      float cloudShade() {
        vec2 q = vWPc.xz + sunXZ * (${((CLOUD_BASE + CLOUD_TOP) / 2).toFixed(1)} - vWPc.y);
        vec2 uv = vec2(q.x / ${CLOUD_SIZE.toFixed(1)} + 0.5, -q.y / ${CLOUD_SIZE.toFixed(1)} + 0.5);
        float c = texture2D(tCloudField, uv).r;
        return 1.0 - 0.78 * smoothstep(0.05, 0.6, c) * shadowOn;
      }`)
      .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= cloudShade();');
    extra?.(sh);
  };
  return mat;
}

// a leafy canopy: clumps of leaves in the colour and in the light. The noise is a small tiling 3-D texture
// holding a value and its gradient, so a crown costs three texture reads a pixel, not a hundred hashes.
let leafTex = null;
function leafNoise() {
  if (leafTex) return leafTex;
  const N = 32, L = 8, r = rng(4242), lat = new Float32Array(L * L * L).map(() => r());
  const at = (x, y, z) => lat[((z % L) * L + (y % L)) * L + (x % L)];
  const v = new Float32Array(N * N * N);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * L, fy = (y / N) * L, fz = (z / N) * L, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = sm(fx - ix), ty = sm(fy - iy), tz = sm(fz - iz);
    const c = (dx, dy, dz) => at(ix + dx, iy + dy, iz + dz);
    const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * tx, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * tx;
    const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * tx, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * tx;
    v[(z * N + y) * N + x] = (x00 + (x10 - x00) * ty) + ((x01 + (x11 - x01) * ty) - (x00 + (x10 - x00) * ty)) * tz;
  }
  const d = new Uint8Array(N * N * N * 4), w = (i) => (i + N) % N, V = (x, y, z) => v[(w(z) * N + w(y)) * N + w(x)];
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = ((z * N + y) * N + x) * 4, k = 0.5 * N / L;   // gradient per lattice cell, about -1..1
    d[i] = V(x, y, z) * 255;
    d[i + 1] = Math.max(0, Math.min(255, 127.5 + (V(x + 1, y, z) - V(x - 1, y, z)) * k * 127.5 / 1.5));
    d[i + 2] = Math.max(0, Math.min(255, 127.5 + (V(x, y + 1, z) - V(x, y - 1, z)) * k * 127.5 / 1.5));
    d[i + 3] = Math.max(0, Math.min(255, 127.5 + (V(x, y, z + 1) - V(x, y, z - 1)) * k * 127.5 / 1.5));
  }
  leafTex = new THREE.Data3DTexture(d, N, N, N);
  leafTex.format = THREE.RGBAFormat; leafTex.type = THREE.UnsignedByteType;
  leafTex.minFilter = leafTex.magFilter = THREE.LinearFilter;
  leafTex.wrapS = leafTex.wrapT = leafTex.wrapR = THREE.RepeatWrapping;
  leafTex.needsUpdate = true;
  return leafTex;
}
function leafy(mat, scale = 1.0) {
  const tex = leafNoise();
  return withCloudShadow(mat, (sh) => {
    sh.uniforms.tLeaf = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLY = position.y;');
    // one lattice cell is 1/8 of the texture: p * scale / 8 puts a clump of leaves about 1/scale metres across
    const s1 = (scale / 8).toFixed(4), s2 = (scale * 2.9 / 8).toFixed(4), s3 = (scale * 7.0 / 8).toFixed(4);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vLY; uniform highp sampler3D tLeaf;
      vec4 leafAt(vec3 p) {   // .x the leaves' value (0..1), .yzw its gradient per metre
        vec4 a = texture(tLeaf, p * ${s1}), b = texture(tLeaf, p * ${s2} + 0.37), c = texture(tLeaf, p * ${s3} + 0.71);
        float v = a.r * 0.5 + b.r * 0.32 + c.r * 0.18;
        vec3 g = (a.gba - 0.5) * ${(scale * 1.5).toFixed(3)} * 0.5 + (b.gba - 0.5) * ${(scale * 2.9 * 1.5).toFixed(3)} * 0.32 + (c.gba - 0.5) * ${(scale * 7.0 * 1.5).toFixed(3)} * 0.18;
        return vec4(v, g);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 LF = leafAt(vWPc);
        diffuseColor.rgb *= (0.5 + 0.85 * smoothstep(0.12, 0.88, LF.x)) * mix(0.55, 1.06, smoothstep(-0.28, 0.3, vLY));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal - (viewMatrix * vec4(LF.yzw, 0.0)).xyz * 2.4);`);
  }, 'leafy' + scale);
}

// ---- geometry
function gableGeo() {   // unit: base x[-.5,.5] z[-.5,.5] at y 0, ridge along x at y 1
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,       // south slope
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,    // north slope
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,    // gable ends
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
function hipGeo(k = 0.32) {   // unit hip: ridge from -k to k along x at y 1
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, k, 1, 0, -0.5, 0, 0.5, k, 1, 0, -k, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -k, 1, 0, 0.5, 0, -0.5, -k, 1, 0, k, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -k, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, k, 1, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
function softBlob(g, cx, cy, cz, ox, oy, oz) {   // normals out from the blob's centre and the whole canopy's: a soft round look
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let j = 0; j < p.count; j++) {
    v.set(p.getX(j) - cx, (p.getY(j) - cy) * 0.8, p.getZ(j) - cz).normalize();
    w.set(p.getX(j) - ox, p.getY(j) - oy, p.getZ(j) - oz).normalize();
    v.multiplyScalar(0.55).addScaledVector(w, 0.45).normalize();
    n.setXYZ(j, v.x, v.y, v.z);
  }
  return g;
}
function canopyGeo(seed, blobs, flat, detail = 2) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.35 + r() * 0.45;
    const s = i === 0 ? 0.62 : 0.32 + r() * 0.3;
    const g = new THREE.IcosahedronGeometry(s, detail);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) { const x = p.getX(j), y = p.getY(j), z = p.getZ(j); const n = 1 + (Math.sin(x * 9 + seed) * Math.cos(z * 8 - i) * Math.sin(y * 7 + i)) * 0.12; p.setXYZ(j, x * n, y * n * flat, z * n); }
    const cx = Math.cos(a) * d * 0.8, cy = (r() - 0.35) * 0.35 * flat + (1 - d) * 0.2, cz = Math.sin(a) * d * 0.8;
    g.translate(cx, cy, cz);
    parts.push(softBlob(g, cx, cy, cz, 0, -0.25 * flat, 0));
  }
  return mergeGeometries(parts);
}
function pineGeo(seed) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = 0.15 + r() * 0.6;
    const g = new THREE.IcosahedronGeometry(0.26 + r() * 0.16, 1);
    g.scale(1, 0.5, 1);
    const cx = Math.cos(a) * d, cy = 0.55 + r() * 0.4, cz = Math.sin(a) * d;
    g.translate(cx, cy, cz);
    parts.push(softBlob(g, cx, cy, cz, 0, 0.4, 0));
  }
  return mergeGeometries(parts);
}
function carGeo() {   // body + a cabin with dark glass, coloured per vertex (glass dark, paint white x instance colour)
  const body = new THREE.BoxGeometry(4.5, 0.75, 1.8); body.translate(0, 0.55, 0);
  const cab = new THREE.BoxGeometry(2.3, 0.55, 1.55); cab.translate(-0.25, 1.2, 0);
  const cp = cab.attributes.position;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); if (y > 1.3) { cp.setX(i, cp.getX(i) * 0.78 - 0.1); cp.setZ(i, cp.getZ(i) * 0.9); } }
  const colorize = (g, fn) => { const p = g.attributes.position, n = g.attributes.normal, c = []; for (let i = 0; i < p.count; i++) { const v = fn(p.getY(i), n.getY(i)); c.push(v, v, v); } g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; };
  cab.computeVertexNormals();
  const a = colorize(body.toNonIndexed(), () => 1), b = colorize(cab.toNonIndexed(), (y, ny) => (ny > 0.9 ? 1 : 0.05));
  const m = mergeGeometries([a, b]); m.computeVertexNormals();
  return m;
}

// ---- the plan of the neighbourhood
function plan(lite) {
  const r = rng(20261118);
  const HALF = lite ? 700 : 960, KEEP0 = HALF * 0.5, KEEP1 = HALF * 0.97;
  const TH = 0.2, cu = Math.cos(TH), su = Math.sin(TH);
  const BU = 150, BV = 96, RW = 17;
  const lots = [], houses = [], roofs = [], trees = [], cars = [], pools = [], drives = [], beds = [], shrubs = [];
  const W = (u, v) => [u * cu - v * su, u * su + v * cu];
  const keep = (x, z) => { const a = Math.atan2(z, x), f = 0.84 + 0.1 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 7 + 2) + 0.03 * Math.sin(a * 13);
    const d = (Math.hypot(x, z) + (Math.sin(x * 0.013) + Math.cos(z * 0.011)) * 30) / f; return d < KEEP0 ? 1 : d > KEEP1 ? 0 : 1 - (d - KEEP0) / (KEEP1 - KEEP0); };
  const nI = Math.ceil(HALF * 1.45 / BU), nJ = Math.ceil(HALF * 1.45 / BV);
  const uL = [], vL = [];
  for (let u = -nI * BU; u <= nI * BU; u += 118 + r() * 64) uL.push(u + (r() - 0.5) * 6);
  for (let v = -nJ * BV; v <= nJ * BV; v += 84 + r() * 30) vL.push(v + (r() - 0.5) * 5);
  const roofCols = [[0.13, 0.125, 0.12], [0.22, 0.22, 0.23], [0.33, 0.32, 0.31], [0.27, 0.2, 0.16], [0.2, 0.15, 0.12], [0.22, 0.25, 0.28], [0.24, 0.28, 0.23], [0.42, 0.41, 0.4], [0.42, 0.24, 0.17], [0.56, 0.58, 0.6], [0.16, 0.24, 0.2]];
  const roofW = [14, 16, 12, 10, 9, 8, 7, 6, 3, 4, 2];
  const pick = (arr, w) => { let t = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { t -= w[i]; if (t <= 0) return arr[i]; } return arr[0]; };
  const wallCols = [[0.86, 0.85, 0.8], [0.9, 0.86, 0.74], [0.78, 0.8, 0.78], [0.72, 0.76, 0.8], [0.7, 0.74, 0.66], [0.62, 0.36, 0.28], [0.95, 0.94, 0.92]];
  const carCols = [[0.85, 0.86, 0.87], [0.05, 0.05, 0.06], [0.45, 0.47, 0.5], [0.62, 0.64, 0.66], [0.12, 0.2, 0.42], [0.5, 0.07, 0.06], [0.2, 0.26, 0.2], [0.55, 0.5, 0.42]];
  const carW = [25, 20, 16, 14, 8, 8, 4, 5];
  const addTree = (u, v, kind, R, H, k = 1) => {
    const [x, z] = W(u, v);
    if (r() > k) return;
    let col;
    if (kind === 0) col = r() < 0.25 ? [0.12, 0.145, 0.095] : [0.075 + r() * 0.025, 0.12 + r() * 0.04, 0.048 + r() * 0.018];
    else if (kind === 1) col = [0.13 + r() * 0.03, 0.16 + r() * 0.04, 0.065];
    else col = r() < 0.06 ? (r() < 0.5 ? [0.3, 0.17, 0.07] : [0.34, 0.29, 0.1]) : [0.14, 0.2, 0.08];
    trees.push({ x, z, kind, R, H, rot: r() * 6.283, col });
  };
  for (let i = 0; i < uL.length - 1; i++) for (let j = 0; j < vL.length - 1; j++) {
    const uA = uL[i] + RW / 2, uB = uL[i + 1] - RW / 2, vA = vL[j] + RW / 2, vB = vL[j + 1] - RW / 2, vM = (vA + vB) / 2 + (r() - 0.5) * 6;
    const [cx, cz] = W((uA + uB) / 2, (vA + vB) / 2);
    const k = keep(cx, cz); if (k <= 0) continue;
    for (const side of [0, 1]) {
      const v0 = side ? vM : vA, v1 = side ? vB : vM, face = side ? 1 : -1;   // the street is at v1 for the back row
      let u = uA;
      while (u < uB - 12) {
        let lw = 16 + r() * 9; if (uB - (u + lw) < 14) lw = uB - u;
        const lot = { u0: u, u1: u + lw, v0, v1, face, g: r() };
        const [lx, lz] = W(u + lw / 2, (v0 + v1) / 2);
        lot.k = keep(lx, lz);
        u += lw;
        if (r() > lot.k) { lot.empty = true; lots.push(lot); continue; }
        lots.push(lot);
        const depth = v1 - v0;
        const hw = Math.min(17, Math.max(9, lw * (0.48 + r() * 0.18))), hd = 10 + r() * 5, sb = 7 + r() * 4;
        const ds = r() < 0.5 ? -1 : 1;
        const hu = (lot.u0 + lot.u1) / 2 - ds * 1.8 + (r() - 0.5) * 1.5;
        const front = face < 0 ? v0 + sb : v1 - sb - hd;     // the street side of the lot
        const hv = front + hd / 2;
        const two = r() < 0.38, eave = two ? 5.9 : 3.3;
        const [hx, hz] = W(hu, hv), rot = -TH + (r() - 0.5) * 0.05;
        houses.push({ x: hx, z: hz, w: hw, d: hd, h: eave, rot, col: pick(wallCols, [30, 18, 12, 10, 8, 10, 12]) });
        const rc = pick(roofCols, roofW), type = r() < 0.38 ? 1 : 0, along = r() < 0.72;
        const pitch = 0.42 + r() * 0.2;
        const rw = (along ? hw : hd) + 0.9, rd = (along ? hd : hw) + 0.9;
        roofs.push({ x: hx, z: hz, w: rw, d: rd, y: eave, rh: pitch * rd / 2, rot: rot + (along ? 0 : Math.PI / 2), type, col: rc });
        lot.house = { hu, hv, hw, hd };
        // a wing at the back, a garage at the drive's end, a shed, a pool
        if (r() < 0.35) {
          const ww = hw * (0.45 + r() * 0.25), wd = 4 + r() * 3, wu = hu + (r() - 0.5) * (hw - ww), wv = hv - face * (hd / 2 + wd / 2 - 0.3);
          const [wx, wz] = W(wu, wv);
          houses.push({ x: wx, z: wz, w: ww, d: wd, h: 3.1, rot, col: houses[houses.length - 1].col });
          roofs.push({ x: wx, z: wz, w: wd + 0.7, d: ww + 0.7, y: 3.1, rh: 0.45 * (ww + 0.7) / 2, rot: rot + Math.PI / 2, type: 0, col: rc });
        }
        const du = ds > 0 ? lot.u1 - 2.4 : lot.u0 + 2.4;
        const streetV = face < 0 ? v0 : v1;
        const garage = r() < 0.32;
        const dEnd = face < 0 ? front + hd + (garage ? 8 : 2) : front - (garage ? 8 : 2);
        drives.push({ u0: du - 1.5, u1: du + 1.5, v0: Math.min(streetV, dEnd), v1: Math.max(streetV, dEnd) });
        if (garage) {
          const gv = face < 0 ? dEnd + 3.2 : dEnd - 3.2, gu = du - ds * 1.5;
          const [gx, gz] = W(gu, gv);
          houses.push({ x: gx, z: gz, w: 6.6, d: 6.4, h: 2.8, rot, col: houses[houses.length - 1].col });
          roofs.push({ x: gx, z: gz, w: 7.2, d: 7.0, y: 2.8, rh: 1.5, rot, type: 0, col: rc });
        }
        const cn = r() < 0.65 ? (r() < 0.3 ? 2 : 1) : 0;
        for (let c = 0; c < cn; c++) {
          const vv = face < 0 ? streetV + 4 + c * 5.4 : streetV - 4 - c * 5.4;   // from the street inward
          const [cx2, cz2] = W(du, vv);
          cars.push({ x: cx2, z: cz2, rot: -TH + Math.PI / 2 + (r() - 0.5) * 0.08, col: pick(carCols, carW) });
        }
        const backV0 = face < 0 ? front + hd + 2 : v0 + 1, backV1 = face < 0 ? v1 - 1 : front - 2;
        if (r() < 0.07 && backV1 - backV0 > 12) {
          const pw = 4 + r() * 1.5, pl = 8 + r() * 3, pu = hu + (r() - 0.5) * 4, pv = (backV0 + backV1) / 2;
          pools.push({ u: pu, v: pv, w: pl, d: pw });
        }
        if (r() < 0.22 && backV1 - backV0 > 8) {
          const su2 = lot.u0 + 2.5 + r() * (lw - 5), sv = face < 0 ? v1 - 3 : v0 + 3;
          const [sx, sz] = W(su2, sv);
          houses.push({ x: sx, z: sz, w: 3.2, d: 2.6, h: 2.3, rot, col: [0.6, 0.55, 0.48] });
          roofs.push({ x: sx, z: sz, w: 3.6, d: 3.0, y: 2.3, rh: 0.8, rot, type: 0, col: [0.3, 0.3, 0.3] });
        }
        // trees: an oak or two, pines at the back, small ones by the house
        if (r() < 0.55) { const tu = hu + ds * (hw / 2 + 2) * (r() < 0.5 ? -1 : 0.3), tv = face < 0 ? v0 + 3 + r() * 3 : v1 - 3 - r() * 3; addTree(tu, tv, 0, 7 + r() * 4.5, 12 + r() * 5); }
        const nb = r() < 0.7 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
        for (let t = 0; t < nb; t++) addTree(lot.u0 + 3 + r() * (lw - 6), backV0 + r() * Math.max(1, backV1 - backV0), 0, 6 + r() * 5, 11 + r() * 6);
        const np = r() < 0.4 ? Math.floor(1 + r() * 3) : 0;
        for (let t = 0; t < np; t++) addTree(lot.u0 + 2 + r() * (lw - 4), backV0 + r() * Math.max(1, backV1 - backV0), 1, 3 + r() * 2, 19 + r() * 9);
        if (r() < 0.5) addTree(hu + (r() - 0.5) * hw, face < 0 ? front - 2.5 : front + hd + 2.5, 2, 2 + r() * 1.6, 5 + r() * 2.5);
        beds.push({ u0: hu - hw / 2 - 1.2, u1: hu + hw / 2 + 1.2, v0: hv - hd / 2 - 1.2, v1: hv + hd / 2 + 1.2 });
        { const fv = face < 0 ? front - 0.9 : front + hd + 0.9, n = 2 + Math.floor(r() * 4);
          for (let s2 = 0; s2 < n; s2++) { const [sx2, sz2] = W(hu - hw / 2 + 1 + r() * (hw - 2), fv); shrubs.push({ x: sx2, z: sz2, R: 0.7 + r() * 0.6, H: 1.1 + r() * 0.6, rot: r() * 6.28, col: [0.06 + r() * 0.03, 0.1 + r() * 0.04, 0.045] }); } }
      }
    }
  }
  // the street trees and a few parked cars
  const nearLine = (x, L) => L.some((l) => Math.abs(x - l) < RW * 0.62);
  for (const v of vL) {
    for (const s of [-1, 1]) {
      let u = uL[0] + r() * 20;
      while (u < uL[uL.length - 1]) {
        u += 19 + r() * 14;
        if (nearLine(u, uL)) continue;
        const [x, z] = W(u, v + s * 5.6);
        const k = keep(x, z);
        if (r() < 0.78) addTree(u, v + s * 5.6, r() < 0.85 ? 0 : 2, 6 + r() * 4.5, 12 + r() * 5, k);
        if (r() < 0.06 * k) { const [cx, cz] = W(u + 6, v + s * 3.0); cars.push({ x: cx, z: cz, rot: -TH + (r() - 0.5) * 0.04, col: pick(carCols, carW) }); }
      }
    }
  }
  for (const u of uL) {
    for (const s of [-1, 1]) {
      let v = vL[0] + r() * 20;
      while (v < vL[vL.length - 1]) {
        v += 21 + r() * 14;
        if (nearLine(v, vL)) continue;
        const [x, z] = W(u + s * 5.6, v);
        if (r() < 0.72) addTree(u + s * 5.6, v, 0, 6 + r() * 4.5, 12 + r() * 5, keep(x, z));
      }
    }
  }
  return { HALF, TH, BU, BV, RW, nI, nJ, uL, vL, lots, houses, roofs, trees, cars, pools, drives, beds, shrubs, W, keep };
}

// ---- the ground: lawns, drives, beds, pools, the streets with their curbs and walks, painted on a canvas
function paintGround(P, size, half, cx, cz, hero) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / (2 * half);
  g.setTransform(s, 0, 0, s, (half - cx) * s, (half - cz) * s);
  g.rotate(P.TH);                       // draw in the grid's (u, v)
  const rr = rng(77);
  const ext = 2 * half + 400, U0 = -P.nI * P.BU - 200, V0 = -P.nJ * P.BV - 200;
  // noise patterns for the grass and the asphalt
  const noise = (n, a, b, blur) => { const k = document.createElement('canvas'); k.width = k.height = n; const kg = k.getContext('2d'); const d = kg.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = a + rr() * (b - a); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; } kg.putImageData(d, 0, 0);
    if (blur) { kg.filter = `blur(${blur}px)`; kg.drawImage(k, 0, 0); } return k; };
  const nGrass = g.createPattern(noise(256, 70, 190, hero ? 0.6 : 1.2), 'repeat');
  const pat = (p, sc) => { p.setTransform(new DOMMatrix().scale(sc, sc)); return p; };
  // lawns
  for (const l of P.lots) {
    const t = l.g;
    const col = l.empty ? `rgb(${88 + t * 26},${96 + t * 16},${60})` : t < 0.55 ? `rgb(${70 + t * 22},${86 + t * 20},${46 + t * 8})` : `rgb(${100 + t * 26},${102 + t * 10},${62 + t * 6})`;
    g.fillStyle = col; g.fillRect(l.u0, l.v0, l.u1 - l.u0, l.v1 - l.v0);
  }
  for (const l of P.lots) { const n = 3; for (let i = 0; i < n; i++) { const u = l.u0 + rr() * (l.u1 - l.u0), v = l.v0 + rr() * (l.v1 - l.v0), rad = 2 + rr() * 6;
    const gr = g.createRadialGradient(u, v, 0, u, v, rad); const c = rr() < 0.5 ? '120,112,70' : '48,62,30'; gr.addColorStop(0, `rgba(${c},0.45)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(u - rad, v - rad, 2 * rad, 2 * rad); } }
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = pat(nGrass, hero ? 0.06 : 0.6); g.fillRect(U0, V0, ext * 2, ext * 2);
  g.globalCompositeOperation = 'source-over';
  // lot lines (fences, hedges, the mower's edge)
  g.strokeStyle = 'rgba(40,52,26,0.35)'; g.lineWidth = hero ? 0.25 : 0.5;
  for (const l of P.lots) if (!l.empty && rr() < 0.7) { g.beginPath(); g.moveTo(l.u0, l.v0); g.lineTo(l.u0, l.v1); g.stroke(); }
  // beds of pine straw around the houses and under trees
  g.fillStyle = 'rgb(122,78,44)';
  for (const b of P.beds) { g.fillRect(b.u0, b.v0, b.u1 - b.u0, b.v1 - b.v0); }
  const inv = (x, z) => [x * Math.cos(-P.TH) - z * Math.sin(-P.TH), x * Math.sin(-P.TH) + z * Math.cos(-P.TH)];
  for (const t of P.trees) {
    if (t.kind === 1 || rr() < 0.3) { const [u, v] = inv(t.x, t.z); g.fillStyle = t.kind === 1 ? 'rgba(118,80,46,0.7)' : 'rgba(62,56,34,0.4)'; g.beginPath(); g.ellipse(u, v, (t.kind === 1 ? 2.6 : 1.6) * (0.8 + rr() * 0.5), (t.kind === 1 ? 2.2 : 1.4) * (0.8 + rr() * 0.5), rr() * 3, 0, 6.283); g.fill(); }
  }
  // drives and walks, pools
  for (const d of P.drives) { g.fillStyle = `rgb(${170 + rr() * 18},${168 + rr() * 16},${160 + rr() * 14})`; g.fillRect(d.u0, d.v0, d.u1 - d.u0, d.v1 - d.v0); }
  for (const p of P.pools) {
    g.fillStyle = 'rgb(214,210,198)'; g.fillRect(p.u - p.w / 2 - 1.2, p.v - p.d / 2 - 1.2, p.w + 2.4, p.d + 2.4);
    const gr = g.createLinearGradient(p.u - p.w / 2, 0, p.u + p.w / 2, 0); gr.addColorStop(0, 'rgb(40,150,175)'); gr.addColorStop(1, 'rgb(70,185,200)');
    g.fillStyle = gr; g.fillRect(p.u - p.w / 2, p.v - p.d / 2, p.w, p.d);
  }
  // houses' footprints darken the ground a little (eaves, foundations)
  g.fillStyle = 'rgba(30,30,24,0.5)';
  for (const l of P.lots) if (l.house) { const h = l.house; g.fillRect(h.hu - h.hw / 2 - 0.4, h.hv - h.hd / 2 - 0.4, h.hw + 0.8, h.hd + 0.8); }
  // the streets: verge, walk, curb, asphalt
  const lineU = (v, a, w, col) => { g.fillStyle = col; g.fillRect(U0, v + a, ext * 2, w); };
  const lineV = (u, a, w, col) => { g.fillStyle = col; g.fillRect(u + a, V0, w, ext * 2); };
  const streets = (fn, n, B) => { for (const x of (B === P.BV ? P.vL : P.uL)) fn(x); };
  const walks = [[-8.5, 1.5, 'rgb(158,156,148)'], [7.0, 1.5, 'rgb(158,156,148)']], curbs = [[-4.0, 0.25, 'rgb(172,170,162)'], [3.75, 0.25, 'rgb(172,170,162)']];
  const some = (L) => L.filter((x, i) => (i * 7919 + 13) % 5 < 3);
  for (const [a, w, col] of walks) { for (const v of some(P.vL)) lineU(v, a, w, col); for (const u of some(P.uL)) lineV(u, a, w, col); }
  for (const [a, w, col] of curbs) { streets((v) => lineU(v, a, w, col), P.nJ, P.BV); streets((u) => lineV(u, a, w, col), P.nI, P.BU); }
  streets((v) => lineU(v, -3.75, 7.5, 'rgb(74,76,78)'), P.nJ, P.BV); streets((u) => lineV(u, -3.75, 7.5, 'rgb(74,76,78)'), P.nI, P.BU);
  // the asphalt's own texture: patches, wear in the wheel paths
  g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.45;
  const nA = g.createPattern(noise(128, 70, 190, 0.6), 'repeat');
  g.fillStyle = pat(nA, hero ? 0.04 : 0.25);
  streets((v) => g.fillRect(U0, v - 3.75, ext * 2, 7.5), P.nJ, P.BV); streets((u) => g.fillRect(u - 3.75, V0, 7.5, ext * 2), P.nI, P.BU);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // the edge: fade into the satellite's ground
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  if (!hero) {
    const n = 256, m = document.createElement('canvas'); m.width = m.height = n; const mg = m.getContext('2d'); const d = mg.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = cx - half + (i + 0.5) / n * 2 * half, z = cz - half + (j + 0.5) / n * 2 * half;
      const k = Math.min(1, P.keep(x, z) * 1.25); d.data[(j * n + i) * 4 + 3] = Math.round(255 * k * k * (3 - 2 * k));
    }
    mg.putImageData(d, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(m, 0, 0, size, size);
  } else {
    const gr = g.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size * 0.5); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function createCity(ctx, T, cloudField, geo) {
  const { renderer } = ctx;
  const lite = ctx.quality === 'lite';
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color().setRGB(0.42, 0.53, 0.68);
  scene.background = fogCol.clone();
  scene.fog = new THREE.FogExp2(fogCol, 0.000062);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60000);
  camera.up.set(0, 0, -1);
  cloudShadowUniforms.tCloudField.value = cloudField;

  // ---- the satellite's ground: Wilmington (R3) over Cape Fear (R2)
  const plane = (tex, box, y, order) => {
    const x0 = (box[0] - geo.lon0) * geo.mLon, x1 = (box[2] - geo.lon0) * geo.mLon;
    const z0 = -(box[3] - geo.lat0) * geo.mLat, z1 = -(box[1] - geo.lat0) * geo.mLat;   // north edge, south edge
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2),
      withCloudShadow(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: order, polygonOffsetUnits: order })));
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; m.renderOrder = -10 - order;
    scene.add(m); return m;
  };
  plane(T.r2, [-78.75, 33.55, -77.25, 34.85], -2, 2);
  plane(T.r3, [-78.0, 34.12, -77.76, 34.32], 0, 0);

  // ---- the neighbourhood
  const P = plan(lite);
  // the hero: the lot nearest the centre gets the house with the skylight; everything moves so the skylight is the origin
  let best = null, bd = Infinity;
  for (const l of P.lots) if (l.house) { const [x, z] = P.W(l.house.hu, l.house.hv); const d = Math.hypot(x - 30, z + 10); if (d < bd) { bd = d; best = l; } }
  const HW = 16, HD = 12, HE = 3.25, HP = 0.5;       // the hero house: footprint, eave height, pitch
  const skyLocal = new THREE.Vector3(0, 0, HD / 4);    // the skylight on the south slope, a quarter of the depth from the middle
  const hcx = best.house.hu, hcv = best.house.hv;
  const [hx, hz] = P.W(hcx, hcv);
  // the hero's own house and roof replace the plan's (drop the ones on this lot)
  const near = (o) => Math.hypot(o.x - hx, o.z - hz) < 14;
  P.houses = P.houses.filter((h) => !near(h)); P.roofs = P.roofs.filter((h) => !near(h));
  { const sk0 = skyLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -P.TH); const sx = hx + sk0.x, sz = hz + sk0.z;
    P.trees = P.trees.filter((t) => Math.hypot(t.x - hx, t.z - hz) > (t.kind === 1 ? 10 : 7) && Math.hypot(t.x - sx, t.z - sz) > t.R * 1.3 + 4); }
  best.house.hw = HW; best.house.hd = HD;
  const rotH = -P.TH;
  // the world position of the skylight before the shift
  const sk = skyLocal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotH);
  const shift = new THREE.Vector2(hx + sk.x, hz + sk.z);
  P.shrubs = P.shrubs.filter((t) => Math.hypot(t.x - hx, t.z - hz) > 12);
  for (const list of [P.houses, P.roofs, P.trees, P.cars, P.shrubs]) for (const o of list) { o.x -= shift.x; o.z -= shift.y; }
  // the hero's own garden: a live oak behind the house, a tall pine by the drive, a crepe myrtle by the porch (none over the skylight)
  { const Y = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3(hx - shift.x, 0, hz - shift.y);
    const put = (lx, lz, kind, R, H, col) => { const p = new THREE.Vector3(lx, 0, lz).applyAxisAngle(Y, rotH).add(o); P.trees.push({ x: p.x, z: p.z, kind, R, H, rot: lx * 0.37, col }); };
    for (let i = 0; i < 7; i++) { const p = new THREE.Vector3(-6.5 + i * 2.1, 0, HD / 2 + 0.9 + (i % 2) * 0.25).applyAxisAngle(Y, rotH).add(o); P.shrubs.push({ x: p.x, z: p.z, R: 0.75 + (i % 3) * 0.15, H: 1.2, rot: i, col: [0.07, 0.115, 0.05] }); }
    put(-11, -12.5, 0, 9.5, 15.5, [0.085, 0.13, 0.055]); put(11.5, -10, 1, 3.6, 24, [0.14, 0.17, 0.065]); put(-6.5, 10.2, 2, 2.3, 5.5, [0.15, 0.21, 0.08]); }

  // ground canvases (painted in the shifted frame: the canvas centre is offset)
  const big = paintGround(P, lite ? 2048 : 4096, P.HALF, shift.x, shift.y, false);
  const heroTex = paintGround(P, lite ? 1024 : 2048, 90, shift.x, shift.y, true);
  const grain = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 w = vWPc.xz; float near = 1.0 - smoothstep(60.0, 260.0, distance(cameraPosition, vWPc));
          float g = gn(w * 9.0) * 0.45 + gn(w * 2.3 + 7.0) * 0.35 + gn(w * 0.45 + 3.0) * 0.2;
          float green = smoothstep(0.0, 0.08, diffuseColor.g - diffuseColor.b) * smoothstep(0.0, 0.05, diffuseColor.g - diffuseColor.r * 0.9);
          diffuseColor.rgb *= 1.0 + (g - 0.5) * mix(0.18, 0.55, green) * near;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.04, 0.86), green * smoothstep(0.55, 0.8, gn(w * 0.8 + 11.0)) * 0.6 * near); }`);
  };
  const gmat = (map, off) => withCloudShadow(new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off }), grain, 'ground');
  const bigG = new THREE.Mesh(new THREE.PlaneGeometry(2 * P.HALF, 2 * P.HALF).rotateX(-Math.PI / 2), gmat(big, -2));
  bigG.receiveShadow = true; bigG.renderOrder = -5; scene.add(bigG);
  const heroG = new THREE.Mesh(new THREE.PlaneGeometry(180, 180).rotateX(-Math.PI / 2), gmat(heroTex, -4));
  heroG.receiveShadow = true; heroG.renderOrder = -4; scene.add(heroG);
  // (the canvases were painted with the shift applied at their centres: put the planes where the paint is)
  bigG.position.set(0, 0.02, 0); heroG.position.set(0, 0.04, 0);

  // ---- instanced things, in chunks so the near view draws only its own
  const CH = 3, CS = (2 * P.HALF) / CH;
  const chunkOf = (x, z) => Math.max(0, Math.min(CH - 1, Math.floor((x + P.HALF) / CS))) * CH + Math.max(0, Math.min(CH - 1, Math.floor((z + P.HALF) / CS)));
  const shingles = bakeShingles(renderer, lite ? 512 : 1024);
  const wallMat = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const roofMat = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0xffffff, map: shingles.map, normalMap: shingles.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9 }));
  roofMat.customProgramCacheKey = () => 'tthp-earth-roof';
  roofMat.onBeforeCompile = ((prev) => (sh) => {
    prev(sh);
    // the shingles follow the roof: uv from the roof's own scaled coordinates
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 lp = position * sc;
        vMapUv = vec2(lp.x, lp.z * 1.12 + lp.y * 0.5) / 2.0;
        vNormalMapUv = vMapUv;
      #endif`);
  })(roofMat.onBeforeCompile);
  const oakMat = leafy(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), 1.1);
  const pineMat = leafy(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 1.8);
  const carMat = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.3 }));
  const trunkMat = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 }));
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const geos = { gable: gableGeo(), hip: hipGeo(), oakA: canopyGeo(5, 4, 0.5, 1), oakB: canopyGeo(9, 3, 0.45, 1), oakN: canopyGeo(5, 7, 0.5, 2), small: canopyGeo(13, 3, 0.7, 1), pine: pineGeo(3), car: carGeo(),
    trunk: new THREE.CylinderGeometry(0.18, 0.26, 1, 6).translate(0, 0.5, 0) };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
  const chunks = [];
  for (let c = 0; c < CH * CH; c++) { const g = new THREE.Group(); scene.add(g); chunks.push(g); }
  function instanced(geo, mat, items, fn, { cast = true, receive = true } = {}) {
    const per = Array.from({ length: CH * CH }, () => []);
    for (const it of items) per[chunkOf(it.x, it.z)].push(it);
    per.forEach((list, ci) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { const cc = fn(it, m4); im.setMatrixAt(i, m4); if (cc) im.setColorAt(i, col.setRGB(cc[0], cc[1], cc[2])); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = cast; im.receiveShadow = receive;
      im.computeBoundingSphere();
      chunks[ci].add(im);
    });
  }
  const place = (x, y, z, rot, sx, sy, sz) => { e.set(0, rot, 0); q.setFromEuler(e); return m4.compose(pv.set(x, y, z), q, sv.set(sx, sy, sz)); };
  instanced(box, wallMat, P.houses, (h) => { place(h.x, 0, h.z, h.rot, h.w, h.h, h.d); return h.col; });
  instanced(geos.gable, roofMat, P.roofs.filter((r) => r.type === 0), (r) => { place(r.x, r.y, r.z, r.rot, r.w, r.rh, r.d); return r.col; });
  instanced(geos.hip, roofMat, P.roofs.filter((r) => r.type === 1), (r) => { place(r.x, r.y, r.z, r.rot, r.w, r.rh, r.d); return r.col; });
  const oaks = P.trees.filter((t) => t.kind === 0), pines = P.trees.filter((t) => t.kind === 1), smalls = P.trees.filter((t) => t.kind === 2);
  const isNear = (t) => Math.hypot(t.x, t.z) < 140;
  instanced(geos.oakN, oakMat, oaks.filter(isNear), (t) => { place(t.x, t.H * 0.62, t.z, t.rot, t.R, t.H * 0.42, t.R); return t.col; });
  instanced(geos.oakA, oakMat, oaks.filter((t, i) => !isNear(t) && i % 2 === 0), (t) => { place(t.x, t.H * 0.62, t.z, t.rot, t.R, t.H * 0.42, t.R); return t.col; });
  instanced(geos.oakB, oakMat, oaks.filter((t, i) => !isNear(t) && i % 2 === 1), (t) => { place(t.x, t.H * 0.62, t.z, t.rot, t.R, t.H * 0.45, t.R); return t.col; });
  instanced(geos.small, oakMat, smalls, (t) => { place(t.x, t.H * 0.55, t.z, t.rot, t.R, t.H * 0.4, t.R); return t.col; });
  instanced(geos.small, oakMat, P.shrubs, (t) => { place(t.x, t.H * 0.45, t.z, t.rot, t.R, t.H * 0.5, t.R); return t.col; });
  instanced(geos.pine, pineMat, pines, (t) => { place(t.x, t.H * 0.72, t.z, t.rot, t.R, t.H * 0.32, t.R); return t.col; });
  instanced(geos.trunk, trunkMat, pines, (t) => { place(t.x, 0, t.z, 0, 1.1, t.H * 0.9, 1.1); return null; });
  instanced(geos.car, carMat, P.cars, (c) => { place(c.x, 0, c.z, c.rot, 1, 1, 1); return c.col; }, { receive: true });

  // ---- the hero house: walls, a hip roof of dark shingles, gutters, a chimney, a porch, and the skylight
  const hero = new THREE.Group();
  hero.position.set(hx - shift.x, 0, hz - shift.y); hero.rotation.y = rotH; scene.add(hero);
  const hm = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; hero.add(m); return m; };
  hm(new THREE.BoxGeometry(HW, HE, HD).translate(0, HE / 2, 0), withCloudShadow(new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 })), 0, 0, 0);
  const shTex = bakeShingles(renderer, lite ? 1024 : 2048);
  shTex.map.repeat.set(1, 1);
  const heroRoofM = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0x9a958e, map: shTex.map, normalMap: shTex.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.92 }));
  const OH = 0.55, RW2 = HW + 2 * OH, RD2 = HD + 2 * OH, RH = HP * RD2 / 2, kk = (RW2 - RD2) / 2 / RW2;
  const hr = hipGeo(kk); hr.scale(RW2, RH, RD2);
  { // uv in metres along the slopes
    const p = hr.attributes.position, n = hr.attributes.normal, uv = [];
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), nx = n.getX(i), nz = n.getZ(i);
      const along = Math.abs(nz) > Math.abs(nx) ? x : z, up = Math.abs(nz) > Math.abs(nx) ? Math.abs(z) * 1.12 : Math.abs(x) * 1.12;
      uv.push(along / 2, up / 2); }
    hr.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  hm(hr, heroRoofM, 0, HE, 0);
  const trim = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.6 }));
  for (const s of [-1, 1]) { hm(new THREE.BoxGeometry(RW2, 0.1, 0.1), trim, 0, HE - 0.03, s * RD2 / 2); hm(new THREE.BoxGeometry(0.1, 0.1, RD2), trim, s * RW2 / 2, HE - 0.03, 0); }
  hm(new THREE.BoxGeometry(0.9, 2.6, 0.7).translate(0, 1.3, 0), withCloudShadow(new THREE.MeshStandardMaterial({ color: 0x7a4a36, roughness: 0.9 })), -4.2, HE + 0.6, -2.6);
  { const pr = hm(new THREE.BoxGeometry(6, 0.1, 2.6), heroRoofM, 2, 2.75, HD / 2 + 1.3); pr.rotation.x = 0.18; }   // the porch's roof, shingled, sloping off
  // the ridge caps
  hm(new THREE.BoxGeometry(RW2 * 2 * kk + 0.3, 0.06, 0.24), heroRoofM, 0, HE + RH + 0.01, 0);
  // the skylight: an aluminium frame and glass, on the south slope, a little proud of it
  const slope = Math.atan2(RH, RD2 / 2);
  const skyG = new THREE.Group();
  const ySky = HE + RH * (1 - skyLocal.z / (RD2 / 2));
  skyG.position.set(skyLocal.x, ySky + 0.09, skyLocal.z); skyG.rotation.x = slope; hero.add(skyG);
  const frameM = withCloudShadow(new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 0.4, metalness: 0.7 }));
  for (const [w, d, x, z] of [[1.2, 0.06, 0, -0.43], [1.2, 0.06, 0, 0.43], [0.06, 0.8, -0.57, 0], [0.06, 0.8, 0.57, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), frameM); m.position.set(x, 0, z); m.castShadow = true; skyG.add(m);
  }
  const glassM = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vW; varying vec3 vN; varying vec2 vU; void main() { vU = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; varying vec3 vN; varying vec2 vU;
      void main() { vec3 V = normalize(cameraPosition - vW); float f = 0.04 + 0.96 * pow(1.0 - max(dot(V, vN), 0.0), 5.0);
        vec2 c = vU - 0.5; float glow = smoothstep(0.75, 0.0, length(c * vec2(1.0, 1.4)));
        vec3 inside = mix(vec3(0.05, 0.04, 0.03), vec3(0.42, 0.3, 0.19), glow);
        float streak = smoothstep(0.08, 0.0, abs(c.x * 0.8 + c.y - 0.12)) * 0.25;
        vec3 sky = vec3(0.45, 0.6, 0.9);
        gl_FragColor = vec4(mix(inside, sky, clamp(f * 2.5 + 0.06 + streak, 0.0, 1.0)), 1.0); }`,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8).rotateX(-Math.PI / 2), glassM); glass.position.y = 0.05; skyG.add(glass);

  const skyWorld = new THREE.Vector3(); skyG.getWorldPosition(skyWorld);
  hero.updateMatrixWorld(true); skyG.getWorldPosition(skyWorld);

  // ---- light: the sun (its direction set from the globe) and the sky
  const sun = new THREE.DirectionalLight(0xfff4e6, 3.4);
  sun.castShadow = true; sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x5a5a40, 1.1); scene.add(hemi);
  const sunDir = new THREE.Vector3(0.6, 0.7, 0.3).normalize();

  // ---- the cumulus deck: thin layers through its height, each drawing the field where the cloud reaches it
  const layers = [], NL = lite ? 6 : 10;
  const layerU = { tField: { value: cloudField }, sun: { value: sunDir }, camY: { value: 5000 }, fadeAll: { value: 1 } };
  for (let i = 0; i < NL; i++) {
    const hN = i / (NL - 1), y = CLOUD_BASE + (CLOUD_TOP - CLOUD_BASE) * hN;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...layerU, hN: { value: hN }, ly: { value: y } },
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D tField; uniform vec3 sun; uniform float camY, hN, ly, fadeAll; varying vec3 vW;
        float F(vec2 xz) { return texture2D(tField, vec2(xz.x / ${CLOUD_SIZE.toFixed(1)} + 0.5, -xz.y / ${CLOUD_SIZE.toFixed(1)} + 0.5)).r; }
        void main() {
          float d = F(vW.xz);
          float top = pow(d, 0.8);                  // where this cloud's top is (0..1 of the deck)
          float a = smoothstep(hN - 0.02, hN + 0.12, top) * smoothstep(0.02, 0.12, d);
          if (a < 0.003) discard;
          vec2 s2 = normalize(sun.xz + 1e-4) * 60.0;
          float lit = clamp(0.62 + (d - F(vW.xz + s2)) * 3.0 + hN * 0.35, 0.25, 1.15);
          vec3 c = mix(vec3(0.62, 0.66, 0.74), vec3(1.0, 0.985, 0.96), lit) * mix(0.72, 1.0, hN);
          float near = smoothstep(90.0, 220.0, abs(camY - ly));
          gl_FragColor = vec4(c * 2.4, a * 0.62 * near * fadeAll);
        }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CLOUD_SIZE, CLOUD_SIZE).rotateX(-Math.PI / 2), mat);
    m.position.y = y; m.renderOrder = 10 + i; scene.add(m); layers.push(m);
  }
  // near the eye: march each pixel's ray a few hundred metres through the same field, so a cloud has depth, edges and holes
  const fogQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { ...layerU, camPos: { value: new THREE.Vector3() }, invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() } },
    vertexShader: 'varying vec2 vN; void main() { vN = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tField; uniform float fadeAll; uniform vec3 camPos, sun; uniform mat4 invProj, camWorld; varying vec2 vN;
      const float B = ${CLOUD_BASE.toFixed(1)}, TP = ${CLOUD_TOP.toFixed(1)}, S = ${CLOUD_SIZE.toFixed(1)};
      float F(vec2 xz) { return texture2D(tField, vec2(xz.x / S + 0.5, -xz.y / S + 0.5)).r; }
      float dens(vec3 p) {
        float d = F(p.xz), hN = (p.y - B) / (TP - B);
        float body = smoothstep(-0.015, 0.05, pow(d, 0.8) - hN) * smoothstep(-0.04, 0.02, hN) * smoothstep(0.03, 0.14, d);
        float wisp = F(p.xz * 11.0 + vec2(p.y * 4.0, -p.y * 2.5) + 1300.0) * 1.1;
        return body * smoothstep(0.05, 0.75, wisp);
      }
      void main() {
        if (camPos.y > TP + 260.0 || camPos.y < B - 260.0) { gl_FragColor = vec4(0.0); return; }
        vec4 q = invProj * vec4(vN, 1.0, 1.0); q /= q.w;
        vec3 rd = normalize((camWorld * vec4(q.xyz, 0.0)).xyz);
        float T = 1.0, t = 2.0; vec3 col = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float dt = 10.0 * pow(1.65, float(i));
          vec3 p = camPos + rd * (t + dt * 0.5);
          float s = dens(p) * 0.0075 * dt;
          float a = 1.0 - exp(-s);
          float hN = clamp((p.y - B) / (TP - B), 0.0, 1.0);
          vec3 c = mix(vec3(0.66, 0.69, 0.75), vec3(1.0, 0.99, 0.97), 0.45 + 0.55 * hN);
          col += T * a * c;
          T *= 1.0 - a;
          t += dt;
        }
        float A = (1.0 - T) * fadeAll;
        gl_FragColor = vec4(col / max(1.0 - T, 1e-3) * 2.3, A);
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  }));
  fogQuad.frustumCulled = false; fogQuad.renderOrder = 100; scene.add(fogQuad);

  // ---- how the town looks from a height: the neighbourhood grows out of the satellite's ground as the eye comes down
  let reveal = 1;
  function setReveal(k) {
    reveal = k;
    bigG.material.opacity = heroG.material.opacity = k;
    for (const c of chunks) c.visible = k > 0.01;
    hero.visible = k > 0.01;
    for (const c of chunks) for (const im of c.children) im.scale.y = Math.max(0.001, k);
    hero.scale.y = Math.max(0.001, k);
  }
  function setSun(dir) {
    sunDir.copy(dir).normalize();
    // the sunbeam's horizontal run per metre of height (for the clouds' shadows)
    const k = 1 / Math.max(0.2, sunDir.y);
    cloudShadowUniforms.sunXZ.value.set(sunDir.x * k, sunDir.z * k);
  }
  setSun(sunDir);
  function frame(alt) {     // the camera sits at alt metres above the skylight, looking down; light and shadows follow the view
    const h = Math.max(alt, 0.05);
    sun.castShadow = h < 1200;            // above that the town is under (or inside) the cumulus: its shadows would not show
    camera.near = Math.max(0.03, Math.min(50, h * 0.02));
    camera.far = Math.max(3000, h * 8 + 6000);
    camera.updateProjectionMatrix();
    const span = Math.min(2400, Math.max(28, h * 1.25 + 20));
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.near = 1; sc.far = 4000; sc.updateProjectionMatrix();
    const gx = camera.position.x, gz = camera.position.z;
    sun.target.position.set(gx, 0, gz);
    sun.position.set(gx, 0, gz).addScaledVector(sunDir, 2000);
    sun.target.updateMatrixWorld();
    layerU.camY.value = camera.position.y;
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    fogQuad.material.uniforms.camPos.value.copy(camera.position);
    fogQuad.material.uniforms.invProj.value.copy(camera.projectionMatrixInverse);
    fogQuad.material.uniforms.camWorld.value.copy(camera.matrixWorld);
    for (const l of layers) l.visible = Math.abs(camera.position.y - l.position.y) > 2 && camera.position.y > l.position.y - 200;
  }
  const stage = {
    scene, camera, bloom: { strength: 0.18, radius: 0.5, threshold: 1.6 }, exposure: 0.9,
    update() {
      const a = ctx.size.w / ctx.size.h;
      if (Math.abs(camera.aspect - a) > 1e-4) { camera.aspect = a; camera.updateProjectionMatrix(); }
    },
  };
  return { stage, camera, skyWorld, setSun, setReveal, frame, layers, fogU: layerU, hero, get reveal() { return reveal; } };
}
