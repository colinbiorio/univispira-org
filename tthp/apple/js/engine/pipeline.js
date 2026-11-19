// pipeline.js — how a world reaches the screen.
//
// Every stage is a world of its own (a scene and a camera). One is drawn
// alone; during a transition two are drawn, each into a target of its own,
// and mixed (a fade, through light, through dark, a burst of zoom, a
// dissolve). Then bloom, then the film's tone and the screen's colour
// (OutputPass). The glow and the exposure follow whichever world is shown,
// blended while two are.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const STYLE = { fade: 0, light: 1, dark: 2, zoom: 3, dissolve: 4 };

const MIX_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const MIX_FRAG = `
  uniform sampler2D tA; uniform sampler2D tB; uniform float m; uniform int style; uniform float time; uniform float aspect;
  uniform vec2 focus;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
  vec3 zoomed(sampler2D t, vec2 uv, float k) {
    vec3 c = vec3(0.0); vec2 d = uv - focus;
    for (int i = 0; i < 12; i++) { float s = 1.0 - k * float(i) / 12.0; c += texture2D(t, focus + d * s).rgb; }
    return c / 12.0;
  }
  void main() {
    vec3 a = texture2D(tA, vUv).rgb;
    if (m <= 0.0) { gl_FragColor = vec4(a, 1.0); return; }
    vec3 b = texture2D(tB, vUv).rgb;
    vec3 c;
    if (style == 1) {            // through light
      float w = 1.0 - abs(2.0 * m - 1.0);
      c = mix(a, b, smoothstep(0.42, 0.58, m)) + vec3(1.0, 0.97, 0.92) * pow(w, 2.2) * 2.6;
    } else if (style == 2) {     // through dark
      c = m < 0.5 ? a * (1.0 - 2.0 * m) : b * (2.0 * m - 1.0);
    } else if (style == 3) {     // a burst of zoom: the old world rushes past, the new one settles in
      vec3 za = zoomed(tA, vUv, m * 0.55), zb = zoomed(tB, vUv, -(1.0 - m) * 0.35);
      c = mix(za, zb, smoothstep(0.25, 0.75, m)) + vec3(0.9, 0.95, 1.0) * pow(1.0 - abs(2.0 * m - 1.0), 3.0) * 0.6;
    } else if (style == 4) {     // a dissolve with a glowing edge
      float n = fbm(vec2(vUv.x * aspect, vUv.y) * 5.0 + time * 0.05);
      float e = smoothstep(m - 0.06, m, n) - smoothstep(m, m + 0.06, n);
      c = mix(b, a, step(m, n)) + vec3(1.0, 0.75, 0.45) * e * 3.0;
    } else c = mix(a, b, m);
    gl_FragColor = vec4(c, 1.0);
  }`;

class StagesPass extends Pass {
  constructor(renderer, w, h) {
    super();
    const opts = { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 };
    this.rtA = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtB = new THREE.WebGLRenderTarget(w, h, opts);
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tB: { value: null }, m: { value: 0 }, style: { value: 0 }, time: { value: 0 }, aspect: { value: w / h }, focus: { value: new THREE.Vector2(0.5, 0.5) } },
      vertexShader: MIX_VERT, fragmentShader: MIX_FRAG, depthTest: false, depthWrite: false,
    }));
    this.a = null; this.b = null; this.m = 0; this.style = 0;
    this.needsSwap = true;
  }
  setSize(w, h) { this.rtA.setSize(w, h); this.rtB.setSize(w, h); this.quad.material.uniforms.aspect.value = w / h; }
  draw(renderer, stage, target) {
    renderer.setRenderTarget(target);
    renderer.clear();
    if (stage) renderer.render(stage.scene, stage.camera);
  }
  render(renderer, writeBuffer) {
    const u = this.quad.material.uniforms;
    this.draw(renderer, this.a, this.rtA);
    const two = this.b && this.m > 0;
    if (two) this.draw(renderer, this.b, this.rtB);
    u.tA.value = this.rtA.texture; u.tB.value = two ? this.rtB.texture : this.rtA.texture;
    u.m.value = two ? this.m : 0; u.style.value = this.style; u.time.value = performance.now() / 1000;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.quad.dispose(); }
}

export function createPipeline(canvasHolder) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = true;
  canvasHolder.appendChild(renderer.domElement);
  const size = { w: 1, h: 1, scale: 1 };
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType }));
  const stages = new StagesPass(renderer, 2, 2);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.6, 0.85);
  const output = new OutputPass();
  composer.addPass(stages); composer.addPass(bloom); composer.addPass(output);

  function resize() {
    const w = Math.max(1, canvasHolder.clientWidth), h = Math.max(1, canvasHolder.clientHeight);
    // as sharp as the screen allows, within about 2.6 million pixels (an 8 GB laptop's GPU keeps sixty frames)
    const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.6e6 / (w * h)));
    size.w = w; size.h = h; size.scale = scale;
    renderer.setPixelRatio(scale); renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    composer.setPixelRatio(scale); composer.setSize(w, h);
    for (const s of [stages.a, stages.b]) if (s?.camera) { s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); s.resize?.(w, h); }
  }

  // the glow and the exposure of whichever world is shown (blended while two are)
  function feel() {
    const A = stages.a || {}, B = stages.b || A, m = stages.b ? stages.m : 0;
    const ga = A.bloom || {}, gb = B.bloom || {};
    const l = (x, y, d) => (x ?? d) + ((y ?? x ?? d) - (x ?? d)) * m;
    bloom.strength = l(ga.strength, gb.strength, 0.6);
    bloom.radius = l(ga.radius, gb.radius, 0.6);
    bloom.threshold = l(ga.threshold, gb.threshold, 0.85);
    renderer.toneMappingExposure = l(A.exposure, B.exposure, 1);
  }

  return {
    renderer, composer, size, resize, STYLE,
    get shown() { return stages.a; },
    get incoming() { return stages.b; },
    // one world alone
    show(stage) {
      stages.a = stage; stages.b = null; stages.m = 0;
      if (stage?.camera) { stage.camera.aspect = size.w / size.h; stage.camera.updateProjectionMatrix(); }
    },
    // two, mixed: m from 0 (all a) to 1 (all b)
    blend(a, b, m, style = 0, focus = null) {
      stages.a = a; stages.b = b; stages.m = Math.max(0, Math.min(1, m)); stages.style = style;
      if (focus) stages.quad.material.uniforms.focus.value.set(focus[0], focus[1]);
      for (const s of [a, b]) if (s?.camera) { s.camera.aspect = size.w / size.h; s.camera.updateProjectionMatrix(); }
    },
    render() { feel(); composer.render(); },
  };
}
