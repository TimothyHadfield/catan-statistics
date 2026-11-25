// The table view keeps hands secret during play and shows every hand once the game is over
// (Tim 2026-11-25: "at the end of the game ... show how many hidden victory points each player had and
// what was in each player's hand, so we know how close it was")
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

const game = () => E.newGame([0, 1, 2].map(i => ({ name: 'P' + i, kind: 'cpu', level: 'easy' })), {}, 42);

test('hands stay secret while the game runs', () => {
  const st = game(); st.players[1].res = [1, 2, 0, 0, 3]; st.players[1].dev = ['K', 'V']; st.players[1].vpCards = 1;
  const g = E.view(st);
  assert.strictEqual(g.hands, undefined);
  assert.strictEqual(g.players[1].res, 6);
  assert.strictEqual(g.players[1].vpCards, 0);
});

test('every hand and hidden point is shown once it is over', () => {
  const st = game(); st.players[1].res = [1, 2, 0, 0, 3]; st.players[1].dev = ['V', 'K', 'M']; st.players[1].vpCards = 1;
  st.phase = 'over'; st.winner = 0;
  const g = E.view(st);
  assert.deepStrictEqual(g.hands[1], { res: [1, 2, 0, 0, 3], dev: ['K', 'M', 'V'] });
  assert.strictEqual(g.players[1].vpCards, 1);
  assert.strictEqual(g.hands.length, 3);
});
