// globe.js — the Earth in space: one ray-traced planet (ground, sea, clouds,
// night lights, air), the stars behind it and the sun.
//
// The planet is drawn on the inside of a sphere a little larger than its air;
// each pixel traces its own ray in the planet's frame, so the ground stays a
// true sphere at any height (from 30 000 km down to a few km over Wilmington).
// The imagery: NASA's Blue Marble (day), Black Marble (night), the clouds of
// one real day (VIIRS, 24 Oct 2025), and three finer crops on the way down
// (the Carolinas, Cape Fear, Wilmington), blended in as the eye gets near.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const R_KM = 6371;

// a lat/lon (degrees) to a unit vector in the planet's frame: +y north, lon 0 at +z, east at +x
export function llToVec(lat, lon, out = new THREE.Vector3()) {
  const a = lat * DEG, b = lon * DEG;
  return out.set(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
}
// the local frame there: east, north, up
export function enuAt(lat, lon) {
  const a = lat * DEG, b = lon * DEG;
  const up = llToVec(lat, lon);
  const north = new THREE.Vector3(-Math.sin(a) * Math.sin(b), Math.cos(a), -Math.sin(a) * Math.cos(b));
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  return { east, north, up };
}

const VERT = /* glsl */`
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vPos;
  uniform vec3 camPos;        // the eye, in the planet's frame (radius 1 = the ground)
  uniform vec3 sunDir;        // toward the sun, planet's frame
  uniform float Ra, Rc;       // top of the air; the cloud shell
  uniform vec3 betaR; uniform float betaM, HR, HM, sunI, mieG;
  uniform sampler2D tDay, tNight, tCloud, tWater, tR1, tR1w, tR2, tR2w, tR3, tR3w, tRC, tLC;
  uniform vec4 boxR1, boxR2, boxR3, boxRC, boxLC;     // lonMin, latMin, lonMax, latMax (radians)
  uniform vec4 detail;                          // how much of R1, R2, R3, RC
  uniform float cloudLon, cloudAmt, lightsAmt, nearK, lcAmt, reliefStep; uniform int nSteps;
  const float PI = 3.14159265;

  vec2 hitSphere(vec3 ro, vec3 rd, float r) {   // (t near, t far); near > far: no hit. The stable form.
    float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h);
    float q = b > 0.0 ? -b - h : -b + h;
    float ta = q, tb = c / q;
    return vec2(min(ta, tb), max(ta, tb));
  }
  // Schuler's Chapman approximation: optical depth (in H) from height h toward a zenith angle cos
  float chapman(float X, float h, float cz) {
    float c = sqrt(X + h);
    if (cz >= 0.0) return c / (c * cz + 1.0) * exp(-h);
    float x0 = sqrt(1.0 - cz * cz) * (X + h);
    float c0 = sqrt(x0);
    return 2.0 * c0 * exp(min(X - x0, 60.0)) - c / (1.0 - c * cz) * exp(-h);
  }
  vec3 sunTrans(float r, float cz) {   // what is left of sunlight at radius r, sun at zenith cos cz
    float h = r - 1.0;
    float shade = 1.0;
    if (cz < 0.0) shade = smoothstep(0.9985, 1.004, r * sqrt(1.0 - cz * cz));   // behind the planet
    vec3 tau = betaR * HR * chapman(1.0 / HR, h / HR, cz) + betaM * 1.1 * HM * chapman(1.0 / HM, h / HM, cz);
    return exp(-tau) * shade;
  }
  // the global maps wrap at the date line: pick the gradient of the unwrapped coordinate
  vec4 sampleWrap(sampler2D t, vec2 uv) {
    vec2 uvB = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
    vec2 dxA = dFdx(uv), dyA = dFdy(uv), dxB = dFdx(uvB), dyB = dFdy(uvB);
    vec2 dx = abs(dxA.x) < abs(dxB.x) ? dxA : dxB, dy = abs(dyA.x) < abs(dyB.x) ? dyA : dyB;
    return textureGrad(t, uv, dx, dy);
  }
  float boxW(vec2 uv, float e) {
    vec2 a = smoothstep(vec2(0.0), vec2(e), uv) * smoothstep(vec2(0.0), vec2(e), 1.0 - uv);
    return a.x * a.y;
  }
  vec2 boxUV(vec2 ll, vec4 b) { return (ll - b.xy) / (b.zw - b.xy); }

  vec3 dayColor(vec2 ll, vec2 guv, out float water) {
    vec3 c = sampleWrap(tDay, guv).rgb;
    water = sampleWrap(tWater, guv).r;
    vec2 u1 = boxUV(ll, boxR1); float w1 = detail.x * boxW(u1, 0.07);
    if (w1 > 0.0) { c = mix(c, texture2D(tR1, u1).rgb, w1); water = mix(water, texture2D(tR1w, u1).r, w1); }
    vec2 u2 = boxUV(ll, boxR2); float w2 = detail.y * boxW(u2, 0.09);
    if (w2 > 0.0) { c = mix(c, texture2D(tR2, u2).rgb, w2); water = mix(water, texture2D(tR2w, u2).r, w2); }
    vec2 u3 = boxUV(ll, boxR3); float w3 = detail.z * boxW(u3, 0.08);
    if (w3 > 0.0) { c = mix(c, texture2D(tR3, u3).rgb, w3); water = mix(water, texture2D(tR3w, u3).r, w3); }
    return c;
  }
  float cloudAt(vec3 n) {
    float lon = atan(n.x, n.z) - cloudLon, lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 ll = vec2(lon, lat);
    float c = sampleWrap(tCloud, vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5)).r;
    vec2 uc = boxUV(vec2(atan(n.x, n.z) - cloudLon, lat), boxRC); float wc = detail.w * boxW(uc, 0.1);
    if (wc > 0.0) c = mix(c, texture2D(tRC, uc).r, wc);
    // the town's own deck of cumulus (the same field the town's sky is made of), close to the ground
    vec2 ul = boxUV(vec2(atan(n.x, n.z), lat), boxLC);
    if (lcAmt > 0.0 && ul.x > 0.0 && ul.x < 1.0 && ul.y > 0.0 && ul.y < 1.0) c = mix(c, texture2D(tLC, ul).r, lcAmt * boxW(ul, 0.25));
    return c * cloudAmt;
  }

  void main() {
    vec3 ro = camPos, rd = normalize(vPos - camPos);
    vec2 ta = hitSphere(ro, rd, Ra);
    if (ta.x > ta.y || ta.y < 0.0) discard;
    float t0 = max(ta.x, 0.0), t1 = ta.y;
    vec2 tg = hitSphere(ro, rd, 1.0);
    bool ground = tg.x <= tg.y && tg.x > 0.0;
    if (ground) t1 = tg.x;
    vec2 tc = hitSphere(ro, rd, Rc);
    float tCl = (tc.x <= tc.y && tc.x > 0.0 && length(ro) > Rc && (!ground || tc.x < tg.x)) ? tc.x : -1.0;

    // ---- the air along the ray: single scattering, 20 steps, the light to the sun by Chapman
    float mu = dot(rd, sunDir);
    float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    float g2 = mieG * mieG;
    float pM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * mieG * mu, 1.5));
    int N = nSteps;
    float seg = t1 - t0, ds = seg / float(N);
    float dith = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 sumR = vec3(0.0), sumM = vec3(0.0), cR = vec3(0.0), cM = vec3(0.0), Tc = vec3(1.0);
    float odR = 0.0, odM = 0.0;
    bool past = tCl < 0.0;
    for (int i = 0; i < 24; i++) {
      if (i >= N) break;
      float t = t0 + ds * (float(i) + dith);
      vec3 p = ro + rd * t;
      float r = length(p), h = r - 1.0;
      float dR = exp(-h / HR) * ds, dM = exp(-h / HM) * ds;
      if (!past && t > tCl) { past = true; cR = sumR; cM = sumM; Tc = exp(-(betaR * odR + betaM * 1.1 * odM)); }
      odR += dR; odM += dM;
      vec3 att = exp(-(betaR * odR + betaM * 1.1 * odM)) * sunTrans(r, dot(p, sunDir) / r);
      sumR += dR * att; sumM += dM * att;
    }
    if (!past) { cR = sumR; cM = sumM; Tc = exp(-(betaR * odR + betaM * 1.1 * odM)); }
    vec3 Tall = exp(-(betaR * odR + betaM * 1.1 * odM));
    vec3 Iall = sunI * (sumR * betaR * pR + sumM * betaM * pM);
    vec3 Icl = sunI * (cR * betaR * pR + cM * betaM * pM);

    // ---- the ground
    vec3 G = vec3(0.0);
    if (ground) {
      vec3 P = ro + rd * tg.x, n = normalize(P);
      float lon = atan(n.x, n.z), lat = asin(clamp(n.y, -1.0, 1.0));
      vec2 ll = vec2(lon, lat), guv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
      float water;
      vec3 alb = dayColor(ll, guv, water);
      alb *= mix(1.0, 0.7, water * 0.6);
      float NL = dot(n, sunDir);
      vec3 Ts = sunTrans(1.0, NL);
      // the clouds' shadow, where the sunbeam to this point crosses the shell
      float hc = Rc - 1.0;
      vec3 q = n + sunDir * (hc / max(NL, 0.18));
      float sh = 1.0 - 0.72 * smoothstep(0.05, 0.8, cloudAt(normalize(q)));
      vec3 E = sunI * Ts * max(NL, 0.0) * sh + sunI * 0.07 * vec3(0.55, 0.75, 1.0) * smoothstep(-0.25, 0.6, NL);
      G = alb / PI * E;
      // the sea: the sun's glint and the sky in it
      if (water > 0.01) {
        vec3 V = -rd, H = normalize(sunDir + V);
        float NH = max(dot(n, H), 0.0), NV = max(dot(n, V), 0.05);
        float a = mix(0.085, 0.24, nearK), a2 = a * a;
        float D = a2 / (PI * pow(NH * NH * (a2 - 1.0) + 1.0, 2.0));
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
        vec3 spec = sunI * Ts * D * F / (4.0 * NV) * max(NL, 0.0) / max(NL, 0.05) * smoothstep(0.0, 0.08, NL);
        float Fv = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
        G += water * (spec * sh + Fv * sunI * 0.05 * vec3(0.35, 0.55, 1.0) * smoothstep(-0.2, 0.4, NL));
      }
      // the lights of towns, past the terminator
      float lights = sampleWrap(tNight, guv).r;
      float night = smoothstep(0.1, -0.14, NL);
      float cl = cloudAt(n);
      G += lightsAmt * night * pow(lights, 1.15) * vec3(1.0, 0.68, 0.38) * 2.6 * (1.0 - 0.8 * smoothstep(0.1, 0.7, cl));
    }

    // ---- the clouds
    vec3 C = vec3(0.0); float ca = 0.0;
    if (tCl > 0.0) {
      vec3 Q = ro + rd * tCl, nc = normalize(Q);
      float c = cloudAt(nc);
      vec3 ts = sunDir - nc * dot(sunDir, nc);
      float tl = length(ts);
      float relief = 1.0;
      if (tl > 1e-3) {
        float c2 = cloudAt(normalize(nc + ts / tl * reliefStep));
        relief = clamp(1.0 - (c2 - c) * 2.2, 0.45, 1.25);
      }
      float NLc = dot(nc, sunDir);
      vec3 Tsc = sunTrans(Rc, NLc);
      float lit = smoothstep(-0.16, 0.22, NLc);
      vec3 Ec = sunI * Tsc * (0.16 + 0.84 * max(NLc, 0.0)) * lit * relief + sunI * 0.05 * vec3(0.6, 0.75, 1.0) * smoothstep(-0.2, 0.5, NLc);
      C = 0.82 / PI * Ec * mix(0.82, 1.0, smoothstep(0.2, 0.9, c));
      ca = smoothstep(0.1, 0.82, c) * 0.97;
    }

    vec3 col; float alpha;
    if (ground) {
      vec3 under = Iall - Icl + Tall * G;
      col = Icl + Tc * ca * C + (1.0 - ca) * under;
      alpha = 1.0;
    } else {
      vec3 under = Iall - Icl;
      col = Icl + Tc * ca * C + (1.0 - ca) * under;
      float tm = (Tall.r + Tall.g + Tall.b) / 3.0;
      alpha = clamp(1.0 - (1.0 - ca) * tm - ca * 0.0, 0.0, 1.0);
      alpha = max(alpha, ca);
    }
    gl_FragColor = vec4(col, alpha);
  }`;

// the sky behind: stars with their colours, and a faint Milky Way
function makeStars(quality) {
  const n = quality === 'lite' ? 4500 : 9000;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the galactic plane, tilted across the sky
  const gp = new THREE.Vector3(0.3, 0.85, -0.42).normalize();
  const temps = [[0.62, 0.72, 1.0], [0.8, 0.86, 1.0], [1.0, 1.0, 1.0], [1.0, 0.94, 0.82], [1.0, 0.82, 0.62], [1.0, 0.7, 0.5]];
  for (let i = 0; i < n; i++) {
    let v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
    v.normalize();
    if (rnd() < 0.45) { v.addScaledVector(gp, -v.dot(gp) * (0.75 + 0.25 * rnd())); v.normalize(); }   // crowd toward the band
    pos.set([v.x, v.y, v.z], i * 3);
    const m = Math.pow(rnd(), 3.2);              // most stars faint, a few bright
    const t = temps[Math.min(5, Math.floor(Math.pow(rnd(), 0.9) * 6))];
    const b = 0.25 + m * 3.2;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    size[i] = 1.0 + m * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 1 }, fade: { value: 1 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
      void main() { vC = color; vec4 p = modelViewMatrix * vec4(position * 50.0, 1.0); gl_Position = projectionMatrix * p; gl_PointSize = size * scale; }`,
    fragmentShader: `varying vec3 vC; uniform float fade;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = exp(-r * r * 4.0) + 0.25 * exp(-r * 9.0);
        gl_FragColor = vec4(vC * a * fade, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false; stars.renderOrder = 0;
  // the band of the galaxy: a soft glow on a sphere around the eye
  const band = new THREE.Mesh(new THREE.SphereGeometry(48, 48, 24), new THREE.ShaderMaterial({
    uniforms: { gp: { value: gp }, fade: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 gp; uniform float fade;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        float d = dot(vD, gp);
        float f = 0.0, a = 0.5; vec3 p = vD * 3.0;
        for (int i = 0; i < 5; i++) { f += a * n3(p); p *= 2.1; a *= 0.5; }
        float band = exp(-d * d * 22.0) * (0.35 + 0.9 * f * f);
        float dust = smoothstep(0.55, 0.75, n3(vD * 9.0 + 3.0)) * exp(-d * d * 120.0);
        vec3 c = mix(vec3(0.45, 0.5, 0.75), vec3(0.9, 0.78, 0.62), f) * band * (1.0 - 0.7 * dust);
        gl_FragColor = vec4(c * 0.022 * fade, 1.0);
      }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  }));
  band.renderOrder = -1; band.frustumCulled = false;
  return { stars, band };
}

// the sun: a white-hot disc and its glare (seen when the eye turns toward it)
function makeSun() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { k: { value: 1 } },
    vertexShader: 'varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vU; uniform float k;
      void main() { float r = length(vU);
        float disc = smoothstep(0.065, 0.055, r) * 40.0;
        float glare = exp(-r * 9.0) * 3.0 + exp(-r * 3.2) * 0.5;
        float rays = pow(abs(sin(atan(vU.y, vU.x) * 3.0)), 30.0) * exp(-r * 4.0) * 0.6;
        vec3 c = vec3(1.0, 0.95, 0.86) * (disc + glare + rays) * (1.0 - smoothstep(0.7, 1.0, r));
        gl_FragColor = vec4(c * k, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  sun.renderOrder = 1; sun.frustumCulled = false;
  return sun;
}

export function createGlobe(ctx, T) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.0005, 200);

  // earth (turned by the hand) > spinner (my slow turning, about the pole) > planet (the mesh that is traced)
  const earth = new THREE.Group();
  const spinner = new THREE.Group();
  earth.add(spinner);
  const Ra = 1.032, HR = 0.0034, HM = 0.0006;
  const uniforms = {
    camPos: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(1, 0, 0) },
    Ra: { value: Ra }, Rc: { value: 1.0042 },
    // Rayleigh and Mie per planet radius, the scale heights stretched ~2.3x so the rim reads (the column kept near Earth's)
    betaR: { value: new THREE.Vector3(5.8e-3, 13.5e-3, 33.1e-3).multiplyScalar(R_KM * 8 / (HR * R_KM)) },
    betaM: { value: 4e-3 * R_KM * 1.2 / (HM * R_KM) * 0.9 },
    HR: { value: HR }, HM: { value: HM }, sunI: { value: 7.5 }, mieG: { value: 0.76 },
    tDay: { value: T.day }, tNight: { value: T.night }, tCloud: { value: T.clouds }, tWater: { value: T.water },
    tR1: { value: T.r1 }, tR1w: { value: T.r1w }, tR2: { value: T.r2 }, tR2w: { value: T.r2w }, tR3: { value: T.r3 }, tR3w: { value: T.r3w }, tRC: { value: T.rc }, tLC: { value: T.lc },
    boxR1: { value: new THREE.Vector4(-84, 30.5, -74, 38).multiplyScalar(DEG) },
    boxR2: { value: new THREE.Vector4(-78.75, 33.55, -77.25, 34.85).multiplyScalar(DEG) },
    boxR3: { value: new THREE.Vector4(-78.0, 34.12, -77.76, 34.32).multiplyScalar(DEG) },
    boxRC: { value: new THREE.Vector4(-86, 26, -66, 42).multiplyScalar(DEG) },
    boxLC: { value: new THREE.Vector4(0, 0, 1, 1) },
    detail: { value: new THREE.Vector4(1, 0, 0, 1) },
    cloudLon: { value: 0 }, cloudAmt: { value: 1 }, lightsAmt: { value: 1 }, nearK: { value: 0 }, lcAmt: { value: 0 }, reliefStep: { value: 0.0035 }, nSteps: { value: 20 },
  };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(Ra * 1.012, 128, 64), new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  }));
  planet.renderOrder = 2; planet.frustumCulled = false;
  spinner.add(planet);
  scene.add(earth);

  const { stars, band } = makeStars(ctx.quality);
  const sky = new THREE.Group(); sky.add(band, stars); scene.add(sky);
  const sun = makeSun(); scene.add(sun);
  const sunWorld = new THREE.Vector3(0.92, -0.12, 0.3).normalize();

  const inv = new THREE.Matrix4(), tmp = new THREE.Vector3(), q = new THREE.Quaternion();
  function sync() {
    earth.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    inv.copy(planet.matrixWorld).invert();
    uniforms.camPos.value.copy(camera.position).applyMatrix4(inv);
    planet.getWorldQuaternion(q).invert();
    uniforms.sunDir.value.copy(sunWorld).applyQuaternion(q).normalize();
    sky.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(sunWorld, 40);
    sun.quaternion.copy(camera.quaternion);
    sun.scale.setScalar(40 * 0.35);
    stars.material.uniforms.scale.value = ctx.size.scale || 1;
  }
  return { scene, camera, earth, spinner, planet, uniforms, sunWorld, sync, stars, band, sun };
}
