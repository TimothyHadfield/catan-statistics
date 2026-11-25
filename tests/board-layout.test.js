// The board shown before Start is the board you get, so "Random board" can be tapped again to re-deal
// (Tim 2026-11-25: "make the random board button be able to be clicked again to randomize the board again")
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const CG = require('../js/adapter.js');

const seats = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'cpu', level: 'easy' }));
const layoutOf = st => ({ res: st.hexRes.slice(), nums: st.hexNum.slice(), ports: st.ports.map(p => p.type) });

test('a dealt layout is used as-is, with its own deck seed, and not kept in rules', () => {
  for (const n of [4, 6]) {
    const shown = E.newGame(seats(n), { board: 'random' }, 1234);
    const st = E.newGame(seats(n), { board: 'random', layout: layoutOf(shown) }, 99);
    assert.deepStrictEqual(layoutOf(st), layoutOf(shown));
    assert.strictEqual(st.robber, shown.robber);
    assert.strictEqual(st.rules.layout, undefined);
    assert.strictEqual(st.seed !== shown.seed, true);
  }
});

test('different seeds deal different random boards', () => {
  const a = layoutOf(E.newGame(seats(4), {}, 1)), b = layoutOf(E.newGame(seats(4), {}, 2));
  assert.notDeepStrictEqual(a, b);
});

test('a wrong-sized layout is ignored', () => {
  const st = E.newGame(seats(4), { layout: { res: [1, 2], nums: [3], ports: [] } }, 7);
  assert.strictEqual(st.hexRes.length, 19);
});

test('an online room starts on the layout the host saw', () => {
  const shown = E.newGame(seats(4), {}, 555);
  let r = 0.3; const rng = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const st = CG.game.setup(4, { rules: {}, layout: layoutOf(shown) }, rng, [{ kind: 'human', name: 'A' }, {}, {}, {}]);
  assert.deepStrictEqual(layoutOf(st), layoutOf(shown));
  assert.strictEqual(st.rules.layout, undefined);
});
