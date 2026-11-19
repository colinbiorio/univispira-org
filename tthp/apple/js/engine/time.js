// time.js — animations on the page's own clock.
//
// anim(seconds, step, ease) calls step(k, e) every frame with k going 0 to 1
// (e is k eased) and resolves when it reaches 1; wait(seconds) waits on the
// same clock. Both are driven by tick(dt) from the main loop, so a hidden tab
// pauses them together with everything else.
export const ease = {
  linear: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  inExpo: (k) => (k === 0 ? 0 : Math.pow(2, 10 * k - 10)),
  outExpo: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inOutExpo: (k) => (k === 0 ? 0 : k === 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
  outBack: (k) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outElastic: (k) => (k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export function createTime() {
  const running = new Set();
  let now = 0;
  return {
    get now() { return now; },
    anim(seconds, step, easing = ease.inOut) {
      return new Promise((resolve) => {
        const a = { t: 0, d: Math.max(1e-4, seconds), step, easing, resolve };
        running.add(a);
        step(0, easing(0));
      });
    },
    wait(seconds) { return new Promise((resolve) => running.add({ t: 0, d: Math.max(1e-4, seconds), step: null, resolve })); },
    tick(dt) {
      now += dt;
      for (const a of [...running]) {
        a.t += dt;
        const k = Math.min(1, a.t / a.d);
        if (a.step) a.step(k, a.easing(k));
        if (k >= 1) { running.delete(a); a.resolve(); }
      }
    },
  };
}
