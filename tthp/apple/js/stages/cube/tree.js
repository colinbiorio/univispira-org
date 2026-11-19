// cube/tree.js — the tree. One set of meshes, every vertex placed by how far the growth has come: a
// seedling's green stem becomes a buttressed, furrowed giant (a redwood's bark, baked once on the
// GPU), branches sprout from the bottom of the crown up (the lowest of youth fall away, as a
// redwood's do), sprays of needles fill it. Then the door: the kerf a laser leaves (hot, then
// charred), the cut panel (the same surface, freed and hinged), the jamb, and the hollow room inside,
// carved out of the trunk with a chimney narrowing up to a hole of daylight.
import * as THREE from 'three';
import { HASH, SIMPLEX, VORONOI, BUMP, rng, smooth } from './glsl.js';
import { bake, PERIODIC } from './bake.js';
import { patch } from './patch.js';

export const TREE = { H0: 0.065, HF: 75, RF: 5.0 };
export const heightAt = (g) => TREE.H0 * Math.pow(TREE.HF / TREE.H0, g);
export const radiusAt = (H) => 0.024 * H + 0.000569 * H * H;
const TAU = Math.PI * 2;
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// ---------------------------------------------------------------- bark, baked
const BARK_FRAG = /* glsl */`
uniform float uMode; uniform float uTexel;
varying vec2 vUv;
${PERIODIC}
float barkH(vec2 uv) {
  // a redwood's: long fibrous ridges running up the trunk, wandering, splitting and joining, deep furrows between
  // (five to a tile, sixteen tiles round: some eighty ridges about the trunk)
  float wx = pfbm2(uv * vec2(2.0, 1.0), vec2(2.0, 1.0), 3) * 1.2 + pfbm2(uv * vec2(5.0, 3.0) + 4.3, vec2(5.0, 3.0), 3) * 0.5;
  float r1 = 1.0 - abs(fract(uv.x * 5.0 + wx) * 2.0 - 1.0);
  float r2 = 1.0 - abs(fract(uv.x * 5.0 + 0.5 + wx * 0.7 + pfbm2(uv * vec2(4.0, 2.0) + 9.1, vec2(4.0, 2.0), 3) * 0.7) * 2.0 - 1.0);
  float split = smoothstep(0.0, 0.3, pfbm2(uv * vec2(6.0, 4.0) + 2.7, vec2(6.0, 4.0), 3));
  float r = smoothstep(0.15, 0.95, mix(r1, max(r1 * 0.85, r2 * 0.9), split));
  float brk = smoothstep(0.3, 0.42, abs(pfbm2(uv * vec2(10.0, 5.0) + 1.3, vec2(10.0, 5.0), 3)));    // a ridge broken across, now and then
  float fib = pfbm2(uv * vec2(90.0, 3.0), vec2(90.0, 3.0), 4);
  float fib2 = pfbm2(uv * vec2(35.0, 7.0), vec2(35.0, 7.0), 3);
  return r * (0.8 + 0.16 * fib2) * (1.0 - 0.22 * brk) + fib * 0.15 * (0.35 + r);
}
void main() {
  vec2 uv = vUv;
  float h = barkH(uv);
  if (uMode < 0.5) {
    vec3 deep = vec3(0.034, 0.016, 0.01), plate = vec3(0.27, 0.13, 0.075), grey = vec3(0.3, 0.26, 0.22);       // cinnamon, browner than red
    vec3 c = mix(deep, plate, smoothstep(0.05, 0.5, h));
    float weather = smoothstep(0.55, 0.9, h + pfbm2(uv * vec2(8.0, 3.0), vec2(8.0, 3.0), 3) * 0.6);
    c = mix(c, grey, weather * 0.55);
    c *= 0.82 + 0.36 * (pfbm2(uv * vec2(40.0, 6.0), vec2(40.0, 6.0), 3) + 0.5);
    float lic = smoothstep(0.66, 0.74, pfbm2(uv * vec2(14.0, 9.0) + 7.0, vec2(14.0, 9.0), 4) + 0.5) * smoothstep(0.4, 0.7, h);
    c = mix(c, vec3(0.30, 0.34, 0.22), lic * 0.55);
    gl_FragColor = vec4(c, 1.0);
  } else {
    float e = uTexel;
    float hx = barkH(uv + vec2(e, 0.0)) - barkH(uv - vec2(e, 0.0));
    float hy = barkH(uv + vec2(0.0, e)) - barkH(uv - vec2(0.0, e));
    vec3 n = normalize(vec3(-hx * 3.2, -hy * 1.6, 2.0 * e * 1024.0 * 0.06));
    gl_FragColor = vec4(n * 0.5 + 0.5, h);
  }
}`;

// ---------------------------------------------------------------- the trunk's shape (GLSL; mirrored in JS below)
const TRUNK_GLSL = /* glsl */`
uniform float uH; uniform float uSR; uniform float uButt; uniform float uBarkD; uniform float uTaper;
uniform vec4 uLobe; uniform float uDoorTh; uniform sampler2D uBarkN;
#define HF 75.0
#define RF 5.0
float lobes(float th) {
  float d = th - uDoorTh;
  return -uLobe.x * cos(3.0 * d) - uLobe.y * cos(5.0 * d) - uLobe.z * cos(7.0 * d + 0.6) + uLobe.w * sin(4.0 * d);
}
float profileR(float yf) {
  float t = max(1.0 - yf / HF, 0.0005);
  return RF * pow(t, 0.8 * uTaper) * (1.0 + 0.6 * exp(-max(yf, 0.0) / 2.2) * (0.3 + 0.7 * uButt)) * (1.0 - smoothstep(0.986, 1.0, yf / HF));
}
float rShape(float th, float yf) { return profileR(yf) * (1.0 + 0.2 * uButt * lobes(th) * exp(-max(yf, 0.0) / 3.2)); }
float rRoom(float th, float yf) { return (rShape(th, yf) - 0.45) * mix(1.0, 0.12, smoothstep(3.4, 11.0, yf)); }
vec3 trunkSurf(float th, float f) { float r = rShape(th, f * HF) * uSR; return vec3(cos(th) * r, f * uH, sin(th) * r); }
vec3 trunkP(vec3 tp) {
  float yf = tp.y * HF;
  float ro = rShape(tp.x, yf) * uSR;
  float bh = textureLod(uBarkN, vec2(tp.x / 6.2831853 * 16.0, yf / 3.0), 2.0).a;
  ro += (bh - 0.62) * uBarkD * (1.0 - tp.z);
  float r = mix(ro, rRoom(tp.x, yf), tp.z);
  return vec3(cos(tp.x) * r, tp.y * uH, sin(tp.x) * r);
}
`;
const DOOR_GLSL = /* glsl */`
uniform vec4 uDoor; uniform float uRref; uniform float uCutS; uniform float uCutV; uniform float uOpen; uniform float uPanel;
vec2 doorXY(vec3 tp) { float d = mod(tp.x - uDoor.x + 3.14159265, 6.2831853) - 3.14159265; return vec2(d * uRref, tp.y * 75.0); }
bool inDoor(vec2 p) { float W2 = uDoor.y * 0.5, yc = uDoor.z - W2; return abs(p.x) < W2 && p.y > uDoor.w && (p.y < yc || length(p - vec2(0.0, yc)) < W2); }
vec2 archSD(vec2 p) {
  float W2 = uDoor.y * 0.5, yc = uDoor.z - W2, y0 = uDoor.w, L1 = yc - y0, arc = 3.14159265 * W2;
  float best = 1e9, sb = 0.0, t, d;
  t = clamp(p.y, y0, yc); d = length(p - vec2(-W2, t)); if (d < best) { best = d; sb = t - y0; }
  vec2 q = p - vec2(0.0, yc); float aa = clamp(atan(q.y, q.x), 0.0, 3.14159265);
  d = length(q - W2 * vec2(cos(aa), sin(aa))); if (d < best) { best = d; sb = L1 + (3.14159265 - aa) * W2; }
  t = clamp(p.y, y0, yc); d = length(p - vec2(W2, t)); if (d < best) { best = d; sb = L1 + arc + (yc - t); }
  t = clamp(p.x, -W2, W2); d = length(p - vec2(t, y0)); if (d < best) { best = d; sb = 2.0 * L1 + arc + (W2 - t); }
  return vec2(best, sb);
}
`;

export function createTree(ctx, { noise } = {}) {
  const { renderer } = ctx;
  const lite = ctx.quality === 'lite';
  const R = rng(23);
  const group = new THREE.Group();
  const bs = lite ? 512 : 1024;
  const barkCol = bake(renderer, { w: bs, frag: BARK_FRAG, uniforms: { uMode: { value: 0 }, uTexel: { value: 1 / bs } }, srgb: true });
  const barkNrm = bake(renderer, { w: bs, frag: BARK_FRAG, uniforms: { uMode: { value: 1 }, uTexel: { value: 1 / bs } } });

  // ---- the door's place: in the valley between two buttresses, facing where the eye will be
  const door = { th: 0, W: 1.7, Hd: 3.05, y0: 0.1 };
  const lobeA = new THREE.Vector4(0.62, 0.3, 0.16, 0.12);
  const U = {
    uH: { value: TREE.H0 }, uSR: { value: radiusAt(TREE.H0) / TREE.RF }, uButt: { value: 0 }, uBarkD: { value: 0 }, uTaper: { value: 0 },
    uLobe: { value: lobeA }, uDoorTh: { value: 0 }, uBarkN: { value: barkNrm }, uGreen: { value: 1 }, uG: { value: 0 },
    uDoor: { value: new THREE.Vector4(0, door.W, door.Hd, door.y0) }, uRref: { value: 4.5 }, uCutS: { value: -1 }, uCutV: { value: 1.6 }, uOpen: { value: 0 }, uPanel: { value: 0 },
    uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 0.95, 0.86).multiplyScalar(3) }, uCrown: { value: new THREE.Vector3() },
  };
  // the same shape in JS (at full growth), for the door, the room, the camera
  const S = { butt: 1, taper: 1 };
  const lobesJS = (th) => { const d = th - U.uDoorTh.value; return -lobeA.x * Math.cos(3 * d) - lobeA.y * Math.cos(5 * d) - lobeA.z * Math.cos(7 * d + 0.6) + lobeA.w * Math.sin(4 * d); };
  const profileJS = (yf) => { const t = Math.max(1 - yf / TREE.HF, 0.0005); return TREE.RF * Math.pow(t, 0.8 * S.taper) * (1 + 0.6 * Math.exp(-Math.max(yf, 0) / 2.2) * (0.3 + 0.7 * S.butt)) * (1 - smooth(0.986, 1, yf / TREE.HF)); };
  const rShapeJS = (th, yf) => profileJS(yf) * (1 + 0.2 * S.butt * lobesJS(th) * Math.exp(-Math.max(yf, 0) / 3.2));
  const rRoomJS = (th, yf) => (rShapeJS(th, yf) - 0.45) * (1 + (0.12 - 1) * smooth(3.4, 11, yf));
  const at = (th, yf, depth, out = new THREE.Vector3()) => { const r = depth ? rShapeJS(th, yf) * (1 - depth) + rRoomJS(th, yf) * depth : rShapeJS(th, yf); return out.set(Math.cos(th) * r, yf, Math.sin(th) * r); };

  function setDoor(th) {
    door.th = th; U.uDoorTh.value = th; U.uDoor.value.x = th;
    door.rRef = rShapeJS(th, 1.5); U.uRref.value = door.rRef;
    door.n = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    door.x = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
    const W2 = door.W / 2, yc = door.Hd - W2, L1 = yc - door.y0;
    door.total = 2 * L1 + Math.PI * W2 + door.W;
    door.outline = (s) => {
      if (s < L1) return [-W2, door.y0 + s];
      s -= L1; if (s < Math.PI * W2) { const a = Math.PI - s / W2; return [W2 * Math.cos(a), yc + W2 * Math.sin(a)]; }
      s -= Math.PI * W2; if (s < L1) return [W2, yc - s];
      s -= L1; return [W2 - Math.min(s, door.W), door.y0];
    };
    door.thOf = (x) => th + x / door.rRef;
    door.world = (x, y, depth = 0, out = new THREE.Vector3()) => at(door.thOf(x), y, depth, out);
    door.centre = door.world(0, 1.5);
  }

  // ---- materials
  const trunkMat = new THREE.MeshStandardMaterial({ map: barkCol, normalMap: barkNrm, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.95, metalness: 0, envMapIntensity: 0.22 });   // little of the sky's blue on its ridges
  const trunkVertexHead = TRUNK_GLSL + 'attribute vec3 aTP; attribute vec3 aTA; attribute vec3 aTB; attribute float aKind; varying vec3 vTP; varying float vKind; varying vec3 vOP; vec3 gP;';
  const trunkNormal = /* glsl */`
    gP = trunkP(aTP);
    vec3 pA = trunkP(aTP + aTA * 0.002), pB = trunkP(aTP + aTB * 0.002);
    vec3 nn = cross(pA - gP, pB - gP);
    vec3 objectNormal = dot(nn, nn) > 1e-26 ? normalize(nn) : vec3(0.0, 1.0, 0.0);`;
  const trunkPos = 'vec3 transformed = gP; vTP = aTP; vKind = aKind; vOP = gP;';
  const trunkFragHead = TRUNK_GLSL + DOOR_GLSL + HASH + SIMPLEX + VORONOI + BUMP + /* glsl */`
    uniform float uGreen; varying vec3 vTP; varying float vKind; varying vec3 vOP; float gHeat; float gKerf; float gAge; float gRough; float gBump;
  `;
  const trunkDiscard = 'if (uOpen > 0.5 && uPanel < 0.5 && vKind < 1.5 && inDoor(doorXY(vTP))) discard;';
  const makeTrunkMat = (name, panel) => {
    const m = trunkMat.clone();
    const own = { ...U, uPanel: { value: panel ? 1 : 0 } };
    patch(m, name, {
      uniforms: own, vertexHead: trunkVertexHead, normal: trunkNormal, position: trunkPos,
      fragmentHead: trunkFragHead, fragmentStart: trunkDiscard,
      color: /* glsl */`
        gHeat = 0.0; gKerf = 0.0; gRough = 0.92; gBump = 0.0;
        if (vKind < 0.5) {
          // the young stem is green; bark comes with age
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.24, 0.045) * (0.8 + 0.4 * smoothstep(0.0, 1.0, vTP.y)), uGreen);
          if (uCutS > 0.0) {
            vec2 sd = archSD(doorXY(vTP));
            float done = step(sd.y, uCutS);
            gAge = (uCutS - sd.y) / uCutV;
            gKerf = (1.0 - smoothstep(0.003, 0.011, sd.x)) * done;
            float scorch = (1.0 - smoothstep(0.006, 0.08, sd.x)) * done;
            diffuseColor.rgb *= (1.0 - 0.8 * scorch) * (1.0 - 0.96 * gKerf);
            gHeat = done * exp(-gAge / 0.42) * (1.0 - smoothstep(0.0, 0.03, sd.x));
          }
        } else if (vKind < 1.5) {
          // the room's wall: redwood heart, carved; grain running up, the adze's shallow scallops
          float circ = vTP.x * 3.4;
          float grain = snoise(vec2(circ * 16.0, vOP.y * 0.7)) * 0.5 + snoise(vec2(circ * 64.0, vOP.y * 2.2)) * 0.25;
          vec3 vo = voronoi2(vec2(circ * 9.0, vOP.y * 5.5));
          diffuseColor.rgb = mix(vec3(0.16, 0.052, 0.026), vec3(0.34, 0.125, 0.062), 0.5 + 0.5 * grain) * (0.95 + 0.07 * vo.z);
          gRough = 0.55 - 0.06 * vo.z;
          gBump = vo.x * vo.x * 0.004 + grain * 0.0016;
        } else {
          // faces the laser cut: charred, the wall's rings faint in them
          float rings = 0.5 + 0.5 * sin(vTP.z * 150.0 + snoise(vTP.xy * vec2(25.0, 300.0)) * 2.0);
          diffuseColor.rgb = mix(vec3(0.03, 0.017, 0.011), vec3(0.10, 0.045, 0.025), rings * 0.6 + 0.2);
          gRough = 0.85;
        }`,
      roughness: 'if (vKind > 0.5) roughnessFactor = gRough;',
      normalMap: 'if (vKind > 0.5) normal = bumpNormal(-vViewPosition, nonPerturbedNormal, gBump);',
      emissive: 'totalEmissiveRadiance += vec3(1.0, 0.42, 0.1) * gHeat * 7.0 + vec3(1.0, 0.75, 0.45) * gKerf * exp(-gAge / 0.2) * 22.0;',
    });
    m.userData.u = own;
    return m;
  };
  const trunkM = makeTrunkMat('trunk', false), panelM = makeTrunkMat('panel', true);
  const depthFor = (name, panel) => patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), name, {
    uniforms: { ...U, uPanel: { value: panel ? 1 : 0 } }, vertexHead: trunkVertexHead, position: 'vec3 transformed = trunkP(aTP); vTP = aTP; vKind = aKind;',
    fragmentHead: DOOR_GLSL + 'varying vec3 vTP; varying float vKind;', fragmentStart: trunkDiscard,
  });
  const trunkDepth = depthFor('trunkD', false), panelDepth = depthFor('panelD', true);

  // ---- geometry on (θ, f, depth): a grid, or a strip along the door's outline
  function paramGeometry(rows, cols, fn, flip = false) {
    const n = rows * cols, tp = new Float32Array(n * 3), ta = new Float32Array(n * 3), tb = new Float32Array(n * 3), kind = new Float32Array(n), uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const k = i * cols + j, o = fn(i, j);
      tp.set(o.tp, k * 3); ta.set(o.ta, k * 3); tb.set(o.tb, k * 3); kind[k] = o.kind;
      uv.set([o.tp[0] / TAU * 16, o.tp[1] * TREE.HF / 3], k * 2);
    }
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aTP', new THREE.BufferAttribute(tp, 3)); g.setAttribute('aTA', new THREE.BufferAttribute(ta, 3));
    g.setAttribute('aTB', new THREE.BufferAttribute(tb, 3)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 60);
    return g;
  }
  const NT = lite ? 128 : 192, NF = lite ? 110 : 170;
  const fAt = (i, n) => -0.007 + 1.007 * Math.pow(i / (n - 1), 1.45);
  const trunkGeo = paramGeometry(NF, NT + 1, (i, j) => ({ tp: [j / NT * TAU, fAt(i, NF), 0], ta: [0, 1, 0], tb: [1, 0, 0], kind: 0 }));
  const trunk = new THREE.Mesh(trunkGeo, trunkM);
  trunk.castShadow = true; trunk.receiveShadow = true; trunk.customDepthMaterial = trunkDepth; trunk.frustumCulled = false;
  group.add(trunk);

  // the room's wall (inside the trunk), up the chimney to the light
  const roomTop = 22;
  const innerGeo = paramGeometry(lite ? 60 : 90, NT + 1, (i, j) => ({ tp: [j / NT * TAU, (roomTop / TREE.HF) * Math.pow(i / ((lite ? 60 : 90) - 1), 1.3), 1], ta: [1, 0, 0], tb: [0, 1, 0], kind: 1 }), true);
  const inner = new THREE.Mesh(innerGeo, trunkM);
  inner.receiveShadow = true; inner.frustumCulled = false; inner.visible = false;
  group.add(inner);

  // ---- branches and sprays of needles, laid out for the full-grown tree
  const branchVertexHead = TRUNK_GLSL + /* glsl */`
    uniform float uG; attribute vec3 aOff; attribute vec3 aRad; attribute vec4 aAtt;
    float growE() { return smoothstep(aAtt.z, aAtt.z + 0.1, uG) * (1.0 - smoothstep(aAtt.w, aAtt.w + 0.07, uG)); }
    vec3 attachP() { vec3 a = trunkSurf(aAtt.x, aAtt.y); return vec3(a.x * 0.9, a.y, a.z * 0.9); }
    vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  `;
  const branchPos = 'float bE = growE(); vec3 transformed = attachP() + (aOff * (uH / HF) + aRad * uSR) * bE;';
  const branchNormal = 'vec3 objectNormal = length(aRad) > 1e-6 ? normalize(aRad) : vec3(0.0, 1.0, 0.0);';
  const bOff = [], bRad = [], bAtt = [], bUv = [], bIdx = [];
  const cards = [];   // [cx, cy, cz, size, qx, qy, qz, qw, th, f, birth, death]
  const RS = 7, SEG = 9;
  function addTube(pts, r0, att) {
    const base = bOff.length / 3;
    const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, p = sample(pts, t);
      tan.copy(sample(pts, Math.min(1, t + 0.02))).sub(sample(pts, Math.max(0, t - 0.02))).normalize();
      nrm.crossVectors(tan, up).normalize(); if (nrm.lengthSq() < 0.5) nrm.set(1, 0, 0);
      bin.crossVectors(nrm, tan).normalize();
      const r = r0 * (1 - 0.82 * t) * (i === SEG ? 0.3 : 1);
      for (let j = 0; j <= RS; j++) {
        const a = j / RS * TAU, c = Math.cos(a), s = Math.sin(a);
        bOff.push(p.x, p.y, p.z);
        bRad.push((nrm.x * c + bin.x * s) * r, (nrm.y * c + bin.y * s) * r, (nrm.z * c + bin.z * s) * r);
        bAtt.push(...att); bUv.push(j / RS * 2, t * 4);
      }
    }
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RS; j++) {
      const a = base + i * (RS + 1) + j, b = a + 1, c = a + RS + 1, d = c + 1;
      bIdx.push(a, c, b, b, c, d);
    }
  }
  function sample(pts, t) {   // along a polyline of points, smoothly (Catmull-Rom)
    const n = pts.length - 1, x = Math.min(n - 1e-6, t * n), i = Math.floor(x), u = x - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const u2 = u * u, u3 = u2 * u, out = new THREE.Vector3();
    for (const k of ['x', 'y', 'z']) out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    return out;
  }
  const qtmp = new THREE.Quaternion(), mtmp = new THREE.Matrix4(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), vN = new THREE.Vector3();
  function addCards(pts, L, att, density, from = 0.25) {
    const n = Math.max(2, Math.round(L * density));
    for (let k = 0; k < n; k++) {
      const t = from + (1 - from) * Math.pow(R(), 0.7);
      const p = sample(pts, t);
      const d = sample(pts, Math.min(1, t + 0.05)).sub(sample(pts, Math.max(0, t - 0.05))); d.y = 0; d.normalize();
      const spread = 0.35 + 0.5 * t;
      p.x += (R() - 0.5) * 2 * spread; p.y += (R() - 0.35) * 1.2 * spread; p.z += (R() - 0.5) * 2 * spread;
      const yaw = (R() - 0.5) * 1.4, c = Math.cos(yaw), s = Math.sin(yaw);
      vA.set(d.x * c - d.z * s, 0.15 + (R() - 0.5) * 0.5, d.x * s + d.z * c).normalize();   // along the spray
      vN.set((R() - 0.5) * 0.9, 1, (R() - 0.5) * 0.9).normalize();                          // its face, mostly up
      vB.crossVectors(vA, vN).normalize(); vA.crossVectors(vN, vB).normalize();
      mtmp.makeBasis(vB, vA, vN); qtmp.setFromRotationMatrix(mtmp);
      const size = (2.1 + R() * 1.1) * (0.75 + 0.25 * Math.min(1, L / 8));
      cards.push(p.x, p.y, p.z, size, qtmp.x, qtmp.y, qtmp.z, qtmp.w, ...att);
    }
  }
  function branch(th, f, L, pitch, birth, death, sub = true) {
    const dir = new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
    const bend = (R() - 0.5) * 0.25, pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(new THREE.Vector3().addScaledVector(dir, L * t).addScaledVector(side, L * bend * Math.sin(Math.PI * t))
        .add(new THREE.Vector3(0, L * (pitch * t - 0.22 * t * t + 0.14 * smooth(0.65, 1, t)), 0)));
    }
    const r0 = 0.05 + 0.011 * Math.pow(L, 1.25);
    const att = [th, f, birth, death];
    addTube(pts, r0, att);
    addCards(pts, L, att, lite ? 2.4 : 3.2, 0.2);
    if (!sub) return;
    const ns = L > 5 ? 3 : L > 2.5 ? 2 : 1;
    for (let k = 0; k < ns; k++) {
      const t0 = 0.3 + 0.5 * (k + R() * 0.5) / ns, p0 = sample(pts, t0);
      const a = (k % 2 ? 1 : -1) * (0.55 + R() * 0.35), d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      const L2 = L * (0.32 + R() * 0.15), sp = [];
      for (let i = 0; i <= 4; i++) { const t = i / 4; sp.push(p0.clone().addScaledVector(d2, L2 * t).add(new THREE.Vector3(0, L2 * (0.1 * t - 0.2 * t * t), 0))); }
      addTube(sp, r0 * 0.45, [th, f, birth + 0.04, death]);
      addCards(sp, L2, [th, f, birth + 0.04, death], lite ? 3.2 : 4.2, 0.12);
    }
  }
  // the crown of the grown tree: longest in its middle, the lower limbs drooping, the upper rising
  const NB = lite ? 44 : 70;
  for (let i = 0; i < NB; i++) {
    const u = i / (NB - 1), f = 0.36 + 0.61 * u + (R() - 0.5) * 0.012;
    const crown = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.88)), 0.75);
    const L = (2.5 + 13.5 * crown) * (0.85 + 0.3 * R());
    branch(i * 2.39996 + R() * 0.5, f, L, -0.12 + 0.6 * u + (R() - 0.5) * 0.2, 0.05 + 0.16 * R(), 9);
  }
  // the limbs of its youth, low on the stem, gone as it grows
  const NY = lite ? 12 : 18;
  for (let i = 0; i < NY; i++) {
    const u = i / (NY - 1), f = 0.08 + 0.27 * u;
    branch(i * 2.39996 + 1.3, f, (9 + 5 * R()) * (1 - 0.3 * u), 0.05 + 0.2 * u + (R() - 0.5) * 0.2, 0.04 + 0.08 * u, 0.42 + 0.3 * u, false);
  }
  // the leader at the very top
  for (let k = 0; k < 44; k++) {
    const f = 0.93 + 0.07 * R(), th = R() * TAU, rr = 0.6 + R() * 1.2;
    const p = [Math.cos(th) * rr, (R() - 0.3) * 2, Math.sin(th) * rr];
    vN.set((R() - 0.5) * 1.2, 1, (R() - 0.5) * 1.2).normalize(); vA.set(Math.cos(th), 0.6, Math.sin(th)).normalize();
    vB.crossVectors(vA, vN).normalize(); vA.crossVectors(vN, vB).normalize(); mtmp.makeBasis(vB, vA, vN); qtmp.setFromRotationMatrix(mtmp);
    cards.push(p[0], p[1], p[2], 1.3 + R() * 0.8, qtmp.x, qtmp.y, qtmp.z, qtmp.w, th, f, 0.1, 9);
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bOff.length), 3));
  bGeo.setAttribute('aOff', new THREE.Float32BufferAttribute(bOff, 3)); bGeo.setAttribute('aRad', new THREE.Float32BufferAttribute(bRad, 3));
  bGeo.setAttribute('aAtt', new THREE.Float32BufferAttribute(bAtt, 4)); bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bUv, 2));
  bGeo.setIndex(bIdx); bGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 60);
  const branchMat = new THREE.MeshStandardMaterial({ map: barkCol, normalMap: barkNrm, color: 0x9a8a80, roughness: 0.9, metalness: 0, envMapIntensity: 0.8 });
  patch(branchMat, 'branch', { uniforms: U, vertexHead: branchVertexHead, normal: branchNormal, position: branchPos,
    fragmentHead: 'uniform float uGreen;', color: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.2, 0.04), uGreen * 0.8);' });
  const branchDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patch(branchDepth, 'branchD', { uniforms: U, vertexHead: branchVertexHead, position: branchPos });
  const branches = new THREE.Mesh(bGeo, branchMat);
  branches.castShadow = true; branches.receiveShadow = true; branches.customDepthMaterial = branchDepth; branches.frustumCulled = false;
  group.add(branches);

  // sprays: one card each, turned and sized; they grow and fall with their limb
  const spray = sprayTexture(R);
  const nc = cards.length / 12;
  const fg = new THREE.InstancedBufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  fg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  fg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  fg.setIndex([0, 1, 2, 0, 2, 3]);
  const cC = new Float32Array(nc * 4), cQ = new Float32Array(nc * 4), cA = new Float32Array(nc * 4);
  for (let i = 0; i < nc; i++) { cC.set(cards.slice(i * 12, i * 12 + 4), i * 4); cQ.set(cards.slice(i * 12 + 4, i * 12 + 8), i * 4); cA.set(cards.slice(i * 12 + 8, i * 12 + 12), i * 4); }
  fg.setAttribute('aC', new THREE.InstancedBufferAttribute(cC, 4)); fg.setAttribute('aQ', new THREE.InstancedBufferAttribute(cQ, 4)); fg.setAttribute('aAtt', new THREE.InstancedBufferAttribute(cA, 4));
  fg.instanceCount = nc; fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), 60);
  const cardHead = branchVertexHead.replace('attribute vec4 aAtt;', 'attribute vec4 aAtt; attribute vec4 aC; attribute vec4 aQ; uniform vec3 uCrown; varying float vShade;');
  const cardPos = /* glsl */`
    float cE = growE();
    vec3 cl = qrot(aQ, vec3(position.x, position.y - 0.12, 0.0) * aC.w);
    vec3 transformed = attachP() + (aC.xyz + cl) * (uH / HF) * cE;`;
  const cardNormal = /* glsl */`
    vec3 cn = qrot(aQ, vec3(0.0, 0.0, 1.0));
    vec3 cw = attachP() + aC.xyz * (uH / HF);
    vec3 objectNormal = normalize(mix(cn, normalize(cw - uCrown * (uH / HF)), 0.55));
    vShade = 0.65 + 0.35 * clamp(length(aC.xz) / 10.0, 0.0, 1.0);`;
  const foliageMat = new THREE.MeshStandardMaterial({ map: spray, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0, envMapIntensity: 0.7, alphaToCoverage: true });
  patch(foliageMat, 'foliage', {
    uniforms: U, vertexHead: cardHead, normal: cardNormal, position: cardPos,
    fragmentHead: 'uniform vec3 uSunV; uniform vec3 uSunC; uniform float uGreen; varying float vShade;',
    color: 'diffuseColor.rgb *= vShade;',
    lightsEnd: 'reflectedLight.directDiffuse += diffuseColor.rgb * uSunC * max(0.0, -dot(normal, uSunV)) * 0.28 * vShade;',
  });
  const foliageDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: spray, alphaTest: 0.42 });
  patch(foliageDepth, 'foliageD', { uniforms: U, vertexHead: cardHead, position: cardPos });
  const foliage = new THREE.Mesh(fg, foliageMat);
  foliage.castShadow = true; foliage.receiveShadow = true; foliage.customDepthMaterial = foliageDepth; foliage.frustumCulled = false;
  group.add(foliage);
  U.uCrown.value.set(0, TREE.HF * 0.66, 0);

  // ---- the door's parts (made once the door's place is known)
  let panel = null, jamb = null, panelPivot = new THREE.Group(), hinge = new THREE.Vector3(), swingSign = 1;
  group.add(panelPivot);
  function buildDoor(th) {
    setDoor(th);
    const W2 = door.W / 2, yc = door.Hd - W2;
    const NS = 180, out = [];
    for (let k = 0; k <= NS; k++) out.push(door.outline(k / NS * door.total));
    const param = ([x, y]) => [door.thOf(x), y / TREE.HF];
    const tang = (k) => { const a = param(out[Math.max(0, k - 1)]), b = param(out[Math.min(NS, k + 1)]); const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l, 0]; };
    // the jamb: the trunk's side of the cut, facing into the hole
    jamb = new THREE.Mesh(paramGeometry(2, NS + 1, (i, k) => ({ tp: [...param(out[k]), i], ta: tang(k), tb: [0, 0, 1], kind: 2 }), true), trunkM);
    jamb.receiveShadow = true; jamb.frustumCulled = false; jamb.visible = false;
    group.add(jamb);
    // the panel: its bark face, its inner face, its cut sides
    const NJ = 40, NI = 24;
    const xw = (y) => (y <= yc ? W2 : Math.sqrt(Math.max(0, W2 * W2 - (y - yc) * (y - yc))));
    const face = (depth, kind, ta, tb, flip) => paramGeometry(NJ, NI, (j, i) => { const y = door.y0 + (door.Hd - door.y0) * j / (NJ - 1), x = -xw(y) + 2 * xw(y) * i / (NI - 1); return { tp: [...param([x, y]), depth], ta, tb, kind }; }, flip);
    const parts = [face(0, 0, [0, 1, 0], [1, 0, 0], false), face(1, 1, [1, 0, 0], [0, 1, 0], true),
      paramGeometry(2, NS + 1, (i, k) => ({ tp: [...param(out[k]), i], ta: [0, 0, 1], tb: tang(k), kind: 2 }))];
    panel = new THREE.Group();
    for (const g of parts) { const m = new THREE.Mesh(g, panelM); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = panelDepth; m.frustumCulled = false; panel.add(m); }
    // hinged at its inner left edge: it swings into the room
    door.world(-W2, 1.5, 1, hinge);
    panelPivot.position.copy(hinge); panel.position.copy(hinge).negate();
    panelPivot.add(panel); panelPivot.visible = false;
    const far = door.world(W2, 1.5, 0.5), test = far.clone().sub(hinge).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3).add(hinge);
    swingSign = test.clone().sub(far).dot(door.n) < 0 ? 1 : -1;
  }

  function setGrowth(g) {
    const H = heightAt(g), Rb = radiusAt(H);
    U.uG.value = g; U.uH.value = H; U.uSR.value = Rb / TREE.RF;
    U.uButt.value = smooth(0.55, 0.92, g); U.uTaper.value = smooth(0.02, 0.45, g);
    U.uBarkD.value = 0.14 * smooth(0.2, 0.7, g) * (Rb / TREE.RF);
    U.uGreen.value = 1 - smooth(0.05, 0.26, g);
    return { H, R: Rb };
  }
  setGrowth(0);
  return {
    group, trunk, inner, branches, foliage, U, door, TREE, rShapeJS, rRoomJS, at, roomTop,
    get jamb() { return jamb; }, get panelPivot() { return panelPivot; },
    buildDoor, setGrowth,
    // the laser's progress along the outline (metres), and the door freed
    setCut(s) { U.uCutS.value = s; for (const m of [trunkM, panelM]) m.userData.u.uCutS.value = s; },
    open(on) { U.uOpen.value = on ? 1 : 0; trunkM.userData.u.uOpen.value = on ? 1 : 0; panelPivot.visible = on; if (jamb) jamb.visible = on; },
    swing(angle) { panelPivot.rotation.y = swingSign * angle; },
    room(on) { inner.visible = on; },
    // the bark's relief in the light: none on a green stem
    trunkNormalScale(k) { for (const m of [trunkM, panelM]) m.normalScale.set(1.3 * k, 1.3 * k); },
    // inside the trunk the sky's light hardly reaches the wood
    envInside(k) { for (const m of [trunkM, panelM]) m.envMapIntensity = 0.45 + (0.07 - 0.45) * k; },
    sun(sunWorld, camera) { U.uSunV.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse); },
  };
}

// a flat spray of needles, two rows along each twig (a redwood's), drawn once
function sprayTexture(R) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  const twig = (x0, y0, ang, len, w, depth) => {
    const steps = Math.ceil(len / 6);
    let x = x0, y = y0, a = ang;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, nx = x + Math.cos(a) * 6, ny = y + Math.sin(a) * 6;
      g.strokeStyle = 'rgb(74,54,32)'; g.lineWidth = Math.max(1.2, w * (1 - t * 0.7));
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      const nl = (depth ? 20 : 28) * (1 - t * 0.6) * (0.85 + R() * 0.3);
      for (const sd of [-1, 1]) {
        const na = a + sd * (1.0 + (R() - 0.5) * 0.25), ex = nx + Math.cos(na) * nl, ey = ny + Math.sin(na) * nl;
        const k = 0.72 + R() * 0.4;
        g.strokeStyle = `rgb(${Math.round(40 * k)},${Math.round(82 * k)},${Math.round(34 * k)})`; g.lineWidth = 5.5 * (1 - t * 0.35);
        g.beginPath(); g.moveTo(nx, ny); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = `rgba(${Math.round(100 * k)},${Math.round(136 * k)},${Math.round(60 * k)},0.85)`; g.lineWidth = 2.6 * (1 - t * 0.3);
        g.beginPath(); g.moveTo(nx + (ex - nx) * 0.55, ny + (ey - ny) * 0.55); g.lineTo(ex, ey); g.stroke();
      }
      x = nx; y = ny; a += (R() - 0.5) * 0.06;
      if (!depth && i % 8 === 3 && t < 0.78) twig(nx, ny, a + ((i / 8) % 2 ? -1 : 1) * (0.5 + R() * 0.25), len * (0.42 - t * 0.28), w * 0.6, 1);
    }
  };
  twig(S / 2, S - 6, -Math.PI / 2, S - 28, 7, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
