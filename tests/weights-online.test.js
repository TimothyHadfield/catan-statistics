// "Weighted" spot odds maths (node --test)
const test = require('node:test');
const assert = require('node:assert');
const W = require('../js/weights-online.js');
const E = require('../js/engine.js');

test('weights: clamp(mean / P_r, 0.5, 2), 2 for a resource with no dots', () => {
  // wood 6+8 = 10 dots, brick 2 = 1, sheep 5 = 4, wheat 9 = 4, ore none; desert has no number
  const hexRes = [0, 0, 1, 2, 3, -1], hexNum = [6, 8, 2, 5, 9, 0];
  assert.deepStrictEqual(W.resourcePips(hexRes, hexNum), [10, 1, 4, 4, 0]);
  const w = W.weights(hexRes, hexNum); // mean 19/5 = 3.8
  assert.deepStrictEqual(w.map(x => +x.toFixed(3)), [0.5, 2, 0.95, 0.95, 2]);
  // corner on wood 6, brick 2, sheep 5: 5*0.5 + 1*2 + 4*0.95 = 8.3
  assert.strictEqual(W.weightedSpot([0, 2, 3], hexRes, hexNum, w), 8.3);
  // the robber's tile counts for nothing
  assert.strictEqual(W.weightedSpot([0, 2, 3], hexRes, hexNum, w, 2), 6.3);
});

test('weights on real boards: equal dots give weight 1, scarce > 1 > common', () => {
  const flat = W.weights([0, 1, 2, 3, 4], [6, 8, 6, 8, 6]);
  assert.deepStrictEqual(flat, [1, 1, 1, 1, 1]);
  for (const n of [4, 6]) for (const seed of [1, 2, 3, 99]) {
    const st = E.newGame(Array.from({ length: n }, () => ({})), { board: 'random' }, seed);
    const P = W.resourcePips(st.hexRes, st.hexNum), w = W.weights(st.hexRes, st.hexNum);
    assert.strictEqual(P.reduce((a, b) => a + b, 0), st.hexNum.reduce((a, x) => a + E.pips(x), 0), 'every dot belongs to a resource');
    w.forEach((x, r) => { assert.ok(x >= 0.5 && x <= 2); P.forEach((q, s) => { if (P[r] < q) assert.ok(x >= w[s], 'scarcer resource weighs at least as much'); }); });
  }
});
