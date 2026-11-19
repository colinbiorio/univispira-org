// bake.js — textures made once on the GPU: a fragment shader drawn into a
// texture (mipmapped), so wood, stone and cloth have real detail without
// shipping images. The shaders write linear colour; colour targets are sRGB.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const NOISE = /* glsl */`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
  float gnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 ga = hash22(i) * 2.0 - 1.0, gb = hash22(i + vec2(1, 0)) * 2.0 - 1.0, gc = hash22(i + vec2(0, 1)) * 2.0 - 1.0, gd = hash22(i + vec2(1, 1)) * 2.0 - 1.0;
    float va = dot(ga, f), vb = dot(gb, f - vec2(1, 0)), vc = dot(gc, f - vec2(0, 1)), vd = dot(gd, f - vec2(1, 1));
    return 0.5 + 0.7 * mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * gnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
  float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
`;

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// draw `frag` (which sets gl_FragColor from vUv) into a w x h texture
export function bake(renderer, w, h, frag, { uniforms = {}, srgb = true, repeat = false } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping, wrapT: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { res: { value: new THREE.Vector2(w, h) }, ...uniforms }, vertexShader: VERT, fragmentShader: 'precision highp float; varying vec2 vUv; uniform vec2 res;\n' + NOISE + frag }));
  const prev = renderer.getRenderTarget(), tone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt); renderer.clear(); quad.render(renderer);
  renderer.setRenderTarget(prev); renderer.toneMapping = tone;
  quad.material.dispose(); quad.dispose();
  rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return rt.texture;
}

// ---- the cutting board: edge-grain strips of maple, walnut and cherry, oiled, used
// (uv: x along the board's width W cm, y along its depth D cm). Three outputs: colour, normal, roughness.
const BOARD = /* glsl */`
  uniform vec2 sizeCm; uniform int mode;
  // the strips across the depth: widths in cm and woods (0 maple, 1 walnut, 2 cherry)
  const int NS = 9;
  float sw(int i) { return i == 0 ? 2.6 : i == 1 ? 1.4 : i == 2 ? 2.6 : i == 3 ? 2.2 : i == 4 ? 4.0 : i == 5 ? 2.2 : i == 6 ? 2.6 : i == 7 ? 1.4 : 2.6; }
  int sk(int i) { return (i == 1 || i == 7) ? 1 : (i == 3 || i == 5) ? 2 : 0; }
  // a knife's marks: short straight cuts, many directions, most of them in the middle where the work is done
  float cuts(vec2 p, float scale, float seed, out float depth) {
    vec2 g = p / scale; vec2 i = floor(g);
    float best = 1.0; depth = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(x, y);
      vec2 r = hash22(c + seed);
      if (r.x > 0.62) continue;
      vec2 o = (c + hash22(c + seed + 7.0)) * scale;
      float a = hash12(c + seed + 3.0) * 3.14159;
      a = mix(a, 0.25 + 0.3 * sin(seed), 0.35);
      vec2 d = vec2(cos(a), sin(a));
      float len = scale * (0.6 + 1.6 * r.y);
      vec2 q = p - o; float t = clamp(dot(q, d), -len, len);
      float dist = length(q - d * t);
      float w = 0.012 + 0.018 * hash12(c + seed + 5.0);
      float m = 1.0 - smoothstep(w * 0.4, w, dist);
      m *= smoothstep(len, len * 0.6, abs(t));
      if (m > 1.0 - best) { best = 1.0 - m; depth = m * (0.4 + 0.6 * r.y); }
    }
    return 1.0 - best;
  }
  vec4 wood(vec2 cm, out float height, out float rough) {
    // which strip
    float z = cm.y, acc = 0.0; int si = 0; float z0 = 0.0, wdt = sw(0);
    for (int i = 0; i < NS; i++) { float wv = sw(i); if (z >= acc && z < acc + wv) { si = i; z0 = acc; wdt = wv; } acc += wv; }
    float zl = z - z0, seed = float(si) * 17.31;
    int kind = sk(si);
    // growth rings, nearly parallel to the length (edge grain), wavering slowly
    float warp = (fbm3(vec2(cm.x * 0.035, seed)) - 0.5) * 1.6 + (gnoise(vec2(cm.x * 0.16, seed + 3.0)) - 0.5) * 0.25;
    float dens = (kind == 0 ? 4.2 : kind == 1 ? 2.8 : 3.4) * (0.85 + 0.3 * hash12(vec2(seed, 2.0)));
    float r = (zl + warp + seed) * dens;
    float f = fract(r);
    float late = smoothstep(0.62, 0.9, f) * (1.0 - smoothstep(0.9, 1.0, f));
    float figure = fbm(vec2(cm.x * 0.09, zl * 0.8 + seed));
    vec3 base, dark;
    if (kind == 0) { base = vec3(0.54, 0.355, 0.185); dark = vec3(0.4, 0.24, 0.11); }
    else if (kind == 1) { base = vec3(0.09, 0.045, 0.024); dark = vec3(0.04, 0.02, 0.011); }
    else { base = vec3(0.27, 0.085, 0.036); dark = vec3(0.17, 0.05, 0.022); }
    float tint = hash12(vec2(seed, 5.0));
    base *= (0.86 + 0.26 * tint) * (0.88 + 0.24 * figure); dark *= 0.86 + 0.26 * tint;
    vec3 c = mix(base, dark, late * (kind == 1 ? 0.8 : 0.75));
    // pores (walnut and cherry), short dark dashes along the grain
    float pn = vnoise(vec2(cm.x * 1.4, zl * 26.0 + seed));
    float pores = smoothstep(0.80, 0.93, pn) * (kind == 0 ? 0.25 : kind == 1 ? 0.8 : 0.5);
    c *= 1.0 - 0.45 * pores;
    // maple's flecks and a mineral streak now and then
    if (kind == 0) {
      float fl = smoothstep(0.72, 0.9, vnoise(vec2(cm.x * 3.0, zl * 9.0 + seed * 3.0)));
      c = mix(c, c * 1.12, fl * 0.5);
      float streak = smoothstep(0.7, 0.85, fbm3(vec2(cm.x * 0.07, zl * 1.6 + seed * 1.7)));
      c = mix(c, c * vec3(0.78, 0.8, 0.76), streak * 0.6);
    }
    // the glue lines between strips
    float edge = min(zl, wdt - zl);
    c *= mix(0.62, 1.0, smoothstep(0.0, 0.045, edge));
    // use: knife marks (lighter, fresh wood) and a few darker old ones, mostly in the middle
    vec2 ctr = (cm - sizeCm * 0.5) / (sizeCm * 0.5);
    float work = smoothstep(1.15, 0.2, length(ctr * vec2(0.9, 1.1)));
    float d1, d2, d3;
    float m1 = cuts(cm, 1.1, 1.0, d1), m2 = cuts(cm, 0.6, 9.0, d2), m3 = cuts(cm, 2.2, 23.0, d3);
    float marks = (m1 * 0.7 + m2 * 0.5 + m3 * 0.8) * work;
    c = mix(c, c * vec3(1.18, 1.14, 1.08) + 0.015, clamp(marks, 0.0, 1.0) * 0.55);
    c *= 1.0 - 0.06 * (1.0 - work);   // handled edges are a little darker, the oil richer
    // a soft wet stain where an apple or a lemon was cut once
    float stain = smoothstep(0.55, 0.0, length((cm - vec2(sizeCm.x * 0.38, sizeCm.y * 0.62)) / vec2(4.5, 3.2)) + (fbm3(cm * 0.4) - 0.5) * 0.6);
    c *= 1.0 - 0.08 * stain;
    height = -late * 0.35 - pores * 0.6 - (d1 * 0.8 + d2 * 0.5 + d3 * 0.9) * work * 1.2 + (figure - 0.5) * 0.2 - (1.0 - smoothstep(0.0, 0.05, edge)) * 0.5;
    rough = clamp(0.42 + 0.08 * (figure - 0.5) + marks * 0.25 + pores * 0.1 - 0.06 * late + 0.04 * stain, 0.25, 0.8);
    return vec4(c, 1.0);
  }
  void main() {
    vec2 cm = vUv * sizeCm;
    float h, r;
    vec4 c = wood(cm, h, r);
    if (mode == 0) { gl_FragColor = c; return; }
    if (mode == 2) { gl_FragColor = vec4(r, r, r, 1.0); return; }
    float e = sizeCm.x / res.x;
    float hx, hy, r2;
    wood(cm + vec2(e, 0.0), hx, r2); wood(cm + vec2(0.0, e), hy, r2);
    vec3 n = normalize(vec3(-(hx - h) / e * 0.012, -(hy - h) / e * 0.012, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }`;

export function bakeBoard(renderer, wCm, dCm, px) {
  const h = Math.round(px * dCm / wCm);
  const u = () => ({ sizeCm: { value: new THREE.Vector2(wCm, dCm) }, mode: { value: 0 } });
  const a = u(), n = u(), r = u(); n.mode.value = 1; r.mode.value = 2;
  return {
    map: bake(renderer, px, h, BOARD, { uniforms: a }),
    normalMap: bake(renderer, px, h, BOARD, { uniforms: n, srgb: false }),
    roughnessMap: bake(renderer, px >> 1, h >> 1, BOARD, { uniforms: r, srgb: false }),
  };
}

// ---- honed white marble for the island (uv over its top, sizeCm)
const MARBLE = /* glsl */`
  uniform vec2 sizeCm; uniform int mode;
  void main() {
    vec2 p = vUv * sizeCm / 38.0;
    vec2 q = vec2(fbm(p + vec2(1.7, 9.2)), fbm(p + vec2(8.3, 2.8)));
    vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.2, 4.7)), fbm(p + 3.5 * q + vec2(6.1, 1.3)));
    float f = fbm(p * 0.9 + 3.0 * r);
    float v1 = abs(f - 0.5);
    float vein = 1.0 - smoothstep(0.0, 0.018, v1);
    float vein2 = 1.0 - smoothstep(0.0, 0.006, abs(fbm(p * 2.3 + 2.0 * q + 5.0) - 0.52));
    float cloud = fbm(p * 0.5 + 11.0);
    vec3 base = vec3(0.86, 0.85, 0.82) * (0.94 + 0.08 * cloud);
    vec3 c = mix(base, vec3(0.52, 0.53, 0.55), vein * 0.55 + smoothstep(0.08, 0.0, v1) * 0.12);
    c = mix(c, vec3(0.62, 0.6, 0.57), vein2 * 0.35);
    float speck = vnoise(vUv * sizeCm * 6.0);
    c *= 0.985 + 0.03 * speck;
    if (mode == 1) { float rr = 0.32 + 0.1 * cloud + 0.06 * vein; gl_FragColor = vec4(rr, rr, rr, 1.0); return; }
    gl_FragColor = vec4(c, 1.0);
  }`;
export function bakeMarble(renderer, wCm, dCm, px) {
  const h = Math.round(px * dCm / wCm);
  const mk = (m) => ({ sizeCm: { value: new THREE.Vector2(wCm, dCm) }, mode: { value: m } });
  return { map: bake(renderer, px, h, MARBLE, { uniforms: mk(0) }), roughnessMap: bake(renderer, px >> 2, h >> 2, MARBLE, { uniforms: mk(1), srgb: false }) };
}

// ---- white oak floor planks, repeating (a tile of 2.4 m x 1.44 m)
const FLOOR = /* glsl */`
  void main() {
    vec2 cm = vUv * vec2(240.0, 144.0);
    float row = floor(cm.y / 18.0), yl = cm.y - row * 18.0;
    float off = hash12(vec2(row, 3.0)) * 240.0;
    float x = mod(cm.x + off, 240.0);
    float len = 60.0 + floor(hash12(vec2(row, 7.0)) * 3.0) * 30.0;
    float plank = floor(x / len), xl = x - plank * len;
    float seed = hash12(vec2(row, plank)) * 50.0;
    float grain = fract((yl + (fbm3(vec2(cm.x * 0.02, seed)) - 0.5) * 6.0) * 0.9 + seed);
    float late = smoothstep(0.7, 0.95, grain) * (1.0 - smoothstep(0.95, 1.0, grain));
    vec3 c = vec3(0.62, 0.47, 0.32) * (0.85 + 0.25 * hash12(vec2(row, plank + 0.5)));
    c = mix(c, c * 0.8, late * 0.6);
    c *= 0.92 + 0.12 * fbm(vec2(cm.x * 0.05, yl * 0.3 + seed));
    float gap = min(min(yl, 18.0 - yl), min(xl, len - xl));
    c *= mix(0.45, 1.0, smoothstep(0.0, 0.15, gap));
    gl_FragColor = vec4(c, 1.0);
  }`;
export const bakeFloor = (renderer, px) => bake(renderer, px, Math.round(px * 0.6), FLOOR, { repeat: true });

// ---- a linen tea towel: oatmeal weave, two indigo stripes
const LINEN = /* glsl */`
  void main() {
    vec2 cm = vUv * vec2(50.0, 70.0);
    float wx = 0.5 + 0.5 * sin(cm.x * 70.0), wy = 0.5 + 0.5 * sin(cm.y * 70.0);
    float slub = fbm3(vec2(cm.x * 0.6, cm.y * 18.0)) * 0.6 + fbm3(vec2(cm.x * 18.0, cm.y * 0.6)) * 0.4;
    vec3 c = vec3(0.78, 0.74, 0.66) * (0.9 + 0.1 * (wx * wy) + 0.12 * (slub - 0.5));
    float s = cm.y;
    float stripe = smoothstep(0.1, 0.0, abs(s - 8.0) - 1.0) + smoothstep(0.1, 0.0, abs(s - 11.5) - 0.35);
    c = mix(c, vec3(0.12, 0.17, 0.34) * (0.85 + 0.2 * slub), clamp(stripe, 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
  }`;
export const bakeLinen = (renderer, px) => bake(renderer, px, Math.round(px * 1.4), LINEN);

// ---- asphalt shingles, architectural (laminated), a 2 m x 2 m repeating tile: colour (grey) and normal
const SHINGLE = /* glsl */`
  uniform int mode;
  // rows (courses) 14 cm apart; each course of laminated tabs of random widths, some with a second, darker layer
  float course(vec2 cm, out float tone, out float grain) {
    float row = floor(cm.y / 14.0), yl = cm.y - row * 14.0;
    float x = cm.x + hash12(vec2(row, 1.0)) * 300.0;
    float tw = 18.0 + 22.0 * hash12(vec2(floor(x / 40.0), row));
    float tab = floor(x / tw), xl = x - tab * tw;
    tone = hash12(vec2(tab, row + 9.0));
    float lam = step(0.45, hash12(vec2(tab, row + 2.0)));
    grain = vnoise(cm * 9.0) * 0.55 + vnoise(cm * 23.0) * 0.45;
    float h = 1.0 - smoothstep(11.5, 14.0, yl) * 0.85;          // the course lies over the next
    h -= (1.0 - smoothstep(0.0, 0.35, xl)) * 0.25;              // the slot between tabs
    h += lam * smoothstep(13.0, 6.0, yl) * 0.2;                 // the laminated layer
    return h + grain * 0.08;
  }
  void main() {
    vec2 cm = vUv * 200.0;
    float tone, grain; float h = course(cm, tone, grain);
    if (mode == 1) {
      float t2, g2; float hx = course(cm + vec2(0.15, 0.0), t2, g2), hy = course(cm + vec2(0.0, 0.15), t2, g2);
      vec3 n = normalize(vec3(-(hx - h) * 2.2, -(hy - h) * 2.2, 1.0));
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); return;
    }
    float row = floor(cm.y / 14.0), yl = cm.y - row * 14.0;
    float v = 0.5 + 0.05 * (tone - 0.5) + 0.26 * (grain - 0.5);
    v *= 1.0 - 0.32 * smoothstep(12.6, 14.0, yl);               // the shadow line under each course
    v *= 0.88 + 0.12 * vnoise(cm * vec2(0.08, 0.02) + 3.0);     // weathering, streaked down the slope
    float speck = step(0.93, hash12(floor(cm * 12.0)));         // a few light granules
    v = mix(v, 0.85, speck * 0.25);
    gl_FragColor = vec4(vec3(v), 1.0);
  }`;
export function bakeShingles(renderer, px) {
  return {
    map: bake(renderer, px, px, SHINGLE, { uniforms: { mode: { value: 0 } }, repeat: true }),
    normalMap: bake(renderer, px, px, SHINGLE, { uniforms: { mode: { value: 1 } }, repeat: true, srgb: false }),
  };
}
