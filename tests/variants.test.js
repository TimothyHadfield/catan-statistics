// 5-6 players and house-rule options (node --test). Base rules stay the default.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const CG = require('../js/adapter.js');

const seats = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'human', level: 'medium' }));
const clone = s => JSON.parse(JSON.stringify(s));
const cpus = (n, g) => Array.from({ length: n }, (_, i) => ({ kind: 'cpu', level: ['easy', 'medium', 'hard'][(g + i) % 3] }));
function lcg(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
function playOut(st, r, onMove) {
  let moves = 0;
  while (st.phase !== 'over') {
    const who = E.actors(st); assert.ok(who.length > 0, 'someone always acts (' + st.phase + ')');
    const p = who[Math.floor(r() * who.length)];
    const a = AI.choose(st, p, r);
    if (onMove) onMove(st, p, a);
    st = E.apply(st, p, a);
    assert.ok(++moves < 40000, 'game ends');
  }
  return st;
}

// ------------------------------------------------------------ 5-6 players
test('5-6 players: 30-tile board with 2 deserts, 28 numbers, 11 harbours, 34 cards, 24 of each in the bank', () => {
  for (const n of [5, 6]) {
    const st = E.newGame(seats(n), {}, 3);
    const G = E.geo(st);
    assert.strictEqual(st.rules.big, true, 'big board is automatic at ' + n);
    assert.strictEqual(G.HEXES.length, 30);
    const c = [0, 0, 0, 0, 0]; let desert = 0;
    st.hexRes.forEach(r => (r < 0 ? desert++ : c[r]++));
    assert.deepStrictEqual(c, [6, 5, 6, 6, 5]); assert.strictEqual(desert, 2);
    assert.deepStrictEqual(st.hexNum.filter(Boolean).sort((a, b) => a - b),
      [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12]);
    st.hexRes.forEach((r, h) => { if (r < 0) assert.strictEqual(st.hexNum[h], 0, 'deserts have no number'); });
    assert.ok(st.hexRes[st.robber] < 0, 'robber starts on a desert');
    assert.strictEqual(st.ports.length, 11);
    assert.strictEqual(st.ports.filter(p => p.type === 'any').length, 5);
    assert.strictEqual(st.ports.filter(p => p.type === 'sheep').length, 2);
    const pv = st.ports.flatMap(p => G.E[p.e].v);
    assert.strictEqual(new Set(pv).size, 22, 'harbours share no corner');
    st.ports.forEach(p => assert.strictEqual(G.E[p.e].hexes.length, 1, 'harbours on the coast'));
    assert.strictEqual(st.deck.length, 34);
    assert.strictEqual(st.deck.filter(k => k === 'K').length, 20);
    assert.deepStrictEqual(st.bank, [24, 24, 24, 24, 24]);
    assert.strictEqual(new Set(st.players.map(P => P.color)).size, n);
    G.V.forEach(v => { assert.ok(v.adj.length >= 2 && v.adj.length <= 3); assert.ok(v.hexes.length >= 1 && v.hexes.length <= 3); });
  }
  // 3-4 players keep the base board
  const b = E.newGame(seats(4), {}, 3);
  assert.ok(!b.rules.big); assert.strictEqual(E.geo(b).HEXES.length, 19); assert.strictEqual(E.geo(b), E.G);
});

test('5-6 players: random boards keep 6 and 8 apart', () => {
  const red = n => n === 6 || n === 8;
  for (let s = 1; s <= 200; s++) {
    const st = E.newGame(seats(6), {}, s), adj = E.geo(st).hexAdj;
    st.hexNum.forEach((n, h) => { if (red(n)) adj[h].forEach(j => assert.ok(!red(st.hexNum[j]), 'seed ' + s)); });
  }
});

test('5-6 players: special build phase after each turn, build only, then the next player rolls', () => {
  let st = E.newGame(seats(5), { board: 'random' }, 8);
  const r = () => 0.3;
  while (st.phase === 'setup') { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, r)); }
  st = E.apply(st, 0, { t: 'roll' });
  while (st.phase !== 'main') { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, r)); }
  // seats 2 and 4 can afford a card; 1 and 3 have nothing
  st.players.forEach(P => { P.res = [0, 0, 0, 0, 0]; });
  st.players[2].res = [0, 0, 1, 1, 1]; st.players[4].res = [0, 0, 1, 1, 1];
  st.players[2].dev = ['K']; st.players[2].fresh = [];
  st = E.apply(st, 0, { t: 'end' });
  assert.strictEqual(st.phase, 'build');
  assert.deepStrictEqual(E.actors(st), [2], 'seats that can build nothing are skipped');
  assert.throws(() => E.apply(clone(st), 2, { t: 'bank', give: 2, get: 0 }), /build/i);
  assert.throws(() => E.apply(clone(st), 2, { t: 'offer', give: [0, 0, 1, 0, 0], get: [1, 0, 0, 0, 0] }), /build/i);
  assert.throws(() => E.apply(clone(st), 2, { t: 'play', card: 'K' }), /build/i);
  st = E.apply(st, 2, { t: 'buy' });
  assert.strictEqual(st.players[2].dev.length, 2);
  assert.deepStrictEqual(E.actors(st), [4], 'seat 2 had nothing left, so seat 4 is next');
  st = E.apply(st, 4, { t: 'end' });
  assert.strictEqual(st.phase, 'roll'); assert.strictEqual(st.turn, 1);
  assert.deepStrictEqual(E.actors(st), [1]);
  assert.strictEqual(E.playable(st, 2, 'K'), 2, 'a card bought in the build phase is playable on your own next turn');
  // 3-4 players: no build phase
  let b = E.newGame(seats(3), { board: 'beginner' }, 3);
  while (b.phase === 'setup') { const p = E.actors(b)[0]; b = E.apply(b, p, AI.choose(b, p, r)); }
  b = E.apply(b, 0, { t: 'roll' });
  while (b.phase !== 'main') { const p = E.actors(b)[0]; b = E.apply(b, p, AI.choose(b, p, r)); }
  b.players[1].res = [5, 5, 5, 5, 5];
  b = E.apply(b, 0, { t: 'end' });
  assert.strictEqual(b.phase, 'roll'); assert.strictEqual(b.turn, 1);
});

test('5-6 players: 30 computer games end with a winner, legal moves, 24 of each card conserved', () => {
  for (let g = 0; g < 30; g++) {
    const n = 5 + (g % 2);
    const st = playOut(E.newGame(cpus(n, g), { board: 'random', balanced: g % 3 === 0, friendly: g % 4 === 0 }, g + 50), lcg(g + 7));
    assert.ok(E.vp(st, st.winner) >= 10 || st.log.some(e => e.k === 'win' && e.timeout));
    assert.ok(!st.log.some(e => e.k === 'win' && e.timeout), 'no game hits the turn cap (seed ' + g + ')');
    for (let k = 0; k < 5; k++) assert.strictEqual(st.bank[k] + st.players.reduce((a, P) => a + P.res[k], 0), 24);
    assert.deepStrictEqual(clone(st), st);
  }
});

test('online: rooms seat up to 6 and a 6-seat game sets up the big board', () => {
  assert.strictEqual(CG.game.maxSeats, 6);
  const st = CG.game.setup(6, { rules: { friendly: true, vp: 12 } }, () => 0.5, Array.from({ length: 6 }, () => ({ kind: 'computer' })));
  assert.strictEqual(st.n, 6); assert.ok(st.rules.big); assert.ok(st.rules.friendly); assert.strictEqual(st.rules.vp, 12);
  const v = CG.game.publicView(st);
  assert.strictEqual(E.geo(v).HEXES.length, 30, 'views know which board they are on');
});

test('robbing works from the screen\'s view of the table (other hands are only counts there)', () => {
  const st = E.newGame(seats(3), { board: 'beginner' }, 3);
  st.vOwner[20] = 1; st.vLevel[20] = 1; st.players[1].res = [1, 0, 0, 0, 0];
  const g = CG.merge(CG.game.publicView(st), CG.game.privateView(st, 0), 0);
  const h = E.G.V[20].hexes[0];
  assert.deepStrictEqual(E.victims(g, 0, h), [1]);
  assert.ok(E.robberHexes(g, 0).length > 0);
});

// ------------------------------------------------------------ house rules
test('friendly robber: no tile touching a player on 2 points or fewer, unless every tile is blocked', () => {
  let st = E.newGame(seats(3), { board: 'beginner', friendly: true }, 5);
  const r = () => 0.3;
  while (st.phase === 'setup') { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, r)); }
  st.phase = 'robber'; st.robberBack = 'main'; st.turn = 0;
  // everyone has 2 points after setup: every tile touching seats 1 or 2 is off limits
  const G = E.geo(st);
  const touches = (h, p) => G.hexVerts[h].some(v => st.vOwner[v] === p);
  const blocked = [...Array(19).keys()].find(h => h !== st.robber && (touches(h, 1) || touches(h, 2)));
  const open = [...Array(19).keys()].find(h => h !== st.robber && !touches(h, 1) && !touches(h, 2));
  assert.ok(blocked !== undefined && open !== undefined);
  assert.throws(() => E.apply(clone(st), 0, { t: 'robber', h: blocked, from: E.victims(st, 0, blocked)[0] ?? -1 }), /friendly|2 points/i);
  assert.ok(!E.robberHexes(st, 0).includes(blocked)); assert.ok(E.robberHexes(st, 0).includes(open));
  E.apply(clone(st), 0, { t: 'robber', h: open, from: E.victims(st, 0, open)[0] ?? -1 });
  // a player on 3 points can be robbed again
  const three = clone(st); const v1 = three.vOwner.findIndex((o, v) => o === 1 && three.vLevel[v] === 1); three.vLevel[v1] = 2;
  const h3 = G.V[v1].hexes.find(h => h !== three.robber && !touches(h, 2));
  if (h3 !== undefined) assert.ok(E.robberHexes(three, 0).includes(h3));
  // off by default
  const plain = clone(st); plain.rules.friendly = false;
  assert.ok(E.robberHexes(plain, 0).includes(blocked));
  // every tile blocked (6 towns of 2-point players cover all 18 other tiles): the robber may go anywhere
  const all = E.newGame(seats(4), { board: 'beginner', friendly: true }, 5);
  all.phase = 'robber'; all.robberBack = 'main'; all.turn = 0;
  const tri = G.V.map((v, i) => i).filter(i => G.V[i].hexes.length === 3 && !G.V[i].hexes.includes(all.robber));
  const pickCover = (used, out) => {
    if (out.length === 6) return out;
    for (const v of tri) if (G.V[v].hexes.every(h => !used.has(h)) && (!out.length || v > out[out.length - 1])) {
      const r2 = pickCover(new Set([...used, ...G.V[v].hexes]), out.concat(v)); if (r2) return r2;
    }
    return null;
  };
  const cover = pickCover(new Set(), []);
  assert.ok(cover, 'found 6 corners covering every tile');
  cover.forEach((v, i) => { all.vOwner[v] = 1 + (i % 3); all.vLevel[v] = 1; });
  const rh = E.robberHexes(all, 0);
  assert.strictEqual(rh.length, 18, 'all blocked: any other tile is allowed');
});

test('friendly robber: computers never break it (40 games)', () => {
  for (let g = 0; g < 40; g++) {
    const n = 3 + (g % 2);
    playOut(E.newGame(cpus(n, g), { board: g % 2 ? 'random' : 'beginner', friendly: true }, g + 300), lcg(g + 3), (st, p, a) => {
      if (a.t === 'robber') assert.ok(E.robberHexes(st, p).includes(a.h), 'computer robber spot is allowed');
    });
  }
});

test('balanced board: same resources, same numbers and 6/8 never touch; no corner over 12 dots', () => {
  for (const n of [3, 6]) {
    for (let s = 1; s <= 150; s++) {
      const st = E.newGame(seats(n), { balanced: true }, s), G = E.geo(st);
      st.hexRes.forEach((r, h) => G.hexAdj[h].forEach(j => {
        if (r >= 0) assert.notStrictEqual(st.hexRes[j], r, `resource touch n${n} seed ${s}`);
        if (st.hexNum[h]) assert.notStrictEqual(st.hexNum[j], st.hexNum[h], `number touch n${n} seed ${s}`);
        const red = x => x === 6 || x === 8;
        assert.ok(!(red(st.hexNum[h]) && red(st.hexNum[j])), `red touch n${n} seed ${s}`);
      }));
      G.V.forEach(v => assert.ok(v.hexes.reduce((a, h) => a + E.pips(st.hexNum[h]), 0) <= 12, `corner dots n${n} seed ${s}`));
    }
  }
  // the plain random board often breaks these (so the option really changes something)
  let touches = 0;
  for (let s = 1; s <= 50; s++) { const st = E.newGame(seats(3), {}, s); if (st.hexRes.some((r, h) => r >= 0 && E.hexAdj[h].some(j => st.hexRes[j] === r))) touches++; }
  assert.ok(touches > 40);
});

test('points to win: 8 and 13 both end the game at that score, computers included', () => {
  for (const vp of [8, 13]) {
    for (let g = 0; g < 8; g++) {
      const st = playOut(E.newGame(cpus(3 + (g % 2), g), { board: 'random', vp }, g + 900), lcg(g + 11));
      assert.ok(!st.log.some(e => e.k === 'win' && e.timeout));
      assert.ok(E.vp(st, st.winner) >= vp, 'winner reached ' + vp);
      if (vp === 13) assert.ok(E.vp(st, st.winner) <= 15);
    }
  }
  assert.throws(() => E.newGame(seats(3), { vp: 40 }, 1), /points/);
});
