// apple.js — one apple, whole or in halves.
//
// The skin is turned from an apple's own profile (the stem's cavity, the
// shoulders, the widest girth a little above the middle, the calyx's basin)
// and given the five faint lobes of its carpels; it is painted (streaks,
// blush, lenticels, russet in the cavity) and waxed. Inside, nothing is
// painted on a face: the flesh, the core line, the five seed chambers and the
// seeds in them exist in three dimensions in the cut face's shader, so a cut
// from any direction shows what a knife would. A cut is a real one: the skin,
// the stem and the leaf are clipped by the plane, and the face left is capped.
// The apple is about one unit across.
import * as THREE from 'three';

// ---- the profile, top (stem cavity) to bottom (calyx basin), as (radius, height)
const PROFILE = [
  [0.000, 0.318], [0.034, 0.322], [0.078, 0.338], [0.128, 0.368], [0.182, 0.401], [0.240, 0.425], [0.300, 0.436],
  [0.365, 0.428], [0.425, 0.396], [0.468, 0.345], [0.496, 0.272], [0.510, 0.185], [0.509, 0.090], [0.497, -0.010],
  [0.474, -0.108], [0.437, -0.200], [0.385, -0.280], [0.320, -0.343], [0.250, -0.382], [0.180, -0.398], [0.118, -0.392],
  [0.070, -0.374], [0.032, -0.352], [0.000, -0.343],
];
export const APPLE = { radius: 0.51, top: 0.438, bottom: -0.398 };

function profilePoints(n) {
  const c = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getSpacedPoints(n).map((p, i, a) => new THREE.Vector2(i === 0 || i === a.length - 1 ? 0 : Math.max(0.0005, p.x), p.y));
}

// a small seeded noise (value noise in 3D) for the skin's irregularity
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const n = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v), l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}

function skinGeometry(lite) {
  const g = new THREE.LatheGeometry(profilePoints(lite ? 72 : 128), lite ? 72 : 144);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = Math.hypot(v.x, v.z); if (r < 1e-5) continue;
    const phi = Math.atan2(v.z, v.x);
    // five lobes, strongest toward the calyx; a slight lean; a little unevenness
    const low = THREE.MathUtils.smoothstep(-v.y, -0.05, 0.36);
    const lobes = 1 + 0.03 * Math.cos(5 * phi + 0.4) * (0.35 + 0.65 * low);
    const uneven = 1 + 0.022 * (noise3(v.x * 3.1 + 7, v.y * 3.1, v.z * 3.1) - 0.5) + 0.01 * (noise3(v.x * 9, v.y * 9 + 3, v.z * 9) - 0.5);
    const lean = 1 + 0.035 * Math.cos(phi - 1.1) * THREE.MathUtils.smoothstep(v.y, -0.1, 0.4);
    const k = lobes * uneven * lean;
    v.x *= k; v.z *= k;
    v.y += 0.012 * Math.sin(phi * 2 + 0.7) * low;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---- the skin's paint: a red apple with streaks over a gold-green ground, a blush, lenticels, russet in the cavity
function skinTextures(lite) {
  const W = lite ? 1024 : 2048, H = lite ? 512 : 1024;
  const col = document.createElement('canvas'); col.width = W; col.height = H;
  const rough = document.createElement('canvas'); rough.width = W / 2; rough.height = H / 2;
  const cx = col.getContext('2d'), rx = rough.getContext('2d');
  const img = cx.createImageData(W, H), d = img.data;
  const rimg = rx.createImageData(W / 2, H / 2), rd = rimg.data;
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);                 // 0 at the stem cavity (top), 1 at the calyx
    for (let x = 0; x < W; x++) {
      const u = x / W, a = u * Math.PI * 2;
      const sx = Math.cos(a), sz = Math.sin(a);
      // streaks run from stem to calyx: noise stretched along v
      const streak = noise3(sx * 9 + 3, v * 1.6, sz * 9) * 0.6 + noise3(sx * 26, v * 3.0 + 9, sz * 26) * 0.4;
      const blotch = noise3(sx * 2.2 + 11, v * 2.4, sz * 2.2);
      const sunny = 0.5 + 0.5 * Math.cos(a - 0.9);               // the side that faced the sun is redder
      let red = 0.55 + 0.45 * sunny + 0.35 * (blotch - 0.5);
      red = Math.min(1, Math.max(0, red));
      // near the poles the red thins to gold-green
      const pole = Math.min(THREE.MathUtils.smoothstep(v, 0.0, 0.16), 1 - THREE.MathUtils.smoothstep(v, 0.84, 1.0));
      red *= 0.35 + 0.65 * pole;
      const ground = [0.74 + 0.08 * blotch, 0.6 + 0.1 * blotch, 0.2];          // gold-green under the red
      // the red: deep, with fine darker streaks running stem to calyx (subtle, not stripes)
      const sv = 0.86 + 0.14 * streak;
      const tone = [0.56 * sv + 0.06 * sunny, 0.035 + 0.03 * streak, 0.045];
      let r = ground[0], g = ground[1], b = ground[2];
      const m = THREE.MathUtils.smoothstep(red, 0.22, 0.62);
      r = r + (tone[0] - r) * m; g = g + (tone[1] - g) * m; b = b + (tone[2] - b) * m;
      // russet in the stem cavity
      const rus = 1 - THREE.MathUtils.smoothstep(v, 0.0, 0.07);
      r = r + (0.45 - r) * rus * 0.8; g = g + (0.33 - g) * rus * 0.8; b = b + (0.14 - b) * rus * 0.8;
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, r * 255); d[i + 1] = Math.min(255, g * 255); d[i + 2] = Math.min(255, b * 255); d[i + 3] = 255;
      if (!(x & 1) && !(y & 1)) {
        const j = ((y >> 1) * (W >> 1) + (x >> 1)) * 4, ro = 0.32 + 0.12 * noise3(sx * 14, v * 6, sz * 14) + 0.25 * rus;
        rd[j] = rd[j + 1] = rd[j + 2] = Math.min(255, ro * 255); rd[j + 3] = 255;
      }
    }
  }
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  // lenticels: small pale dots, more toward the calyx, stretched by the curvature near the poles
  const rnd = (() => { let s = 77; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let k = 0; k < (lite ? 2600 : 5200); k++) {
    const u = rnd(), v = 0.06 + 0.9 * Math.pow(rnd(), 0.85), r = (0.6 + rnd() * 1.4) * (W / 2048);
    const stretch = 1 / Math.max(0.25, Math.sin(Math.PI * v));
    cx.fillStyle = `rgba(${235 + rnd() * 20},${215 + rnd() * 30},${150 + rnd() * 50},${0.35 + rnd() * 0.4})`;
    cx.beginPath(); cx.ellipse(u * W, v * H, r * stretch, r, 0, 0, Math.PI * 2); cx.fill();
  }
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.wrapS = THREE.RepeatWrapping;
  const roughnessMap = new THREE.CanvasTexture(rough); roughnessMap.wrapS = THREE.RepeatWrapping;
  return { map, roughnessMap };
}

// a fine bump for the skin, from the same noise (it reads as the wax's unevenness in a highlight)
function bumpTexture(lite) {
  const S = lite ? 512 : 1024, c = document.createElement('canvas'); c.width = S; c.height = S / 2;
  const x = c.getContext('2d'), img = x.createImageData(S, S / 2), d = img.data;
  for (let j = 0; j < S / 2; j++) for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2, v = j / (S / 2);
    const n = noise3(Math.cos(a) * 40, v * 20, Math.sin(a) * 40) * 0.5 + noise3(Math.cos(a) * 90, v * 45, Math.sin(a) * 90) * 0.5;
    const k = (j * S + i) * 4; d[k] = d[k + 1] = d[k + 2] = 110 + n * 90; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function stemGeometry() {
  // from the bottom of the cavity, up, bending, thinner toward its torn tip
  const pts = [[0, 0.29, 0], [0.004, 0.36, 0.002], [0.016, 0.43, 0.006], [0.038, 0.5, 0.012], [0.066, 0.555, 0.02], [0.092, 0.585, 0.026]].map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 40, 1, 10, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  const segs = 40, ring = 11;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs; curve.getPointAt(t, c);
    const r = 0.017 * (1 - 0.45 * t) + (t > 0.94 ? -0.006 * (t - 0.94) / 0.06 : 0) + (t < 0.08 ? 0.01 * (1 - t / 0.08) : 0);
    for (let k = 0; k < ring; k++) {
      const i = s * ring + k; v.fromBufferAttribute(p, i).sub(c);   // the tube was made with radius 1: scale each ring
      v.multiplyScalar(r); p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  g.computeVertexNormals();
  // a cap on its tip
  return g;
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.07, 0.05, 0.11, 0.16, 0.085, 0.27);
  s.bezierCurveTo(0.07, 0.33, 0.035, 0.37, 0, 0.4);
  s.bezierCurveTo(-0.035, 0.37, -0.07, 0.33, -0.085, 0.27);
  s.bezierCurveTo(-0.11, 0.16, -0.07, 0.05, 0, 0);
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // folded a little along the midrib, curling at the tip
    p.setZ(i, Math.abs(x) * 0.45 - 0.35 * y * y);
    uv.setXY(i, x / 0.22 + 0.5, y / 0.4);
  }
  g.computeVertexNormals();
  return g;
}
function leafTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#2f6a1e'); g.addColorStop(1, '#4f8f2a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  x.strokeStyle = 'rgba(200,230,140,0.55)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(128, 512); x.lineTo(128, 0); x.stroke();
  x.lineWidth = 1.4;
  for (let k = 0; k < 9; k++) {
    const y = 470 - k * 50;
    for (const sgn of [-1, 1]) { x.beginPath(); x.moveTo(128, y); x.quadraticCurveTo(128 + sgn * 50, y - 30, 128 + sgn * 108, y - 70); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- the inside: a shader that knows the apple in three dimensions
const INSIDE = /* glsl */`
  varying vec3 vInner;
  uniform float uSeedTurn;
  float ih(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float in3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(ih(i), ih(i + vec3(1,0,0)), f.x), mix(ih(i + vec3(0,1,0)), ih(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(ih(i + vec3(0,0,1)), ih(i + vec3(1,0,1)), f.x), mix(ih(i + vec3(0,1,1)), ih(i + vec3(1,1,1)), f.x), f.y), f.z); }
  vec3 ih3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
  // the flesh's cells: the two nearest of points jittered in a lattice
  vec2 icell(vec3 p) {
    vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z)), r = g + ih3(i + g) - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return sqrt(vec2(d1, d2));
  }
  // the five chambers: their centres turn about the axis; a chamber is a long ellipsoid, pointed to stem and calyx
  float chamber(vec3 p, out vec3 q) {
    float a = atan(p.z, p.x) + uSeedTurn, r = length(p.xz);
    float k = floor(a / 1.2566 + 0.5); float ac = k * 1.2566;
    vec2 c = vec2(cos(ac - uSeedTurn), sin(ac - uSeedTurn)) * 0.088;
    q = vec3(p.x - c.x, p.y + 0.01, p.z - c.y);
    vec3 dir = normalize(vec3(c.x, 0.0, c.y));
    float rad = dot(q, dir), tan = length(q - dir * rad - vec3(0.0, q.y, 0.0));
    return length(vec3(rad / 0.04, q.y / 0.125, tan / 0.031));
  }
  // a seed: a teardrop in its chamber, tip toward the stem; two in some chambers. Most lie whole (a knife
  // pushes a seed aside); now and then one is cut
  float seed(vec3 p, out float coat, out float cut) {
    float best = 9.0; coat = 0.0; cut = 0.0;
    for (int k = 0; k < 5; k++) {
      float ac = float(k) * 1.2566 - uSeedTurn;
      vec2 c = vec2(cos(ac), sin(ac)) * 0.088;
      for (int s = 0; s < 2; s++) {
        if (s == 1 && mod(float(k), 2.0) > 0.5) continue;
        float yo = s == 0 ? 0.012 : -0.062;
        vec3 q = vec3(p.x - c.x, p.y - yo, p.z - c.y);
        vec3 dir = normalize(vec3(c.x, 0.0, c.y));
        float rad = dot(q, dir), tan = length(q - dir * rad - vec3(0.0, q.y, 0.0));
        float taper = 1.0 - 0.45 * clamp(q.y / 0.048, -1.0, 1.0);    // narrower toward its tip, up
        float e = length(vec3(rad / (0.02 * taper), q.y / 0.05, tan / (0.029 * taper)));
        if (e < best) { best = e; cut = mod(float(k) * 2.0 + float(s), 3.0) < 0.5 ? 1.0 : 0.0; }
      }
    }
    coat = smoothstep(0.3, 0.55, best);
    return best;
  }
  vec3 insideColour(vec3 p, out float wet, out float shade, out float hgt) {
    float r = length(p.xz);
    // cream-gold flesh: its cells (juice in each, a glint), fibres running stem to calyx, deeper toward the core
    vec2 cl = icell(p * 95.0);
    float cell = smoothstep(0.0, 0.3, cl.y - cl.x);
    float fib = in3(vec3(normalize(p.xz + 1e-5) * 16.0, r * 70.0));
    vec3 flesh = vec3(0.68, 0.54, 0.3) * (0.9 + 0.12 * cell + 0.09 * (fib - 0.5)) * (0.94 + 0.08 * smoothstep(0.05, 0.4, length(p)));
    flesh += vec3(0.03, 0.02, -0.01) * (in3(p * 11.0) - 0.5);
    wet = 0.45 + 0.45 * cell; shade = 1.0; hgt = 0.6 * cell + 0.3 * fib;
    // the core line: ten bundles in a ring, joined faintly; greener near it
    float ring = abs(r - 0.205 * (1.0 - 0.6 * smoothstep(0.12, 0.33, abs(p.y))));
    float a = atan(p.z, p.x) + uSeedTurn;
    float k10 = abs(fract(a / 0.6283) - 0.5);
    float bundles = (1.0 - smoothstep(0.004, 0.011, ring)) * (0.25 + 0.75 * (1.0 - smoothstep(0.05, 0.13, k10)));
    float inner = 1.0 - smoothstep(-0.004, 0.004, r - 0.205 * (1.0 - 0.6 * smoothstep(0.12, 0.33, abs(p.y))));
    flesh = mix(flesh, vec3(0.7, 0.62, 0.38), inner * 0.3);                                  // within the core line, glassier
    flesh = mix(flesh, vec3(0.6, 0.56, 0.28), (1.0 - smoothstep(0.0, 0.018, ring)) * 0.55);
    flesh = mix(flesh, vec3(0.46, 0.46, 0.18), bundles);
    // the core: around the chambers the flesh is drier and paler
    float coreR = 0.15 * (1.0 - smoothstep(0.1, 0.24, abs(p.y + 0.01)));
    flesh = mix(flesh, vec3(0.86, 0.77, 0.52), (1.0 - smoothstep(coreR - 0.02, coreR + 0.012, r)) * 0.45);
    // the carpels' seams meet in a five-pointed star at the middle, greenish
    float star = abs(fract((atan(p.z, p.x) + uSeedTurn) / 1.2566 + 0.5) - 0.5) * r;
    flesh = mix(flesh, vec3(0.78, 0.76, 0.5), (1.0 - smoothstep(0.002, 0.007, star)) * (1.0 - smoothstep(0.03, 0.1, r)) * (1.0 - smoothstep(0.1, 0.2, abs(p.y))) * 0.5);
    // round each chamber its cartilage; inside, a hollow lined with a glossy parchment
    vec3 q; float ch = chamber(p, q);
    flesh = mix(flesh, vec3(0.9, 0.84, 0.64), (1.0 - smoothstep(1.0, 1.18, ch)) * step(1.0, ch) * 0.5);
    if (ch < 1.0) {
      float wall = smoothstep(0.8, 0.97, ch);
      vec3 hollow = mix(vec3(0.2, 0.14, 0.07), vec3(0.5, 0.4, 0.22), smoothstep(0.15, 0.8, ch));
      flesh = mix(hollow, vec3(0.92, 0.86, 0.68), wall);
      wet = mix(0.5, 0.85, wall); hgt = -1.2 + 1.2 * wall;
    }
    // the seeds: dark, glossy, round-backed; a cut one cream inside its coat
    float coat, cut; float s = seed(p, coat, cut);
    if (s < 1.0) {
      float dome = 1.0 - s * s;
      vec3 brown = mix(vec3(0.04, 0.014, 0.005), vec3(0.25, 0.1, 0.03), dome * (0.65 + 0.35 * in3(p * 260.0)));
      flesh = cut > 0.5 ? mix(vec3(0.86, 0.8, 0.6), brown, coat) : brown;
      wet = 1.0; hgt = cut > 0.5 ? 0.0 : 6.0 * dome;
    }
    // the stem's thread and the calyx's tube, down the axis
    float axis = (1.0 - smoothstep(0.006, 0.014, r)) * smoothstep(0.08, 0.26, abs(p.y));
    flesh = mix(flesh, vec3(0.62, 0.52, 0.30), axis * 0.8);
    return flesh;
  }
  // a bump from a height known only here: three.js's perturbNormalArb, by another name
  vec3 perturbApple(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
    vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)), vSigmaY = normalize(dFdy(surf_pos.xyz)), vN = surf_norm;
    vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }`;

function insideMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  m.userData.uniforms = { uSeedTurn: { value: 0.3 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying vec3 vInner;\nvarying float vEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInner = position;\nvEdge = aEdge;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEdge;\n' + INSIDE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wet, shade, hgt; vec3 inner = insideColour(vInner, wet, shade, hgt);
        // the skin's red bleeds a hair into the flesh at the rim; the skin itself is the last line
        float rim = smoothstep(0.955, 0.985, vEdge), skin = smoothstep(0.988, 0.997, vEdge);
        inner = mix(inner, vec3(0.86, 0.55, 0.42), rim * 0.55);
        inner = mix(inner, vec3(0.46, 0.04, 0.05), skin);
        diffuseColor.rgb = inner * shade;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.6, 0.18, wet);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 dH = vec2(dFdx(hgt), dFdy(hgt)) * 0.55; normal = perturbApple(-vViewPosition, normal, dH, faceDirection); }');
  };
  return m;
}

// ---- cutting: clip a mesh's triangles by a plane (keep the side d >= 0), collecting the cut segments
function clipGeometry(geo, n, d0, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  const out = { p: [], n: [], uv: [] }, segs = [];
  const vtx = (i) => ({ p: new THREE.Vector3().fromBufferAttribute(P, i), n: N ? new THREE.Vector3().fromBufferAttribute(N, i) : new THREE.Vector3(), uv: U ? new THREE.Vector2().fromBufferAttribute(U, i) : new THREE.Vector2() });
  const dist = (v) => v.p.dot(n) - d0;
  const lerpV = (a, b, t) => ({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) });
  for (let i = 0; i < P.count; i += 3) {
    const tri = [vtx(i), vtx(i + 1), vtx(i + 2)], ds = tri.map(dist);
    if (ds.every((x) => x >= 0)) { for (const v of tri) push(v); continue; }
    if (ds.every((x) => x < 0)) continue;
    const poly = [], cut = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3], da = ds[k], db = ds[(k + 1) % 3];
      if (da >= 0) poly.push(a);
      if ((da >= 0) !== (db >= 0)) { const v = lerpV(a, b, da / (da - db)); poly.push(v); cut.push(v.p); }
    }
    for (let k = 1; k + 1 < poly.length; k++) { push(poly[0]); push(poly[k]); push(poly[k + 1]); }
    if (cut.length === 2) segs.push([cut[0], cut[1]]);
  }
  function push(v) { out.p.push(v.p.x, v.p.y, v.p.z); out.n.push(v.n.x, v.n.y, v.n.z); out.uv.push(v.uv.x, v.uv.y); }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(out.n, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  return { geometry: r, segs };
}

// the cut segments chained into closed loops
function loopsOf(segs) {
  const key = (v) => `${Math.round(v.x * 2e4)},${Math.round(v.y * 2e4)},${Math.round(v.z * 2e4)}`;
  const nexts = new Map();
  for (const [a, b] of segs) {
    const ka = key(a), kb = key(b); if (ka === kb) continue;
    if (!nexts.has(ka)) nexts.set(ka, { v: a, to: [] }); if (!nexts.has(kb)) nexts.set(kb, { v: b, to: [] });
    nexts.get(ka).to.push(kb); nexts.get(kb).to.push(ka);
  }
  const used = new Set(), loops = [];
  for (const [k0] of nexts) {
    if (used.has(k0)) continue;
    const loop = []; let k = k0, prev = null;
    for (let guard = 0; guard < 100000; guard++) {
      used.add(k); loop.push(nexts.get(k).v);
      const nk = nexts.get(k).to.find((x) => x !== prev && !used.has(x));
      if (!nk) break;
      prev = k; k = nk;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// a cap over each loop: a fan from its middle, with two rings, carrying how near the rim each point is (aEdge)
function capGeometry(loops, n, facing) {
  const p = [], e = [], nn = [];
  const fn = n.clone().multiplyScalar(facing);
  for (const loop of loops) {
    const c = new THREE.Vector3(); for (const v of loop) c.add(v); c.multiplyScalar(1 / loop.length);
    const rings = [0, 0.5, 0.82, 0.94, 1];
    const at = (i, r) => c.clone().lerp(loop[i % loop.length], r);
    for (let i = 0; i < loop.length; i++) {
      for (let k = 0; k + 1 < rings.length; k++) {
        const a0 = at(i, rings[k]), a1 = at(i + 1, rings[k]), b0 = at(i, rings[k + 1]), b1 = at(i + 1, rings[k + 1]);
        const quad = k === 0 ? [[a0, b0, b1]] : [[a0, b0, b1], [a0, b1, a1]];
        const ek = k === 0 ? [[rings[0], rings[1], rings[1]]] : [[rings[k], rings[k + 1], rings[k + 1]], [rings[k], rings[k + 1], rings[k]]];
        quad.forEach((tri, ti) => {
          // wound so the face looks along fn
          const [x, y, z] = tri, cross = new THREE.Vector3().subVectors(y, x).cross(new THREE.Vector3().subVectors(z, x));
          const order = cross.dot(fn) >= 0 ? [0, 1, 2] : [0, 2, 1];
          for (const o of order) { const v = tri[o]; p.push(v.x, v.y, v.z); e.push(ek[ti][o]); nn.push(fn.x, fn.y, fn.z); }
        });
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(e, 1));
  return g;
}

export function createApple({ quality = 'high', envMap = null } = {}) {
  const lite = quality === 'lite';
  const root = new THREE.Group(); root.name = 'apple';
  const whole = new THREE.Group(); root.add(whole);
  const tex = skinTextures(lite), bump = bumpTexture(lite);
  const skinMat = new THREE.MeshPhysicalMaterial({
    map: tex.map, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0, bumpMap: bump, bumpScale: 0.6,
    clearcoat: 0.38, clearcoatRoughness: 0.32,
    envMap, envMapIntensity: 0.75,
  });
  // skin glow (for the light breaking through it): driven by uniforms the orchard sets
  skinMat.userData.uniforms = { uCrack: { value: 0 }, uDissolve: { value: 0 }, uGlowCol: { value: new THREE.Color(1.0, 0.72, 0.45) } };
  skinMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, skinMat.userData.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; uniform float uCrack; uniform float uDissolve; uniform vec3 uGlowCol;
        float ch(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float cn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float cfbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * cn(p); p *= 2.1; a *= 0.5; } return s; }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float veins = 0.0, burn = 0.0;
        if (uCrack > 0.0 || uDissolve > 0.0) {
          float f = cfbm(vObj * 7.0);
          float line = 1.0 - smoothstep(0.0, 0.035 + 0.05 * uCrack, abs(f - 0.5));
          veins = line * smoothstep(0.0, 1.0, uCrack * 1.4 - cfbm(vObj * 2.0 + 4.0) * 0.6);
          float d = cfbm(vObj * 4.0 + 9.0);
          if (d < uDissolve * 1.15 - 0.1) discard;
          burn = 1.0 - smoothstep(0.0, 0.09, d - (uDissolve * 1.15 - 0.1));
          burn *= step(0.001, uDissolve);
        }
        totalEmissiveRadiance += uGlowCol * (veins * 6.0 + burn * 9.0) + uGlowCol * uCrack * uCrack * 0.6;`);
  };
  const skinGeo = skinGeometry(lite);
  const skin = new THREE.Mesh(skinGeo, skinMat); skin.castShadow = true; skin.receiveShadow = true; whole.add(skin);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5a3f22, roughness: 0.85, metalness: 0 });
  stemMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.33, 0.36, 0.14), diffuseColor.rgb, smoothstep(0.3, 0.45, vH));');
  };
  const stemGeo = stemGeometry();
  const stem = new THREE.Mesh(stemGeo, stemMat); stem.castShadow = true; whole.add(stem);
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.55, side: THREE.DoubleSide });
  const leafGeo = leafGeometry();
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.set(0.05, 0.53, 0.015); leaf.rotation.set(-0.35, 0.6, -1.05); leaf.scale.setScalar(0.62); leaf.castShadow = true;
  leaf.updateMatrix(); whole.add(leaf);
  const insideMat = insideMaterial();

  let halves = null;
  const api = {
    root, whole, skin, skinMat, insideMat,
    get halves() { return halves; },
    // cut along a plane through the apple (its normal in the apple's own frame, and how far from the middle);
    // answers two groups, a (on the normal's side) and b, each a half with its face capped, placed as the whole was
    cut(normal, offset = 0) {
      api.uncut();
      const n = normal.clone().normalize();
      const parts = [skin, stem, leaf];
      const make = (sign) => {
        // the half turns about its own middle (g, placed there); its meshes keep the apple's own coordinates
        // (inner, placed back by as much), which is what the face's shader reads the inside from
        const g = new THREE.Group(); g.name = sign > 0 ? 'half-a' : 'half-b';
        const inner = new THREE.Group(); g.add(inner);
        const nn = n.clone().multiplyScalar(sign), d0 = offset * sign;
        let capLoops = [];
        for (const m of parts) {
          m.updateMatrix();
          const { geometry, segs } = clipGeometry(m.geometry, nn, d0, m === skin ? null : m.matrix);
          if (geometry.attributes.position.count === 0) { geometry.dispose(); continue; }
          const mesh = new THREE.Mesh(geometry, m.material); mesh.castShadow = true; mesh.receiveShadow = true;
          inner.add(mesh);
          if (m === skin) capLoops = loopsOf(segs);
        }
        if (capLoops.length) {
          const cap = new THREE.Mesh(capGeometry(capLoops, nn, -1), insideMat); cap.receiveShadow = true; cap.castShadow = true; cap.name = 'face';
          inner.add(cap);
        }
        const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3());
        c.addScaledVector(nn, 0.06);
        inner.position.copy(c).negate();
        g.position.copy(c);
        g.userData.normal = nn.clone();      // which way its face looks (before it moves): -nn
        return g;
      };
      halves = { a: make(1), b: make(-1), normal: n };
      root.add(halves.a, halves.b);
      whole.visible = false;
      return halves;
    },
    uncut() {
      if (!halves) return;
      for (const h of [halves.a, halves.b]) { root.remove(h); h.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
      halves = null; whole.visible = true;
    },
    setEnv(map) { skinMat.envMap = map; insideMat.envMap = map; stemMat.envMap = map; leafMat.envMap = map; for (const m of [skinMat, insideMat, stemMat, leafMat]) m.needsUpdate = true; },
    dispose() {
      api.uncut();
      for (const g of [skinGeo, stemGeo, leafGeo]) g.dispose();
      for (const m of [skinMat, stemMat, leafMat, insideMat]) m.dispose();
      for (const t of [tex.map, tex.roughnessMap, bump, leafMat.map]) t.dispose();
    },
  };
  return api;
}
