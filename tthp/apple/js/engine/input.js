// input.js — a tap is not a spin.
//
// A press that moves less than a few pixels and lets go within half a second
// is a tap (and Space or Enter is a tap, anywhere); anything that moves
// further is a drag, handed on as it moves. A second finger while dragging is
// a twist (the board's halves spin with it).
export function createInput(el, h) {
  const TAP_PX = 8, TAP_MS = 550;
  const down = new Map();      // pointerId -> { x, y, t, dragged }
  let dragId = null, twist = null;

  const at = (e) => ({ x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, alt: e.altKey, touch: e.pointerType === 'touch' });
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 2) return;
    el.setPointerCapture?.(e.pointerId);
    down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), dragged: false, px: e.clientX, py: e.clientY });
    if (down.size === 2 && dragId != null) {
      const [p, q] = [...down.values()];
      twist = { a: Math.atan2(q.y - p.y, q.x - p.x) };
    }
  });
  el.addEventListener('pointermove', (e) => {
    const d = down.get(e.pointerId); if (!d) return;
    if (twist && down.size >= 2) {
      const [p, q] = [...down.values()];
      if (e.pointerId === [...down.keys()][1]) { q.x = e.clientX; q.y = e.clientY; } else { p.x = e.clientX; p.y = e.clientY; }
      const a = Math.atan2(q.y - p.y, q.x - p.x); let da = a - twist.a; twist.a = a;
      if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      h.onTwist?.(da);
      return;
    }
    if (!d.dragged && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) {
      d.dragged = true;
      if (dragId == null) { dragId = e.pointerId; h.onDragStart?.({ ...at(e), x: d.x, y: d.y }); }
    }
    if (d.dragged && dragId === e.pointerId) {
      h.onDrag?.({ ...at(e), dx: e.clientX - d.px, dy: e.clientY - d.py });
    }
    d.px = e.clientX; d.py = e.clientY;
  });
  const up = (e) => {
    const d = down.get(e.pointerId); if (!d) return;
    down.delete(e.pointerId);
    if (down.size < 2) twist = null;
    if (dragId === e.pointerId) { dragId = null; h.onDragEnd?.(at(e)); return; }
    if (e.type === 'pointerup' && !d.dragged && performance.now() - d.t < TAP_MS && down.size === 0) h.onTap?.(at(e));
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && !e.target.closest?.('button, a, input')) {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      h.onTap?.({ x: r.left + r.width / 2, y: r.top + r.height / 2, key: true });
    }
  });
}
