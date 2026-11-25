// A computer never offers the same player trade twice in one turn (Tim: "sometimes the AI try to
// offer the same trade twice in one turn. This shouldn't happen.")
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const LV = ['easy', 'medium', 'hard'];

// plays computer-only games; counts offers that repeat an earlier offer (same give/get) from the same turn
function repeats(n, games, levelsOf) {
  let offers = 0, dup = 0; const examples = [];
  for (let g = 0; g < games; g++) {
    let st = E.newGame(levelsOf(g).map((l, i) => ({ name: 'P' + i, kind: 'cpu', level: l })), {}, 500 + g);
    const rng = mulberry(g * 13 + 7);
    let turnKey = -1, seen = new Set(), moves = 0;
    while (st.phase !== 'over') {
      const who = E.actors(st), p = who[Math.floor(rng() * who.length)];
      const a = AI.choose(st, p, rng);
      if (st.turns !== turnKey) { turnKey = st.turns; seen = new Set(); }
      if (a.t === 'offer') {
        offers++;
        const k = p + ':' + a.give.join('') + '>' + a.get.join('');
        if (seen.has(k)) { dup++; if (examples.length < 3) examples.push('game ' + g + ' turn ' + st.turns + ' ' + k); }
        seen.add(k);
      }
      st = E.apply(st, p, a);
      assert.ok(++moves < 40000, 'game ends');
    }
  }
  return { offers, dup, examples };
}

test('no repeated offer in a turn: 200 four-player games, all levels mixed', () => {
  const r = repeats(4, 200, g => [0, 1, 2, 3].map(i => LV[(g + i) % 3]));
  assert.ok(r.offers > 100, 'computers do make offers (' + r.offers + ')');
  assert.strictEqual(r.dup, 0, r.dup + ' repeated offers, e.g. ' + r.examples.join('; '));
});

test('no repeated offer in a turn: 4 hard players (200 games) and 6 players with the build phase (50 games)', () => {
  const h = repeats(4, 200, () => ['hard', 'hard', 'hard', 'hard']);
  assert.strictEqual(h.dup, 0, h.dup + ' repeated offers (hard), e.g. ' + h.examples.join('; '));
  const s = repeats(6, 50, g => [0, 1, 2, 3, 4, 5].map(i => LV[(g + i) % 3]));
  assert.ok(s.offers > 20, 'computers do make offers in 6p (' + s.offers + ')');
  assert.strictEqual(s.dup, 0, s.dup + ' repeated offers (6p), e.g. ' + s.examples.join('; '));
});

test('the turn memory of offers is JSON-safe, survives a view, and clears at the next turn', () => {
  let st = E.newGame([0, 1, 2, 3].map(i => ({ name: 'P' + i, kind: 'cpu', level: 'hard' })), {}, 77);
  const rng = mulberry(3); let checked = 0;
  while (st.phase !== 'over' && checked < 5) {
    const who = E.actors(st), p = who[0], a = AI.choose(st, p, rng), turn = st.turns;
    st = E.apply(st, p, a);
    if (a.t === 'offer') {
      assert.ok(Array.isArray(st.offered) && st.offered.length >= 1, 'offer remembered');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(st)).offered, st.offered);
      assert.deepStrictEqual(E.view(st).offered, st.offered, 'a view keeps it (online computers)');
      // the same offer from a view is not chosen again this turn
      checked++;
    }
    if (st.turns !== turn) assert.deepStrictEqual(st.offered, [], 'cleared at the next turn');
  }
  assert.ok(checked > 0, 'saw an offer');
});
