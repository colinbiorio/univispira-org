// cube/ground.js — the soil face, near enough to see crumbs. One mesh whose rings widen away from the
// tree's place (millimetres there, metres at the face's edges); the soil seen from space (planet.js's
// soilFar) with clods, crumbs, grains and wet patches added as the eye comes near; real crumbs and
// little stones scattered round the middle, a few drops of dew; and the sprout lifting and cracking
// it from beneath.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { HASH, SIMPLEX, VORONOI, BUMP, rng, smooth } from './glsl.js';
import { SOIL_FAR, CUBE } from './planet.js';
import { patch } from './patch.js';

export const GROUND_GLSL = /* glsl */`
${HASH}
${SIMPLEX}
${VORONOI}
${SOIL_FAR}
uniform float uBulge; uniform float uCrack; uniform float uHalfG;
// the ground's height: long swells far out (none near the tree), furrows, lumps; finer than lod metres left out
float groundH(vec2 p, float lod) {
  float r = length(p);
  float edge = 1.0 - smoothstep(uHalfG * 0.8, uHalfG * 0.985, max(abs(p.x), abs(p.y)));
  float far = smoothstep(9.0, 45.0, r) * edge;
  float h = far * (fbmL(p * 0.008, 3, lod * 0.008) * 1.6 + fbmL(p * 0.04 + 3.0, 3, lod * 0.04) * 0.35);
  h += fbmL(p * 1.2 + 7.0, 3, lod * 1.2) * 0.02 * edge;
  h += fbmL(p * 9.0 + 1.0, 3, lod * 9.0) * 0.004;
  h += uBulge * 0.0045 * exp(-r * r / (0.016 * 0.016));
  return h;
}
// cracks the sprout opens round itself
float crackMask(vec2 p) {
  if (uCrack <= 0.001 || dot(p, p) > 0.032 * 0.032) return 0.0;
  vec3 vo = voronoi2(p * 150.0 + 3.0);
  return (1.0 - smoothstep(0.0, 0.07, vo.y - vo.x)) * (1.0 - smoothstep(0.006, 0.03, length(p)));
}
// everything the soil is at a point, worked out once: its colour, its fine relief, how wet it is.
// Crumbs are rounded lumps of many sizes packed together (a dome per cell); grains and threads of old
// root between them; all of it left out where it would be smaller than a pixel.
void soilAt(vec2 p, float fw, out vec3 col, out float h, out float wet) {
  vec3 c = soilFar(p, fw);
  h = 0.0;
  float k1 = 1.0 - smoothstep(0.15, 0.4, fw * 95.0);
  if (k1 > 0.0) {
    vec3 v1 = voronoi2(p * 95.0 + snoise(p * 30.0) * 0.3);
    float l1 = (1.0 - smoothstep(0.0, 0.66, v1.x)) * (0.55 + 0.45 * v1.z), l2 = 0.0;
    float k2 = 1.0 - smoothstep(0.15, 0.4, fw * 260.0);
    if (k2 > 0.0) { vec3 v2 = voronoi2(p * 260.0 + 5.0); l2 = (1.0 - smoothstep(0.0, 0.6, v2.x)) * k2; }
    c *= mix(1.0, (0.62 + 0.5 * v1.z) * (0.62 + 0.38 * l1) * (0.85 + 0.15 * l2), k1);
    h = l1 * 0.0026 * k1 + l2 * 0.0009;
    h += snoise(p * 700.0) * 0.00012 * (1.0 - smoothstep(0.15, 0.4, fw * 700.0));
  }
  float kf = 1.0 - smoothstep(0.2, 0.5, fw * 60.0);
  if (kf > 0.0) {
    float fibre = (1.0 - smoothstep(0.0, 0.05, abs(snoise(p * vec2(60.0, 9.0) + 4.0)))) * step(0.6, snoise(p * 7.0 + 2.0)) * kf;
    c = mix(c, vec3(0.16, 0.09, 0.04), fibre * 0.6);
  }
  wet = smoothstep(0.12, 0.6, fbmL(p * 3.0 + 11.0, 2, fw * 3.0)) * 0.75;
  col = c * mix(1.0, 0.6, wet);
}
`;

// a lump: an icosahedron pushed about by noise (shared by every crumb of one kind)
function lumpGeometry(seed, detail, rough) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const R = rng(seed), p = g.attributes.position, v = new THREE.Vector3();
  const f = [0, 1, 2, 3, 4, 5].map(() => [R() * 6.28, R() * 6.28, R() * 6.28, 1 + R() * 3]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (const [a, b, c, w] of f) k += rough * Math.sin(v.x * w + a) * Math.sin(v.y * w + b) * Math.sin(v.z * w + c) / w;
    v.multiplyScalar(k); p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createGround(ctx, { noise } = {}) {
  const lite = ctx.quality === 'lite';
  const half = CUBE.HALF - CUBE.BEVEL;
  const group = new THREE.Group();
  const U = { uBulge: { value: 0 }, uCrack: { value: 0 }, uHalfG: { value: half }, uPush: { value: 0 }, uCover: { value: 0 }, uCrumbK: { value: 1 } };

  // ---- the mesh: a centre, then rings from 1.5 mm out to the square's edge
  const NA = lite ? 160 : 256, NR = lite ? 150 : 210, r0 = 0.0015;
  const pos = new Float32Array((NA * NR + 1) * 3), lod = new Float32Array(NA * NR + 1);
  const idx = [];
  pos.set([0, 0, 0], 0); lod[0] = r0;
  for (let i = 0; i < NR; i++) {
    const r = r0 * Math.pow(half / r0, i / (NR - 1));
    const sq = Math.min(1, Math.max(0, (r / half - 0.25) / 0.75)), sqs = sq * sq * (3 - 2 * sq);
    const ring = r * Math.log(half / r0) / (NR - 1);
    for (let j = 0; j < NA; j++) {
      const a = (j + (i % 2) * 0.5) / NA * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const k = 1 + (1 / Math.max(Math.abs(c), Math.abs(s)) - 1) * sqs;
      const n = 1 + i * NA + j;
      pos.set([c * r * k, 0, s * r * k], n * 3);
      lod[n] = Math.max(ring, r * 2 * Math.PI / NA);
    }
  }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NA; j++) {
    const a = 1 + i * NA + j, b = 1 + i * NA + (j + 1) % NA, c = 1 + (i + 1) * NA + j, d = 1 + (i + 1) * NA + (j + 1) % NA;
    if (i % 2 === 0) idx.push(a, b, c, b, d, c); else idx.push(a, d, c, a, b, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLod', new THREE.BufferAttribute(lod, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), half * 1.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 });
  patch(mat, 'ground', {
    uniforms: U,
    vertexHead: GROUND_GLSL + 'attribute float aLod; varying vec2 vGP;',
    normal: /* glsl */`
      float gl0 = max(aLod, 1e-4), ge = gl0 * 0.7;
      float hC = groundH(position.xz, gl0);
      float hX = groundH(position.xz + vec2(ge, 0.0), gl0), hZ = groundH(position.xz + vec2(0.0, ge), gl0);
      vec3 objectNormal = normalize(vec3(-(hX - hC) / ge, 1.0, -(hZ - hC) / ge));`,
    position: /* glsl */`vec3 transformed = vec3(position.x, hC - uCrack * 0.0015 * crackMask(position.xz), position.z); vGP = position.xz;`,
    fragmentHead: GROUND_GLSL + BUMP + 'varying vec2 vGP; float gWet; float gCr; float gfw; float gH;',
    color: /* glsl */`
      gfw = max(length(fwidth(vGP)), 1e-5);
      vec3 gSoil; soilAt(vGP, gfw, gSoil, gH, gWet);
      diffuseColor.rgb = gSoil;
      gCr = crackMask(vGP) * uCrack;
      diffuseColor.rgb *= 1.0 - gCr * 0.85;`,
    roughness: 'roughnessFactor = mix(0.94, 0.6, gWet);',
    normalMap: 'normal = bumpNormal(-vViewPosition, normal, gH - gCr * 0.0016);',
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  group.add(ground);

  // ---- crumbs, stones and dew round the middle
  const R = rng(5);
  const pushGLSL = /* glsl */`
    vec4 mvPosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      mvPosition = instanceMatrix * mvPosition;
      float ir = length(ip.xz);
      vec2 idir = ip.xz / max(ir, 1e-5);
      mvPosition.xz += idir * uPush * 0.014 * exp(-ir / 0.011);
      mvPosition.y += uPush * 0.007 * exp(-ir * ir / (0.011 * 0.011));
      mvPosition.xyz = ip + (mvPosition.xyz - ip) * uCrumbK;
      if (ir < uCover) mvPosition.xyz = ip - vec3(0.0, 0.05, 0.0);
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;`;
  const scatter = (mesh, n, sizeFn, colFn, sink) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const rr = 0.44 * Math.pow(R(), 0.8), a = R() * Math.PI * 2;
      const size = sizeFn() * (1 - smooth(0.24, 0.44, rr));
      p.set(Math.cos(a) * rr, size * sink, Math.sin(a) * rr);
      e.set(R() * 6.28, R() * 6.28, R() * 6.28); q.setFromEuler(e);
      s.set(size * (0.7 + R() * 0.6), size * (0.5 + R() * 0.4), size * (0.7 + R() * 0.6));
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      colFn(c); mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  const crumbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, envMapIntensity: 0.35 });
  patch(crumbMat, 'crumb', { uniforms: U, vertexHead: 'uniform float uPush; uniform float uCover; uniform float uCrumbK;', project: pushGLSL });
  const crumbDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patch(crumbDepth, 'crumbD', { uniforms: U, vertexHead: 'uniform float uPush; uniform float uCover; uniform float uCrumbK;', project: pushGLSL });
  const nCr = lite ? 1800 : 4200;
  const crumbs = [];
  for (let k = 0; k < 3; k++) {
    const im = new THREE.InstancedMesh(lumpGeometry(11 + k, 1, 0.55), crumbMat, Math.round(nCr / 3));
    scatter(im, im.count, () => 0.0006 * Math.exp(R() * 1.9) * (R() < 0.04 ? 2.2 : 1), (c) => {
      const t = R(); c.setRGB(0.06 + t * 0.05, 0.04 + t * 0.03, 0.028 + t * 0.02); if (R() < 0.3) c.multiplyScalar(0.6);
    }, 0.25);
    im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = crumbDepth; im.frustumCulled = false;
    group.add(im); crumbs.push(im);
  }
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, envMapIntensity: 0.35 });
  patch(stoneMat, 'stone', { uniforms: U, vertexHead: 'uniform float uPush; uniform float uCover; uniform float uCrumbK;', project: pushGLSL });
  const stones = new THREE.InstancedMesh(lumpGeometry(31, 2, 0.4), stoneMat, lite ? 40 : 80);
  const stoneCols = [[0.27, 0.25, 0.23], [0.36, 0.29, 0.2], [0.3, 0.29, 0.27], [0.32, 0.18, 0.11], [0.18, 0.18, 0.2]];
  scatter(stones, stones.count, () => 0.0018 * Math.exp(R() * 1.6), (c) => { const s = stoneCols[Math.floor(R() * stoneCols.length)]; c.setRGB(s[0], s[1], s[2]).multiplyScalar(0.55 + R() * 0.5); }, 0.2);
  stones.castShadow = true; stones.receiveShadow = true; stones.customDepthMaterial = crumbDepth; stones.frustumCulled = false;
  group.add(stones);
  const dewMat = new THREE.MeshStandardMaterial({ color: 0x030405, roughness: 0.03, metalness: 0.0, envMapIntensity: 1.4 });
  patch(dewMat, 'dew', { uniforms: U, vertexHead: 'uniform float uPush; uniform float uCover; uniform float uCrumbK;', project: pushGLSL });
  const dew = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), dewMat, 9);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < dew.count; i++) {
      const rr = 0.03 + 0.2 * R(), a = R() * 6.28, size = 0.0006 + R() * 0.0009;
      p.set(Math.cos(a) * rr, size * 0.45 + 0.0025, Math.sin(a) * rr); s.set(size, size * 0.62, size);
      m.compose(p, q, s); dew.setMatrixAt(i, m);
    }
    dew.instanceMatrix.needsUpdate = true; dew.frustumCulled = false;
  }
  group.add(dew);
  const small = [...crumbs, stones, dew];

  return {
    group, ground, U, small,
    // the sprout's work on the soil: bulge, cracks, crumbs pushed aside (each 0..1)
    set({ bulge = 0, crack = 0, push = 0 } = {}) { U.uBulge.value = bulge; U.uCrack.value = crack; U.uPush.value = push; },
    // crumbs under the trunk (radius r) go; the little things are shown only while the eye is near
    cover(r) { U.uCover.value = r; for (const m of small) m.visible = r < 0.4; },
  };
}
