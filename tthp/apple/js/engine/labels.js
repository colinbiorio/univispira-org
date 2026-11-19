// labels.js — the words that name what is seen.
//
// A label sits below (or above) the thing it names, a fine line rising from it
// to the thing, and follows it on the screen. It can fade in, fade out, or be
// wiped: the old word drawn away left to right and the new one drawn in after.
import * as THREE from 'three';

export function createLabels(layer) {
  const items = new Map();
  const v = new THREE.Vector3();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function make(id, text) {
    const el = document.createElement('div');
    el.className = 'label';
    el.innerHTML = '<span class="lead"></span><span class="word"></span>';
    el.querySelector('.word').textContent = text;
    layer.appendChild(el);
    return el;
  }
  const api = {
    // show a label: at() gives the thing's world position, camera() the eye it is seen through
    show(id, { text, at, camera, gap = 74, place = 'below', delay = 0 }) {
      let it = items.get(id);
      if (!it) { it = { el: make(id, text) }; items.set(id, it); }
      Object.assign(it, { text, at, camera, gap, place, gone: false });
      it.el.classList.toggle('above', place === 'above');
      it.el.querySelector('.word').textContent = text;
      it.el.classList.remove('out');
      clearTimeout(it.timer);
      it.timer = setTimeout(() => it.el.classList.add('in'), 30 + delay);
      return wait(delay + 900);
    },
    // the word changes: wiped away, and the new one drawn in
    async change(id, text, { how = 'wipe' } = {}) {
      const it = items.get(id); if (!it) return;
      const w = it.el.querySelector('.word');
      w.classList.add(how === 'wipe' ? 'wiping' : 'fading');
      await wait(how === 'wipe' ? 620 : 420);
      w.textContent = text; it.text = text;
      w.classList.remove('wiping', 'fading'); w.classList.add(how === 'wipe' ? 'drawing' : 'rising');
      await wait(how === 'wipe' ? 700 : 450);
      w.classList.remove('drawing', 'rising');
    },
    async hide(id, { how = 'fade' } = {}) {
      const it = items.get(id); if (!it) return;
      it.gone = true;
      it.el.classList.add(how === 'wipe' ? 'wiped' : 'out'); it.el.classList.remove('in');
      await wait(how === 'wipe' ? 650 : 520);
      if (it.gone) { it.el.remove(); items.delete(id); }
    },
    async clear(opts) { await Promise.all([...items.keys()].map((id) => api.hide(id, opts))); },
    has: (id) => items.has(id),
    update(w, h) {
      for (const it of items.values()) {
        const cam = it.camera?.(); const p = it.at?.();
        if (!cam || !p) continue;
        v.copy(p).project(cam);
        const behind = v.z > 1;
        const x = Math.min(w - 56, Math.max(56, (v.x * 0.5 + 0.5) * w)), y = (-v.y * 0.5 + 0.5) * h;
        const ly = Math.min(h - 44, Math.max(30, it.place === 'above' ? y - it.gap : y + it.gap));     // never off the screen
        it.el.style.transform = `translate(${x.toFixed(1)}px, ${ly.toFixed(1)}px)`;
        it.el.style.setProperty('--lead', `${Math.max(0, it.gap - 26).toFixed(0)}px`);
        it.el.style.visibility = behind ? 'hidden' : 'visible';
      }
    },
  };
  return api;
}
