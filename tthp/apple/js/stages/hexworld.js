// hexworld.js — the way back: into a sun, a six-sided planet at its heart, the orchard.
//
// Colin: "the camera should zoom into a random bright point in the universe,
// directly into a sun, at the center of which, a hexagonal planet is found,
// with one of the sides being full of greenery, continuing to zoom until you
// end up at the beginning frame".
//
// The sun's face boils: bright granules with dark lanes between them, the slow
// swell of active regions, a few spots, darker toward the limb, a red rim, a
// corona with streamers. The eye goes through it. Inside: the fire all round,
// embers drifting, and at the heart a six-sided planet of dark stone veined
// with gold, a layer of soil, and on its top face grass and rows of trees, an
// orchard planet. In the middle of that face is the orchard itself, small: the
// same trees, the same grass, the same apple (copies of the orchard's own, to
// scale). The eye comes down onto it, all the way, and stops where the
// orchard's own eye stands. For the last seconds the small orchard and the
// real one are mixed, the two eyes moving as one, and the fire overhead
// becomes the sky.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SUN_DIR } from './apple/orchard-world.js';

const R = 6;                    // the sun
const HEX = 1.0;                // the planet, centre to corner
const DEPTH = 0.56;             // its stone, top to bottom
const SOIL = 0.035;             // the soil over the stone
const RS = HEX - 0.075;         // the soil's and the grass's hexagon
const TOP = DEPTH / 2 + SOIL;   // the grass, above the planet's centre
const S = 0.014;                // the orchard's scale on the planet (its rows ~0.7 across a face 2 across)
const P0 = new THREE.Vector3(0, TOP, 0.3);     // where the orchard's own origin lies on the face

const noise = (oct) => /* glsl */`
  float hh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float nn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fb(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < ${oct}; i++) { s += a * nn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;
// the two nearest of points jittered in a lattice (the points moving): granules, and the dark lanes between them
const CELLS = /* glsl */`
  vec3 h3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
  vec2 cells(vec3 p, float t) {
    vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z)), o = h3(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      vec3 r = g + o - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return sqrt(vec2(d1, d2));
  }`;
const VERT = 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main() { vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';

// the face of the sun, seen from outside
function sunMaterial(lite) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNear: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uNear;
      ${noise(lite ? 3 : 5)}${CELLS}
      void main() {
        vec3 p = normalize(vP);
        vec3 w = vec3(fb(p * 4.0 + uTime * 0.015), fb(p * 4.0 + 5.2), fb(p * 4.0 - 3.7));
        vec2 c = cells(p * 52.0 + w * 2.4, uTime * 0.25);
        float gran = (0.35 + 0.65 * smoothstep(0.0, 0.35, c.y - c.x)) * (0.78 + 0.22 * (1.0 - smoothstep(0.0, 0.7, c.x)));
        ${lite ? '' : 'if (uNear > 0.001) { vec2 c2 = cells(p * 210.0 + w * 6.0, uTime * 0.6); gran *= mix(1.0, 0.7 + 0.3 * smoothstep(0.0, 0.3, c2.y - c2.x), uNear); }'}
        float act = fb(p * 2.4 + vec3(0.0, uTime * 0.006, 0.0));
        float heat = gran * (0.62 + 0.55 * act);
        vec3 col = mix(vec3(0.6, 0.1, 0.01), vec3(1.9, 0.62, 0.08), smoothstep(0.2, 0.8, heat));
        col = mix(col, vec3(2.6, 1.45, 0.45), smoothstep(0.84, 1.1, heat));
        float sp = fb(p * 3.0 + 17.0);
        col *= 1.0 - 0.45 * smoothstep(0.68, 0.72, sp) - 0.45 * smoothstep(0.73, 0.76, sp);
        float mu = max(0.0, dot(normalize(vN), normalize(vV)));
        col *= 0.3 + 0.7 * pow(mu, 0.5);
        col += vec3(1.3, 0.3, 0.05) * pow(1.0 - mu, 5.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
// the fire seen from within: deep red, and bright filaments flowing in it
function insideMaterial(lite) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, side: THREE.BackSide,
    vertexShader: VERT,
    fragmentShader: `varying vec3 vP; uniform float uTime;
      ${noise(lite ? 3 : 5)}
      void main() {
        vec3 p = normalize(vP);
        float w = fb(p * 2.6 + vec3(uTime * 0.025, 0.0, -uTime * 0.02));
        float f = fb(p * 6.5 + w * 2.2 - vec3(0.0, uTime * 0.04, 0.0));
        float fil = smoothstep(0.58, 0.82, f);
        vec3 col = mix(vec3(0.16, 0.025, 0.004), vec3(0.78, 0.2, 0.03), smoothstep(0.3, 0.75, w));
        col += vec3(2.2, 0.9, 0.22) * fil * (0.45 + 0.55 * w);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
// dark stone with gold in its veins, the gold faintly alight
function stoneMaterial(uTime) {
  const m = new THREE.MeshStandardMaterial({ color: 0x2e2824, roughness: 0.62, metalness: 0.15 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform float uTime;\n' + noise(5))
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.6 + 0.8 * fb(vObj * 7.0);
        float rv = abs(fb(vObj * 2.3 + fb(vObj * 5.0) * 0.6) - 0.5);
        float gold = max(1.0 - smoothstep(0.0, 0.016, rv), 0.6 * (1.0 - smoothstep(0.0, 0.009, abs(fb(vObj * 5.5 + 3.0) - 0.5))));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.6, 0.24), gold);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, gold);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.9, gold);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.5, 0.78, 0.26) * gold * (0.5 + 0.5 * sin(uTime * 0.8 + vObj.x * 3.0 + vObj.z * 2.0));');
  };
  return m;
}
function soilTexture() {
  const W = 512, H = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 4, v = r(), band = 0.78 + 0.22 * Math.sin(j * 0.45 + Math.sin(i * 0.05) * 1.5), roots = j < 10 ? 0.6 : 1;
    d[k] = (62 + v * 30) * band * roots; d[k + 1] = (42 + v * 22) * band * roots; d[k + 2] = (27 + v * 14) * band * roots; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 220; k++) { x.fillStyle = `rgba(${120 + r() * 60},${110 + r() * 50},${95 + r() * 40},0.8)`; x.beginPath(); x.ellipse(r() * W, 12 + r() * (H - 14), 1 + r() * 2.5, 0.8 + r() * 1.6, 0, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); return t;
}
function coronaTexture() {
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d'); x.translate(N / 2, N / 2);
  const g = x.createRadialGradient(0, 0, 40, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,220,160,1)'); g.addColorStop(0.18, 'rgba(255,170,90,0.55)'); g.addColorStop(0.45, 'rgba(255,120,50,0.12)'); g.addColorStop(1, 'rgba(255,90,30,0)');
  x.fillStyle = g; x.fillRect(-256, -256, 512, 512);
  x.globalCompositeOperation = 'lighter';
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {     // streamers
    const a = r() * Math.PI * 2, len = 150 + r() * 105, w = 0.006 + r() * 0.022;
    const gr = x.createRadialGradient(0, 0, 120, 0, 0, len);
    gr.addColorStop(0, 'rgba(255,200,140,0)'); gr.addColorStop(0.3, `rgba(255,190,120,${0.05 + r() * 0.09})`); gr.addColorStop(1, 'rgba(255,150,80,0)');
    x.fillStyle = gr; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, len, a - w, a + w); x.closePath(); x.fill();
  }
  return new THREE.CanvasTexture(cv);
}
function dotTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
}
const inHex = (x, z, r) => { for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2; if (x * Math.sin(a) + z * Math.cos(a) > r * Math.cos(Math.PI / 6)) return false; } return true; };

// rows of round little trees over the rest of the face (the orchard proper is copied in when first needed)
function moreTrees(lite) {
  const trunk = new THREE.CylinderGeometry(0.09, 0.14, 1.25, 6); trunk.translate(0, 0.62, 0);
  const parts = [[0, 1.85, 0, 0.95], [0.6, 1.65, 0.25, 0.7], [-0.55, 1.7, -0.2, 0.75], [0.1, 2.35, -0.15, 0.68], [-0.2, 1.6, 0.55, 0.6]].map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), k = 1 + 0.14 * Math.sin(vx * 7.1 + vy * 3.3) * Math.cos(vz * 6.3 - vy * 2.1); p.setXYZ(i, vx * k + x, vy * k * 0.85 + y, vz * k + z); }
    return g;
  });
  const crown = mergeVertices(mergeGeometries(parts)); crown.computeVertexNormals();
  const fruit = mergeGeometries([[0.75, 1.5, 0.55], [-0.7, 1.95, 0.45], [0.2, 1.3, -0.85], [0.85, 2.1, -0.3], [-0.4, 2.6, 0.5], [-0.85, 1.45, -0.45]].map(([x, y, z]) => new THREE.IcosahedronGeometry(0.12, 0).translate(x, y, z)));
  const spots = [];
  let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let ox = -77; ox <= 77; ox += 5.5) for (let oz = -80; oz <= 80; oz += 5) {
    const jx = ox + (r() - 0.5) * 0.8, jz = oz + (r() - 0.5) * 0.8;
    if (Math.abs(jx) < 20 && jz > -56 && jz < 16) continue;          // the orchard itself, and where its eye stands
    const x = P0.x + jx * S, z = P0.z + jz * S;
    if (!inHex(x, z, RS - 0.035) || (lite && r() < 0.4)) continue;
    spots.push([x, z, r() * Math.PI * 2, 0.8 + r() * 0.35, r()]);
  }
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }), spots.length);
  const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }), spots.length);
  const am = new THREE.InstancedMesh(fruit, new THREE.MeshStandardMaterial({ color: 0xa3141c, roughness: 0.4 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, a, k, v], i) => {
    m.compose(new THREE.Vector3(x, TOP, z), q.setFromAxisAngle(up, a), new THREE.Vector3(S * k, S * k, S * k));
    tm.setMatrixAt(i, m); cm.setMatrixAt(i, m); am.setMatrixAt(i, m);
    cm.setColorAt(i, c.setHSL(0.27 + 0.05 * (v - 0.5), 0.42 + 0.14 * v, 0.2 + 0.07 * v, THREE.SRGBColorSpace));
  });
  for (const o of [tm, cm, am]) { o.castShadow = true; o.receiveShadow = true; }
  return [tm, cm, am];
}

export async function createHexWorld(ctx) {
  const lite = ctx.quality === 'lite';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 3000);    // the orchard's own lens, so that the last view is its view
  const uTime = { value: 0 };
  const sun = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), sunMaterial(lite)); scene.add(sun);
  const inside = new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 96, 64), insideMaterial(lite)); scene.add(inside);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: coronaTexture(), color: new THREE.Color(1.3, 0.8, 0.42), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(R * 3.6); scene.add(glow);
  // stars far behind
  const N = 4000, sp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(400 + Math.random() * 600); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xd8dcff })));
  // embers drifting in the fire, inside
  const NE = lite ? 600 : 1500, ep = new Float32Array(NE * 3), ec = new Float32Array(NE * 3);
  for (let i = 0; i < NE; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1.4 + Math.pow(Math.random(), 0.7) * 4.3); ep.set([v.x, v.y, v.z], i * 3);
    const b = 0.6 + Math.random() * 1.4; ec.set([b * 1.6, b * (0.45 + Math.random() * 0.4), b * 0.08], i * 3);
  }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.035, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(embers);

  // the planet at the heart: six sides of stone, soil over it, grass on top
  const planet = new THREE.Group(); scene.add(planet);
  const shape = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; i ? shape.lineTo(HEX * 0.95 * Math.sin(a), HEX * 0.95 * Math.cos(a)) : shape.moveTo(0, HEX * 0.95); }
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 1 });
  bodyGeo.rotateX(-Math.PI / 2); bodyGeo.computeBoundingBox(); bodyGeo.translate(0, -(bodyGeo.boundingBox.min.y + bodyGeo.boundingBox.max.y) / 2, 0);
  const body = new THREE.Mesh(bodyGeo, stoneMaterial(uTime)); body.receiveShadow = true; planet.add(body);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(RS, RS, SOIL, 6, 1, true), new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1 }));
  soil.position.y = DEPTH / 2 + SOIL / 2; soil.receiveShadow = true; planet.add(soil);
  // the grass: a hexagon whose texture lies exactly as the orchard's ground does, at the orchard's scale
  const faceGeo = new THREE.BufferGeometry(), fp = [0, TOP, 0], fi = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; fp.push(RS * Math.sin(a), TOP, RS * Math.cos(a)); fi.push(0, 1 + i, 1 + (i + 1) % 6); }
  const fuv = []; for (let i = 0; i < fp.length; i += 3) fuv.push((fp[i] - P0.x) / S / 400 + 0.5, -(fp[i + 2] - P0.z) / S / 400 + 0.5);
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
  faceGeo.setIndex(fi); faceGeo.computeVertexNormals();
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 0.95 })); face.receiveShadow = true; planet.add(face);
  planet.add(...moreTrees(lite));
  // light inside the sun: warm from all round, and a key from where the orchard's sun stands (so the small orchard is lit as the large one)
  const hemi = new THREE.HemisphereLight(0xffe6c8, 0x8a3008, 0.8); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.copy(SUN_DIR).multiplyScalar(4); scene.add(key); scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -1.15, right: 1.15, top: 1.15, bottom: -1.15, near: 0.5, far: 8 }); key.shadow.bias = -0.00005; key.shadow.normalBias = 0.0015;

  // the orchard, small (copied once from the orchard's own), and its apple (copied each time, whole)
  let mini = null, fruitHolder = null, fruit = null, follow = null;
  const groundCol = new THREE.Color(), above = new THREE.Color(1.75, 1.6, 1.3);
  function copyOrchard(orchard) {
    mini = new THREE.Group(); mini.position.copy(P0); mini.scale.setScalar(S); planet.add(mini);
    for (const t of orchard.world.trees) mini.add(t.clone());
    const grass = orchard.world.grassMesh.clone(), m = new THREE.Matrix4(), p = new THREE.Vector3(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
    const { centre, radius: far } = orchard.world.grassMesh.userData;
    for (let i = 0; i < grass.count; i++) {    // seen from above its edge would show: the blades shorten toward it
      grass.getMatrixAt(i, m); m.decompose(p, qq, sc);
      sc.multiplyScalar(0.05 + 0.95 * THREE.MathUtils.smoothstep(far - Math.hypot(p.x - centre.x, p.z - centre.z), 0, far * 0.3)); m.compose(p, qq, sc); grass.setMatrixAt(i, m);
    }
    mini.add(grass);
    scene.environment = orchard.world.env;
    fruitHolder = new THREE.Group(); mini.add(fruitHolder);
    face.material = orchard.world.ground.material.clone(); groundCol.copy(orchard.world.ground.material.color);
  }
  function copyApple(orchard) {
    if (fruit) fruitHolder.remove(fruit);
    fruit = orchard.apple.root.clone(); fruit.visible = true; fruitHolder.add(fruit);
    fruitHolder.position.copy(orchard.holder.position); fruitHolder.quaternion.copy(orchard.holder.quaternion);
  }

  const stage = {
    scene, camera, bloom: { strength: 0.75, radius: 0.65, threshold: 1.3 }, exposure: 0.66,
    update(dt, t) {
      uTime.value = t; sun.material.uniforms.uTime.value = t; inside.material.uniforms.uTime.value = t;
      glow.material.rotation += dt * 0.01; embers.rotation.y += dt * 0.03; embers.rotation.x = Math.sin(t * 0.05) * 0.2;
      if (follow) { fruitHolder.position.copy(follow.holder.position); fruitHolder.quaternion.copy(follow.holder.quaternion); }
    },
  };

  // the eye's way, e from 0 to 1: from far outside the sun, through its face, round and down onto the face of
  // the planet, to where the orchard's own eye stands (its distance shrinking at an even rate through the scales)
  const D0 = 31, ROT0 = 1.35, tgt = new THREE.Vector3(), dir = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Quaternion();
  let look1 = null, d1 = 1, el1 = 0;
  const smooth = THREE.MathUtils.smoothstep, deg = Math.PI / 180;
  const bez = (u, a, b, c, d) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;
  function at(e) {
    planet.rotation.y = ROT0 * (1 - smooth(e, 0.25, 0.85)); planet.updateMatrixWorld();
    tgt.set(0, 0, 0).lerp(w.copy(look1).applyMatrix4(planet.matrixWorld), smooth(e, 0.2, 0.78));
    const d = D0 * Math.pow(d1 / D0, e);
    const el = e < 0.25 ? 0 : bez((e - 0.25) / 0.75, 0, 70 * deg, 30 * deg, el1);
    dir.set(0, Math.sin(el), Math.cos(el));
    camera.position.copy(tgt).addScaledVector(dir, d); camera.up.set(0, 1, 0); camera.lookAt(tgt);
    camera.near = THREE.MathUtils.clamp(d * 0.01, 0.0004, 0.3); camera.far = d > R * 1.2 ? 3000 : 40; camera.updateProjectionMatrix();
    glow.visible = d > R * 1.05; glow.material.opacity = smooth(d, R * 1.05, R * 1.9);
    sun.material.uniforms.uNear.value = smooth(-d, -R * 2.2, -R * 1.02);
    if (mini) face.material.color.copy(above).lerp(groundCol, smooth(e, 0.72, 0.86));
    const k = smooth(e, 0.45, 0.9);
    stage.exposure = 0.62 + 0.2 * k;
    stage.bloom = { strength: 0.75 - 0.47 * k, radius: 0.65 - 0.15 * k, threshold: 1.3 + 0.9 * k };
  }
  // the orchard's eye where the small one's is: in the small orchard's own measure
  function sync(oc) {
    mini.updateMatrixWorld();
    oc.position.copy(camera.position); mini.worldToLocal(oc.position);
    mini.getWorldQuaternion(q); oc.quaternion.copy(q.invert().multiply(camera.quaternion));
  }

  return {
    stage,
    async play({ from, orchard }) {
      await orchard.arrive('orchard');            // its apple whole and its eye at home, before it is copied
      if (!mini) copyOrchard(orchard);
      copyApple(orchard); follow = orchard;
      const home = orchard.home;
      look1 = P0.clone().addScaledVector(home.look, S);
      const cam1 = P0.clone().addScaledVector(home.pos, S);
      d1 = cam1.distanceTo(look1); el1 = Math.asin((cam1.y - look1.y) / d1);
      // into a bright point of the universe: it becomes a sun
      const focus = await from.flareAndDive(2.2);
      at(0);
      await ctx.transition(stage, { style: 'light', duration: 1.1, focus });
      const T = 9.5, T1 = 0.77, ez = (u) => u * u * (3 - 2 * u);
      await ctx.anim(T * T1, (k) => at(ez(k * T1)), ctx.ease.linear);
      // the last of the way, the small orchard and the orchard mixed, the eyes as one
      const oc = orchard.stage.camera;
      await ctx.transition(orchard.stage, { style: 'fade', duration: T * (1 - T1), easing: ctx.ease.inOutSine, during: (k) => { at(ez(T1 + (1 - T1) * k)); sync(oc); } });
      oc.position.copy(home.pos); oc.lookAt(home.look);
      follow = null;
      ctx.ui.hint('tap the apple  ·  drag to turn it', 4000);
    },
  };
}
