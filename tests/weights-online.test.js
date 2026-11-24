// "Weighted" corner numbers in online play (node --test): js/weights.js fed from the engine's board,
// the same way js/app.js does it (engine resources 0..4 are W.RES in order).
const test = require('node:test');
const assert = require('node:assert');
const W = require('../js/weights.js');
const E = require('../js/engine.js');

const boardWeights = (hexRes, hexNum) => W.weights(W.totals(hexRes.map((r, h) => ({ resource: W.RES[r], number: hexNum[h] }))));
const spot = (hexes, hexRes, hexNum, w, robber) => Math.round(W.weightedSum(hexes.filter(h => h !== robber && hexRes[h] >= 0).map(h => ({ resource: W.RES[hexRes[h]], pips: E.pips(hexNum[h]) })), w) * 10) / 10;

test('engine and weights agree on resource order', () => assert.deepStrictEqual(E.RES, W.RES));

test('weights: clamp(mean / P_r, 0.5, 2), 2 for a resource with no dots; corners to 1 decimal', () => {
  // wood 6+8 = 10 dots, brick 2 = 1, sheep 5 = 4, wheat 9 = 4, ore none; desert has no number
  const hexRes = [0, 0, 1, 2, 3, -1], hexNum = [6, 8, 2, 5, 9, 0];
  const w = boardWeights(hexRes, hexNum); // mean 19/5 = 3.8
  assert.deepStrictEqual(W.RES.map(r => +w[r].toFixed(3)), [0.5, 2, 0.95, 0.95, 2]);
  assert.strictEqual(spot([0, 2, 3], hexRes, hexNum, w, -1), 8.3); // 5*0.5 + 1*2 + 4*0.95
  assert.strictEqual(spot([0, 2, 3], hexRes, hexNum, w, 2), 6.3);  // the robber's tile counts for nothing
  assert.strictEqual(spot([5, 0], hexRes, hexNum, w, -1), 2.5);    // desert adds nothing
});

test('real 4p and 6p boards: weights in range, scarcer resource never weighs less', () => {
  for (const n of [4, 6]) for (const seed of [1, 2, 3, 99]) {
    const st = E.newGame(Array.from({ length: n }, () => ({})), { board: 'random' }, seed);
    const w = boardWeights(st.hexRes, st.hexNum), P = W.totals(st.hexRes.map((r, h) => ({ resource: W.RES[r], number: st.hexNum[h] })));
    assert.strictEqual(W.RES.reduce((a, r) => a + P[r], 0), st.hexNum.reduce((a, x) => a + E.pips(x), 0), 'every dot belongs to a resource');
    W.RES.forEach(r => { assert.ok(w[r] >= 0.5 && w[r] <= 2); W.RES.forEach(s => { if (P[r] < P[s]) assert.ok(w[r] >= w[s]); }); });
  }
});
