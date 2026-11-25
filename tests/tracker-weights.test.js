// Weighted pips and the back-button history for the in-person page.
const test = require('node:test');
const assert = require('node:assert');
const W = require('../js/weights.js');
const U = require('../js/undo.js');
const TB = require('../js/tracker-board.js');

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('weights: mean / P, clamped to 0.5..2, missing resource = 2', () => {
  // mean = (10 + 20 + 5 + 13 + 2) / 5 = 10
  const w = W.weights({ wood: 10, brick: 20, sheep: 5, wheat: 13, ore: 2 });
  assert.ok(near(w.wood, 1) && near(w.brick, 0.5) && near(w.sheep, 2) && near(w.wheat, 10 / 13) && near(w.ore, 2));
  const clampLow = W.weights({ wood: 40, brick: 10, sheep: 10, wheat: 10, ore: 10 }); // mean 16
  assert.ok(near(clampLow.wood, 0.5) && near(clampLow.brick, 1.6));
  const none = W.weights({ wood: 0, brick: 15, sheep: 15, wheat: 15, ore: 15 }); // mean 12
  assert.ok(near(none.wood, 2) && near(none.brick, 0.8));
  const empty = W.weights({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  assert.deepStrictEqual(empty, { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2 });
});

test('weights on a real random board: totals 58 pips, scarce resource weighs more', () => {
  for (let s = 1; s <= 200; s++) {
    const { hexes } = TB.randomBoard(s * 7919);
    const P = W.totals(hexes), w = W.weights(P);
    assert.strictEqual(Object.values(P).reduce((a, b) => a + b, 0), 58);
    const rs = W.RES.slice().sort((a, b) => P[a] - P[b]);
    for (let i = 1; i < rs.length; i++) assert.ok(w[rs[i - 1]] >= w[rs[i]], `seed ${s}: fewer pips must not weigh less`);
  }
});

test('personal weights: need (build costs, minus what you already get) and what is still open', () => {
  const zero = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const even = { wood: 12, brick: 12, sheep: 12, wheat: 12, ore: 12 };
  // nothing yet, everything equally open: wheat and ore (4 each in road+town+city+card) beat wood/brick/sheep (2)
  let w = W.personal(zero, even, even);
  assert.ok(w.wheat > w.wood && near(w.wheat, w.ore) && near(w.wood, w.brick) && near(w.wood, w.sheep));
  // supply = 12*3/NEED: wood 18, wheat 9; mean = (18*3 + 9*2)/5 = 14.4 -> wood 0.8, wheat 1.6
  assert.ok(near(w.wood, 0.8) && near(w.wheat, 1.6));
  // already getting lots of wheat: wheat drops below ore
  w = W.personal({ ...zero, wheat: 9 }, even, even);
  assert.ok(w.wheat < w.ore);
  // little ore left on open corners: ore counts more than wheat
  w = W.personal(zero, { ...even, ore: 3 }, even);
  assert.ok(w.ore > w.wheat);
  // no ore on any open corner: 2 (like a resource missing from the board)
  w = W.personal(zero, { ...even, ore: 0 }, even);
  assert.strictEqual(w.ore, 2);
  // every corner taken: fall back to the whole board
  assert.deepStrictEqual(W.personal(zero, zero, even), W.personal(zero, even, even));
  W.RES.forEach(r => assert.ok(w[r] >= 0.5 && w[r] <= 2));
});

test('openDots: dots per resource summed over open corners only', () => {
  const corners = [
    { open: true, hexes: [{ resource: 'wood', pips: 5 }, { resource: 'ore', pips: 2 }] },
    { open: false, hexes: [{ resource: 'wood', pips: 5 }] },
    { open: true, hexes: [{ resource: 'wood', pips: 5 }] },
  ];
  assert.deepStrictEqual(W.openDots(corners), { wood: 10, brick: 0, sheep: 0, wheat: 0, ore: 2 });
});

test('vertex sum and number format', () => {
  const w = { wood: 2, brick: 0.5, sheep: 1, wheat: 10 / 13, ore: 1 };
  assert.ok(near(W.weightedSum([{ resource: 'wood', pips: 5 }, { resource: 'brick', pips: 4 }, { resource: 'wheat', pips: 3 }], w), 10 + 2 + 30 / 13));
  assert.strictEqual(W.weightedSum([{ resource: 'wood', pips: 5 }], null), 5);
  assert.deepStrictEqual([W.fmt(7), W.fmt(7.25), W.fmt(14.3076), W.fmt(0.04), W.fmt(2.95)], ['7', '7.3', '14.3', '0', '3']);
});

test('history: records only real changes, goes back in order, keeps the last 200', () => {
  let st = [], s = { rolls: [] };
  const change = next => { st = U.record(st, s, next); s = next; };
  change({ rolls: [6] });
  change({ rolls: [6] }); // no change, no entry
  change({ rolls: [6, 8] });
  change({ rolls: [6, 8], weighted: true });
  assert.strictEqual(st.length, 3);
  let r = U.back(st); assert.deepStrictEqual(r.state, { rolls: [6, 8] });
  r = U.back(r.stack); assert.deepStrictEqual(r.state, { rolls: [6] });
  r = U.back(r.stack); assert.deepStrictEqual(r.state, { rolls: [] });
  r = U.back(r.stack); assert.strictEqual(r.state, null);
  // snapshots are copies: changing live state later does not change history
  const live = { a: [1] }; const h = U.record([], live, { a: [1, 2] }); live.a.push(9);
  assert.deepStrictEqual(h[0], { a: [1] });
  // cap
  st = []; s = { n: 0 };
  for (let i = 1; i <= 250; i++) change({ n: i });
  assert.strictEqual(st.length, 200);
  assert.deepStrictEqual(st[0], { n: 50 }); // entries are states 0..249; the oldest 50 dropped
  assert.deepStrictEqual(U.back(st).state, { n: 249 });
});
