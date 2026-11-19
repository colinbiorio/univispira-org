// katana.js — the blade that cuts the apple.
//
// A shinogi-zukuri blade swept along its own curve (the edge on the convex
// side): the edge, the ridge line, the back; the point rises into the tip.
// Polished steel with a frosted temper line along the edge (its roughness and
// a paler tint), a gold collar, an iron guard, a handle wrapped in black silk
// over white ray skin, a dark pommel cap. Local frame: the blade runs along +x
// from the collar (x = 0) to the tip (x = LENGTH); the edge faces -y; its
// thickness is along z. About 2.3 units of blade (an apple is one across).
import * as THREE from 'three';

export const LENGTH = 2.3;

function hamonTextures() {
  // u along the blade (0 collar .. 1 tip), v across it (0 edge .. 1 back)
  const W = 1024, H = 128;
  const col = document.createElement('canvas'); col.width = W; col.height = H;
  const rou = document.createElement('canvas'); rou.width = W; rou.height = H;
  const c = col.getContext('2d'), r = rou.getContext('2d');
  c.fillStyle = 'rgb(200,205,214)'; c.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(28,28,28)'; r.fillRect(0, 0, W, H);             // polished body: roughness ~0.11
  // the hamon: a wavy line, the edge side frosty
  const line = (x) => 0.32 + 0.05 * Math.sin(x * 0.045) + 0.03 * Math.sin(x * 0.13 + 1.7) + 0.015 * Math.sin(x * 0.37);
  for (let x = 0; x < W; x++) {
    const h = line(x) * H;
    const gc = c.createLinearGradient(0, H, 0, H - h - 6);
    gc.addColorStop(0, 'rgb(232,236,240)'); gc.addColorStop(0.85, 'rgb(226,230,236)'); gc.addColorStop(1, 'rgba(226,230,236,0)');
    c.fillStyle = gc; c.fillRect(x, H - h - 6, 1, h + 6);
    const gr = r.createLinearGradient(0, H, 0, H - h - 5);
    gr.addColorStop(0, 'rgb(96,96,96)'); gr.addColorStop(0.8, 'rgb(84,84,84)'); gr.addColorStop(1, 'rgb(28,28,28)');
    r.fillStyle = gr; r.fillRect(x, H - h - 5, 1, h + 5);
  }
  // nie: a few bright crystals along the line
  for (let k = 0; k < 900; k++) { const x = Math.random() * W, y = H - line(x) * H + (Math.random() - 0.5) * 8; c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x, y, 1, 1); }
  // the ridge-to-back (shinogi-ji) a touch matte
  r.fillStyle = 'rgba(52,52,52,0.9)'; r.fillRect(0, 0, W, H * 0.3);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap: new THREE.CanvasTexture(rou) };
}

function bladeGeometry() {
  const S = 120, L = LENGTH, sori = 0.11;
  const centre = (s) => new THREE.Vector3(s, sori * Math.pow(s / L, 2) * 1.0 - sori * 0.15 * (s / L), 0);
  const pos = [], uv = [], idx = [];
  // the section at s: [edge, ridge top, back top, back ridge, back bottom, ridge bottom] as (v across, z thickness, uv.y)
  const section = (s) => {
    const t = s / L, w = 0.088 - 0.022 * t, th = 0.019 - 0.007 * t;
    const k0 = 0.9;                                  // where the point begins
    let edge = -w / 2;
    if (t > k0) { const q = (t - k0) / (1 - k0); edge = -w / 2 + (w * 0.92) * (1 - Math.sqrt(Math.max(0, 1 - q * q))); }
    const back = w / 2 - (t > 0.985 ? (t - 0.985) / 0.015 * w * 0.08 : 0);
    const ridge = edge + (back - edge) * 0.72;
    const thick = th * (t > k0 ? 1 - 0.6 * (t - k0) / (1 - k0) : 1);
    return [[edge, 0, 0], [ridge, thick / 2, 0.72], [back, thick * 0.36, 0.97], [back + thick * 0.12, 0, 1], [back, -thick * 0.36, 0.97], [ridge, -thick / 2, 0.72]];
  };
  const tang = new THREE.Vector3(), up = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= S; i++) {
    const s = (i / S) * L, c = centre(s);
    tang.subVectors(centre(Math.min(L, s + 1e-3)), centre(Math.max(0, s - 1e-3))).normalize();
    up.crossVectors(z, tang).normalize();           // across the blade, toward the back
    for (const [v, th, uy] of section(s)) {
      pos.push(c.x + up.x * v, c.y + up.y * v, th);
      uv.push(s / L, uy);
    }
  }
  const R = 6;
  for (let i = 0; i < S; i++) for (let k = 0; k < R; k++) {
    const a = i * R + k, b = i * R + (k + 1) % R, c = (i + 1) * R + k, d = (i + 1) * R + (k + 1) % R;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function handleTexture() {
  const W = 512, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#e9e4d8'; x.fillRect(0, 0, W, H);                              // ray skin
  for (let k = 0; k < 1800; k++) { x.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`; x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 0.8 + Math.random() * 1.6, 0, 7); x.fill(); }
  // the wrap: crossing bands leave diamonds of ray skin
  x.fillStyle = '#101012';
  const n = 9, step = W / n;
  for (let i = -1; i <= n; i++) {
    const x0 = i * step;
    x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0 + step * 0.55, 0); x.lineTo(x0 + step * 1.05, H); x.lineTo(x0 + step * 0.5, H); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(x0 + step * 1.05, 0); x.lineTo(x0 + step * 0.5, 0); x.lineTo(x0, H); x.lineTo(x0 + step * 0.55, H); x.closePath(); x.fill();
  }
  // silk sheen
  x.strokeStyle = 'rgba(120,120,140,0.25)'; x.lineWidth = 1;
  for (let k = 0; k < 220; k++) { const px = Math.random() * W, py = Math.random() * H; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6, py + 10); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

function guardTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, 7); x.fill();
  // four openings like petals, the blade's slot in the middle left closed
  x.fillStyle = '#000';
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    x.beginPath(); x.ellipse(S / 2 + Math.cos(a) * S * 0.3, S / 2 + Math.sin(a) * S * 0.3, S * 0.11, S * 0.05, a, 0, 7); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function createKatana({ envMap = null } = {}) {
  const root = new THREE.Group(); root.name = 'katana';
  const ham = hamonTextures();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: ham.map, metalness: 1, roughness: 1, roughnessMap: ham.roughnessMap, envMap, envMapIntensity: 1.35, clearcoat: 0.3, clearcoatRoughness: 0.1 });
  const blade = new THREE.Mesh(bladeGeometry(), steel); blade.castShadow = true; root.add(blade);
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.28, envMap, envMapIntensity: 1.2 });
  const iron = new THREE.MeshPhysicalMaterial({ color: 0x24221f, metalness: 0.85, roughness: 0.5, envMap, alphaMap: guardTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.03), gold); habaki.position.set(-0.035, 0.002, 0); root.add(habaki);
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 48, 1), iron); tsuba.rotation.z = Math.PI / 2; tsuba.position.x = -0.08; root.add(tsuba);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.006, 8, 64), gold); rim.rotation.y = Math.PI / 2; rim.position.x = -0.08; root.add(rim);
  const seppa = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.026, 32), gold); seppa.rotation.z = Math.PI / 2; seppa.position.x = -0.08; root.add(seppa);
  const wrap = handleTexture(); wrap.repeat.set(1, 1);
  const handleMat = new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.75, metalness: 0.05 });
  // the handle: an oval section, a little waisted
  const hg = new THREE.CylinderGeometry(0.03, 0.03, 0.62, 24, 24, true);
  { const p = hg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.08 * Math.cos((y / 0.62) * Math.PI * 2); p.setXYZ(i, p.getX(i) * k * 1.15, y, p.getZ(i) * k * 0.82); } hg.computeVertexNormals(); }
  const handle = new THREE.Mesh(hg, handleMat); handle.rotation.z = Math.PI / 2; handle.position.x = -0.4; handle.castShadow = true; root.add(handle);
  const fuchi = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 24), gold); fuchi.rotation.z = Math.PI / 2; fuchi.position.x = -0.1; root.add(fuchi);
  const kashira = new THREE.Mesh(new THREE.SphereGeometry(0.038, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x1a1816, metalness: 0.9, roughness: 0.35, envMap }));
  kashira.rotation.z = Math.PI / 2; kashira.scale.set(1.0, 0.55, 0.82); kashira.position.x = -0.71; root.add(kashira);
  const kcol = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.02, 24), kashira.material); kcol.rotation.z = Math.PI / 2; kcol.position.x = -0.71; root.add(kcol);

  // the light it leaves: a ribbon through where its edge has just been
  const TR = 18, trailPos = new Float32Array(TR * 2 * 3), trailA = new Float32Array(TR * 2);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  tg.setAttribute('aA', new THREE.BufferAttribute(trailA, 1).setUsage(THREE.DynamicDrawUsage));
  { const idx = []; for (let i = 0; i < TR - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } tg.setIndex(idx); }
  const trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * vA * 1.6, vA); }',
  }));
  trail.frustumCulled = false; trail.visible = false;
  const hist = [];
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();

  return {
    root, trail, blade,
    // where its edge is now, in the world: two points along it (for the trail)
    record() {
      root.updateMatrixWorld();
      p0.set(LENGTH * 0.9, -0.03, 0).applyMatrix4(root.matrixWorld);
      p1.set(LENGTH * 0.995, 0.03, 0).applyMatrix4(root.matrixWorld);
      hist.unshift([p0.clone(), p1.clone()]); if (hist.length > TR) hist.pop();
      for (let i = 0; i < TR; i++) {
        const h = hist[Math.min(i, hist.length - 1)] || [p0, p1];
        trailPos.set([h[0].x, h[0].y, h[0].z, h[1].x, h[1].y, h[1].z], i * 6);
        const a = hist.length > 1 && i < hist.length ? Math.pow(1 - i / TR, 1.8) * 0.75 : 0; trailA[i * 2] = a * 0.25; trailA[i * 2 + 1] = a;
      }
      tg.attributes.position.needsUpdate = true; tg.attributes.aA.needsUpdate = true;
      trail.visible = hist.length > 1;
    },
    clearTrail() { hist.length = 0; trail.visible = false; },
    setEnv(map) { for (const m of [steel, gold, iron, kashira.material]) { m.envMap = map; m.needsUpdate = true; } },
  };
}
