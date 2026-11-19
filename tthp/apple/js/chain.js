// chain.js — the order of it, tap by tap.
//
//   0 orchard     an apple floats under an apple tree                    (tap)
//   1 halves      a katana cuts it; two halves, each "apple"             (tap)
//   2 whole       the cut runs backward; one apple, "apple"              (tap)
//   3 universe    the apple becomes the universe, "universe"             (tap)
//   4 earth       into the universe, to the Earth, "Earth"               (tap)
//   5 board       "Earth" is wiped to "universe"; down to Wilmington, a
//                 house, a cutting board with an apple on it, "apple"    (tap)
//   6 split       "apple" becomes "universe"; cut by nothing; two halves
//                 on the board, each "universe": turned, flipped, pushed (tap)
//   7 above       together again, and the universe over the board        (tap)
//   8 end         into it: a supernova, a cubic planet, a sprout, a tree,
//                 a door, a room, a mirror ("May univispira momentarily
//                 peer..."), the words; out again: the universe on black (tap)
//   9 → 0         into a sun, a six-sided planet, the orchard again
//
// ?at=N starts at state N (the worlds are set as if it had been reached).
const NAMES = ['orchard', 'halves', 'whole', 'universe', 'earth', 'board', 'split', 'above', 'end'];
const WORDS = ['Look around.', 'You are not separate.', 'You are in it.', 'Just as it is in you.'];

export async function runChain(ctx) {
  const veil = document.getElementById('veil');
  const S = {};
  const make = async (key, file, fn) => {
    if (!S[key]) S[key] = (async () => (await import(`./stages/${file}.js`))[fn](ctx))();
    return S[key];
  };
  // ?solo=earth|cosmos|cube|hex: one world's sequence alone, again on every tap (for building and checking one)
  const solo = ctx.params.get('solo');
  if (solo) return runSolo(solo);

  const orchard = await make('orchard', 'orchard', 'createOrchard');
  const at = Math.max(0, Math.min(NAMES.length - 1, Number(ctx.params.get('at') || 0) | 0));

  // the rest is made while the first world is looked at
  const later = () => Promise.all([
    make('cosmos', 'cosmos', 'createCosmos'), make('earth', 'earth', 'createEarth'),
    make('cube', 'cubeworld', 'createCubeWorld'), make('void', 'void', 'createVoid'), make('hex', 'hexworld', 'createHexWorld'),
  ]);

  await arrive(at);
  veil.classList.add('gone');
  setTimeout(() => later().catch((e) => console.error('[tthp] a world could not be made', e)), at ? 0 : 1500);
  if (at === 0) setTimeout(() => ctx.ui.hint('tap the apple  ·  drag to turn it', 6000), 2400);

  let s = at;
  for (;;) {
    ctx.state = NAMES[s];
    await ctx.tap();
    ctx.ui.unhint();
    try { s = await stepFrom(s)(); }
    catch (e) { console.error('[tthp] a step broke', NAMES[s], e); s = 0; await arrive(0); }
  }

  async function runSolo(which) {
    const done = () => veil.classList.add('gone');
    if (which === 'earth') {
      const E = await make('earth', 'earth', 'createEarth');
      for (;;) {
        await E.present(); ctx.show(E.stage); spinEarth(E); done();
        ctx.labels.show('one', { text: 'Earth', at: E.labelAt, camera: () => E.stage.camera });
        ctx.state = 'earth'; await ctx.tap();
        await ctx.labels.change('one', 'universe', { how: 'wipe' }); ctx.spin.set([], null);
        await Promise.all([ctx.labels.hide('one'), E.descend({ before: async () => {} })]);
        ctx.state = 'board'; await ctx.tap();
      }
    }
    const C = await make('cosmos', 'cosmos', 'createCosmos');
    ctx.show(C.stage); done();
    for (;;) {
      ctx.state = 'solo:' + which; await ctx.tap();
      if (which === 'cosmos') await C.fly({ toward: ctx.params.get('toward') || 'earth', seconds: 8, sights: ['stars', 'planets', 'supernova'] });
      else if (which === 'cube') {
        const [U, V] = await Promise.all([make('cube', 'cubeworld', 'createCubeWorld'), make('void', 'void', 'createVoid')]);
        await C.fly({ toward: 'cube', seconds: 10, sights: ['stars', 'planets', 'supernova'] });
        await U.play({ cosmos: C, words: WORDS, end: V });
        ctx.state = 'solo:end'; await ctx.tap(); ctx.show(C.stage);
      } else if (which === 'hex') {
        const [H, V] = await Promise.all([make('hex', 'hexworld', 'createHexWorld'), make('void', 'void', 'createVoid')]);
        const orchard = await make('orchard', 'orchard', 'createOrchard');
        await V.present(); ctx.show(V.stage);
        await H.play({ from: V, orchard });
        ctx.state = 'solo:orchard'; await ctx.tap(); ctx.show(C.stage);
      }
    }
  }

  // ---- arriving at a state at once (the start, and ?at=)
  async function arrive(n) {
    ctx.labels.clear({ how: 'fade' });
    ctx.drag = null; ctx.claimTap = null;
    if (n <= 3) {
      ctx.show(orchard.stage);
      await orchard.arrive(NAMES[n]);
      return;
    }
    if (n === 4) {
      const E = await make('earth', 'earth', 'createEarth');
      await E.present(); ctx.show(E.stage); spinEarth(E);
      ctx.labels.show('one', { text: 'Earth', at: E.labelAt, camera: () => E.stage.camera });
      return;
    }
    const E = await make('earth', 'earth', 'createEarth');
    const K = await make('kitchen', 'kitchen', 'createKitchenApple');
    E.showKitchen(); ctx.show(E.kitchen);
    if (n === 5) { await K.place(E, 'whole'); return; }
    if (n === 6) { await K.place(E, 'split'); return; }
    if (n === 7) { await K.place(E, 'universe'); return; }
    const V = await make('void', 'void', 'createVoid');
    await V.present(); ctx.show(V.stage);
  }

  function spinEarth(E) { ctx.spin.set([{ object: E.earth }], E.stage.camera); }

  // ---- the steps: each runs from one state to the next, and answers the next state's number
  async function stepSlice() {           // 0 → 1
    await orchard.slice();
    return 1;
  }
  async function stepWhole() {           // 1 → 2
    await orchard.unslice();
    return 2;
  }
  async function stepUniverse() {        // 2 → 3
    await orchard.toUniverse();
    return 3;
  }
  async function stepEarth() {           // 3 → 4: into the universe, to the Earth
    const [C, E] = await Promise.all([make('cosmos', 'cosmos', 'createCosmos'), make('earth', 'earth', 'createEarth')]);
    ctx.labels.clear({ how: 'fade' });
    ctx.spin.set([], null);
    const focus = ctx.screenOf(orchard.universeCentre(), orchard.stage.camera);
    await Promise.all([orchard.diveIn(), ctx.transition(C.stage, { style: 'zoom', duration: 2.4, focus, easing: ctx.ease.inExpo })]);
    await C.fly({ toward: 'earth', seconds: 7 });
    await E.present();
    await ctx.transition(E.stage, { style: 'light', duration: 1.4 });
    spinEarth(E);
    await ctx.labels.show('one', { text: 'Earth', at: E.labelAt, camera: () => E.stage.camera });
    return 4;
  }
  async function stepBoard() {           // 4 → 5: "Earth" wiped to "universe"; down to the board
    const [E, K] = await Promise.all([make('earth', 'earth', 'createEarth'), make('kitchen', 'kitchen', 'createKitchenApple')]);
    await ctx.labels.change('one', 'universe', { how: 'wipe' });
    await ctx.wait(0.7);
    ctx.spin.set([], null);
    await Promise.all([ctx.labels.hide('one', { how: 'fade' }), E.descend({ before: () => K.place(E, 'whole', { quiet: true }) })]);
    await K.settle(E);   // the label "apple", and the apple may be turned
    return 5;
  }
  async function stepSplit() {           // 5 → 6: cut by nothing; two halves, each "universe"
    const K = await make('kitchen', 'kitchen', 'createKitchenApple');
    const E = await make('earth', 'earth', 'createEarth');
    await K.split(E);
    return 6;
  }
  async function stepAbove() {           // 6 → 7: together, and the universe over the board
    const K = await make('kitchen', 'kitchen', 'createKitchenApple');
    const E = await make('earth', 'earth', 'createEarth');
    await K.toUniverse(E);
    return 7;
  }
  async function stepEnd() {             // 7 → 8: into it, all the way to the mirror, and out
    const [C, U, V, K, E] = await Promise.all([make('cosmos', 'cosmos', 'createCosmos'), make('cube', 'cubeworld', 'createCubeWorld'),
      make('void', 'void', 'createVoid'), make('kitchen', 'kitchen', 'createKitchenApple'), make('earth', 'earth', 'createEarth')]);
    ctx.labels.clear({ how: 'fade' }); ctx.spin.set([], null); ctx.drag = null; ctx.claimTap = null;
    const focus = ctx.screenOf(K.universeCentre(), E.kitchen.camera);
    await Promise.all([K.diveIn(E), ctx.transition(C.stage, { style: 'zoom', duration: 2.4, focus, easing: ctx.ease.inExpo })]);
    await C.fly({ toward: 'cube', seconds: 10, sights: ['stars', 'planets', 'supernova'] });
    await U.play({ cosmos: C, words: WORDS, end: V });     // ends with the void shown, the universe flowing
    return 8;
  }
  async function stepReturn() {          // 8 → 0: into a sun, a six-sided planet, the orchard
    const [V, H] = await Promise.all([make('void', 'void', 'createVoid'), make('hex', 'hexworld', 'createHexWorld')]);
    ctx.spin.set([], null);
    await H.play({ from: V, orchard });
    return 0;
  }
  // which step runs from which state
  function stepFrom(n) { return [stepSlice, stepWhole, stepUniverse, stepEarth, stepBoard, stepSplit, stepAbove, stepEnd, stepReturn][n]; }
}
