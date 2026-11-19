// cube/bake.js — pictures made once by a shader on the GPU: a tiling block of 3D noise (the nebula,
// the stars' sky, the planets), and flat textures (bark, leaves).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HASH } from './glsl.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// periodic gradient noise and cells, for things that must tile
export const PERIODIC = /* glsl */`
${HASH}
vec3 grad3(vec3 c) { return normalize(hash33(c) * 2.0 - 1.0 + 1e-4); }
float gdot(vec3 i, vec3 f, vec3 o, float per) { return dot(grad3(mod(i + o, per)), f - o); }
float pnoise3(vec3 p, float per) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = gdot(i, f, vec3(0, 0, 0), per), b = gdot(i, f, vec3(1, 0, 0), per);
  float c = gdot(i, f, vec3(0, 1, 0), per), d = gdot(i, f, vec3(1, 1, 0), per);
  float e = gdot(i, f, vec3(0, 0, 1), per), g = gdot(i, f, vec3(1, 0, 1), per);
  float h = gdot(i, f, vec3(0, 1, 1), per), k = gdot(i, f, vec3(1, 1, 1), per);
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float pworley3(vec3 p, float per) {
  vec3 i = floor(p), f = fract(p); float d = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + hash33(mod(i + o, per)) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
vec2 h22p(vec2 c, vec2 per) { return hash22(mod(c, per)); }
float pnoise2(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(h22p(i, per) * 2.0 - 1.0, f), b = dot(h22p(i + vec2(1, 0), per) * 2.0 - 1.0, f - vec2(1, 0));
  float c = dot(h22p(i + vec2(0, 1), per) * 2.0 - 1.0, f - vec2(0, 1)), d = dot(h22p(i + vec2(1, 1), per) * 2.0 - 1.0, f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm2(vec2 p, vec2 per, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * pnoise2(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s;
}
// F1, F2 of cells that tile with period per
vec2 pvoronoi2(vec2 x, vec2 per) {
  vec2 n = floor(x), f = fract(x); float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + h22p(n + g, per) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return sqrt(vec2(f1, f2));
}
`;

const NOISE3_FRAG = /* glsl */`
uniform float uZ;
varying vec2 vUv;
${PERIODIC}
void main() {
  vec3 p = vec3(vUv, uZ);
  // r: smooth fbm, four octaves; g: a finer fbm; b: billows (inverted cells); a: the slowest swell
  float r = 0.0, g = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { float per = 4.0 * pow(2.0, float(i)); r += a * pnoise3(p * per, per); g += a * pnoise3(p * per * 2.0 + 17.0, per * 2.0); a *= 0.5; }
  float b = 1.0 - (pworley3(p * 5.0, 5.0) * 0.6 + pworley3(p * 10.0, 10.0) * 0.28 + pworley3(p * 20.0, 20.0) * 0.12);
  float s = pnoise3(p * 2.0 + 5.0, 2.0) * 0.7 + pnoise3(p * 4.0 + 9.0, 4.0) * 0.3;
  gl_FragColor = vec4(0.5 + r * 0.75, 0.5 + g * 0.75, clamp(b * 1.25 - 0.1, 0.0, 1.0), 0.5 + s * 0.8);
}`;

const cache = new WeakMap();
// a 128³ (64³ when lite) block of noise that tiles every way, made once per renderer
export function noise3D(renderer, lite = false) {
  if (cache.has(renderer)) return cache.get(renderer);
  const n = lite ? 64 : 128;
  const rt = new THREE.WebGL3DRenderTarget(n, n, n, { depthBuffer: false });
  const t = rt.texture;
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  const q = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { uZ: { value: 0 } }, vertexShader: VERT, fragmentShader: NOISE3_FRAG, depthTest: false, depthWrite: false }));
  const prev = renderer.getRenderTarget();
  for (let z = 0; z < n; z++) { q.material.uniforms.uZ.value = (z + 0.5) / n; renderer.setRenderTarget(rt, z); q.render(renderer); }
  renderer.setRenderTarget(prev);
  q.material.dispose(); q.dispose();
  cache.set(renderer, t);
  return t;
}

// a flat picture made by a shader (srgb for colour; else data)
export function bake(renderer, { w, h = w, frag, uniforms = {}, srgb = false, mips = true, wrap = THREE.RepeatWrapping }) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false, generateMipmaps: mips, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: wrap, wrapT: wrap, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace, anisotropy: 8,
  });
  const q = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false }));
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); q.render(renderer); renderer.setRenderTarget(prev);
  q.material.dispose(); q.dispose();
  return rt.texture;
}
