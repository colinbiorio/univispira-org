// cube/door.js — what the laser makes as it cuts: its bright point and the light it throws on the bark,
// sparks (thrown off hot, falling, bouncing, cooling from white to red), and smoke rising in wisps.
import * as THREE from 'three';
import { NOISE3, rng } from './glsl.js';
import { makeGlow } from './space.js';

export function createLaserFX(ctx, { noise }) {
  const lite = ctx.quality === 'lite';
  const group = new THREE.Group();
  const R = rng(91);
  const point = makeGlow({ color: new THREE.Color(1.0, 0.86, 0.68), size: 0.07, intensity: 9, rays: 1 });
  point.uniforms.uMinPx.value = 14;
  const core = makeGlow({ color: new THREE.Color(1, 1, 1), size: 0.018, intensity: 30, rays: 0 });
  core.uniforms.uMinPx.value = 4;
  group.add(point.mesh, core.mesh);
  const light = new THREE.PointLight(0xffa860, 0, 3.5, 2);
  group.add(light);

  // ---- sparks
  const NSP = lite ? 320 : 760;
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  sg.setIndex([0, 1, 2, 0, 2, 3]);
  const sP = new Float32Array(NSP * 3), sV = new Float32Array(NSP * 3), sT = new Float32Array(NSP * 2).fill(-100);
  const aP = new THREE.InstancedBufferAttribute(sP, 3), aV = new THREE.InstancedBufferAttribute(sV, 3), aT = new THREE.InstancedBufferAttribute(sT, 2);
  aP.setUsage(THREE.DynamicDrawUsage); aV.setUsage(THREE.DynamicDrawUsage); aT.setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('aP', aP); sg.setAttribute('aV', aV); sg.setAttribute('aT', aT);
  sg.instanceCount = NSP;
  const sU = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 } };
  const sparks = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    uniforms: sU,
    vertexShader: /* glsl */`
      attribute vec3 aP; attribute vec3 aV; attribute vec2 aT;
      uniform float uTime; uniform vec2 uRes; uniform float uPx;
      varying vec3 vCol; varying vec2 vQ; varying float vHalf; varying float vW;
      vec3 at(float t) {
        float k = 2.2, e = (1.0 - exp(-k * t)) / k;
        vec3 p = aP + aV * e + vec3(0.0, -9.8, 0.0) * (t / k - e / k);
        if (p.y < 0.004) p.y = 0.004 + abs(p.y - 0.004) * 0.15;
        return p;
      }
      void main() {
        float age = uTime - aT.x;
        if (age < 0.0 || age > aT.y) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vCol = vec3(0.0); return; }
        vec4 c = projectionMatrix * viewMatrix * vec4(at(age), 1.0);
        vec4 pc = projectionMatrix * viewMatrix * vec4(at(max(0.0, age - 0.022)), 1.0);
        if (c.w < 0.05 || pc.w < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vCol = vec3(0.0); return; }
        vec2 s = c.xy / c.w * 0.5 * uRes, ps = pc.xy / pc.w * 0.5 * uRes;
        vec2 dl = s - ps; float L = length(dl);
        vec2 ax = L > 0.01 ? dl / L : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
        float w = 1.1 * uPx;
        vec2 sp = s - 0.5 * dl + ax * position.x * (0.5 * L + 2.0 * w) + ay * position.y * 2.0 * w;
        gl_Position = vec4(sp / (0.5 * uRes) * c.w, c.z, c.w);
        vQ = vec2(position.x * (0.5 * L + 2.0 * w), position.y * 2.0 * w); vHalf = 0.5 * L; vW = w;
        float k = age / aT.y;
        vec3 hot = vec3(1.0, 0.92, 0.7) * 9.0, warm = vec3(1.0, 0.45, 0.1) * 4.0, cool = vec3(0.7, 0.12, 0.02) * 1.2;
        vCol = (k < 0.35 ? mix(hot, warm, k / 0.35) : mix(warm, cool, (k - 0.35) / 0.65)) * (1.0 - smoothstep(0.75, 1.0, k)) / (1.0 + L / (6.0 * w));
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying vec2 vQ; varying float vHalf; varying float vW;
      void main() {
        float dx = max(abs(vQ.x) - vHalf, 0.0);
        float g = exp(-(dx * dx + vQ.y * vQ.y) / (vW * vW));
        gl_FragColor = vec4(vCol * g, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false; sparks.renderOrder = 5;
  group.add(sparks);
  let sNext = 0;
  const tmp = new THREE.Vector3();
  function spark(at, nrm, t) {
    const i = sNext; sNext = (sNext + 1) % NSP;
    const speed = 1.2 + R() * 3.8;
    tmp.set(R() - 0.5, R() * 0.8 - 0.1, R() - 0.5).multiplyScalar(2.6).addScaledVector(nrm, speed);
    sP.set([at.x, at.y, at.z], i * 3); sV.set([tmp.x, tmp.y, tmp.z], i * 3); sT.set([t, 0.35 + R() * 1.0], i * 2);
  }

  // ---- smoke
  const NSM = lite ? 50 : 90;
  const mg = new THREE.InstancedBufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  mg.setIndex([0, 1, 2, 0, 2, 3]);
  const mO = new Float32Array(NSM * 3), mT = new Float32Array(NSM * 3).fill(-100);
  const aO = new THREE.InstancedBufferAttribute(mO, 3), aM = new THREE.InstancedBufferAttribute(mT, 3);
  aO.setUsage(THREE.DynamicDrawUsage); aM.setUsage(THREE.DynamicDrawUsage);
  mg.setAttribute('aO', aO); mg.setAttribute('aM', aM); mg.instanceCount = NSM;
  const mU = { uTime: { value: 0 }, uNoise: { value: noise }, uLight: { value: new THREE.Color(1, 1, 1) } };
  const smoke = new THREE.Mesh(mg, new THREE.ShaderMaterial({
    uniforms: mU,
    vertexShader: /* glsl */`
      attribute vec3 aO; attribute vec3 aM;
      uniform float uTime;
      varying vec2 vUv; varying float vA; varying float vR;
      void main() {
        float age = uTime - aM.x;
        vR = aM.z;
        if (age < 0.0 || age > aM.y) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vA = 0.0; return; }
        float k = age / aM.y;
        vec3 c = aO + vec3(sin(age * 0.9 + aM.z * 6.0) * 0.12 * age, 0.22 * age + 0.05 * age * age, cos(age * 0.7 + aM.z * 4.0) * 0.12 * age);
        float size = 0.05 + 0.38 * sqrt(age);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float r = aM.z * 6.28;
        mv.xy += mat2(cos(r + age * 0.3), sin(r + age * 0.3), -sin(r + age * 0.3), cos(r + age * 0.3)) * position.xy * size;
        gl_Position = projectionMatrix * mv;
        vUv = position.xy; vA = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.35, 1.0, k));
      }`,
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform float uTime; uniform vec3 uLight;
      varying vec2 vUv; varying float vA; varying float vR;
      void main() {
        float r = length(vUv);
        float n = texture(uNoise, vec3(vUv * 0.35 + vR, vR * 3.0 + uTime * 0.03)).r;
        float n2 = texture(uNoise, vec3(vUv * 0.9 + vR * 2.0, vR + uTime * 0.05)).g;
        float a = (1.0 - smoothstep(0.3, 1.0, r)) * smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.3) * vA * 0.42;
        gl_FragColor = vec4(uLight * (0.55 + 0.25 * n2) * a, a);
      }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  smoke.frustumCulled = false; smoke.renderOrder = 4;
  group.add(smoke);
  let mNext = 0;
  function puff(at, t) {
    const i = mNext; mNext = (mNext + 1) % NSM;
    mO.set([at.x, at.y, at.z], i * 3); mT.set([t, 2.6 + R() * 1.8, R()], i * 3);
  }

  let carry = 0, carryM = 0, on = false;
  const glows = [point, core];
  return {
    group, light,
    // each frame: where the point is (null: off), its surface normal, the clock, and the sun's colour for the smoke
    update(dt, t, at, nrm, camera, sunCol) {
      sU.uTime.value = t; mU.uTime.value = t;
      const W = ctx.size.w * ctx.size.scale, H = ctx.size.h * ctx.size.scale;
      sU.uRes.value.set(W, H); sU.uPx.value = ctx.size.scale;
      for (const g of glows) g.uniforms.uRes.value.set(W, H);
      if (sunCol) mU.uLight.value.copy(sunCol).multiplyScalar(0.25);
      on = !!at;
      point.mesh.visible = core.mesh.visible = on;
      if (on) {
        tmp.copy(at).addScaledVector(nrm, 0.05);
        point.mesh.position.copy(tmp); core.mesh.position.copy(tmp);
        const fl = 0.85 + 0.15 * Math.sin(t * 61) * Math.sin(t * 37);
        point.uniforms.uI.value = 9 * fl; core.uniforms.uI.value = 30 * fl;
        light.position.copy(at).addScaledVector(nrm, 0.25); light.intensity = 1.1 * fl;
        carry += dt * (lite ? 220 : 420);
        while (carry >= 1) { spark(at, nrm, t - Math.random() * dt); carry -= 1; }
        carryM += dt * 14;
        while (carryM >= 1) { puff(tmp, t); carryM -= 1; }
        aP.needsUpdate = aV.needsUpdate = aT.needsUpdate = aO.needsUpdate = aM.needsUpdate = true;
      } else light.intensity = 0;
    },
  };
}
