// cube/bodies.js — the worlds passed on the way: a banded giant with rings (each shadowing the other),
// a cratered rock, a cracked ice moon; stars (a sun with a churning face and a corona); the Earth as a
// blue-white point; and a supernova: a star that flares, a shell of plasma rushing out, its light.
import * as THREE from 'three';
import { HASH, SIMPLEX, NOISE3, BUMP } from './glsl.js';
import { makeGlow } from './space.js';

const PLANET_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vO;
void main() {
  vO = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// lit by a far light (uL: the direction to it) and, while it lasts, by a supernova (uSN: position, strength)
const LIGHTS = /* glsl */`
uniform vec3 uL; uniform vec3 uLC; uniform vec4 uSN; uniform vec3 uSNC; uniform float uAmb;
vec3 snLight(vec3 n, vec3 w) { vec3 l = uSN.xyz - w; float d = length(l); return uSNC * uSN.w * max(dot(n, l / d), 0.0); }
`;

const RING_GLSL = /* glsl */`
float ringDens(float x, float fw) {
  if (x <= 0.0 || x >= 1.0) return 0.0;
  float d = 0.52 + 0.2 * sin(x * 97.0) * (1.0 - smoothstep(0.004, 0.012, fw)) + 0.13 * sin(x * 263.0 + 1.3) * (1.0 - smoothstep(0.0015, 0.005, fw)) + 0.09 * sin(x * 611.0 + 0.4) * (1.0 - smoothstep(0.0006, 0.002, fw));
  d *= smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.9, 1.0, x));
  d *= 1.0 - 0.94 * (1.0 - smoothstep(0.012, 0.03, abs(x - 0.64)));
  d *= 1.0 - 0.6 * (1.0 - smoothstep(0.004, 0.01, abs(x - 0.87)));
  d *= mix(0.22, 1.0, smoothstep(0.1, 0.3, x));
  return clamp(d, 0.0, 1.0);
}`;

function planetMaterial(frag, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uL: { value: new THREE.Vector3(0.75, 0.35, 0.25).normalize() }, uLC: { value: new THREE.Color(1.0, 0.96, 0.9).multiplyScalar(1.15) },
      uSN: { value: new THREE.Vector4(0, 0, 0, 0) }, uSNC: { value: new THREE.Color(0.8, 0.88, 1.0) }, uAmb: { value: 0.015 }, uTime: { value: 0 },
      ...extra,
    },
    vertexShader: PLANET_VERT, fragmentShader: frag,
  });
}

// ---------------------------------------------------------------- the giant and its rings
export function makeGasGiant(noise, { radius = 50, tilt = 0.42, palette = 0 } = {}) {
  const group = new THREE.Group();
  const ringIn = 1.38, ringOut = 2.35;
  const mat = planetMaterial(/* glsl */`
    ${HASH}
    ${SIMPLEX}
    ${LIGHTS}
    ${RING_GLSL}
    uniform float uTime; uniform vec3 uC; uniform float uR; uniform vec3 uRingN; uniform vec2 uRing; uniform float uPal;
    varying vec3 vN; varying vec3 vW; varying vec3 vO;
    void main() {
      vec3 n = normalize(vN), v = normalize(cameraPosition - vW), o = normalize(vO);
      float w1 = snoise(o * vec3(2.2, 7.0, 2.2) + vec3(0.0, 0.0, uTime * 0.008));
      float w2 = snoise(o * vec3(6.0, 22.0, 6.0) + w1 * 0.8);
      float w3 = snoise(o * vec3(16.0, 60.0, 16.0) + w2);
      float b = o.y * 6.5 + w1 * 0.22 + w2 * 0.1 + w3 * 0.035;
      vec3 c1 = uPal < 0.5 ? vec3(0.86, 0.76, 0.60) : vec3(0.62, 0.78, 0.86);
      vec3 c2 = uPal < 0.5 ? vec3(0.66, 0.45, 0.29) : vec3(0.30, 0.48, 0.70);
      vec3 c3 = uPal < 0.5 ? vec3(0.95, 0.91, 0.83) : vec3(0.85, 0.92, 0.95);
      vec3 c4 = uPal < 0.5 ? vec3(0.50, 0.30, 0.20) : vec3(0.22, 0.30, 0.55);
      float s1 = 0.5 + 0.5 * sin(b * 3.1), s2 = 0.5 + 0.5 * sin(b * 7.7 + 1.7), s3 = 0.5 + 0.5 * sin(b * 1.31 + 0.4);
      vec3 col = mix(c1, c2, smoothstep(0.25, 0.85, s1));
      col = mix(col, c3, smoothstep(0.55, 1.0, s2) * 0.55);
      col = mix(col, c4, smoothstep(0.7, 0.98, s3) * 0.55);
      col *= 0.92 + 0.16 * w3;
      // a great storm, turning
      vec3 sc = normalize(vec3(0.75, -0.36, 0.55));
      float sd = length((o - sc) * vec3(1.0, 1.9, 1.0));
      float sw = (1.0 - smoothstep(0.0, 0.16, sd));
      col = mix(col, uPal < 0.5 ? vec3(0.78, 0.38, 0.24) : vec3(0.9, 0.95, 1.0), sw * (0.55 + 0.45 * sin(sd * 70.0 - uTime * 0.6 + w2 * 2.0)));
      // light: a soft terminator (the deep air carries light past it), darker limb
      float ndl = dot(n, uL);
      float mu = max(dot(n, v), 0.0);
      float diff = max(ndl, 0.0) * 0.9 + 0.1 * smoothstep(-0.15, 0.2, ndl);
      float limb = 0.5 + 0.5 * pow(mu, 0.45);
      // the rings' shadow: the line from here toward the light crosses the ring plane
      float rs = 0.0;
      float dn = dot(uL, uRingN);
      if (abs(dn) > 1e-3) {
        float t = dot(uC - vW, uRingN) / dn;
        if (t > 0.0) { float r = length(vW + uL * t - uC) / uR; rs = ringDens((r - uRing.x) / (uRing.y - uRing.x), 0.004); }
      }
      vec3 lit = col * diff * limb * uLC * (1.0 - rs * 0.85);
      lit += col * snLight(n, vW) * limb;
      float rim = pow(1.0 - mu, 3.0) * smoothstep(-0.25, 0.45, ndl);
      lit += (uPal < 0.5 ? vec3(0.55, 0.62, 0.9) : vec3(0.45, 0.75, 1.0)) * rim * 0.35 * uLC;
      lit += col * uAmb;
      gl_FragColor = vec4(lit, 1.0);
    }`, {
    uC: { value: new THREE.Vector3() }, uR: { value: radius }, uRingN: { value: new THREE.Vector3(0, 1, 0) }, uRing: { value: new THREE.Vector2(ringIn, ringOut) }, uPal: { value: palette },
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
  ball.scale.setScalar(radius);
  const tiltG = new THREE.Group(); tiltG.rotation.z = tilt; tiltG.rotation.x = 0.18;
  group.add(tiltG); tiltG.add(ball);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { ...{ uL: mat.uniforms.uL, uLC: mat.uniforms.uLC, uSN: mat.uniforms.uSN, uSNC: mat.uniforms.uSNC, uAmb: mat.uniforms.uAmb }, uC: mat.uniforms.uC, uR: mat.uniforms.uR, uRingN: mat.uniforms.uRingN, uRing: mat.uniforms.uRing },
    vertexShader: /* glsl */`varying vec3 vW; varying float vR; void main() { vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${HASH}
      ${LIGHTS}
      ${RING_GLSL}
      uniform vec3 uC; uniform float uR; uniform vec3 uRingN; uniform vec2 uRing;
      varying vec3 vW; varying float vR;
      void main() {
        float x = (vR - uRing.x) / (uRing.y - uRing.x);
        float dens = ringDens(x, fwidth(x));
        if (dens < 0.005) discard;
        // the planet's shadow on the rings
        vec3 oc = vW - uC; float b = dot(oc, uL), c = dot(oc, oc) - uR * uR, h = b * b - c;
        float shadow = b < 0.0 ? smoothstep(-0.02, 0.06, h / (uR * uR)) : 0.0;
        vec3 v = normalize(cameraPosition - vW);
        float sl = dot(uRingN, uL), sv = dot(uRingN, v);
        float phase = max(dot(-v, uL), 0.0);
        float through = sl * sv < 0.0 ? 0.3 + 1.6 * pow(phase, 8.0) : 1.0;   // seen from the unlit side: light comes through, most when looking toward the sun
        vec3 base = mix(vec3(0.72, 0.64, 0.54), vec3(0.92, 0.87, 0.8), 0.5 + 0.5 * sin(vR * 41.0 + 2.0 * sin(vR * 13.0)));
        vec3 col = base * (0.12 + abs(sl)) * through * (1.0 - shadow) * uLC * 0.9 + base * uAmb;
        col += base * max(dot(normalize(uSN.xyz - vW), uRingN) * sign(sv), 0.0) * uSNC * uSN.w * 0.6;
        gl_FragColor = vec4(col, dens * 0.9);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(ringIn, ringOut, 256, 1), ringMat);
  // drawn before the nebula's light is laid over the picture, so gas in front of the rings hides them too
  ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(radius); ring.renderOrder = -5.5;
  tiltG.add(ring);
  const tmp = new THREE.Vector3();
  return {
    group, mat, radius, ringOut: ringOut * radius,
    update(t) {
      mat.uniforms.uTime.value = t;
      ball.rotation.y = t * 0.02;
      group.updateMatrixWorld(true);
      mat.uniforms.uC.value.setFromMatrixPosition(ball.matrixWorld);
      mat.uniforms.uRingN.value.set(0, 1, 0).applyQuaternion(tiltG.getWorldQuaternion(new THREE.Quaternion())).normalize();
      void tmp;
    },
  };
}

// ---------------------------------------------------------------- a cratered rock
export function makeRocky({ radius = 14, hue = 0 } = {}) {
  const mat = planetMaterial(/* glsl */`
    ${HASH}
    ${SIMPLEX}
    ${LIGHTS}
    ${BUMP}
    uniform float uHue;
    varying vec3 vN; varying vec3 vW; varying vec3 vO;
    float craters(vec3 p) {
      vec3 i = floor(p), f = fract(p); float h = 0.0;
      for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 c = i + g;
        if (hash13(c + 3.1) < 0.5) continue;
        vec3 r = g + hash33(c) - f;
        float rad = 0.22 + 0.3 * hash13(c + 7.0);
        float d = length(r) / rad;
        h += (d < 1.0 ? (d * d - 1.0) * 0.55 : 0.0) + exp(-pow((d - 1.0) * 3.2, 2.0)) * 0.3;
      }
      return h;
    }
    void main() {
      vec3 n = normalize(vN), v = normalize(cameraPosition - vW), o = normalize(vO);
      float maria = smoothstep(-0.1, 0.35, snoise(o * 1.7) * 0.7 + snoise(o * 4.0) * 0.3);
      float h = craters(o * 4.0) * 0.6 + craters(o * 11.0 + 5.0) * 0.25 + snoise(o * 30.0) * 0.08 + snoise(o * 90.0) * 0.03;
      vec3 hi = uHue < 0.5 ? vec3(0.42, 0.37, 0.32) : vec3(0.55, 0.30, 0.18);
      vec3 lo = uHue < 0.5 ? vec3(0.16, 0.15, 0.14) : vec3(0.30, 0.14, 0.08);
      vec3 col = mix(hi, lo, maria * 0.8) * (0.85 + 0.3 * snoise(o * 24.0));
      vec3 nb = bumpNormal(vW, n, h * 1.4);
      float ndl = dot(nb, uL), mu0 = max(ndl, 0.0), mu = max(dot(n, v), 0.01);
      float ls = mu0 / (mu0 + mu) * 2.0;           // the moon's flat look (Lommel-Seeliger), mixed with Lambert
      vec3 lit = col * mix(mu0, ls, 0.5) * uLC * 1.2 * smoothstep(-0.03, 0.05, dot(n, uL));
      lit += col * snLight(nb, vW) + col * uAmb;
      // thin air: a pale limb on the day side
      lit += vec3(0.75, 0.5, 0.35) * pow(1.0 - mu, 5.0) * smoothstep(-0.1, 0.4, dot(n, uL)) * 0.25 * uHue;
      gl_FragColor = vec4(lit, 1.0);
    }`, { uHue: { value: hue } });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 72), mat);
  mesh.scale.setScalar(radius);
  return { group: mesh, mat, radius, update(t) { mesh.rotation.y = t * 0.03; } };
}

// ---------------------------------------------------------------- an ice moon
export function makeIcy({ radius = 20 } = {}) {
  const mat = planetMaterial(/* glsl */`
    ${HASH}
    ${SIMPLEX}
    ${LIGHTS}
    ${BUMP}
    varying vec3 vN; varying vec3 vW; varying vec3 vO;
    void main() {
      vec3 n = normalize(vN), v = normalize(cameraPosition - vW), o = normalize(vO);
      float l1 = pow(1.0 - abs(snoise(o * 3.0 + snoise(o * 1.5) * 0.4)), 14.0);
      float l2 = pow(1.0 - abs(snoise(o * 8.0 + 3.0)), 18.0);
      float l3 = pow(1.0 - abs(snoise(o * 21.0 + 9.0)), 22.0);
      float lines = clamp(l1 + l2 * 0.7 + l3 * 0.4, 0.0, 1.0);
      float ptc = smoothstep(0.0, 0.6, snoise(o * 2.2 + 11.0));
      vec3 ice = mix(vec3(0.82, 0.88, 0.95), vec3(0.62, 0.74, 0.86), ptc * 0.6);
      vec3 col = mix(ice, vec3(0.55, 0.32, 0.22), lines * 0.75);
      vec3 nb = bumpNormal(vW, n, (l1 + l2 * 0.5) * 0.6 + snoise(o * 60.0) * 0.02);
      float ndl = max(dot(nb, uL), 0.0), mu = max(dot(n, v), 0.0);
      vec3 hv = normalize(uL + v);
      float spec = pow(max(dot(nb, hv), 0.0), 60.0) * 0.5 * (1.0 - lines);
      vec3 lit = (col * ndl + spec) * uLC * smoothstep(-0.03, 0.05, dot(n, uL));
      lit += col * snLight(nb, vW) + col * uAmb;
      lit += vec3(0.4, 0.7, 1.0) * pow(1.0 - mu, 4.0) * smoothstep(-0.2, 0.4, dot(n, uL)) * 0.4;
      gl_FragColor = vec4(lit, 1.0);
    }`);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 72), mat);
  mesh.scale.setScalar(radius);
  return { group: mesh, mat, radius, update(t) { mesh.rotation.y = -t * 0.025; } };
}

// ---------------------------------------------------------------- a star: a churning face, a corona, a glow
export function makeStar(noise, { radius = 10, color = new THREE.Color(1.0, 0.82, 0.52), intensity = 3.5, glowI = 0.7 } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNoise: { value: noise }, uTime: { value: 0 }, uCol: { value: color.clone() }, uI: { value: intensity } },
    vertexShader: PLANET_VERT,
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform float uTime; uniform vec3 uCol; uniform float uI;
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      void main() {
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW), o = normalize(vO);
        float mu = max(dot(n, v), 0.0);
        vec4 a = texture(uNoise, o * 0.9 + vec3(0.0, 0.0, uTime * 0.004));
        float g1 = texture(uNoise, o * 3.2 + (a.xyz - 0.5) * 0.25 + vec3(uTime * 0.01, 0.0, 0.0)).b;
        float g2 = texture(uNoise, o * 9.5 + (a.xyz - 0.5) * 0.4 - vec3(0.0, uTime * 0.015, 0.0)).b;
        float g3 = texture(uNoise, o * 27.0 + vec3(uTime * 0.03)).b;
        float gran = 0.72 + 0.5 * (g1 * 0.35 + g2 * 0.4 + g3 * 0.25 - 0.5);
        float spots = smoothstep(0.74, 0.8, a.r) * smoothstep(0.3, 0.6, a.g);
        float fac = smoothstep(0.62, 0.8, a.a) * (1.0 - mu) * 0.6;   // bright faculae toward the limb
        float limb = 0.32 + 0.68 * pow(mu, 0.5);
        vec3 c = uCol * uI * limb * (gran + fac) * (1.0 - 0.75 * spots);
        c *= mix(vec3(1.0, 0.52, 0.28), vec3(1.0), smoothstep(0.0, 0.45, mu));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
  ball.scale.setScalar(radius);
  group.add(ball);
  // the corona: streamers round the disc
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uNoise: { value: noise }, uTime: mat.uniforms.uTime, uCol: mat.uniforms.uCol, uI: { value: intensity * 0.3 }, uR: { value: radius } },
    vertexShader: /* glsl */`
      uniform float uR; varying vec2 vP;
      void main() { vP = position.xy * 4.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * uR * 4.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform float uTime; uniform vec3 uCol; uniform float uI;
      varying vec2 vP;
      void main() {
        float r = length(vP); if (r < 0.98) discard;
        float a = atan(vP.y, vP.x);
        float s = texture(uNoise, vec3(cos(a) * 0.6, sin(a) * 0.6, r * 0.05 - uTime * 0.01)).r;
        float s2 = texture(uNoise, vec3(cos(a) * 2.1, sin(a) * 2.1, r * 0.1 - uTime * 0.02)).g;
        float fall = pow(1.0 / r, 3.2) * (0.6 + 0.9 * smoothstep(0.4, 0.8, s) + 0.4 * s2);
        float edge = smoothstep(0.98, 1.03, r);
        gl_FragColor = vec4(uCol * uI * fall * edge * (1.0 - smoothstep(2.5, 4.0, r)), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  corona.renderOrder = 2;
  group.add(corona);
  const glow = makeGlow({ color, size: radius * 9, intensity: glowI, rays: 0.6 });
  glow.uniforms.uMinPx.value = 26;
  group.add(glow.mesh);
  return { group, mat, ball, corona, glow, radius, update(t) { mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- the Earth, far off: a blue-white point
export function makeEarthDot({ radius = 0.08 } = {}) {
  const group = new THREE.Group();
  const mat = planetMaterial(/* glsl */`
    ${HASH}
    ${SIMPLEX}
    ${LIGHTS}
    varying vec3 vN; varying vec3 vW; varying vec3 vO;
    void main() {
      vec3 n = normalize(vN), v = normalize(cameraPosition - vW), o = normalize(vO);
      float land = smoothstep(0.05, 0.15, snoise(o * 2.0) * 0.7 + snoise(o * 5.0) * 0.3);
      float cloud = smoothstep(0.1, 0.5, snoise(o * 4.0 + 3.0) * 0.6 + snoise(o * 11.0) * 0.4);
      vec3 col = mix(vec3(0.05, 0.16, 0.42), vec3(0.2, 0.32, 0.12), land);
      col = mix(col, vec3(0.95), cloud * 0.8);
      float ndl = max(dot(n, uL), 0.0);
      vec3 lit = col * ndl * uLC * 1.4 + vec3(0.35, 0.6, 1.0) * pow(1.0 - max(dot(n, v), 0.0), 2.0) * smoothstep(-0.2, 0.3, dot(n, uL)) * 0.8;
      gl_FragColor = vec4(lit, 1.0);
    }`);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  ball.scale.setScalar(radius);
  group.add(ball);
  const glow = makeGlow({ color: new THREE.Color(0.62, 0.8, 1.0), size: radius * 6, intensity: 3.2, rays: 0.5 });
  glow.uniforms.uMinPx.value = 15; glow.mesh.material.depthTest = false;
  group.add(glow.mesh);
  return { group, mat, glow, radius };
}

// ---------------------------------------------------------------- a supernova
// set(τ): τ seconds from the moment it goes (negative: the star before it). Answers how bright it is now.
export function makeSupernova(noise, { color = new THREE.Color(0.72, 0.82, 1.0) } = {}) {
  const group = new THREE.Group();
  const star = makeGlow({ color, size: 26, intensity: 2.5, rays: 1 });
  star.uniforms.uMinPx.value = 18;
  group.add(star.mesh);
  const shellMat = (inner) => new THREE.ShaderMaterial({
    uniforms: { uNoise: { value: noise }, uAge: { value: 0 }, uFade: { value: 0 }, uSeed: { value: inner ? 3.7 : 0.0 }, uInner: { value: inner ? 1 : 0 } },
    vertexShader: /* glsl */`
      ${NOISE3}
      uniform float uAge; uniform float uSeed;
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      void main() {
        vO = normalize(position);
        float k = texture(uNoise, vO * 0.7 + vec3(uSeed, 0.0, uAge * 0.02)).r;
        vec3 p = position * (1.0 + (k - 0.5) * 0.07);
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform float uAge; uniform float uFade; uniform float uSeed; uniform float uInner;
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      void main() {
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float mu = abs(dot(n, v));
        float limb = 1.0 / (mu * 2.0 + 0.25);
        vec4 a = texture(uNoise, vO * 0.8 + vec3(uSeed, uAge * 0.02, 0.0));
        vec4 b = texture(uNoise, vO * 2.2 + (a.xyz - 0.5) * 0.9);
        vec4 c = texture(uNoise, vO * 6.0 + (b.xyz - 0.5) * 0.6);
        float r1 = max(1.0 - abs(b.r - 0.5) * 11.0, 0.0), r2 = max(1.0 - abs(c.g - 0.5) * 12.0, 0.0);
        float fil = r1 * r1 * (0.6 + 0.8 * r2) + r2 * r2 * 0.4;
        float patchy = smoothstep(0.35, 0.7, a.g);
        vec3 hot = vec3(0.7, 0.85, 1.0), warm = vec3(1.0, 0.55, 0.28), cool = vec3(1.0, 0.22, 0.45), teal = vec3(0.25, 0.85, 0.9);
        vec3 col = mix(hot, warm, smoothstep(0.1, 1.0, uAge) * smoothstep(0.1, 0.5, fil));
        col = mix(col, mix(cool, teal, smoothstep(0.5, 0.7, b.a)), smoothstep(0.8, 3.0, uAge) * smoothstep(0.05, 0.5, fil));
        col = mix(col, hot * 1.2, pow(1.0 - mu, 5.0) * 0.6);
        if (uInner > 0.5) col = mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.2, 0.35), b.r);
        float I = (0.02 + 1.7 * fil * (0.35 + 0.9 * patchy)) * limb * smoothstep(0.0, 0.2, mu) * uFade;
        gl_FragColor = vec4(col * I, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), shellMat(false));
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMat(true));
  outer.renderOrder = inner.renderOrder = 2;
  group.add(outer, inner);
  // the flash on the lens: a wide wash and a thin anamorphic line through it
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uAt: { value: new THREE.Vector2(0.5, 0.5) }, uI: { value: 0 }, uCol: { value: color.clone() }, uAspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec2 uAt; uniform float uI; uniform vec3 uCol; uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - uAt) * vec2(uAspect, 1.0);
        float r2 = dot(d, d);
        float wash = 0.07 + 0.35 * exp(-r2 * 5.0) + 0.6 * exp(-r2 * 45.0);
        float line = exp(-abs(d.y) * 320.0) * exp(-abs(d.x) * 1.4) * 1.6;
        vec2 g = uAt + (vec2(0.5) - uAt) * 1.6;   // a ghost across the centre
        float ghost = exp(-pow(length((vUv - g) * vec2(uAspect, 1.0)) * 9.0, 2.0)) * 0.25;
        gl_FragColor = vec4((uCol * (wash + ghost) + vec3(0.6, 0.75, 1.0) * line) * uI, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  flare.frustumCulled = false; flare.renderOrder = 50;
  const R = 165;
  let bright = 0;
  return {
    group, flare, star, outer, inner, R,
    get brightness() { return bright; },
    set(tau) {
      // the star before: steady, then restless
      const pre = tau < 0 ? 1 + 0.5 * Math.max(0, 1 + tau / 1.2) * (0.5 + 0.5 * Math.sin(tau * 40)) : 0;
      // the flash: up in a fifth of a second, down over seconds
      const flash = tau < 0 ? 0 : (1 - Math.exp(-tau / 0.06)) * (Math.exp(-tau / 0.55) * 1.0 + Math.exp(-tau / 3.0) * 0.22);
      bright = flash;
      star.uniforms.uI.value = tau < 0 ? 2.0 * pre : 2.0 + flash * 26;
      star.uniforms.uSize.value = tau < 0 ? 24 : 24 + flash * 22;
      const age = Math.max(0, tau);
      const r = R * (1 - Math.exp(-age / 1.7)) + age * 6;
      outer.visible = inner.visible = tau > 0.02;
      outer.scale.setScalar(Math.max(0.01, r));
      inner.scale.setScalar(Math.max(0.01, r * 0.62));
      const fade = tau < 0 ? 0 : Math.min(1, tau / 0.12) * Math.exp(-age / 2.0) * 0.6;
      outer.material.uniforms.uAge.value = inner.material.uniforms.uAge.value = age;
      outer.material.uniforms.uFade.value = fade;
      inner.material.uniforms.uFade.value = fade * 0.3 * Math.min(1, age / 0.6);
      return flash;
    },
    lightFront(tau) { return Math.max(0, tau) * 160; },
  };
}
