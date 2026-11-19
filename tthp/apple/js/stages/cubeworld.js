// cubeworld.js — the cubic planet, and what happens on it.
//
// Colin: "a cubic planet ... one side of the cube is full of soil. We continue to zoom into this cubic
// planet until we are close to the soil, top down, taking up the entire screen. A green sprout
// emerges, grows into a large trunked tree as we zoom out a bit, viewing the tree from an angle, and
// then a door is laser-cut into the wide trunk, and when we enter this hollow trunk ... there is a
// empty tree room with just one thing: a mirror." Then the camera, if it is given, in the mirror; the
// glowing words; and all the way back out to the universe on black.
//
// The flight (cosmos.js) ends looking at this planet; this world takes over with a short cross-fade
// from exactly the same view, dives to the soil, and plays the rest. Metres throughout; the tree's
// place is the origin, the soil face the plane y = 0 near it.
//
// For building and checking: ?cubeskip=sprout|grow|door|room|out starts play() at that part.
import * as THREE from 'three';
import { noise3D } from './cube/bake.js';
import { makeSky, makeFarStars, makeGlow } from './cube/space.js';
import { createCubeBody, CUBE } from './cube/planet.js';
import { createGround } from './cube/ground.js';
import { createSprout } from './cube/sprout.js';
import { createTree, TREE } from './cube/tree.js';
import { createLaserFX } from './cube/door.js';
import { createRoom } from './cube/room.js';
import { smooth, lerp } from './cube/glsl.js';

const V3 = THREE.Vector3;
const Y = new V3(0, 1, 0), ORIGIN = new V3(), CENTRE = new V3(0, -CUBE.HALF, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const PARTS = ['approach', 'sprout', 'grow', 'door', 'room', 'out'];

export async function createCubeWorld(ctx) {
  const { renderer } = ctx;
  const lite = ctx.quality === 'lite';
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const noise = noise3D(renderer, lite);
  // our sun casts the only shadows in the piece (a renderer setting; lights that cast none are untouched by it)
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, ctx.size.w / ctx.size.h, 0.05, 30000);
  scene.fog = new THREE.FogExp2(new THREE.Color(0.5, 0.68, 0.95), 0);

  // ---- sky, stars, the sun and the light it gives
  const sky = makeSky(noise, { air: true }); sky.uniforms.uSun.value.copy(CUBE.SUN); scene.add(sky.mesh);
  const stars = makeFarStars(lite ? 8000 : 18000); scene.add(stars.points);
  const sunDisc = makeGlow({ color: new THREE.Color(1.0, 0.93, 0.8), size: 1, intensity: 3.2, rays: 0.45 });
  sunDisc.mesh.material.fog = false; scene.add(sunDisc.mesh);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.3);
  sun.castShadow = true; sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9cb8ff, 0x3b2a1d, 0.3); scene.add(hemi);
  {
    const envScene = new THREE.Scene(), envSky = makeSky(noise, { air: true });
    envSky.uniforms.uAir.value = 1; envSky.uniforms.uEnv.value = 1; envSky.uniforms.uSun.value.copy(CUBE.SUN);
    envScene.add(envSky.mesh);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.02, 0.1, 100).texture;
    pm.dispose(); envSky.mesh.geometry.dispose(); envSky.mesh.material.dispose();
  }
  await nextFrame();

  // ---- the planet, its soil, the seedling, the tree, the laser's light, the room
  const body = createCubeBody(ctx, { noise, soilTop: false }); scene.add(body.group);
  const ground = createGround(ctx, { noise }); scene.add(ground.group);
  await nextFrame();
  // the eye comes down along fwdH; beside the sprout it sits at azS; when the tree is grown, at azE (the door faces it)
  const fwdH = new V3(-CUBE.ARRIVE.x, 0, -CUBE.ARRIVE.z).normalize();
  const azS = Math.atan2(-fwdH.z, -fwdH.x), azE = azS + 147 * Math.PI / 180;
  const tree = createTree(ctx, { noise }); scene.add(tree.group);
  tree.buildDoor(azE);
  const sunU = { uSunV: tree.U.uSunV, uSunC: tree.U.uSunC };
  const sprout = createSprout(ctx, { sunU, bend: new V3(-fwdH.z, 0, fwdH.x) }); scene.add(sprout.group);
  await nextFrame();
  const laser = createLaserFX(ctx, { noise }); scene.add(laser.group);
  const room = createRoom(ctx, { tree, noise, sunU }); scene.add(room.group);
  scene.add(room.spot, room.spot.target, room.fill);   // lights stay in the scene: one appearing would rebuild every material
  const SPOT = room.spot.intensity, FILL = room.fill.intensity;

  // ---- what the eye attends to, and how the picture is exposed
  const S = {
    focus: new V3(), fdist: 3000, shadowFocus: new V3(), extent: 300, reach: 600, laserAt: null, laserN: new V3(),
    exposure: 1.0, bloom: { strength: 0.75, radius: 0.48, threshold: 0.6 }, inRoom: 0, hold: null,
  };
  const stage = { scene, camera, bloom: { strength: 0.75, radius: 0.48, threshold: 0.6 }, exposure: 1.0, update };
  function look(pos, target, up = Y) {
    camera.position.copy(pos); camera.up.copy(up); camera.lookAt(target);
    S.focus.copy(target); S.fdist = Math.max(1e-3, pos.distanceTo(target));
  }
  const orbit = (target, dist, el, az, out) => out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(dist).add(target);

  const tmp = new V3();
  function update(dt, t) {
    if (S.hold) {   // standing before the mirror: the eye breathes
      S.hold.t += dt;
      const h = S.hold, k = Math.min(1, h.t / 16);
      tmp.copy(h.pos).addScaledVector(h.toward, 0.22 * (1 - Math.pow(1 - k, 2))).add(new V3(Math.sin(h.t * 0.41) * 0.012, Math.sin(h.t * 0.53) * 0.008, 0));
      look(tmp, h.target);
    }
    camera.near = clamp(S.fdist * 0.035, 0.0015, 60);
    camera.far = Math.max(4000, S.fdist * 30);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // air pooled over the soil face: a sky, a haze; away from it, space
    const air = 1 - smooth(260, 1700, camera.position.length());
    sky.uniforms.uAir.value = air;
    stars.uniforms.uBright.value = 1 - 0.88 * air; stars.uniforms.uPx.value = ctx.size.scale;
    scene.fog.density = 0.0013 * air * (1 - smooth(30, 420, camera.position.y));   // haze lies along the ground, not above it
    ground.U.uCrumbK.value = 1 - smooth(1.2, 3.5, S.fdist);
    body.uniforms.uFogD.value = scene.fog.density; body.uniforms.uFogCol.value.copy(scene.fog.color);
    hemi.intensity = (0.05 + 0.25 * air) * (1 - 0.88 * S.inRoom);
    tree.envInside(S.inRoom);
    body.update(t, CUBE.SUN);
    sunDisc.mesh.position.copy(camera.position).addScaledVector(CUBE.SUN, 8000);
    sunDisc.uniforms.uSize.value = 8000 * 0.05;
    sunDisc.uniforms.uRes.value.set(ctx.size.w * ctx.size.scale, ctx.size.h * ctx.size.scale);
    // the sun's shadows follow what is looked at
    const e = S.extent;
    sun.target.position.copy(S.shadowFocus); sun.position.copy(S.shadowFocus).addScaledVector(CUBE.SUN, S.reach);
    const c = sun.shadow.camera;
    c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.near = 0; c.far = S.reach + e * 2.5; c.updateProjectionMatrix();
    sun.shadow.normalBias = e * 0.004; sun.shadow.bias = -0.0003;
    sun.target.updateMatrixWorld();
    // inside the trunk: its own light; the crown and the far faces unseen from there, not drawn
    const deep = S.inRoom > 0.97;
    tree.foliage.visible = tree.branches.visible = !deep; if (body.crystals) body.crystals.visible = !deep;
    room.spot.intensity = SPOT * S.inRoom; room.fill.intensity = FILL * S.inRoom;
    tree.sun(CUBE.SUN, camera);
    room.update(dt, t);
    laser.update(dt, t, S.laserAt, S.laserN, camera, sun.color);
    stage.exposure = S.exposure;
    Object.assign(stage.bloom, S.bloom);
  }

  // ---------------------------------------------------------------- the parts
  const P = {};   // where the eye begins each part (set by the part before, or by a skip)

  async function approach(pose) {
    const dir0 = pose.pos.clone().normalize(), d0 = pose.pos.length(), d1 = 0.12;
    const qd = new THREE.Quaternion().setFromUnitVectors(dir0, Y), qI = new THREE.Quaternion(), q = new THREE.Quaternion();
    const dir = new V3(), up = new V3(), target = new V3(), pos = new V3();
    await ctx.anim(5.9, (k) => {
      const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
      const d = d0 * Math.pow(d1 / d0, e);
      q.copy(qI).slerp(qd, smooth(0.0, 0.72, k)); dir.copy(dir0).applyQuaternion(q);
      pos.copy(dir).multiplyScalar(d);
      target.copy(CENTRE).lerp(ORIGIN, smooth(0.0, 0.45, k));
      up.copy(pose.up).lerp(fwdH, smooth(0.25, 0.8, k)).normalize();
      camera.fov = lerp(pose.fov, 50, smooth(0, 0.6, k));
      look(pos, target, up);
      S.shadowFocus.set(0, 0, 0); S.extent = clamp(d * 0.9, 0.09, 300); S.reach = clamp(d * 2, 0.6, 700);
      S.exposure = lerp(1.0, 1.25, smooth(0.3, 0.9, k));
      S.bloom.strength = lerp(0.75, 0.3, smooth(0.2, 0.7, k)); S.bloom.threshold = lerp(0.6, 0.95, smooth(0.2, 0.7, k)); S.bloom.radius = 0.45;
    }, ctx.ease.linear);
  }

  async function sproutPart() {
    sprout.show();
    const target = new V3(), pos = new V3(), up = new V3();
    await ctx.anim(6.6, (k) => {
      const t = k * 6.6;
      ground.set({ bulge: smooth(0, 1.4, t), crack: smooth(0.5, 1.8, t), push: smooth(0.7, 2.4, t) });
      sprout.pose(t);
      const tilt = smooth(1.3, 4.4, t);
      const el = lerp(Math.PI / 2, 0.36, tilt), dist = lerp(0.12, 0.135, tilt), az = azS + 0.22 * smooth(1.3, 6.6, t);
      target.set(0, lerp(0.0, 0.03, smooth(1.2, 5.0, t)), 0);
      orbit(target, dist, el, az, pos);
      up.copy(fwdH).lerp(Y, smooth(0.0, 0.35, tilt)).normalize();
      look(pos, target, up);
      S.shadowFocus.set(0, 0, 0); S.extent = 0.13; S.reach = 0.6;
    }, ctx.ease.linear);
  }

  async function growPart() {
    tree.group.visible = true;
    const target = new V3(), pos = new V3();
    await ctx.anim(8.6, (k) => {
      const g = 0.5 - 0.5 * Math.cos(Math.PI * k);
      const { H, R } = tree.setGrowth(g);
      sprout.ride(H, g);
      ground.cover(R * 1.7);
      tree.trunkNormalScale(1 - tree.U.uGreen.value);
      const near = smooth(0.62, 1.0, g);
      const el = lerp(lerp(0.36, -0.05, smooth(0.0, 0.7, g)), -0.22, near), dist = H * lerp(lerp(2.08, 1.55, smooth(0.0, 0.3, g)), 0.7, near);
      target.set(0, H * lerp(lerp(0.46, 0.42, smooth(0.0, 0.3, g)), 0.28, near), 0);
      orbit(target, dist, el, lerp(azS + 0.22, azE, g), pos);
      look(pos, target, Y);
      S.shadowFocus.set(0, 0, 0); S.extent = clamp(H * 1.1, 0.13, 100); S.reach = H * 2.4 + 0.5;
    }, ctx.ease.linear);
  }

  const dr = tree.door;
  const doorTarget = dr.centre.clone().setY(1.5);
  const doorView = dr.centre.clone().addScaledVector(dr.n, 7.4).setY(1.95);
  const doorClose = dr.centre.clone().addScaledVector(dr.n, 6.2).setY(1.85);
  async function doorPart() {
    const p0 = camera.position.clone(), t0 = S.focus.clone();
    const dA = p0.distanceTo(doorTarget), dB = doorView.distanceTo(doorTarget);
    const dir0 = p0.clone().sub(doorTarget).normalize(), dir1 = doorView.clone().sub(doorTarget).normalize(), dir = new V3(), tgt = new V3(), pos = new V3();
    await ctx.anim(3.1, (k, e) => {
      dir.copy(dir0).lerp(dir1, e).normalize();
      pos.copy(doorTarget).addScaledVector(dir, dA * Math.pow(dB / dA, e));
      tgt.copy(t0).lerp(doorTarget, smooth(0, 0.75, e));
      look(pos, tgt, Y);
      S.shadowFocus.copy(tgt).setY(0); S.extent = clamp(S.fdist * 0.9, 9, 115); S.reach = 160;
    }, ctx.ease.inOut);
    // the laser draws the door: up, over the arch, down, along the sill
    const cutT = 4.7, total = dr.total;
    tree.U.uCutV.value = total / cutT;
    const lp = new V3();
    await ctx.anim(cutT, (k) => {
      const s = Math.max(1e-4, k * total);
      tree.setCut(s);
      const [x, y] = dr.outline(s), th = dr.thOf(x);
      S.laserAt = tree.at(th, y, 0, lp); S.laserN.set(Math.cos(th), 0, Math.sin(th));
      pos.copy(doorView).lerp(doorClose, k);
      look(pos, doorTarget, Y);
      S.shadowFocus.set(dr.centre.x, 0, dr.centre.z); S.extent = 9; S.reach = 160;
      S.bloom.strength = 0.55; S.bloom.threshold = 0.85;
    }, ctx.ease.linear);
    tree.setCut(total + 0.01);
    S.laserAt = null;
    await ctx.wait(0.5);
    // the panel swings in; the room within is there, lit from above
    tree.open(true); tree.room(true); room.show(true);
    await ctx.anim(2.6, (k, e) => {
      tree.swing(e * 1.75);
      S.inRoom = 0.6 * e;
    }, ctx.ease.inOutSine);
  }

  const mirrorTarget = room.glassCentre.clone().add(new V3(0, 0.02, 0));
  const stopPos = room.glassCentre.clone().addScaledVector(room.facing, 2.05).add(new V3(0, 0.34, 0));
  const inside = dr.n.clone().multiplyScalar(tree.rRoomJS(dr.th, 1.6) - 1.5).setY(1.64);
  async function enterPart() {
    const curve = new THREE.CatmullRomCurve3([camera.position.clone(), dr.centre.clone().addScaledVector(dr.n, 2.4).setY(1.76), dr.world(0, 1.66, 0.5), inside, stopPos], false, 'centripetal');
    const p = new V3(), tg = new V3(), lt = new V3();
    await ctx.anim(5.0, (k, e) => {
      curve.getPoint(e, p); curve.getTangent(Math.min(0.999, e), tg);
      lt.copy(p).addScaledVector(tg, 4).setY(lerp(1.5, 1.4, e)).lerp(mirrorTarget, smooth(0.45, 0.93, e));
      look(p, lt, Y);
      S.inRoom = lerp(0.6, 1, smooth(0.2, 0.6, e));
      S.shadowFocus.set(0, 0, 0); S.extent = lerp(9, 8, e); S.reach = 160;
      S.exposure = lerp(1.25, 1.5, smooth(0.25, 0.75, e));
      S.bloom.strength = 0.45; S.bloom.threshold = lerp(0.85, 0.8, e);
    }, ctx.ease.inOut);
  }

  async function mirrorPart(words) {
    S.hold = { pos: stopPos.clone(), target: mirrorTarget.clone(), toward: room.facing.clone().negate(), t: 0 };
    let granted = false;
    try { const st = await navigator.permissions?.query({ name: 'camera' }); granted = st?.state === 'granted'; } catch { granted = false; }
    let yes = granted;
    // a camera can be asked for only where the browser offers one (a secure page): elsewhere the mirror keeps the room
    const can = !!navigator.mediaDevices?.getUserMedia;
    if (!granted && can) yes = await ctx.ui.ask('May univispira momentarily peer through that camera of yours?', { yes: 'Allow', no: 'Not now', note: 'Nothing is recorded or sent anywhere.' });
    if (yes && can && await room.useCamera()) await ctx.anim(1.8, (k, e) => { room.videoMix = e; }, ctx.ease.inOut);
    await ctx.ui.words(words);
    await ctx.wait(3);
    await ctx.ui.unwords();
  }

  async function outPart() {
    room.stopCamera();
    const from = camera.position.clone(); S.hold = null;
    const curve = new THREE.CatmullRomCurve3([from, inside, dr.world(0, 1.66, 0.5), dr.centre.clone().addScaledVector(dr.n, 3.6).setY(1.85), dr.centre.clone().addScaledVector(dr.n, 9.5).setY(2.5)], false, 'centripetal');
    const p = new V3(), tg = new V3(), pos = new V3(), dir = new V3();
    await ctx.anim(3.0, (k, e) => {
      curve.getPoint(e, p);
      tg.copy(mirrorTarget).lerp(doorTarget.clone().setY(2.4), smooth(0.35, 1.0, e));
      look(p, tg, Y);
      S.inRoom = 1 - smooth(0.3, 0.85, e);
      S.exposure = lerp(1.5, 1.25, smooth(0.3, 0.85, e));
      S.shadowFocus.set(0, 0, 0); S.extent = 9; S.reach = 160;
    }, ctx.ease.inOut);
    // up the trunk, past the crown, until the tree is seen from above
    await ctx.anim(3.2, (k, e) => {
      const h = lerp(2.5, 125, e), out = 9.5 + 26 * smooth(0.45, 1.0, e);
      pos.copy(dr.centre).addScaledVector(dr.n, out).setY(h);
      tg.set(0, Math.max(0, h + lerp(0.5, -125, smooth(0.5, 1.0, e))), 0);
      look(pos, tg, Y);
      if (e > 0.5) room.show(false);
      S.shadowFocus.set(0, 0, 0); S.extent = clamp(h * 1.1, 10, 115); S.reach = 170;
    }, ctx.ease.inOutSine);
    tree.room(false);
    // away from the planet, into space, and dark
    const p0 = camera.position.clone(), d0 = p0.length(), dir0 = p0.clone().normalize();
    const away = new V3(0.35, 0.75, 0.55).normalize(), q = new THREE.Quaternion().setFromUnitVectors(dir0, away), qI = new THREE.Quaternion(), qq = new THREE.Quaternion();
    await ctx.anim(4.3, (k) => {
      const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, k * 1.1));
      qq.copy(qI).slerp(q, smooth(0, 0.7, k)); dir.copy(dir0).applyQuaternion(qq);
      pos.copy(dir).multiplyScalar(d0 * Math.pow(14000 / d0, e));
      tg.copy(ORIGIN).lerp(CENTRE, smooth(0.15, 0.6, k));
      look(pos, tg, Y);
      S.shadowFocus.set(0, 0, 0); S.extent = 300; S.reach = 700;
      S.exposure = 1.2 * (1 - smooth(0.62, 1.0, k));
      S.bloom.strength = 0.5; S.bloom.threshold = 0.8;
    }, ctx.ease.linear);
  }

  // ---------------------------------------------------------------- setting a part's start at once (skips, and a second play)
  function reset() {
    tree.setGrowth(0); tree.setCut(-1); tree.open(false); tree.swing(0); tree.room(false); tree.trunkNormalScale(0); tree.group.visible = false;
    ground.set({}); ground.cover(0); sprout.pose(0); sprout.hide();
    room.show(false); room.stopCamera(); S.inRoom = 0; S.hold = null; S.laserAt = null;
  }
  function jumpTo(part) {
    const i = PARTS.indexOf(part);
    const pos = new V3();
    if (i >= 1) { look(new V3(0, 0.12, 0), ORIGIN, fwdH); camera.fov = 50; S.exposure = 1.25; S.bloom = { strength: 0.3, radius: 0.45, threshold: 0.95 }; }
    if (i >= 2) { ground.set({ bulge: 1, crack: 1, push: 1 }); sprout.show(); sprout.pose(6.6); look(orbit(new V3(0, 0.03, 0), 0.135, 0.36, azS + 0.22, pos), new V3(0, 0.03, 0)); }
    if (i >= 3) { tree.group.visible = true; const { H, R } = tree.setGrowth(1); sprout.ride(H, 1); ground.cover(R * 1.7); tree.trunkNormalScale(1); look(orbit(new V3(0, H * 0.28, 0), H * 0.7, -0.22, azE, pos), new V3(0, H * 0.28, 0)); }
    if (i >= 4) { tree.setCut(dr.total + 0.01); tree.open(true); tree.room(true); room.show(true); tree.swing(1.75); S.inRoom = 1; look(stopPos, mirrorTarget); S.exposure = 1.5; S.bloom = { strength: 0.45, radius: 0.45, threshold: 0.8 }; }
  }

  async function play({ cosmos, words, end }) {
    reset();
    const skip = ctx.params.get('cubeskip');
    const from = Math.max(0, PARTS.indexOf(skip));
    // where the flight left the eye, in this world's metres
    const pose = { pos: new V3(), up: new V3(), fov: 60 };
    const f = cosmos?.cubeFrame, cc = cosmos?.stage?.camera;
    if (f && cc) {
      const qi = f.quaternion.clone().invert();
      pose.pos.copy(cc.position).sub(f.position).applyQuaternion(qi).divideScalar(f.scale).add(CENTRE);
      pose.up.copy(cc.up).applyQuaternion(qi).normalize();
      pose.fov = cc.fov;
      camera.quaternion.copy(qi).multiply(cc.quaternion);
    } else {
      pose.pos.copy(CUBE.ARRIVE).multiplyScalar(3400).add(CENTRE); pose.up.copy(Y);
    }
    camera.position.copy(pose.pos); camera.fov = pose.fov;
    if (!(f && cc)) camera.lookAt(CENTRE);
    S.focus.copy(CENTRE); S.fdist = pose.pos.distanceTo(CENTRE); S.exposure = 1.0; S.bloom = { strength: 0.75, radius: 0.48, threshold: 0.6 };
    if (from) jumpTo(PARTS[from]);
    // the two worlds as one for a moment: the flight's camera held where this one is
    if (f && cc && cosmos.follow) cosmos.follow((c2) => {
      c2.position.copy(camera.position).sub(CENTRE).multiplyScalar(f.scale).applyQuaternion(f.quaternion).add(f.position);
      c2.quaternion.copy(f.quaternion).multiply(camera.quaternion);
    });
    await ctx.transition(stage, { style: from ? 'light' : 'fade', duration: from ? 0.8 : 1.0 });
    cosmos?.follow?.(null);
    if (from <= 0) await approach(pose);
    if (from <= 1) await sproutPart();
    if (from <= 2) await growPart();
    if (from <= 3) { await doorPart(); await enterPart(); }
    if (from <= 4) await mirrorPart(words);
    await outPart();
    await end.present();
    await ctx.transition(end.stage, { style: 'dark', duration: 2.5 });
    reset();
  }

  // every program built now, so nothing stalls mid-sequence
  {
    const vis = [];
    scene.traverse((o) => { if (!o.visible) { vis.push(o); o.visible = true; } });
    tree.open(true); tree.room(true);
    renderer.compile(scene, camera);
    for (const o of vis) o.visible = false;
    reset();
  }
  return { stage, play };
}
