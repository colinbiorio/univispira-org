// cube/planet.js — the cubic planet. On a cube the low ground is each face's middle (gravity pulls to
// the centre, so the middles are nearest it): what water and air there are pool there, and the edges
// stand up out of them like long mountain walls. One face is soil (up close it is ground.js's); one
// holds a round sea; one is ice; one grows violet crystals as tall as towers; one is black basalt split
// by glowing seams; the underside is banded stone.
//
// Units: metres. The cube is HALF·2 on a side, its soil face the plane y = 0 (the centre at y = -HALF),
// the tree's place at the origin.
import * as THREE from 'three';
import { HASH, SIMPLEX, NOISE3, BUMP, VORONOI, rng } from './glsl.js';

export const CUBE = {
  HALF: 500, BEVEL: 24,
  // where the sun is, seen from the cube (35° over the soil face)
  SUN: new THREE.Vector3(-0.26, 0.574, 0.776).normalize(),
  // where the eye arrives from, seen from the cube (three faces: soil above, the sea, the crystals)
  ARRIVE: new THREE.Vector3(0.52, 0.66, 0.54).normalize(),
};

// the soil as seen from far off, shared with ground.js so the two agree
export const SOIL_FAR = /* glsl */`
vec3 soilFar(vec2 p, float fw) {
  float n1 = fbmL(p * 0.0035, 3, fw * 0.0035), n2 = fbmL(p * 0.021 + 3.1, 2, fw * 0.021), n3 = fbmL(p * 0.11 + 7.2, 2, fw * 0.11);
  vec3 c = mix(vec3(0.042, 0.028, 0.019), vec3(0.100, 0.068, 0.045), smoothstep(-0.4, 0.5, n1 * 1.2 + n2 * 0.6));
  c *= 0.78 + 0.42 * (0.5 + 0.5 * n3);
  return c;
}`;

function roundedBox(half, r, openTop = false) {
  const nB = 9, nF = 26, inner = half - r, flat = half - 2 * r;
  const ts = [];
  for (let i = 0; i <= nB; i++) ts.push(-half + 2 * r * (i / nB));
  for (let i = 1; i < nF; i++) ts.push(-flat + 2 * flat * (i / nF));
  for (let i = 0; i <= nB; i++) ts.push(flat + 2 * r * (i / nB));
  ts.push(-inner, inner); ts.sort((a, b) => a - b);   // a grid line exactly where the flat part ends
  const N = ts.length, pos = [], nor = [], idx = [];
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const base = pos.length / 3, ua = (ax + 1) % 3, va = (ax + 2) % 3;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = [0, 0, 0]; p[ax] = sg * half; p[ua] = ts[i]; p[va] = ts[j];
      const c = p.map((x) => Math.max(-inner, Math.min(inner, x)));
      const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
      pos.push(c[0] + d[0] / l * r, c[1] + d[1] / l * r, c[2] + d[2] / l * r); nor.push(d[0] / l, d[1] / l, d[2] / l);
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      // the soil face's flat middle is the ground's to draw, when there is a ground
      if (openTop && ax === 1 && sg > 0 && Math.max(Math.abs(ts[i]), Math.abs(ts[i + 1]), Math.abs(ts[j]), Math.abs(ts[j + 1])) <= inner + 1e-6) continue;
      const a = base + j * N + i, b = a + 1, c = a + N, d = c + 1;
      if (sg > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const FACE_FRAG = /* glsl */`
${NOISE3}
${HASH}
${SIMPLEX}
${VORONOI}
${BUMP}
${SOIL_FAR}
uniform vec3 uSun; uniform vec3 uSunCol; uniform float uAmb; uniform float uTime; uniform float uHalf; uniform float uBevel;
uniform float uSoilTop; uniform mat3 uNM; uniform vec3 uFogCol; uniform float uFogD;
varying vec3 vP; varying vec3 vN; varying vec3 vW;

// a seam of width w (in cell units) that fades rather than flickers once it is thinner than a pixel
float seamL(float e, float w, float fwc) { float ww = max(w, fwc * 1.5); return (1.0 - smoothstep(0.0, ww, e)) * (w / ww); }

void main() {
  vec3 n = normalize(vN), a = abs(n);
  float fw = max(length(fwidth(vP)), 1e-3);       // metres per pixel here
  int face; vec2 uv;
  if (a.y >= a.x && a.y >= a.z) { face = n.y > 0.0 ? 0 : 1; uv = vP.xz; }
  else if (a.x >= a.z) { face = n.x > 0.0 ? 2 : 3; uv = vP.zy; }
  else { face = n.z > 0.0 ? 4 : 5; uv = vP.xy; }
  float flatness = max(max(a.x, a.y), a.z);
  if (face == 0 && uSoilTop < 0.5 && flatness > 0.99999) discard;   // the ground draws the soil there
  float rad = length(uv) / uHalf;                  // 0 in the middle of a face
  float edge = max(abs(uv.x), abs(uv.y)) / uHalf;   // 1 at its edges
  float cliff = 1.0 - smoothstep(0.93, 0.9995, flatness);
  vec3 col = vec3(0.2); float h = 0.0; float spec = 0.0, shin = 30.0; vec3 emit = vec3(0.0);
  float rock = fbmL(uv * 0.012 + float(face) * 13.0, 5, fw * 0.012);
  vec3 stone = mix(vec3(0.16, 0.15, 0.14), vec3(0.30, 0.27, 0.24), 0.5 + 0.5 * rock);
  if (face == 0) {
    col = soilFar(vP.xz, fw); h = fbmL(uv * 0.03, 4, fw * 0.03) * 0.6;
  } else if (face == 4) {          // the round sea
    float shore = rad + 0.035 * fbmL(uv * 0.006, 4, fw * 0.006);
    float wave = fbmL(uv * 0.08 + vec2(uTime * 0.05, uTime * 0.03), 4, fw * 0.08) + 0.5 * fbmL(uv * 0.35 - uTime * 0.08, 3, fw * 0.35);
    if (shore < 0.58) {
      float depth = 1.0 - smoothstep(0.25, 0.58, shore);
      col = mix(vec3(0.06, 0.32, 0.36), vec3(0.008, 0.035, 0.09), depth);
      h = wave * 0.15; spec = 1.0; shin = 220.0;
      float foam = smoothstep(0.572, 0.58, shore) * (0.6 + 0.4 * sin(uTime * 1.5 + shore * 500.0));
      col = mix(col, vec3(0.8), foam * 0.6);
    } else if (shore < 0.615) { col = vec3(0.62, 0.55, 0.42) * (0.9 + 0.2 * rock); h = rock * 0.3; }
    else { float g = smoothstep(0.62, 0.8, shore); col = mix(vec3(0.10, 0.22, 0.07) * (0.8 + 0.4 * rock), stone, g); h = rock; }
  } else if (face == 2) {          // the crystal face: dark stone, violet light in its seams
    vec3 vo = voronoi2(uv * 0.018);
    float seam = seamL(vo.y - vo.x, 0.06, fw * 0.018);
    vec3 vo2 = voronoi2(uv * 0.07 + 4.0);
    float seam2 = seamL(vo2.y - vo2.x, 0.05, fw * 0.07);
    col = mix(vec3(0.05, 0.045, 0.07), vec3(0.13, 0.11, 0.16), 0.5 + 0.5 * rock);
    emit = vec3(0.55, 0.22, 1.0) * (seam * 1.4 + seam2 * 0.5) * (0.6 + 0.4 * sin(uTime * 0.7 + vo.z * 20.0)) * (1.0 - cliff);
    h = rock - seam * 0.5;
  } else if (face == 3) {          // ice
    vec3 vo = voronoi2(uv * 0.01 + fbmL(uv * 0.004, 3, fw * 0.004) * 0.6);
    float crev = seamL(vo.y - vo.x, 0.08, fw * 0.01);
    float lake = 1.0 - smoothstep(0.27, 0.32, rad + 0.03 * fbmL(uv * 0.01, 3, fw * 0.01));
    col = mix(vec3(0.78, 0.86, 0.95), vec3(0.55, 0.70, 0.88), 0.5 + 0.5 * fbmL(uv * 0.02, 4, fw * 0.02));
    col = mix(col, vec3(0.10, 0.25, 0.45), crev * 0.8);
    col = mix(col, vec3(0.02, 0.07, 0.14), lake);
    h = -crev * 0.8 + fbmL(uv * 0.05, 3, fw * 0.05) * 0.2; spec = 0.5 + lake * 0.5; shin = 80.0 + lake * 200.0;
  } else if (face == 5) {          // basalt, split by glowing seams
    vec3 vo = voronoi2(uv * 0.014 + fbmL(uv * 0.003, 3, fw * 0.003) * 0.8);
    vec3 vo2 = voronoi2(uv * 0.05);
    float s1 = seamL(vo.y - vo.x, 0.05, fw * 0.014), s2 = seamL(vo2.y - vo2.x, 0.04, fw * 0.05);
    col = mix(vec3(0.03, 0.028, 0.03), vec3(0.08, 0.07, 0.065), 0.5 + 0.5 * rock);
    float pulse = 0.6 + 0.4 * sin(uTime * 0.8 + vo.z * 30.0);
    emit = vec3(1.0, 0.32, 0.06) * (s1 * 2.4 + s2 * 0.7) * pulse * (1.0 - cliff * 0.7);
    h = rock - s1 * 0.6;
  } else {                         // the underside: banded stone
    float band = sin(uv.y * 0.05 + fbmL(uv * 0.004, 3, fw * 0.004) * 4.0);
    col = mix(vec3(0.42, 0.24, 0.13), vec3(0.62, 0.48, 0.34), 0.5 + 0.5 * band) * (0.8 + 0.3 * rock);
    h = rock + band * 0.3;
  }
  // the edges stand up out of air and sea as walls of bare rock
  float strata = 0.5 + 0.5 * sin(dot(vP, vec3(0.013, 0.031, 0.017)) * 6.0 + rock * 3.0);
  vec3 cliffCol = mix(stone, stone * vec3(1.15, 1.0, 0.85), strata);
  col = mix(col, cliffCol, smoothstep(0.0, 0.6, cliff));
  spec *= 1.0 - cliff; emit *= 1.0 - smoothstep(0.3, 0.8, cliff);
  h += cliff * (rock + strata * 0.4);
  vec3 nw = normalize(uNM * n);
  vec3 nb = bumpNormal(vW, nw, h * 1.4);
  vec3 v = normalize(cameraPosition - vW);
  float ndl = max(dot(nb, uSun), 0.0);
  vec3 lit = col * ndl * uSunCol + col * uAmb * (0.6 + 0.4 * nw.y);
  if (spec > 0.0) {
    vec3 hv = normalize(uSun + v);
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(nb, v), 0.0), 5.0);
    lit += uSunCol * pow(max(dot(nb, hv), 0.0), shin) * spec * (shin / 40.0) * fr * 4.0 * step(0.0, dot(nw, uSun));
    lit += vec3(0.25, 0.4, 0.65) * fr * spec * 0.25;
  }
  // air pooled over the soil and the sea: a blue sheen at grazing angles on the day side
  if (face == 0 || face == 4) {
    float air = (1.0 - smoothstep(0.4, 0.95, edge)) * pow(1.0 - max(dot(nw, v), 0.0), 2.2);
    lit = mix(lit, vec3(0.30, 0.48, 0.85) * (0.15 + max(dot(nw, uSun), 0.0)) * 0.6, air * 0.55);
  }
  lit += emit;
  float dist = length(vW - cameraPosition);
  lit = mix(lit, uFogCol, 1.0 - exp(-pow(uFogD * dist, 2.0)));
  gl_FragColor = vec4(lit, 1.0);
}`;

const FACE_VERT = /* glsl */`
varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main() {
  vP = position; vN = normal;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// crystals: six-sided columns with points, in clusters on the +x face
function crystalGeometry() {
  const prof = [new THREE.Vector2(0, -0.2), new THREE.Vector2(1, -0.2), new THREE.Vector2(1, 0.78), new THREE.Vector2(0, 1.0)];
  const g = new THREE.LatheGeometry(prof, 6).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function createCubeBody(ctx, { noise, soilTop = true, crystals = true, seed = 11 } = {}) {
  const { HALF, BEVEL } = CUBE;
  const group = new THREE.Group();
  const uniforms = {
    uNoise: { value: noise }, uSun: { value: CUBE.SUN.clone() }, uSunCol: { value: new THREE.Color(1.0, 0.95, 0.86).multiplyScalar(1.6) },
    uAmb: { value: 0.03 }, uTime: { value: 0 }, uHalf: { value: HALF }, uBevel: { value: BEVEL }, uSoilTop: { value: soilTop ? 1 : 0 },
    uNM: { value: new THREE.Matrix3() }, uFogCol: { value: new THREE.Color(0, 0, 0) }, uFogD: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: FACE_VERT, fragmentShader: FACE_FRAG, extensions: { derivatives: true } });
  const box = new THREE.Mesh(roundedBox(HALF, BEVEL, !soilTop), mat);
  box.position.y = -HALF;
  group.add(box);
  let crys = null;
  if (crystals) {
    const R = rng(seed), n = ctx.quality === 'lite' ? 140 : 260;
    const cm = new THREE.ShaderMaterial({
      uniforms: { uSun: uniforms.uSun, uSunCol: uniforms.uSunCol, uTime: uniforms.uTime, uNM: uniforms.uNM, uFogCol: uniforms.uFogCol, uFogD: uniforms.uFogD },
      vertexShader: /* glsl */`
        attribute float aGlow;
        varying vec3 vN; varying vec3 vW; varying float vY; varying float vG;
        void main() {
          vY = position.y; vG = aGlow;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSun; uniform vec3 uSunCol; uniform float uTime; uniform vec3 uFogCol; uniform float uFogD;
        varying vec3 vN; varying vec3 vW; varying float vY; varying float vG;
        void main() {
          vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
          float fr = pow(1.0 - abs(dot(n, v)), 3.0);
          float tip = smoothstep(0.1, 1.0, vY);
          vec3 base = mix(vec3(0.05, 0.015, 0.10), vec3(0.20, 0.06, 0.32), tip);
          vec3 glow = vec3(0.62, 0.26, 1.0) * (0.25 + 2.6 * tip * tip) * vG * (0.8 + 0.2 * sin(uTime * 1.3 + vG * 9.0));
          vec3 r = reflect(-v, n);
          float sp = pow(max(dot(r, uSun), 0.0), 90.0) * 6.0;
          vec3 c = base * (0.25 + max(dot(n, uSun), 0.0)) * uSunCol + glow + vec3(0.8, 0.7, 1.0) * fr * 0.35 + uSunCol * sp;
          gl_FragColor = vec4(mix(c, uFogCol, 1.0 - exp(-pow(uFogD * length(vW - cameraPosition), 2.0))), 1.0);
        }`,
    });
    const geo = crystalGeometry();
    const glow = new Float32Array(n);
    crys = new THREE.InstancedMesh(geo, cm, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
    const clusters = [];
    for (let c = 0; c < 9; c++) clusters.push([(R() * 2 - 1) * HALF * 0.72, (R() * 2 - 1) * HALF * 0.72, 30 + R() * 70]);
    for (let i = 0; i < n; i++) {
      const cl = clusters[i % clusters.length];
      const a = R() * Math.PI * 2, rr = Math.pow(R(), 0.7) * cl[2];
      const z = cl[0] + Math.cos(a) * rr, y = cl[1] + Math.sin(a) * rr - HALF;
      const hgt = (10 + Math.pow(R(), 2.2) * 85) * (1.15 - rr / cl[2] * 0.6);
      p.set(HALF - 2, y, z);
      up.set(1, (R() - 0.5) * 1.2 + Math.sin(a) * 0.5, (R() - 0.5) * 1.2 + Math.cos(a) * 0.5).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * Math.PI));
      s.set(hgt * 0.13, hgt, hgt * 0.13);
      m.compose(p, q, s); crys.setMatrixAt(i, m);
      glow[i] = 0.4 + R() * 0.9;
    }
    void X;
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
    crys.instanceMatrix.needsUpdate = true;
    group.add(crys);
  }
  const nm = new THREE.Matrix3();
  return {
    group, box, mat, uniforms, crystals: crys,
    // sun: the direction to the sun in world space; call each frame the cube is seen
    update(t, sunWorld) {
      uniforms.uTime.value = t;
      if (sunWorld) uniforms.uSun.value.copy(sunWorld);
      group.updateMatrixWorld();
      uniforms.uNM.value.copy(nm.getNormalMatrix(box.matrixWorld));
    },
  };
}
