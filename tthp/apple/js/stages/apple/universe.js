// universe.js — the universe, as nobody has seen it: a supernova's heart and a galaxy's arms.
//
// Tens of thousands of points of light: a white-hot core; three arms of a
// spiral in a thick, tilted disc, magenta to violet to cyan; a shell of fiery
// filaments around it like a supernova's remnant; a halo of stars; two jets
// streaming out along its axis. Among them, soft clouds of glowing gas, and
// clouds of dark dust that put darkness into it. Nothing stands still: the
// inner orbits turn faster than the outer, the space they turn in is warped by
// slow waves on frequencies that never line up, pulses of light run outward
// now and then, and the whole of it tumbles about an axis that wanders. A drag
// turns it (spinner); its own tumbling goes on inside.
//
// From an apple: every point begins on the apple's skin (sampled), and when
// the apple's skin breaks into light the points flow out to their places in
// a swirl, the clouds unfolding after them.
import * as THREE from 'three';

const rand = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), l = (a, b, t) => a + (b - a) * t, n = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v), l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}

// points on the apple's skin, weighted by area (and a few within)
function sampleSurface(geo, count, r) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, tri = p.count / 3;
  const area = new Float32Array(tri); let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < tri; i++) { a.fromBufferAttribute(p, i * 3); b.fromBufferAttribute(p, i * 3 + 1); c.fromBufferAttribute(p, i * 3 + 2); total += area[i] = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; }
  const cdf = new Float32Array(tri); let acc = 0; for (let i = 0; i < tri; i++) { acc += area[i] / total; cdf[i] = acc; }
  const out = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const x = r(); let lo = 0, hi = tri - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < x) lo = mid + 1; else hi = mid; }
    a.fromBufferAttribute(p, lo * 3); b.fromBufferAttribute(p, lo * 3 + 1); c.fromBufferAttribute(p, lo * 3 + 2);
    let u = r(), v = r(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const q = a.clone().multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
    if (r() < 0.12) q.multiplyScalar(0.3 + 0.6 * r());     // some from within
    out.set([q.x, q.y, q.z], k * 3);
  }
  if (g !== geo) g.dispose();
  return out;
}

const POINT_VERT = /* glsl */`
  attribute vec3 aHome; attribute vec3 aApple; attribute vec3 aColor; attribute float aSize; attribute float aSeed; attribute float aKind;
  uniform float uTime; uniform float uMorph; uniform float uRush; uniform float uScale; uniform float uPulse; uniform mat3 uTilt;
  varying vec3 vColor; varying float vGlow;
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  void main() {
    float t = uTime, r = length(aHome.xz);
    vec3 p = aHome;
    float glow = 1.0;
    if (aKind < 1.5) {                 // core and arms: inner orbits faster
      p = rotY(p, t * 0.42 / (0.22 + r) + aSeed * 0.02);
      p = uTilt * p;
    } else if (aKind < 2.5) {          // the shell: slow, breathing
      p = rotY(p, t * 0.035) * (1.0 + 0.035 * sin(t * 0.55 + aSeed * 6.283) + 0.02 * sin(t * 0.21 + p.y * 5.0));
    } else if (aKind < 3.5) {          // the halo: twinkling
      p = rotY(p, t * 0.012);
      glow = 0.55 + 0.45 * sin(t * (1.3 + aSeed * 2.7) + aSeed * 40.0);
    } else {                           // the jets: streaming out along the axis
      float f = fract(aSeed * 7.13 + t * 0.06);
      p = uTilt * vec3(aHome.x * (0.3 + f * 1.4), sign(aHome.y) * (0.06 + f * 1.05), aHome.z * (0.3 + f * 1.4));
      glow = (1.0 - f) * 1.6;
    }
    // the space itself warps, slowly, on frequencies that never line up
    p += 0.045 * sin(p.yzx * vec3(3.1, 2.7, 3.7) + t * vec3(0.23, 0.31, 0.17) + aSeed * 6.283);
    p += 0.02 * sin(p.zxy * vec3(7.3, 6.1, 5.9) + t * vec3(0.41, 0.37, 0.29));
    // a pulse of light running outward
    float d = length(p);
    glow *= 1.0 + 1.8 * uPulse * exp(-pow((d - uPulse * 1.2) * 9.0, 2.0));
    // from the apple: each point leaves the skin in its own time, swirling
    float m = clamp((uMorph - aSeed * 0.45) / 0.55, 0.0, 1.0); m = m * m * (3.0 - 2.0 * m);
    vec3 swirl = rotY(aApple, m * 3.1 * (0.5 + aSeed)) * (1.0 + m * 0.6);
    vec3 pos = mix(aApple, p * uScale, m) + (swirl - aApple) * sin(3.14159 * m) * 0.5;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float near = 1.0 / max(0.05, -mv.z);
    gl_PointSize = aSize * (1.0 + uRush * 2.5) * near * 300.0 * mix(0.6, 1.0, m);
    vColor = aColor; vGlow = glow * mix(2.4, 1.0, m) * (1.0 + uRush * 1.5);
  }`;
const POINT_FRAG = /* glsl */`
  varying vec3 vColor; varying float vGlow;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
    float core = exp(-r2 * 9.0), halo = exp(-r2 * 2.6) * 0.35;
    gl_FragColor = vec4(vColor * (core * 0.85 + halo * 0.22) * vGlow, 1.0);
  }`;

const CLOUD_VERT = /* glsl */`
  attribute vec3 iPos; attribute float iScale; attribute vec3 iColor; attribute float iSeed; attribute float iAlpha;
  uniform float uTime; uniform float uGrow; uniform mat3 uTilt; uniform float uScale;
  varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vAlpha;
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  void main() {
    vUv = uv; vColor = iColor; vSeed = iSeed;
    float r = length(iPos.xz);
    vec3 p = uTilt * rotY(iPos, uTime * 0.3 / (0.3 + r));
    p += 0.05 * sin(p.yzx * 2.3 + uTime * vec3(0.13, 0.17, 0.11) + iSeed * 6.283);
    float g = clamp((uGrow - iSeed * 0.35) / 0.65, 0.0, 1.0); g = g * g * (3.0 - 2.0 * g);
    vAlpha = iAlpha * g;
    vec4 mv = modelViewMatrix * vec4(p * uScale, 1.0);
    float a = iSeed * 6.283 + uTime * (0.03 + 0.04 * fract(iSeed * 9.1));
    vec2 c = vec2(cos(a), sin(a)), corner = position.xy;
    corner = vec2(corner.x * c.x - corner.y * c.y, corner.x * c.y + corner.y * c.x);
    mv.xy += corner * iScale * uScale * (0.4 + 0.6 * g);
    gl_Position = projectionMatrix * mv;
  }`;
const CLOUD_FRAG = /* glsl */`
  varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vAlpha;
  uniform float uTime; uniform float uDark;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
  void main() {
    vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
    vec2 w = q * 1.6 + vSeed * 31.0 + vec2(uTime * 0.012, -uTime * 0.008);
    float f = fbm(w + fbm(w * 1.7 + 4.0) * 1.3);
    float shape = smoothstep(1.0, 0.25, r) * smoothstep(0.32, 0.75, f);
    if (uDark > 0.5) gl_FragColor = vec4(vColor, shape * vAlpha);
    else gl_FragColor = vec4(vColor * shape * (0.6 + f) * vAlpha, 1.0);
  }`;

export function createUniverse(ctx, { apple = null, seed = 3 } = {}) {
  const lite = ctx.quality === 'lite';
  const group = new THREE.Group(); group.name = 'universe';
  const spinner = new THREE.Group(); group.add(spinner);         // what a drag turns
  const tumbler = new THREE.Group(); spinner.add(tumbler);       // what turns of itself
  const r = rand(seed);
  const N = lite ? 42000 : 95000;
  const home = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), seedA = new Float32Array(N), kind = new Float32Array(N);
  const palette = {
    core: [new THREE.Color(1.0, 0.92, 0.78), new THREE.Color(1.0, 0.8, 0.55)],
    arm: [new THREE.Color(0.95, 0.25, 0.85), new THREE.Color(0.55, 0.32, 1.0), new THREE.Color(0.25, 0.78, 1.0), new THREE.Color(0.2, 1.0, 0.85), new THREE.Color(1.0, 0.55, 0.9)],
    shell: [new THREE.Color(1.0, 0.45, 0.12), new THREE.Color(1.0, 0.2, 0.1), new THREE.Color(1.0, 0.75, 0.3), new THREE.Color(0.95, 0.3, 0.5)],
    halo: [new THREE.Color(0.85, 0.9, 1.0), new THREE.Color(1.0, 0.95, 0.85), new THREE.Color(0.7, 0.8, 1.0)],
    jet: [new THREE.Color(0.35, 0.85, 1.0), new THREE.Color(0.6, 0.6, 1.0)],
  };
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  for (let i = 0; i < N; i++) {
    const x = r(); let p, c, s, k;
    if (x < 0.07) {                       // core
      p = new THREE.Vector3(gauss(r), gauss(r) * 0.7, gauss(r)).multiplyScalar(0.05); c = pick(palette.core).clone().multiplyScalar(1.25); s = 0.009 + r() * 0.01; k = 0;
    } else if (x < 0.5) {                 // arms
      const arm = Math.floor(r() * 3), rr = 0.07 + 0.78 * Math.pow(r(), 0.85);
      const th = arm * (Math.PI * 2 / 3) + rr * 5.4 + gauss(r) * 0.28 / (1 + 2.5 * rr);
      const y = gauss(r) * 0.035 * (1 + 1.6 * rr);
      p = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
      const ci = Math.min(palette.arm.length - 1, Math.floor(rr * palette.arm.length * 0.999 + (r() - 0.5) * 1.5 + 0.5));
      c = palette.arm[Math.max(0, ci)].clone().multiplyScalar(0.3 + r() * 0.45); s = 0.006 + r() * 0.01; k = 1;
    } else if (x < 0.78) {                // the shell: filaments where a noise ridges
      let q;
      for (let tries = 0; tries < 30; tries++) {
        q = new THREE.Vector3().randomDirection();
        const ridge = 1 - Math.abs(vnoise(q.x * 3.2 + 5, q.y * 3.2, q.z * 3.2) * 2 - 1);
        if (Math.pow(ridge, 4) > r()) break;
      }
      const rad = 0.62 + gauss(r) * 0.035 + (vnoise(q.x * 6, q.y * 6, q.z * 6) - 0.5) * 0.12;
      p = q.multiplyScalar(rad); c = pick(palette.shell).clone().multiplyScalar(0.45 + r() * 0.65); s = 0.007 + r() * 0.012; k = 2;
    } else if (x < 0.95) {                // halo
      p = new THREE.Vector3().randomDirection().multiplyScalar(0.25 + 1.0 * Math.sqrt(r())); c = pick(palette.halo).clone().multiplyScalar(0.35 + r() * 0.7); s = 0.004 + r() * 0.008; k = 3;
    } else {                              // jets
      const sgn = r() < 0.5 ? -1 : 1, spread = 0.04 * (1 + r());
      p = new THREE.Vector3(gauss(r) * spread, sgn, gauss(r) * spread); c = pick(palette.jet).clone().multiplyScalar(0.7 + r() * 0.6); s = 0.007 + r() * 0.01; k = 4;
    }
    home.set([p.x, p.y, p.z], i * 3); col.set([c.r, c.g, c.b], i * 3); size[i] = s; seedA[i] = r(); kind[i] = k;
  }
  const appleGeo = apple?.skin?.geometry;
  const appleP = appleGeo ? sampleSurface(appleGeo, N, r) : (() => { const a = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const q = new THREE.Vector3().randomDirection().multiplyScalar(0.48); a.set([q.x, q.y, q.z], i * 3); } return a; })();
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(home, 3));
  pg.setAttribute('aHome', new THREE.BufferAttribute(home, 3));
  pg.setAttribute('aApple', new THREE.BufferAttribute(appleP, 3));
  pg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 1));
  pg.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const tilt = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.42, 0, 0.18)));
  const U = {
    uTime: { value: 0 }, uMorph: { value: 1 }, uRush: { value: 0 }, uScale: { value: 1 }, uPulse: { value: 0 }, uTilt: { value: tilt },
  };
  const points = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: U, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false; tumbler.add(points);

  // clouds of glowing gas and of dark dust
  function clouds(count, dark) {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex([0, 2, 1, 2, 3, 1]);
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    const ip = new Float32Array(count * 3), is = new Float32Array(count), ic = new Float32Array(count * 3), id = new Float32Array(count), ia = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let p;
      if (r() < 0.6) { const arm = Math.floor(r() * 3), rr = 0.12 + 0.7 * Math.pow(r(), 0.9), th = arm * (Math.PI * 2 / 3) + rr * 5.4 + gauss(r) * 0.3; p = new THREE.Vector3(Math.cos(th) * rr, gauss(r) * 0.06, Math.sin(th) * rr); }
      else p = new THREE.Vector3().randomDirection().multiplyScalar(0.5 + r() * 0.25);
      ip.set([p.x, p.y, p.z], i * 3);
      is[i] = dark ? 0.16 + r() * 0.3 : 0.22 + r() * 0.5;
      const c = dark ? new THREE.Color(0.012, 0.006, 0.01) : (p.length() > 0.45 ? pick(palette.shell) : (r() < 0.45 ? pick([palette.arm[2], palette.arm[3], palette.jet[0]]) : pick(palette.arm))).clone().multiplyScalar(dark ? 1 : 0.9);
      ic.set([c.r, c.g, c.b], i * 3); id[i] = r(); ia[i] = dark ? 0.5 + r() * 0.3 : 0.035 + r() * 0.05;
    }
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(ip, 3)); g.setAttribute('iScale', new THREE.InstancedBufferAttribute(is, 1));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(ic, 3)); g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(id, 1)); g.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(ia, 1));
    g.instanceCount = count;
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, uGrow: CU.uGrow, uDark: { value: dark ? 1 : 0 } }, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = dark ? 2 : 1;
    return mesh;
  }
  const CU = { uGrow: { value: 1 } };
  const glow = clouds(lite ? 90 : 170, false), dust = clouds(lite ? 24 : 46, true);
  tumbler.add(glow, dust);

  // the heart: a white-hot core in a golden glow
  const disc = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,240,210,0.6)'); g.addColorStop(0.55, 'rgba(255,180,120,0.12)'); g.addColorStop(1, 'rgba(255,160,100,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(1.5, 1.25, 0.95), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  heart.scale.setScalar(0.3); tumbler.add(heart);

  let pulseT = 3 + r() * 4, pulse = -1;
  const api = {
    group, spinner,
    update(dt, t) {
      U.uTime.value = t;
      tumbler.rotation.x += dt * 0.045 * Math.sin(t * 0.13 + 1.1);
      tumbler.rotation.y += dt * (0.06 + 0.035 * Math.sin(t * 0.071));
      tumbler.rotation.z += dt * 0.03 * Math.cos(t * 0.107 + 0.4);
      heart.material.rotation += dt * 0.05;
      const beat = 1 + 0.06 * Math.sin(t * 1.7) + 0.04 * Math.sin(t * 2.9 + 1);
      heart.scale.setScalar(0.3 * beat * (0.25 + 0.75 * U.uMorph.value));
      // now and then a pulse of light runs outward
      pulseT -= dt; if (pulseT <= 0 && pulse < 0) { pulse = 0; pulseT = 5 + r() * 7; }
      if (pulse >= 0) { pulse += dt * 0.55; U.uPulse.value = pulse; if (pulse > 1.4) { pulse = -1; U.uPulse.value = 0; } }
    },
    setMorph(k) { U.uMorph.value = k; CU.uGrow.value = k; heart.visible = k > 0.05; },
    setRush(e) { U.uRush.value = e; },
    // the apple's skin breaks into light, and the points flow out of it
    async becomeFrom(a, { darken = () => {}, bloom = () => {} } = {}) {
      const su = a.skinMat.userData.uniforms;
      group.visible = true; api.setMorph(0); points.visible = false; glow.visible = dust.visible = false;
      await ctx.anim(1.7, (k, e) => { su.uCrack.value = e; darken(0.25 * e); bloom(0.25 * e); }, ctx.ease.in);
      points.visible = true; glow.visible = dust.visible = true;
      const go = ctx.anim(4.2, (k, e) => { api.setMorph(e); darken(0.25 + 0.75 * Math.min(1, k * 1.15)); bloom(0.25 + 0.75 * e); }, ctx.ease.inOutSine);
      await ctx.anim(1.3, (k, e) => { su.uDissolve.value = e; }, ctx.ease.inOut);
      a.root.visible = false; su.uCrack.value = 0; su.uDissolve.value = 0;
      await go;
    },
  };
  return api;
}
