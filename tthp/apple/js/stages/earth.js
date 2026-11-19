// earth.js — the Earth, and the way down to an apple on a cutting board.
//
// Colin, 18 November 2026: "We zoom into, entering, the universe, until we
// arrive at the earth, which is also able to be spun omnidirectionally ...
// then we should zoom into Wilmington, North Carolina, on the Earth, all the
// way into a house (don't actually show my address, just make it a nice zoom
// in transition) until you arrive at a top view of a cutting board with an
// apple sitting on it."
//
// Three worlds, one flight: the globe in space (earth/globe.js: NASA's Blue
// and Black Marble, a real day's clouds, finer real imagery on the way down),
// the town from a few kilometres up to one roof (earth/city.js: the satellite
// ground, a made-up neighbourhood, a deck of cumulus), and the kitchen under
// that roof's skylight (earth/kitchen.js). The eye falls at a steady pace in
// powers of e, slowing in the clouds and at the roof; each world hands the eye
// to the next where they show the same thing.
import * as THREE from 'three';
import { createGlobe, enuAt, DEG, R_KM } from './earth/globe.js';
import { createCity, bakeCloudField, CLOUD_SIZE } from './earth/city.js';
import { createKitchen, U } from './earth/kitchen.js';

// the made-up neighbourhood sits in Wilmington's older streets, east of downtown (no real house is shown)
const TGT = { lat: 34.2200, lon: -77.9150 };

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function loadTextures(ctx) {
  const lite = ctx.quality === 'lite';
  const loader = new THREE.TextureLoader();
  const url = (f) => ctx.asset('earth/' + f);
  const aniso = ctx.renderer.capabilities.getMaxAnisotropy();
  const get = async (f, { srgb = true, wrap = false } = {}) => {
    const t = await loader.loadAsync(url(f));
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    if (wrap) t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const big = lite ? '2048' : '4096';
  const [day, night, clouds, water, r1, r1w, r2, r2w, r3, r3w, rc] = await Promise.all([
    get(`day_${big}.jpg`, { wrap: true }), get(`night_${big}.jpg`, { srgb: false, wrap: true }), get(`clouds_${big}.jpg`, { srgb: false, wrap: true }),
    get('water_2048.png', { srgb: false, wrap: true }), get('r1.jpg'), get('r1_water.png', { srgb: false }), get('r2.jpg'), get('r2_water.png', { srgb: false }),
    get('r3.jpg'), get('r3_water.png', { srgb: false }), get('rc_clouds.jpg', { srgb: false }),
  ]);
  return { day, night, clouds, water, r1, r1w, r2, r2w, r3, r3w, rc };
}

export async function createEarth(ctx) {
  const { renderer } = ctx;
  const lite = ctx.quality === 'lite';
  if (!renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const T = await loadTextures(ctx);
  T.lc = bakeCloudField(renderer, lite ? 1024 : 2048);

  // where the town is on the globe, and metres per degree there
  const geo = { lat0: TGT.lat, lon0: TGT.lon, mLat: 110950, mLon: 111320 * Math.cos(TGT.lat * DEG) };
  const G = createGlobe(ctx, T);
  {
    const dLon = CLOUD_SIZE / 2 / geo.mLon, dLat = CLOUD_SIZE / 2 / geo.mLat;
    G.uniforms.boxLC.value.set(TGT.lon - dLon, TGT.lat - dLat, TGT.lon + dLon, TGT.lat + dLat).multiplyScalar(DEG);
  }
  const C = createCity(ctx, T, T.lc, geo);
  const K = createKitchen(ctx);

  // send everything to the GPU now, a little each frame, so the first look at each world does not stall
  for (const t of Object.values(T)) { renderer.initTexture(t); await nextFrame(); }
  try {
    await renderer.compileAsync(G.scene, G.camera);
    await renderer.compileAsync(C.stage.scene, C.camera);
    await renderer.compileAsync(K.stage.scene, K.stage.camera);
  } catch { /* older browsers: they compile on first sight */ }

  // ---- the globe's own state
  const cam = G.camera;
  const enu = enuAt(TGT.lat, TGT.lon);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, 0, -0.26, 'XYZ'));   // the axis leaning, as in the pictures
  let mode = 'present';      // 'present' (turning, framed) | 'fly' (the descent drives it)
  const spinRate = (2 * Math.PI) / 150;

  function presentDistance() {
    const a = ctx.size.w / ctx.size.h, t = Math.tan((cam.fov / 2) * DEG);
    // the globe's diameter about 56% of the height (or 74% of the width on a narrow screen)
    const tanA = Math.min(0.56 * t, 0.74 * t * a);
    return Math.sqrt(1 + 1 / (tanA * tanA));   // sin(alpha) = 1/d, tan(alpha) = tanA
  }
  function framePresent() {
    cam.fov = 36;
    cam.position.set(0, 0, presentDistance());
    cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
    cam.near = 0.01; cam.far = 200; cam.updateProjectionMatrix();
  }

  const stage = {
    scene: G.scene, camera: cam,
    bloom: { strength: 0.3, radius: 0.5, threshold: 1.25 }, exposure: 1.0,
    update(dt) {
      const a = ctx.size.w / ctx.size.h;
      if (Math.abs(cam.aspect - a) > 1e-4) { cam.aspect = a; cam.updateProjectionMatrix(); }
      if (mode === 'present') {
        G.spinner.rotation.y += dt * spinRate;
        const d = presentDistance();
        if (Math.abs(cam.position.z - d) > 1e-4) { cam.position.set(0, 0, d); cam.lookAt(0, 0, 0); }
      }
      G.uniforms.cloudLon.value += dt * 0.0012 * (mode === 'present' ? 1 : 0.3);
      G.sync();
    },
  };

  // the point the "Earth" label hangs below: the globe's lowest point on the screen
  const lv = new THREE.Vector3(), up = new THREE.Vector3(), toCam = new THREE.Vector3();
  function labelAt() {
    toCam.copy(cam.position); const d = toCam.length(); toCam.normalize();
    up.setFromMatrixColumn(cam.matrixWorld, 1); up.addScaledVector(toCam, -up.dot(toCam)).normalize();
    const R = 1.008, s = R / d, c = Math.sqrt(Math.max(0, 1 - s * s));
    return lv.copy(up).multiplyScalar(-R * c).addScaledVector(toCam, R * s);
  }

  // ---- the flight: log-altitude L = ln(metres above the skylight) falls at a speed that depends on where it is
  const LN = Math.log;
  function speed(L) {   // e-folds per second
    const seg = [[17.5, 1.0], [16.5, 1.0], [15.0, 1.6], [10.5, 1.75], [9.2, 1.4], [8.0, 1.0], [7.55, 0.8], [6.75, 0.72], [6.3, 1.1], [5.8, 1.45], [3.4, 1.4], [1.2, 1.0], [0.0, 0.75]];
    if (L >= seg[0][0]) return seg[0][1];
    for (let i = 1; i < seg.length; i++) if (L >= seg[i][0]) { const [l0, v0] = seg[i - 1], [l1, v1] = seg[i]; const k = (L - l1) / (l0 - l1); return v1 + (v0 - v1) * (k * k * (3 - 2 * k)); }
    return seg[seg.length - 1][1];
  }
  const L_HAND = LN(5600), L_END = LN(1.25), RAMP = 1.3, DT = 1 / 240;
  function table(L0) {   // time -> L, integrated once per flight
    const out = [L0]; let L = L0, t = 0;
    while (L > L_END && out.length < 20000) { const r = Math.min(1, t / RAMP); L -= speed(L) * (0.08 + 0.92 * r * r * (3 - 2 * r)) * DT; t += DT; out.push(Math.max(L, L_END)); }
    return out;
  }
  const Lat = (tab, t) => { const i = t / DT, i0 = Math.min(tab.length - 1, Math.floor(i)), i1 = Math.min(tab.length - 1, i0 + 1); return tab[i0] + (tab[i1] - tab[i0]) * (i - i0); };
  const timeOf = (tab, L) => { for (let i = 0; i < tab.length; i++) if (tab[i] <= L) return i * DT; return (tab.length - 1) * DT; };

  // the globe's turn: where the eye ends (swung toward the sun so the sun stands 45 degrees high over the town), the planet's rotation to bring the town there
  function finalFrame() {
    const s = G.sunWorld, z = new THREE.Vector3(0, 0, 1);
    const axis = new THREE.Vector3().crossVectors(z, s).normalize();
    const D1 = z.clone().applyAxisAngle(axis, z.angleTo(s) - 45 * DEG);
    const u1 = new THREE.Vector3(0, 1, 0).addScaledVector(D1, -D1.y).normalize();
    const e1 = new THREE.Vector3().crossVectors(u1, D1).normalize();
    const Ml = new THREE.Matrix4().makeBasis(enu.east, enu.north, enu.up);
    const Mw = new THREE.Matrix4().makeBasis(e1, u1, D1);
    const Qw = new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
    // the sun as the town sees it: x east, y up, z south
    const sunLocal = new THREE.Vector3(s.dot(e1), s.dot(D1), -s.dot(u1)).normalize();
    return { D1, Qw, sunLocal };
  }

  // the globe's look at a moment of the flight (k: the turn's progress, A: altitude in metres)
  const Z = new THREE.Vector3(0, 0, 1), Dv = new THREE.Vector3(), Yv = new THREE.Vector3(0, 1, 0);
  const qa = new THREE.Quaternion(), qs = new THREE.Quaternion();
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function globeAt(F, k, A) {
    const Akm = A / 1000;
    G.earth.quaternion.slerpQuaternions(F.q0, F.q1, k);
    qs.setFromUnitVectors(Z, F.D1); qa.identity().slerp(qs, k);
    Dv.copy(Z).applyQuaternion(qa).normalize();
    const r = 1 + A / (R_KM * 1000);
    cam.position.copy(Dv).multiplyScalar(r);
    cam.up.copy(Yv).addScaledVector(Dv, -Dv.y).normalize();
    cam.lookAt(0, 0, 0);
    cam.fov = 36 + 14 * sm(15000, 300, Akm);
    cam.near = Math.max(1e-6, (A / (R_KM * 1000)) * 0.3); cam.far = r + 3; cam.updateProjectionMatrix();
    const u = G.uniforms;
    u.detail.value.set(1, sm(1500, 450, Akm), sm(140, 45, Akm), 1);
    u.lcAmt.value = sm(70, 18, Akm);
    u.nearK.value = sm(3500, 300, Akm);
    u.Rc.value = 1 + Math.min(0.0042, 0.25 * A / (R_KM * 1000));
    u.reliefStep.value = Math.min(0.0035, Math.max(0.00002, 0.25 * A / (R_KM * 1000)));
    u.lightsAmt.value = 1;
    u.nSteps.value = Akm > 400 ? 20 : Akm > 40 ? 14 : 8;
  }
  // the town's look at an altitude (metres above the skylight)
  function cityAt(A) {
    C.camera.position.set(0, C.skyWorld.y + A, 0.0001 * Math.max(1, A));
    C.camera.up.set(0, 0, -1);
    C.camera.lookAt(0, C.skyWorld.y, 0);
    C.camera.fov = 50;
    C.setReveal(sm(1950, 1250, A));
    C.frame(A);
  }

  let flying = null;
  async function descend({ before } = {}) {
    mode = 'fly';
    ctx.spin.set([], null);
    const F = finalFrame();
    F.q0 = G.earth.quaternion.clone();
    F.q1 = F.Qw.clone().multiply(G.spinner.quaternion.clone().invert());
    if (F.q0.dot(F.q1) < 0) { F.q1.x *= -1; F.q1.y *= -1; F.q1.z *= -1; F.q1.w *= -1; }
    C.setSun(F.sunLocal);
    const A0 = (cam.position.length() - 1) * R_KM * 1000;
    const tab = table(LN(A0));
    const total = (tab.length - 1) * DT;
    const tHand = timeOf(tab, L_HAND);
    const TURN = Math.min(5.2, tHand * 0.55);
    let handed = false, placing = null;
    const transitions = [];
    flying = { tab, total, tHand };
    await ctx.anim(total, (k) => {
      const t = k * total, L = Lat(tab, t), A = Math.exp(L);
      const kt = Math.min(1, t / TURN), turn = kt < 0.5 ? 4 * kt * kt * kt : 1 - Math.pow(-2 * kt + 2, 3) / 2;
      globeAt(F, turn, A);
      cityAt(A);
      if (!handed && t >= tHand - 0.45) {
        handed = true;
        placing = Promise.resolve(before?.());
        transitions.push(ctx.transition(C.stage, { style: 'fade', duration: 0.9, easing: ctx.ease.inOutSine }));
      }
    }, ctx.ease.linear);
    await Promise.all(transitions);
    // through the skylight: the kitchen opens below while the eye keeps falling toward the glass
    await placing;
    const h0 = K.ceilingY + 0.6 * U - K.boardTop, h1 = K.finalHeight();
    K.unrest();
    K.view(h0);
    const glassFrom = Math.exp(L_END);
    const toKitchen = ctx.transition(K.stage, { style: 'fade', duration: 0.55, easing: ctx.ease.inOutSine,
      during: (k) => { cityAt(glassFrom * (1 - 0.75 * k)); } });
    const DUR = 2.9, lh0 = LN(h0), lh1 = LN(h1);
    await ctx.anim(DUR, (k) => {
      const e = 1 - Math.pow(1 - k, 2.3);
      K.view(Math.exp(lh0 + (lh1 - lh0) * e));
    }, ctx.ease.linear);
    await toKitchen;
    K.rest();
    flying = null;
  }

  // draw each world once, out of sight, in the states the flight will show (every shader, shadow and texture ready before it is needed)
  {
    const warm = new THREE.WebGLRenderTarget(96, 60, { type: THREE.HalfFloatType });
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(warm);
    const F = finalFrame(); F.q0 = G.earth.quaternion.clone(); F.q1 = F.q0.clone();
    for (const A of [2e7, 3e5, 8000]) { globeAt(F, 0, A); G.sync(); renderer.render(G.scene, G.camera); await nextFrame(); }
    for (const A of [6000, 1300, 300, 30, 2]) { cityAt(A); renderer.render(C.stage.scene, C.camera); await nextFrame(); }
    K.view(K.finalHeight()); renderer.render(K.stage.scene, K.stage.camera); K.dim(1); renderer.render(K.stage.scene, K.stage.camera); K.dim(0);
    renderer.setRenderTarget(prev); warm.dispose();
    G.uniforms.nSteps.value = 20; C.setReveal(1);
  }

  return {
    stage,
    kitchen: K.stage,
    earth: G.earth,
    board: K.board,
    labelAt,
    async present() {
      mode = 'present'; flying = null;
      G.earth.quaternion.copy(tilt);
      G.spinner.rotation.set(0, 38 * DEG, 0);   // the Atlantic toward the eye: the Americas, Europe, Africa
      framePresent();
      const u = G.uniforms;
      u.detail.value.set(1, 0, 0, 1); u.lcAmt.value = 0; u.nearK.value = 0; u.Rc.value = 1.0042; u.reliefStep.value = 0.0035; u.lightsAmt.value = 1; u.nSteps.value = 20;
      C.setReveal(1);
      K.unrest(); K.dim(0);
      G.sync();
    },
    descend,
    showKitchen() {
      K.dim(0); K.rest();
      const d = Number(ctx.params.get('edim'));   // a check from outside: ?edim=k dims the kitchen a moment after it is shown
      if (d) setTimeout(() => K.dim(d), 1200);
    },
    dim(k) { K.dim(k); },
    // for checking from outside
    _debug: { G, C, K, cityAt, globeAt, get flying() { return flying; } },
  };
}
