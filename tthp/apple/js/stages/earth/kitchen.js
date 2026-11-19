// kitchen.js — a warm kitchen under a skylight: an island with a honed marble
// top, an edge-grain cutting board of maple, walnut and cherry at its centre,
// morning sun through a mullioned window, two brass pendants.
//
// Units: one world unit is one apple's width (9 cm), so the apple that is put
// on the board (about 1 unit across at scale 1) is the right size; the room is
// built in metres inside a group scaled by U.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bakeBoard, bakeMarble, bakeFloor, bakeLinen } from './bake.js';

export const APPLE_M = 0.09;
export const U = 1 / APPLE_M;              // world units per metre
const BOARD_W = 0.306, BOARD_D = 0.216, BOARD_T = 0.032, TOP_Y = 0.92;   // metres

// a rounded slab (the board), y up, centred, top at +t/2
function slab(w, d, t, r, bevel) {
  const s = new THREE.Shape();
  const x = w / 2 - bevel, z = d / 2 - bevel, rr = Math.min(r, x, z);
  s.moveTo(-x + rr, -z); s.lineTo(x - rr, -z); s.quadraticCurveTo(x, -z, x, -z + rr); s.lineTo(x, z - rr); s.quadraticCurveTo(x, z, x - rr, z);
  s.lineTo(-x + rr, z); s.quadraticCurveTo(-x, z, -x, z - rr); s.lineTo(-x, -z + rr); s.quadraticCurveTo(-x, -z, -x + rr, -z);
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, -t / 2 + bevel, 0);
  // every vertex gets the top's projection: the strips run on over the edges
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getZ(i) + d / 2) / d);
  g.computeVertexNormals();
  return g;
}

// a soft dark patch under a thing (the light that does not get under it)
function aoTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(14px)'; g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(40, 40, 176, 176, 16); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createKitchen(ctx) {
  const { renderer } = ctx;
  const lite = ctx.quality === 'lite';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1410);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
  const room = new THREE.Group(); room.scale.setScalar(U); scene.add(room);

  // light for reflections: a soft room, a little warm
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;

  const mats = [];
  const M = (o) => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const P = (o) => { const m = new THREE.MeshPhysicalMaterial(o); mats.push(m); return m; };
  const add = (geo, mat, x, y, z, { cast = true, receive = true, parent = room } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };

  // ---- floor, walls, ceiling
  const floorTex = bakeFloor(renderer, lite ? 1024 : 2048);
  floorTex.repeat.set(6 / 2.4, 6 / 1.44);
  add(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), M({ map: floorTex, roughness: 0.55, envMapIntensity: 0.18 }), 0, 0, 0, { cast: false });
  const wallM = M({ color: 0xe9e2d6, roughness: 0.9, envMapIntensity: 0.15 });
  // the east wall (+x), with a tall window: the wall in pieces round the opening, and its mullions
  const WX = 2.2, w0 = 0.95, w1 = 2.35, wz = 0.85;
  add(new THREE.BoxGeometry(0.16, w0, 4.6), wallM, WX + 0.08, w0 / 2, 0);
  add(new THREE.BoxGeometry(0.16, 2.8 - w1, 4.6), wallM, WX + 0.08, (w1 + 2.8) / 2, 0);
  add(new THREE.BoxGeometry(0.16, w1 - w0, 2.3 - wz), wallM, WX + 0.08, (w0 + w1) / 2, -(wz + 2.3) / 2);
  add(new THREE.BoxGeometry(0.16, w1 - w0, 2.3 - wz), wallM, WX + 0.08, (w0 + w1) / 2, (wz + 2.3) / 2);
  const frameM = M({ color: 0x2b2a27, roughness: 0.5 });
  for (const z of [-wz, -wz / 3, wz / 3, wz]) add(new THREE.BoxGeometry(0.1, w1 - w0, 0.045), frameM, WX + 0.05, (w0 + w1) / 2, z);
  for (const y of [w0, (w0 + w1) / 2, w1]) add(new THREE.BoxGeometry(0.1, 0.045, 2 * wz), frameM, WX + 0.05, y, 0);
  // daylight in the panes
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2 * wz, w1 - w0).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.7) }));
  pane.position.set(WX + 0.15, (w0 + w1) / 2, 0); room.add(pane);
  // the other walls, out of sight mostly
  add(new THREE.BoxGeometry(4.6, 2.8, 0.16), wallM, 0, 1.4, -2.3, { cast: false });
  add(new THREE.BoxGeometry(4.6, 2.8, 0.16), wallM, 0, 1.4, 2.3, { cast: false });
  add(new THREE.BoxGeometry(0.16, 2.8, 4.6), wallM, -2.3, 1.4, 0, { cast: false });
  // ceiling with the skylight's opening over the island
  const ceilM = M({ color: 0xf1ece4, roughness: 0.95, side: THREE.DoubleSide });
  const SX = 0.55, SZ = 0.4, CY = 2.7;
  add(new THREE.BoxGeometry(4.6, 0.05, 2.3 - SZ), ceilM, 0, CY, -(SZ + 2.3) / 2, { cast: false });
  add(new THREE.BoxGeometry(4.6, 0.05, 2.3 - SZ), ceilM, 0, CY, (SZ + 2.3) / 2, { cast: false });
  add(new THREE.BoxGeometry(2.3 - SX, 0.05, 2 * SZ), ceilM, -(SX + 2.3) / 2, CY, 0, { cast: false });
  add(new THREE.BoxGeometry(2.3 - SX, 0.05, 2 * SZ), ceilM, (SX + 2.3) / 2, CY, 0, { cast: false });

  // ---- the island: painted cabinetry, a marble top
  const marble = bakeMarble(renderer, 244, 112, lite ? 1024 : 2048);
  const bodyM = M({ color: 0x24353a, roughness: 0.55, envMapIntensity: 0.2 });
  add(new THREE.BoxGeometry(2.3, 0.86, 1.0), bodyM, 0, 0.43 + 0.02, 0);
  add(new THREE.BoxGeometry(2.24, 0.06, 0.94), M({ color: 0x151d20, roughness: 0.8 }), 0, 0.03, 0, { cast: false });   // the toe kick
  for (const x of [-0.86, -0.29, 0.29, 0.86]) for (const z of [-0.502, 0.502]) add(new THREE.BoxGeometry(0.53, 0.78, 0.01), M({ color: 0x2a3d43, roughness: 0.5, envMapIntensity: 0.2 }), x, 0.47, z, { cast: false });
  const topM = M({ map: marble.map, roughnessMap: marble.roughnessMap, roughness: 1, envMapIntensity: 0.22 });
  const top = add(new THREE.BoxGeometry(2.44, 0.04, 1.12), topM, 0, TOP_Y - 0.02, 0);
  // the box's top face carries the whole map; its sides take the edges of it (fine for a slab 4 cm thick)

  // ---- the board
  const wood = bakeBoard(renderer, BOARD_W * 100, BOARD_D * 100, lite ? 1024 : 2048);
  const boardM = P({ map: wood.map, normalMap: wood.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: wood.roughnessMap, roughness: 1,
    clearcoat: 0.18, clearcoatRoughness: 0.42, envMapIntensity: 0.2 });
  const boardMesh = add(slab(BOARD_W, BOARD_D, BOARD_T, 0.012, 0.0035), boardM, 0, TOP_Y + BOARD_T / 2, 0);
  // the dark under it
  const ao = aoTexture();
  const aoM = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: ao, transparent: true, opacity: 0.55, depthWrite: false });
  const aoMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W * 1.45, BOARD_D * 1.6).rotateX(-Math.PI / 2), aoM);
  aoMesh.position.set(0, TOP_Y + 0.0008, 0); aoMesh.renderOrder = 1; room.add(aoMesh);

  // ---- a folded linen towel and a small bowl of salt, at the corners of the final view
  const linen = bakeLinen(renderer, 512);
  const towel = add(new THREE.BoxGeometry(0.24, 0.012, 0.17), M({ map: linen, roughness: 0.92, envMapIntensity: 0.12 }), -0.34, TOP_Y + 0.006, -0.15);
  towel.rotation.y = 0.12;
  const fold = add(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 10).rotateX(Math.PI / 2), towel.material, -0.22, TOP_Y + 0.006, -0.15);
  fold.rotation.y = 0.12; fold.position.x = -0.34 + Math.cos(0.12) * 0.12; fold.position.z = -0.15 - Math.sin(0.12) * 0.12;
  const pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16; pts.push(new THREE.Vector2(0.03 + 0.045 * Math.sin(a * Math.PI * 0.5) + (i === 16 ? 0.002 : 0), 0.05 * (1 - Math.cos(a * Math.PI * 0.5)))); }
  const bowlG = new THREE.LatheGeometry(pts, 48);
  const bowl = add(bowlG, P({ color: 0xf3efe8, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.35, side: THREE.DoubleSide }), 0.3, TOP_Y, 0.16);
  const salt = add(new THREE.CircleGeometry(0.068, 40).rotateX(-Math.PI / 2), M({ color: 0xf6f4f0, roughness: 0.75 }), 0.3, TOP_Y + 0.032, 0.16, { cast: false });
  void bowl; void salt;

  // ---- the pendants: dark domes, brass inside, warm bulbs
  const domeOut = M({ color: 0x9a7444, roughness: 0.32, metalness: 1, envMapIntensity: 0.6 });
  const domeIn = M({ color: 0xc9a06a, roughness: 0.3, metalness: 1, side: THREE.BackSide });
  const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.4) });
  const pendants = [];
  for (const x of [-0.62, 0.62]) {
    const g = new THREE.Group(); g.position.set(x, 1.62, 0); room.add(g);
    const shell = new THREE.SphereGeometry(0.17, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const o = new THREE.Mesh(shell, domeOut); o.position.y = 0.17 * Math.cos(Math.PI * 0.42) - 0.0; o.castShadow = true; g.add(o);
    const i = new THREE.Mesh(shell, domeIn); i.position.copy(o.position); i.scale.setScalar(0.985); g.add(i);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12), bulbM); b.position.y = 0.06; g.add(b);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, CY - 1.62 - 0.2, 6), domeOut); cord.position.y = 0.2 + (CY - 1.62 - 0.2) / 2; g.add(cord);
    const L = new THREE.PointLight(0xffb878, 1, 0, 2); L.position.set(x * U, (1.62 + 0.03) * U, 0); scene.add(L);
    pendants.push(L);
  }

  // ---- light
  // the morning sun through the window: from the east, low
  const sun = new THREE.DirectionalLight(0xfff0dc, 1);
  const sd = new THREE.Vector3(Math.cos(28 * Math.PI / 180), Math.sin(28 * Math.PI / 180), 0.16).normalize();
  sun.position.copy(sd).multiplyScalar(4 * U).add(new THREE.Vector3(0, TOP_Y * U, 0));
  sun.target.position.set(-0.3 * U, TOP_Y * U, 0); scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -2.2 * U; sc.right = 2.2 * U; sc.top = 1.6 * U; sc.bottom = -1.6 * U; sc.near = 0.5 * U; sc.far = 8 * U;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  if (!renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  // the skylight's cool light from above, soft
  const sky = new THREE.SpotLight(0xdfe9ff, 1, 0, 0.95, 1, 2);
  sky.position.set(0, 3.2 * U, 0); sky.target.position.set(0, 0, 0); scene.add(sky, sky.target);
  const hemi = new THREE.HemisphereLight(0xe8eefc, 0x5a4636, 1); scene.add(hemi);
  // the pool kept on the board when the room goes dark
  const pool = new THREE.SpotLight(0xffd6a8, 0, 0, 0.25, 0.85, 2);
  pool.position.set(0, (TOP_Y + 1.2) * U, 0.05 * U); pool.target.position.set(0, TOP_Y * U, 0); scene.add(pool, pool.target);

  // brightness at full light (the units are the world's: a metre is U units, so the inverse square needs U²)
  const base = { sun: 2.6, sky: 1.4 * U * U, hemi: 0.3, pend: 0.28 * U * U, env: 1, pool: 3.2 * U * U };
  let dimK = 0;
  function applyLight() {
    const k = dimK, f = 1 - k, f2 = f * f;
    sun.intensity = base.sun * f2;
    sky.intensity = base.sky * f2;
    hemi.intensity = base.hemi * (0.03 + 0.97 * f2);
    for (const L of pendants) L.intensity = base.pend * (0.04 + 0.96 * f2);
    const b = 0.08 + 0.92 * f2;
    bulbM.color.setRGB(6 * b, 4.2 * b, 2.4 * b);
    pool.intensity = base.pool * Math.pow(k, 1.1) * (1 - 0.88 * THREE.MathUtils.smoothstep(k, 0.86, 1));   // at the very last, the universe's own light
    for (const m of mats) { if (m.userData.env == null) m.userData.env = m.envMapIntensity; m.envMapIntensity = m.userData.env * (0.025 + 0.975 * f2); }
    const w = 0.06 + 0.94 * f2;
    pane.material.color.setRGB(2.2 * w, 2.4 * w, 2.7 * w);
  }
  applyLight();

  // ---- the board's group for the apple: centre of the top face, world units
  const boardTop = (TOP_Y + BOARD_T) * U;
  const group = new THREE.Group(); group.position.set(0, boardTop, 0); scene.add(group);
  const board = { group, width: BOARD_W * U, depth: BOARD_D * U };

  // ---- the view: straight down at the board, the board ~60% of the screen's width
  const vfov = 40;
  function finalHeight(aspect) {
    const t = Math.tan((vfov / 2) * Math.PI / 180);
    const byW = board.width / 0.6 / (2 * t * aspect), byH = board.depth / 0.72 / (2 * t);
    return Math.max(byW, byH);
  }
  camera.fov = vfov; camera.up.set(0, 0, -1);
  function view(h) {   // h: height of the eye above the board's top, world units
    camera.position.set(0, boardTop + h, 0.0001); camera.lookAt(0, boardTop, 0);
    camera.near = Math.max(0.05, h * 0.02); camera.far = 400; camera.updateProjectionMatrix();
  }
  let held = null;    // the final height, kept while the kitchen rests
  const stage = {
    scene, camera, bloom: { strength: 0.2, radius: 0.5, threshold: 1.6 }, exposure: 0.85,
    update() {
      const a = ctx.size.w / ctx.size.h;
      if (Math.abs(camera.aspect - a) > 1e-4) { camera.aspect = a; camera.updateProjectionMatrix(); }
      if (held != null) { const h = finalHeight(a); if (Math.abs(h - held) > 1e-3) { held = h; view(h); } }
    },
  };
  return {
    stage, board, boardTop, view, finalHeight: () => finalHeight(ctx.size.w / ctx.size.h), ceilingY: CY * U, topY: TOP_Y * U,
    rest() { held = finalHeight(ctx.size.w / ctx.size.h); view(held); },
    unrest() { held = null; },
    dim(k) { dimK = Math.max(0, Math.min(1, k)); applyLight(); },
    meshes: { boardMesh, top },
  };
}
