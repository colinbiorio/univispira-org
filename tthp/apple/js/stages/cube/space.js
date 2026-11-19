// cube/space.js — what space is made of: the sky far away (the galaxy's band, faint clouds), stars at
// every depth (the near ones streaming past with real parallax, a streak only when the eye is fast),
// and the nebula one flies through (a volume marched at half the screen's size, lit by its own stars
// and, when one goes, by a supernova's light running out through it).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HASH, NOISE3, starColour, rng } from './glsl.js';

// ---------------------------------------------------------------- the sky at infinity
export const SKY_GLSL = /* glsl */`
uniform vec3 uBandN; uniform vec3 uCore; uniform float uBright;
vec3 spaceSky(vec3 d) {
  float b = dot(d, uBandN);
  float band = exp(-b * b / 0.016), wide = exp(-b * b / 0.10);
  float core = pow(max(dot(d, uCore), 0.0), 5.0);
  vec4 n1 = texture(uNoise, d * 0.55 + 0.5);
  vec4 n2 = texture(uNoise, d * 1.7 + vec3(0.21, 0.6, 0.33));
  vec4 n3 = texture(uNoise, d * 4.6 + vec3(0.7, 0.1, 0.4));
  float clouds = smoothstep(0.32, 0.82, n1.r * 0.5 + n2.g * 0.32 + n3.r * 0.18);
  float fil = max(1.0 - abs(n2.g - 0.5) * 6.0, 0.0) + 0.6 * max(1.0 - abs(n3.r - 0.5) * 7.0, 0.0);
  float lanes = smoothstep(0.25, 0.95, fil) * smoothstep(0.3, 0.62, n1.g) * exp(-b * b / 0.006);
  vec3 milky = vec3(1.0, 0.88, 0.74) * (band * (0.25 + 1.3 * clouds) + wide * 0.22 * clouds + core * 1.6 * (0.4 + clouds)) * (1.0 - 0.85 * lanes);
  float pink = smoothstep(0.6, 0.86, n2.r) * (0.25 + band * 1.6) * (0.4 + n3.b);
  float teal = smoothstep(0.64, 0.9, n1.g) * n3.a;
  float viol = smoothstep(0.58, 0.9, n1.a) * (0.3 + 0.7 * n2.a);
  vec3 neb = vec3(1.0, 0.22, 0.42) * pink + vec3(0.12, 0.55, 0.8) * teal * 0.7 + vec3(0.4, 0.22, 0.9) * viol * 0.45;
  return (milky * 0.03 + neb * 0.022) * uBright + vec3(0.0010, 0.0012, 0.0022);
}
`;

export function makeSky(noise, { air = false } = {}) {
  const uniforms = {
    uNoise: { value: noise }, uBright: { value: 1 },
    uBandN: { value: new THREE.Vector3(0.18, 0.92, -0.35).normalize() }, uCore: { value: new THREE.Vector3(-0.62, 0.05, -0.78).normalize() },
    uAir: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uEnv: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }`,
    fragmentShader: /* glsl */`
      ${NOISE3}
      ${HASH}
      ${SKY_GLSL}
      uniform float uAir; uniform vec3 uSun; uniform vec3 uUp; uniform float uEnv;
      varying vec3 vDir;
      vec3 airSky(vec3 d) {
        float mu = dot(d, uUp), sd = max(dot(d, uSun), 0.0);
        float hz = pow(1.0 - clamp(mu, 0.0, 1.0), 4.0);
        vec3 c = mix(vec3(0.030, 0.085, 0.30), vec3(0.36, 0.50, 0.70), hz);
        c += vec3(1.0, 0.72, 0.42) * pow(sd, 5.0) * 0.30 * (0.35 + hz);
        c += vec3(1.0, 0.86, 0.66) * pow(sd, 48.0) * 0.9;
        // under the horizon: past the face's edge there is only thin air over space (or, for the light it gives, the ground)
        vec3 under = uEnv > 0.5 ? vec3(0.05, 0.036, 0.026) : vec3(0.010, 0.014, 0.030);
        return mix(c, under, (1.0 - smoothstep(-0.18, 0.0, mu))) * 1.5;
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = spaceSky(d);
        ${air ? 'c = mix(c, airSky(d) + c * 0.12, uAir);' : ''}
        c += (ign(gl_FragCoord.xy) - 0.5) * 0.0016;
        gl_FragColor = vec4(max(c, 0.0), 1.0);
      }`,
    depthWrite: false, depthTest: true, side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  // drawn after every opaque thing, at the far plane: only where nothing else is does it cost anything
  mesh.frustumCulled = false; mesh.renderOrder = 1000;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- stars at infinity
export function makeFarStars(count, { bandN = new THREE.Vector3(0.18, 0.92, -0.35).normalize(), seed = 7 } = {}) {
  const R = rng(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), mag = new Float32Array(count);
  const v = new THREE.Vector3(), c = new THREE.Color(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  t1.set(1, 0, 0).cross(bandN).normalize(); t2.copy(bandN).cross(t1).normalize();
  for (let i = 0; i < count; i++) {
    if (R() < 0.42) {   // in the band
      const a = R() * Math.PI * 2, lat = (R() + R() + R() - 1.5) * 0.16;
      v.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).addScaledVector(bandN, lat).normalize();
    } else { const z = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - z * z); v.set(r * Math.cos(a), z, r * Math.sin(a)); }
    pos.set([v.x, v.y, v.z], i * 3);
    mag[i] = Math.max(-1.4, 6.8 + 2.6 * Math.log10(Math.max(1e-6, R())));
    const T = R() < 0.6 ? 3400 + R() * 3600 : R() < 0.75 ? 7000 + R() * 5000 : 11000 + R() * 18000;
    starColour(T, c); col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  const uniforms = { uPx: { value: 1 }, uBright: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec3 aCol; attribute float aMag;
      uniform float uPx; uniform float uBright;
      varying vec3 vCol; varying float vSig; varying float vSize;
      void main() {
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99998, p.w);
        float flux = pow(10.0, -0.4 * aMag);
        vSig = (0.62 + 0.22 * log(1.0 + flux * 30.0)) * uPx;
        vSize = ceil(vSig * 7.0);
        gl_PointSize = vSize;
        vCol = aCol * 0.11 * pow(flux / 0.0025, 0.42) * uBright;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vSig; varying float vSize;
      void main() {
        vec2 d = (gl_PointCoord - 0.5) * vSize;
        float g = exp(-dot(d, d) / (2.0 * vSig * vSig));
        gl_FragColor = vec4(vCol * g, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false; points.renderOrder = -6;
  return { points, uniforms };
}

// ---------------------------------------------------------------- stars near enough to pass
// A box of stars wrapped round the eye: as it moves, stars come from ahead and go behind. Each is a
// quad drawn along its own motion on the screen since the last frame (a streak only at speed).
export function makeStarLayer({ count, box, lum = 1, seed = 1, streak = 0.55 }) {
  const R = rng(seed);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const p = new Float32Array(count * 3), c = new Float32Array(count * 3), l = new Float32Array(count), col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    p.set([R(), R(), R()], i * 3);
    const T = R() < 0.55 ? 3300 + R() * 3500 : R() < 0.7 ? 6800 + R() * 4000 : 10000 + R() * 20000;
    starColour(T, col);
    const sat = 1.25; const m = (col.r + col.g + col.b) / 3;   // a little more colour than the eye allows: it is a dream of space
    c.set([m + (col.r - m) * sat, m + (col.g - m) * sat, m + (col.b - m) * sat], i * 3);
    l[i] = lum * Math.exp(R() * R() * 6.5);
  }
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(p, 3));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(c, 3));
  g.setAttribute('aLum', new THREE.InstancedBufferAttribute(l, 1));
  g.instanceCount = count;
  const uniforms = {
    uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uPrevVP: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) },
    uBright: { value: 1 }, uStreak: { value: streak }, uPx: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec3 aCol; attribute float aLum;
      uniform vec3 uCam; uniform float uBox; uniform mat4 uPrevVP; uniform vec2 uRes; uniform float uBright; uniform float uStreak; uniform float uPx;
      varying vec3 vCol; varying vec2 vP; varying float vHalf; varying float vSig;
      void main() {
        vec3 rel = (fract(aPos - uCam / uBox) - 0.5) * uBox;
        vec3 wp = uCam + rel;
        float d = max(length(rel), 1.5);
        vec4 c = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        vec4 pc = uPrevVP * vec4(wp, 1.0);
        if (c.w < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vCol = vec3(0.0); return; }
        vec2 s = c.xy / c.w * 0.5 * uRes;
        vec2 ps = pc.w > 0.5 ? pc.xy / pc.w * 0.5 * uRes : s;
        vec2 dl = (s - ps) * uStreak;
        float L = length(dl);
        if (L > 70.0 * uPx) { dl *= 70.0 * uPx / L; L = 70.0 * uPx; }
        float flux = aLum / (d * d);
        float fade = (1.0 - smoothstep(0.33, 0.5, d / uBox));
        float sig = (0.62 + 0.3 * log(1.0 + flux * 3.0)) * uPx;
        float I = min(1.1 * pow(flux, 0.45), 5.0);
        vec2 ax = L > 0.01 ? dl / L : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
        float hw = 3.2 * sig, hl = 0.5 * L + 3.2 * sig;
        vec2 sp = s - 0.5 * dl + ax * position.x * hl + ay * position.y * hw;
        gl_Position = vec4(sp / (0.5 * uRes) * c.w, c.z, c.w);
        vP = vec2(position.x * hl, position.y * hw); vHalf = 0.5 * L; vSig = sig;
        vCol = aCol * I * fade * uBright / (1.0 + L / (2.5 * sig));
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec2 vP; varying float vHalf; varying float vSig;
      void main() {
        float dx = max(abs(vP.x) - vHalf, 0.0);
        float r2 = dx * dx + vP.y * vP.y;
        float g = exp(-r2 / (2.0 * vSig * vSig)) + 0.04 * exp(-sqrt(r2) / (vSig * 2.5));
        gl_FragColor = vec4(vCol * g, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- a glow: a star close by, a flare, a spark of light
export function makeGlow({ color = 0xffffff, size = 1, intensity = 1, rays = 1 } = {}) {
  const uniforms = { uCol: { value: new THREE.Color(color) }, uI: { value: intensity }, uSize: { value: size }, uMinPx: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uRays: { value: rays } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uSize; uniform float uMinPx; uniform vec2 uRes;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 c = projectionMatrix * mv;
        // at least uMinPx across on the screen, however far
        float px = uSize * projectionMatrix[1][1] / max(-mv.z, 1e-4) * 0.5 * uRes.y;
        float k = px < uMinPx ? uMinPx / max(px, 1e-4) : 1.0;
        mv.xy += position.xy * uSize * k;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uI; uniform float uRays;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5; float r = length(d) * 2.0;
        float core = exp(-r * r * 150.0) * 1.4;
        float halo = 0.010 / (r * r + 0.010) * (1.0 - smoothstep(0.45, 1.0, r));
        float sx = exp(-abs(d.y) * 300.0) * (1.0 - smoothstep(0.0, 0.5, abs(d.x)));
        float sy = exp(-abs(d.x) * 300.0) * (1.0 - smoothstep(0.0, 0.5, abs(d.y)));
        float v = core + halo * 0.7 + (sx + sy) * 0.45 * uRays;
        gl_FragColor = vec4(uCol * uI * v, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.renderOrder = 2; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- the nebula
const NEB_FRAG = /* glsl */`
${NOISE3}
${HASH}
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCam;
uniform vec4 uA; uniform vec4 uB; uniform float uAOn; uniform float uBOn;
uniform vec4 uLightP[4]; uniform vec3 uLightC[4];
uniform vec4 uSN; uniform float uSNI; uniform vec3 uSNCol; uniform float uBright;
uniform vec4 uOcc[3];
varying vec2 vUv;

vec3 palette(float h) {
  vec3 c = mix(vec3(1.0, 0.16, 0.32), vec3(1.0, 0.22, 0.62), smoothstep(0.1, 0.25, h));
  c = mix(c, vec3(0.55, 0.2, 1.0), smoothstep(0.3, 0.42, h));
  c = mix(c, vec3(0.14, 0.38, 1.0), smoothstep(0.45, 0.55, h));
  c = mix(c, vec3(0.06, 0.82, 0.8), smoothstep(0.58, 0.68, h));
  c = mix(c, vec3(1.0, 0.6, 0.26), smoothstep(0.74, 0.86, h));
  return c;
}
// the great nebula the flight begins in
float densA(vec3 p, out float dust, out float hue, out float glow) {
  vec3 q = (p - uA.xyz) / uA.w;
  vec4 a = texture(uNoise, p * 0.0016 + vec3(0.11, 0.53, 0.29));
  vec4 b = texture(uNoise, p * 0.0052 + (a.xyz - 0.5) * 0.7);
  vec4 c = texture(uNoise, p * 0.017 + (b.xyz - 0.5) * 0.5);
  float shape = 1.0 - dot(q, q) + (a.r - 0.5) * 1.8;
  float m = smoothstep(0.0, 0.45, shape);
  // walls of glowing gas (thin sheets where the warped noise crosses its middle), finer threads in them
  float sheet = max(1.0 - abs(b.r - 0.5) * 5.0, 0.0); sheet = sheet * sheet * sheet;
  float fine = max(1.0 - abs(c.g - 0.5) * 6.0, 0.0); fine *= fine;
  float fog = smoothstep(0.45, 0.72, a.g);
  float d = m * (0.04 + fog * 0.42 + sheet * (0.8 + 0.8 * fine));
  // dust: dark threads and banks
  float thread = max(1.0 - abs(c.r - 0.5) * 7.0, 0.0); thread = thread * thread * thread;
  dust = m * (thread * smoothstep(0.4, 0.65, b.b) * 1.2 + smoothstep(0.66, 0.85, b.b * 0.5 + c.b * 0.5) * 0.6);
  hue = 0.5 + (a.a - 0.5) * 2.6 + (b.a - 0.5) * 0.5;
  glow = sheet * (0.6 + 0.8 * fine) * m;
  return d;
}
// the thin shroud round the star that will go supernova
float densB(vec3 p, out float dust, out float hue, out float glow) {
  vec3 q = (p - uB.xyz) / uB.w;
  vec4 a = texture(uNoise, p * 0.0033 + vec3(0.7, 0.2, 0.9));
  vec4 b = texture(uNoise, p * 0.011 + (a.xyz - 0.5) * 0.6);
  float m = smoothstep(0.0, 0.35, 1.0 - length(q) * 1.25 + (a.g - 0.5) * 0.8);
  float sheet = max(1.0 - abs(b.r - 0.5) * 5.0, 0.0); sheet = sheet * sheet * sheet;
  dust = 0.0;
  hue = 0.32 + (a.a - 0.5) * 0.8;
  glow = sheet * m;
  return m * (0.02 + sheet * 0.7);
}
vec2 sphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c; float b = dot(oc, rd), cc = dot(oc, oc) - r * r, h = b * b - cc;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(max(-b - h, 0.0), -b + h);
}
void march(int cloud, vec2 iv, vec3 ro, vec3 rd, float jit, inout vec3 col, inout float T) {
  float span = iv.y - iv.x;
  for (int i = 0; i < STEPS; i++) {
    float s0 = (float(i) + jit) / float(STEPS), s1 = (float(i) + 1.0 + jit) / float(STEPS);
    float ta = iv.x + span * s0 * s0, dt = span * (s1 * s1 - s0 * s0);
    vec3 p = ro + rd * ta;
    float dust, hue, glow;
    float d = cloud == 0 ? densA(p, dust, hue, glow) : densB(p, dust, hue, glow);
    if (d > 0.002 || dust > 0.01) {
      vec3 lit = vec3(0.0);
      for (int k = 0; k < 4; k++) { vec3 l = uLightP[k].xyz - p; lit += uLightC[k] * (uLightP[k].w / (1.0 + dot(l, l) * 0.0004)); }
      float rs = length(p - uSN.xyz);
      float front = exp(-pow((rs - uSN.w) / (18.0 + 0.12 * uSN.w), 2.0)) + 0.1 * step(rs, uSN.w);
      vec3 S = palette(hue) * (0.11 + 0.28 * d + 1.9 * glow) * (0.45 + lit);
      S += uSNCol * (uSNI * front / (1.0 + rs * rs * 0.00003));
      if (cloud == 1) S *= 0.35 + 0.65 * smoothstep(0.0, 0.3, uSNI);
      S *= 1.0 - 0.92 * dust;
      float sigma = d * 0.009 + dust * 0.075;
      float a = exp(-sigma * dt);
      col += T * S * (1.0 - a);
      T *= a;
      if (T < 0.015) break;
    }
  }
}
void main() {
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  vec3 ro = uCam;
  float jit = ign(gl_FragCoord.xy);
  vec3 col = vec3(0.0); float T = 1.0;
  // worlds in the way end the ray (the march stops at them; the gas in front of them still shows)
  float tHit = 1e9;
  for (int k = 0; k < 3; k++) { if (uOcc[k].w > 0.0) { vec2 h = sphere(ro, rd, uOcc[k].xyz, uOcc[k].w); if (h.y > 0.0) tHit = min(tHit, h.x); } }
  vec2 ia = uAOn > 0.5 ? sphere(ro, rd, uA.xyz, uA.w * 1.45) : vec2(-1.0);
  vec2 ib = uBOn > 0.5 ? sphere(ro, rd, uB.xyz, uB.w * 1.45) : vec2(-1.0);
  ia.y = min(ia.y, tHit); ib.y = min(ib.y, tHit);
  if (ia.x >= ia.y) ia = vec2(-1.0);
  if (ib.x >= ib.y) ib = vec2(-1.0);
  bool aFirst = ia.y > 0.0 && (ib.y <= 0.0 || ia.x <= ib.x);
  if (aFirst) { march(0, ia, ro, rd, jit, col, T); if (ib.y > 0.0) march(1, ib, ro, rd, jit, col, T); }
  else { if (ib.y > 0.0) march(1, ib, ro, rd, jit, col, T); if (ia.y > 0.0) march(0, ia, ro, rd, jit, col, T); }
  gl_FragColor = vec4(col * uBright, T);
}`;

export function makeNebula(ctx, noise) {
  const lite = ctx.quality === 'lite';
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const U = {
    uNoise: { value: noise }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
    uA: { value: new THREE.Vector4(0, 0, 0, 300) }, uB: { value: new THREE.Vector4(0, 0, -9000, 200) }, uAOn: { value: 1 }, uBOn: { value: 0 },
    uLightP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uLightC: { value: [0, 1, 2, 3].map(() => new THREE.Color(1, 1, 1)) },
    uSN: { value: new THREE.Vector4(0, 0, -9000, 0) }, uSNI: { value: 0 }, uSNCol: { value: new THREE.Color(0.75, 0.85, 1.0) }, uBright: { value: 1 },
    uOcc: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, defines: { STEPS: lite ? 26 : 42 },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: NEB_FRAG, depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  const comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tNeb: { value: rt.texture }, uTexel: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `uniform sampler2D tNeb; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec4 n = texture2D(tNeb, vUv) * 0.36;
        n += texture2D(tNeb, vUv + uTexel * vec2(0.8, 0.8)) * 0.16; n += texture2D(tNeb, vUv + uTexel * vec2(-0.8, 0.8)) * 0.16;
        n += texture2D(tNeb, vUv + uTexel * vec2(0.8, -0.8)) * 0.16; n += texture2D(tNeb, vUv + uTexel * vec2(-0.8, -0.8)) * 0.16;
        gl_FragColor = vec4(n.rgb, n.a);
      }`,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  }));
  comp.frustumCulled = false; comp.renderOrder = -5;
  const f = lite ? 0.34 : 0.5;
  function render(renderer, camera) {
    const w = Math.max(32, Math.round(ctx.size.w * ctx.size.scale * f)), h = Math.max(32, Math.round(ctx.size.h * ctx.size.scale * f));
    if (rt.width !== w || rt.height !== h) { rt.setSize(w, h); comp.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
    U.uInvProj.value.copy(camera.projectionMatrixInverse); U.uCamWorld.value.copy(camera.matrixWorld); U.uCam.value.setFromMatrixPosition(camera.matrixWorld);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); quad.render(renderer); renderer.setRenderTarget(prev);
  }
  return { comp, U, render };
}
