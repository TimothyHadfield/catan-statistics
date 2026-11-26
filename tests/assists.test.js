// "Allowed" helpers are chosen at the start and are the same for every player, online too
// (Tim 2026-11-25: "make a setting when you start a new game where you can select if the players (including you)
// can turn on each specific setting ... so that if you wanted to play a non-assisted game you could")
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const CG = require('../js/adapter.js');

const seats = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'cpu', level: 'easy' }));
const off = { odds: false, weighted: false, advisor: false, table: false, chart: false };

test('switched-off helpers stay in the game rules and its public view', () => {
  const st = E.newGame(seats(4), { board: 'random', assists: off }, 42);
  assert.deepStrictEqual(st.rules.assists, off);
  assert.deepStrictEqual(E.view(st).rules.assists, off);
});

test('an online room carries the host\'s choice to every player', () => {
  let r = 0.3; const rng = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const st = CG.game.setup(4, { rules: { assists: { advisor: false } } }, rng, [{ kind: 'human', name: 'A' }, { kind: 'human', name: 'B' }, {}, {}]);
  assert.deepStrictEqual(CG.game.publicView(st).rules.assists, { advisor: false });
});

test('a game with everything allowed has no assists entry', () => {
  assert.strictEqual(E.newGame(seats(3), {}, 5).rules.assists, undefined);
});
