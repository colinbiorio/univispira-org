// cube/room.js — the room in the hollow trunk: a floor that is the tree's own cross-section (rings,
// the darker latewood, a few checks), light falling from a hole of sky far up the chimney (a soft pool,
// a shaft with dust turning in it), a little warmth bounced back off the wood, and one thing: a
// standing mirror. It reflects the room (Reflector); given the camera, it shows you, the way a mirror
// would: reversed, silvered, the room's light still on the glass.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { HASH, SIMPLEX, BUMP, NOISE3, rng } from './glsl.js';
import { patch } from './patch.js';

const MIRROR_SHADER = {
  name: 'TTHPMirror',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    tVideo: { value: null }, uVideo: { value: 0 }, uVidAspect: { value: 4 / 3 }, uAspect: { value: 0.54 }, uGain: { value: 0.42 }, uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec2 vLocal; varying vec3 vW; varying vec3 vN;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vLocal = position.xy;
      vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    ${HASH}
    uniform sampler2D tDiffuse; uniform sampler2D tVideo; uniform float uVideo; uniform float uVidAspect; uniform float uAspect; uniform float uGain; uniform float uTime;
    varying vec4 vUv; varying vec2 vLocal; varying vec3 vW; varying vec3 vN;
    vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    void main() {
      vec3 refl = texture2DProj(tDiffuse, vUv).rgb;
      vec2 p = vLocal;                       // -0.5..0.5 across the glass
      float e = length(p * 2.0);             // 0 in the middle, 1 at the frame
      vec3 glass = refl * vec3(0.92, 0.955, 1.0) * 0.9;
      if (uVideo > 0.001) {
        vec2 uv = p + 0.5;
        vec2 s = vec2(1.0);
        if (uVidAspect > uAspect) s.x = uAspect / uVidAspect; else s.y = uVidAspect / uAspect;
        vec2 vuv = (uv - 0.5) * s * 0.92 + 0.5;
        vuv.x = 1.0 - vuv.x;                 // a mirror gives you back reversed
        vec3 v = toLinear(texture2D(tVideo, vuv).rgb);
        float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
        v = mix(vec3(l), v, 0.86) * vec3(0.9, 0.95, 1.03) * uGain;      // silvered: cooler, a little less colour
        v *= 1.0 - smoothstep(0.55, 1.0, e) * 0.45;                       // and dimmer toward the frame
        vec3 m = v + max(refl - 1.5, 0.0) * 0.05 + refl * 0.02;           // the room's light, faintly, still caught by the glass
        glass = mix(glass, m, uVideo);
      }
      // the glass itself: a faint sheen across it, a darker edge, the bevel's bright thread, a little dust
      vec3 view = normalize(cameraPosition - vW);
      float fr = pow(1.0 - max(dot(normalize(vN), view), 0.0), 4.0);
      float sheen = (1.0 - smoothstep(0.0, 0.35, abs(p.x * 0.9 + p.y * 0.45 - 0.1))) * 0.035;
      glass *= 1.0 - smoothstep(0.7, 1.0, e) * 0.3;
      glass += vec3(0.9, 0.94, 1.0) * (sheen + fr * 0.05) * (0.3 + dot(refl, vec3(0.33)));
      glass += vec3(1.0) * smoothstep(0.955, 0.99, e) * (1.0 - smoothstep(0.99, 1.0, e)) * 0.06;
      glass += vec3(0.8) * step(0.9985, hash12(floor(p * 900.0))) * 0.03;
      gl_FragColor = vec4(glass, 1.0);
    }`,
};

export function createRoom(ctx, { tree, noise, sunU }) {
  const lite = ctx.quality === 'lite';
  const group = new THREE.Group();
  group.visible = false;
  const { door, roomTop } = tree;
  const floorR = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => tree.rRoomJS(k / 8 * Math.PI * 2, 0.1))) + 0.4;

  // ---- the floor: the tree's rings
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, envMapIntensity: 0.12 });
  patch(floorMat, 'floor', {
    vertexHead: 'varying vec3 vFP;', vertexTail: 'vFP = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    fragmentHead: HASH + SIMPLEX + BUMP + 'varying vec3 vFP; float gRo; float gBu;',
    color: /* glsl */`
      {
        float r = length(vFP.xz), a = atan(vFP.z, vFP.x);
        float warp = snoise(vec2(cos(a), sin(a)) * 1.6 + r * 0.25) * 0.05 + snoise(vec2(cos(a), sin(a)) * 6.0 + r) * 0.012;
        float sp = 0.065, fw = fwidth(r) / sp, aa = 1.0 - smoothstep(0.3, 0.75, fw);
        float ring = fract((r + warp) / sp + 0.35 * snoise(vec2(r * 1.3, 2.0)));
        float late = smoothstep(0.72, 0.9, ring) * (1.0 - smoothstep(0.93, 1.0, ring));
        float fine = fract((r + warp * 0.6) / 0.016), fa = 1.0 - smoothstep(0.25, 0.6, fwidth(r) / 0.016);
        vec3 c = mix(vec3(0.22, 0.085, 0.042), vec3(0.11, 0.038, 0.019), late * 0.9 * aa + 0.12 * (1.0 - aa));
        c *= 1.0 - 0.05 * smoothstep(0.8, 0.95, fine) * fa;
        c *= 0.94 + 0.12 * snoise(vec2(a * 30.0, r * 3.0));                     // the rays, radial
        c *= mix(0.82, 1.0, smoothstep(0.0, 1.2, r));                            // the oldest wood, darkest
        float chk = 0.0;
        for (int k = 0; k < 6; k++) {
          float ak = float(k) * 1.047 + 0.4 + sin(float(k) * 7.1) * 0.3;
          float d = abs(sin(a - ak)) * r;
          float w = 0.0025 * smoothstep(0.3, 2.5, r) * (0.5 + 0.5 * sin(r * 3.0 + float(k))) + 1e-5;
          chk = max(chk, (1.0 - smoothstep(w * 0.4, w, d)) * step(0.0, cos(a - ak)) * smoothstep(0.4, 0.9, r) * (1.0 - smoothstep(r * 0.0 + 4.0, 5.5, r)));
        }
        c *= 1.0 - chk * 0.85;
        diffuseColor.rgb = c;
        gRo = 0.36 + 0.18 * late - 0.05 * aa; gBu = -chk * 0.004 + late * 0.0005 * aa;
      }`,
    roughness: 'roughnessFactor = gRo;',
    normalMap: 'normal = bumpNormal(-vViewPosition, normal, gBu);',
  });
  const outline = new THREE.Shape();
  for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2, r = tree.rRoomJS(a, 0.05) + 0.2; if (i) outline.lineTo(Math.cos(a) * r, -Math.sin(a) * r); else outline.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(outline, 4), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  group.add(floor);

  // ---- light from above: the sky through the chimney's top, a soft pool, a shaft with dust in it
  const topR = tree.rRoomJS(0, roomTop) * 0.95;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(topR, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.95, 0.85).multiplyScalar(7) }));
  hole.rotation.x = Math.PI / 2; hole.position.y = roomTop - 0.05;
  group.add(hole);
  const spot = new THREE.SpotLight(0xffe9cc, 380, 0, 0.19, 0.95, 2);
  spot.position.set(0, roomTop - 0.3, 0); spot.target.position.set(0, 0, 0);
  group.add(spot, spot.target);
  const fill = new THREE.PointLight(0xff9f6a, 4, 0, 2);
  fill.position.set(0, 2.6, 0);
  group.add(fill);
  const shaftU = { uNoise: { value: noise }, uTime: { value: 0 }, uI: { value: 0.07 } };
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(topR * 0.9, 1.5, roomTop - 0.1, 48, 1, true), new THREE.ShaderMaterial({
    uniforms: shaftU,
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform float uTime; uniform float uI;
      varying vec3 vW; varying vec3 vN;
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float body = pow(abs(dot(normalize(vN), v)), 2.2);
        float dust = texture(uNoise, vW * 0.3 + vec3(0.0, -uTime * 0.015, 0.0)).r;
        float h = smoothstep(0.0, 2.2, vW.y) * (1.0 - 0.6 * smoothstep(6.0, 20.0, vW.y));
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.64) * uI * body * (0.5 + dust) * h, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  shaft.position.y = (roomTop - 0.1) / 2 + 0.05; shaft.renderOrder = 6;
  group.add(shaft);
  const NM = lite ? 160 : 320, R = rng(41), mp = new Float32Array(NM * 3), mr = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { const a = R() * 6.28, r = Math.sqrt(R()) * 1.4; mp.set([Math.cos(a) * r, 0.2 + R() * 5.5, Math.sin(a) * r], i * 3); mr[i] = R(); }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aR', new THREE.BufferAttribute(mr, 1));
  const motesU = { uTime: { value: 0 }, uPx: { value: 1 } };
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
    uniforms: motesU,
    vertexShader: /* glsl */`
      attribute float aR; uniform float uTime; uniform float uPx; varying float vB;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.13 + aR * 40.0) * 0.25, mod(-uTime * 0.03 + aR * 6.0, 6.0) - 3.0 + 3.0 - position.y * 0.0, cos(uTime * 0.11 + aR * 31.0) * 0.25);
        p.y = 0.2 + mod(position.y - uTime * 0.035 * (0.5 + aR), 5.5);
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float inShaft = 1.0 - smoothstep(0.9, 1.5, length(p.xz));
        vB = inShaft * (0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (1.0 + aR * 2.0) + aR * 50.0), 3.0));
        gl_PointSize = (1.5 + 2.0 * aR) * uPx * clamp(3.0 / -mv.z, 0.5, 2.0);
      }`,
    fragmentShader: 'varying float vB; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * vB * 0.9 * (1.0 - smoothstep(0.2, 1.0, r)), 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.frustumCulled = false; motes.renderOrder = 7;
  group.add(motes);

  // ---- the mirror, at the back of the room, facing the door
  const back = door.th + Math.PI;
  const mirrorDist = Math.min(2.6, tree.rRoomJS(back, 1.2) - 0.75);
  const mBase = new THREE.Vector3(Math.cos(back), 0, Math.sin(back)).multiplyScalar(mirrorDist);
  const mirrorG = new THREE.Group();
  mirrorG.position.copy(mBase); mirrorG.position.y = 0.06;
  mirrorG.lookAt(new THREE.Vector3(0, 0.06, 0).add(door.n.clone().multiplyScalar(2)));
  group.add(mirrorG);
  const GW = 0.92, GH = 1.72, GY = 1.2;
  const tilt = new THREE.Group(); tilt.position.y = GY; tilt.rotation.x = -0.07; mirrorG.add(tilt);
  const mirror = new Reflector(new THREE.CircleGeometry(0.5, 96), { shader: MIRROR_SHADER, textureWidth: lite ? 640 : 1024, textureHeight: lite ? 640 : 1024, clipBias: 0.003, multisample: lite ? 0 : 4 });
  mirror.scale.set(GW, GH, 1);
  mirror.material.uniforms.uAspect.value = GW / GH;
  tilt.add(mirror);
  // its frame: dark walnut, a thin line of brass inside; behind it, a wooden back
  const ell = new THREE.EllipseCurve(0, 0, GW / 2 + 0.035, GH / 2 + 0.035, 0, Math.PI * 2);
  const ring3 = new THREE.CatmullRomCurve3(ell.getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0)), true);
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.04, 0.02, 0.012), roughness: 0.38, metalness: 0, envMapIntensity: 0.15 });
  const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.75, 0.52, 0.22), roughness: 0.32, metalness: 1, envMapIntensity: 0.4 });
  const frame = new THREE.Mesh(new THREE.TubeGeometry(ring3, 220, 0.045, 14, true), wood);
  frame.scale.set(1, 1, 0.75); frame.castShadow = true; tilt.add(frame);
  const ell2 = new THREE.EllipseCurve(0, 0, GW / 2 + 0.004, GH / 2 + 0.004, 0, Math.PI * 2);
  const bead = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ell2.getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0.012)), true), 220, 0.009, 8, true), brass);
  tilt.add(bead);
  const backing = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), wood);
  backing.scale.set(GW + 0.07, GH + 0.07, 1); backing.position.z = -0.03; backing.rotation.y = Math.PI; tilt.add(backing);
  // the stand: two posts with brass pivots at the glass's middle, feet
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 1.9, 16), wood);
    post.position.set(sx * (GW / 2 + 0.1), 0.95, -0.02); post.castShadow = true; mirrorG.add(post);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 14), brass);
    knob.position.set(sx * (GW / 2 + 0.1), GY, 0.0); mirrorG.add(knob);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 10), brass);
    arm.rotation.z = Math.PI / 2; arm.position.set(sx * (GW / 2 + 0.05), GY, 0); mirrorG.add(arm);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.62), wood);
    foot.position.set(sx * (GW / 2 + 0.1), 0.025, -0.02); foot.castShadow = true; mirrorG.add(foot);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), wood);
    finial.position.set(sx * (GW / 2 + 0.1), 1.92, -0.02); mirrorG.add(finial);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, GW + 0.2, 12), wood);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.22, -0.02); mirrorG.add(bar);
  mirrorG.updateMatrixWorld(true);
  const glassCentre = new THREE.Vector3(0, GY, 0).applyMatrix4(mirrorG.matrixWorld);
  const facing = new THREE.Vector3(0, 0, 1).transformDirection(mirrorG.matrixWorld);

  // ---- the camera, shown as a mirror would show it
  let video = null, stream = null, vtex = null;
  async function useCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { stream = null; return false; }
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.srcObject = stream;
    try { await video.play(); } catch {}
    await new Promise((r) => { if (video.readyState >= 2) r(); else { video.onloadeddata = () => r(); setTimeout(r, 2500); } });
    vtex = new THREE.VideoTexture(video);
    vtex.colorSpace = THREE.NoColorSpace; vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
    const u = mirror.material.uniforms;
    u.tVideo.value = vtex; u.uVidAspect.value = (video.videoWidth || 4) / (video.videoHeight || 3);
    return true;
  }
  function stopCamera() {
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    if (video) { video.pause(); video.srcObject = null; video = null; }
    const u = mirror.material.uniforms; u.uVideo.value = 0; u.tVideo.value = null;
    if (vtex) { vtex.dispose(); vtex = null; }
  }

  return {
    group, mirror, glassCentre, facing, floorR, spot, fill, shaft, mBase,
    useCamera, stopCamera,
    get hasVideo() { return !!vtex; },
    set videoMix(k) { mirror.material.uniforms.uVideo.value = vtex ? k : 0; },
    update(dt, t) { shaftU.uTime.value = t; motesU.uTime.value = t; motesU.uPx.value = ctx.size.scale; mirror.material.uniforms.uTime.value = t; },
    show(on) { group.visible = on; },
  };
}
