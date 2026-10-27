// Rules tests for js/engine.js (node --test).
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const { G } = E;

const seats = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'human' }));
const clone = s => JSON.parse(JSON.stringify(s));
// a game with everyone's starting towns placed by Medium computers
function started(n = 3, seed = 7, rules = { board: 'beginner' }) {
  let st = E.newGame(seats(n).map(s => Object.assign(s, { level: 'medium' })), rules, seed);
  const rng = () => 0.3;
  while (st.phase === 'setup') { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, rng)); }
  return st;
}
// a vertex no town is near, with free edges
function freeSpot(st) { return E.setupSpots(st).find(v => G.V[v].edges.every(e => st.eOwner[e] < 0)); }

test('board: 19 tiles, 54 corners, 72 edges, 30 coast edges, 9 harbours that share no corner', () => {
  assert.strictEqual(E.HEXES.length, 19);
  assert.strictEqual(G.V.length, 54);
  assert.strictEqual(G.E.length, 72);
  assert.strictEqual(G.coast.length, 30);
  assert.strictEqual(G.portEdges.length, 9);
  const pv = G.portEdges.flatMap(e => G.E[e].v);
  assert.strictEqual(new Set(pv).size, 18);
  G.V.forEach(v => { assert.ok(v.adj.length >= 2 && v.adj.length <= 3); assert.ok(v.hexes.length >= 1 && v.hexes.length <= 3); });
});

test('beginner board has the real tile and number mix', () => {
  const st = E.newGame(seats(4), { board: 'beginner' }, 1);
  const c = [0, 0, 0, 0, 0]; let desert = 0;
  st.hexRes.forEach(r => (r < 0 ? desert++ : c[r]++));
  assert.deepStrictEqual(c, [4, 3, 4, 4, 3]); assert.strictEqual(desert, 1);
  assert.deepStrictEqual(st.hexNum.filter(Boolean).sort((a, b) => a - b), [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  assert.strictEqual(st.hexNum[st.hexRes.indexOf(-1)], 0, 'desert has no number');
  assert.strictEqual(st.robber, st.hexRes.indexOf(-1), 'robber starts on the desert');
  assert.strictEqual(st.ports.filter(p => p.type === 'any').length, 4);
  assert.strictEqual(st.deck.length, 25);
});

test('random boards: right mix, 6 and 8 never touch, different each seed', () => {
  const seen = new Set();
  for (let s = 1; s <= 300; s++) {
    const st = E.newGame(seats(3), {}, s);
    const red = n => n === 6 || n === 8;
    st.hexNum.forEach((n, h) => { if (red(n)) E.hexAdj[h].forEach(j => assert.ok(!red(st.hexNum[j]), 'seed ' + s)); });
    assert.strictEqual(st.hexNum[st.hexRes.indexOf(-1)], 0);
    seen.add(st.hexRes.join());
  }
  assert.ok(seen.size > 250);
});

test('setup: snake order, distance rule, road must touch the new town, second town pays out', () => {
  let st = E.newGame(seats(3), { board: 'beginner' }, 3);
  assert.deepStrictEqual(st.order, [0, 1, 2, 2, 1, 0]);
  const v = 20;
  st = E.apply(st, 0, { t: 'settle', v });
  const far = G.E.findIndex(e => !e.v.includes(v));
  assert.throws(() => E.apply(clone(st), 0, { t: 'road', e: far }), /next to your new town/);
  st = E.apply(st, 0, { t: 'road', e: G.V[v].edges[0] });
  assert.throws(() => E.apply(clone(st), 1, { t: 'settle', v: G.V[v].adj[0] }), /not next to a town/);
  assert.throws(() => E.apply(clone(st), 2, { t: 'settle', v: 0 }), /Not your turn/);
  // play the rest; the last two settlers get paid for their second town
  const rng = () => 0.5;
  while (st.phase === 'setup') { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, rng)); }
  st.players.forEach((P, i) => {
    const second = st.log.filter(e => e.k === 'settle' && e.p === i)[1];
    const expect = G.V[second.v].hexes.filter(h => st.hexRes[h] >= 0).length;
    assert.strictEqual(E.sum(P.res), expect, 'player ' + i);
  });
  assert.strictEqual(st.phase, 'roll'); assert.strictEqual(st.turn, 0);
});

test('production: cities pay 2, robber tile pays nothing, short bank pays nobody when two need it', () => {
  const st = started(3, 11);
  // find a numbered tile with a building on it
  const h = st.hexNum.findIndex((n, i) => n && i !== st.robber && G.hexVerts[i].some(v => st.vOwner[v] >= 0));
  const n = st.hexNum[h], r = st.hexRes[h];
  // force the dice: search seeds until the roll equals n
  let s2;
  for (let seed = 1; seed < 5000; seed++) { const t = clone(st); t.seed = seed; const o = E.apply(t, t.turn, { t: 'roll' }); if (o.dice[0] + o.dice[1] === n) { s2 = clone(st); s2.seed = seed; break; } }
  const owners = G.hexVerts[h].filter(v => st.vOwner[v] >= 0);
  const v0 = owners[0], p0 = st.vOwner[v0];
  s2.vLevel[v0] = 2; // city
  const before = s2.players[p0].res[r];
  const out = E.apply(clone(s2), s2.turn, { t: 'roll' });
  assert.ok(out.players[p0].res[r] - before >= 2, 'city pays at least 2');
  const robbed = clone(s2); robbed.robber = h;
  const out2 = E.apply(robbed, s2.turn, { t: 'roll' });
  const onH = G.hexVerts[h].reduce((a, v) => a + (s2.vOwner[v] === p0 ? s2.vLevel[v] : 0), 0);
  assert.strictEqual(out.players[p0].res[r] - out2.players[p0].res[r], onH, 'the robbed tile pays nothing');
  // short bank: give a second player a town on the same tile, leave 1 card in the bank
  const short = clone(s2);
  const other = G.hexVerts[h].find(v => short.vOwner[v] < 0 && G.V[v].adj.every(u => short.vOwner[u] < 0));
  if (other !== undefined) {
    const q = (p0 + 1) % 3; short.vOwner[other] = q; short.vLevel[other] = 1;
    short.robber = st.robber; short.bank[r] = 1;
    const o3 = E.apply(short, short.turn, { t: 'roll' });
    assert.strictEqual(o3.players[q].res[r], short.players[q].res[r], 'nobody is paid from a short bank');
    assert.strictEqual(o3.bank[r], 1);
  }
});

test('a 7: big hands discard half (rounded down), then the robber moves and steals one card', () => {
  const st = started(3, 5);
  let s = null;
  for (let seed = 1; seed < 5000; seed++) { const t = clone(st); t.seed = seed; t.players[1].res = [3, 3, 3, 0, 0]; t.players[2].res = [1, 1, 1, 1, 3]; const o = E.apply(clone(t), t.turn, { t: 'roll' }); if (o.dice[0] + o.dice[1] === 7) { s = o; break; } }
  assert.strictEqual(s.phase, 'discard');
  assert.deepStrictEqual(Object.keys(s.discard).map(Number), [1]);
  assert.strictEqual(s.discard[1], 4);
  assert.deepStrictEqual(E.actors(s), [1]);
  assert.throws(() => E.apply(clone(s), 1, { t: 'discard', cards: [1, 1, 1, 0, 0] }), /exactly 4/);
  s = E.apply(s, 1, { t: 'discard', cards: [2, 2, 0, 0, 0] });
  assert.strictEqual(s.log[s.log.length - 1].c, 4, 'the feed says how many cards went back');
  assert.strictEqual(s.phase, 'robber');
  assert.throws(() => E.apply(clone(s), s.turn, { t: 'robber', h: s.robber, from: -1 }), /another tile/);
  const h = [...Array(19).keys()].find(i => i !== s.robber && E.victims(s, s.turn, i).length);
  const vic = E.victims(s, s.turn, h)[0];
  const before = E.sum(s.players[vic].res), mine = E.sum(s.players[s.turn].res);
  s = E.apply(s, s.turn, { t: 'robber', h, from: vic });
  assert.strictEqual(E.sum(s.players[vic].res), before - 1);
  assert.strictEqual(E.sum(s.players[s.turn].res), mine + 1);
  assert.strictEqual(s.phase, 'main');
});

test('longest road: 5 in a row takes it, an enemy town cuts it, a tie keeps the holder', () => {
  const st = E.newGame(seats(3), { board: 'beginner' }, 2);
  st.phase = 'main'; st.turn = 0;
  // walk a 6-edge path along the coast
  const path = []; let v = G.E[G.coast[0]].v[0]; const usedE = new Set();
  while (path.length < 6) { const e = G.V[v].edges.find(f => !usedE.has(f) && G.E[f].hexes.length === 1); usedE.add(e); path.push(e); v = G.E[e].v[0] === v ? G.E[e].v[1] : G.E[e].v[0]; }
  const start = G.E[path[0]].v.find(x => !G.E[path[1]].v.includes(x));
  st.vOwner[start] = 0; st.vLevel[start] = 1;
  st.players[0].res = [10, 10, 2, 2, 0];
  let s = st;
  for (let i = 0; i < 5; i++) s = E.apply(s, 0, { t: 'road', e: path[i] });
  assert.strictEqual(s.longest.p, 0); assert.strictEqual(s.longest.len, 5);
  assert.strictEqual(E.vp(s, 0), 3);
  // player 1 ties at 5 on the far coast: the holder keeps it
  const path1 = []; let w = G.E[G.coast[15]].v[0]; const used1 = new Set(path);
  while (path1.length < 5) { const e = G.V[w].edges.find(f => !used1.has(f) && G.E[f].hexes.length === 1); used1.add(e); path1.push(e); w = G.E[e].v[0] === w ? G.E[e].v[1] : G.E[e].v[0]; }
  const t1 = clone(s); t1.turn = 1; t1.players[1].res = [5, 5, 0, 0, 0];
  const s1 = G.E[path1[0]].v.find(x => !G.E[path1[1]].v.includes(x)); t1.vOwner[s1] = 1; t1.vLevel[s1] = 1;
  let u = t1; for (const e of path1) u = E.apply(u, 1, { t: 'road', e });
  assert.strictEqual(E.longestRoad(u, 1), 5);
  assert.strictEqual(u.longest.p, 0, 'a tie keeps the holder');
  // an opponent settles in the middle of it (corner between edge 2 and 3)
  const mid = G.E[path[2]].v.find(x => G.E[path[3]].v.includes(x));
  s.vOwner[mid] = 1; s.vLevel[mid] = 1;
  s.players[0].res[0] += 1; s.players[0].res[1] += 1;
  s = E.apply(s, 0, { t: 'road', e: path[5] }); // recompute: now 3 + 3, nobody else has 5
  assert.strictEqual(E.longestRoad(s, 0), 3);
  assert.strictEqual(s.longest.p, -1, 'cut below 5: card set aside');
});

test('largest army at 3 knights; a card bought this turn cannot be played; one card a turn', () => {
  const st = started(3, 9);
  let s = E.apply(st, st.turn, { t: 'roll' });
  while (s.phase !== 'main') { const p = E.actors(s)[0]; s = E.apply(s, p, AI.choose(s, p, () => 0.4)); }
  const p = s.turn;
  s.deck.push('K'); s.players[p].res = [0, 0, 1, 1, 1];
  s = E.apply(s, p, { t: 'buy' });
  assert.deepStrictEqual(s.players[p].dev, ['K']);
  assert.throws(() => E.apply(clone(s), p, { t: 'play', card: 'K' }), /can't play/);
  s.players[p].fresh = []; s.players[p].dev = ['K', 'K', 'K']; s.players[p].knights = 2;
  s = E.apply(s, p, { t: 'play', card: 'K' });
  assert.strictEqual(s.army.p, p); assert.strictEqual(s.phase, 'robber');
  s = E.apply(s, p, AI.choose(s, p, () => 0.1));
  assert.throws(() => E.apply(clone(s), p, { t: 'play', card: 'K' }), /One development card/);
});

test('bank trades: 4 for 1, 3 for 1 at an any-harbour, 2 for 1 at a matching harbour', () => {
  const st = E.newGame(seats(3), { board: 'beginner' }, 4);
  st.phase = 'main'; st.turn = 0;
  st.players[0].res = [4, 0, 0, 0, 0];
  assert.strictEqual(E.rate(st, 0, 0), 4);
  const any = st.ports.find(p => p.type === 'any');
  const v = G.E[any.e].v[0]; st.vOwner[v] = 0; st.vLevel[v] = 1;
  assert.strictEqual(E.rate(st, 0, 0), 3);
  const wood = st.ports.find(p => p.type === 'wood');
  const w = G.E[wood.e].v[0]; st.vOwner[w] = 0; st.vLevel[w] = 1;
  assert.strictEqual(E.rate(st, 0, 0), 2);
  const s = E.apply(st, 0, { t: 'bank', give: 0, get: 4 });
  assert.deepStrictEqual(s.players[0].res, [2, 0, 0, 0, 1]);
  assert.strictEqual(s.bank[0], 21); assert.strictEqual(s.bank[4], 18);
  assert.strictEqual(s.log[s.log.length - 1].c, 2, 'the feed says how many cards were paid');
});

test('player trade: offer, everyone who can pay answers at once, the offerer picks a partner', () => {
  const st = E.newGame(seats(4), { board: 'beginner' }, 4);
  st.phase = 'main'; st.turn = 0;
  st.players[0].res = [1, 0, 0, 0, 0]; st.players[1].res = [0, 0, 0, 1, 0]; st.players[2].res = [0, 0, 0, 1, 0]; st.players[3].res = [0, 0, 0, 0, 0];
  let s = E.apply(st, 0, { t: 'offer', give: [1, 0, 0, 0, 0], get: [0, 0, 0, 1, 0] });
  assert.strictEqual(s.phase, 'trade');
  assert.deepStrictEqual(E.actors(s), [1, 2], 'seat 3 cannot pay, so is not asked');
  s = E.apply(s, 2, { t: 'answer', yes: true });
  s = E.apply(s, 1, { t: 'answer', yes: false });
  assert.deepStrictEqual(E.actors(s), [0]);
  assert.throws(() => E.apply(clone(s), 0, { t: 'deal', with: 1 }), /Pick who/);
  s = E.apply(s, 0, { t: 'deal', with: 2 });
  assert.deepStrictEqual(s.players[0].res, [0, 0, 0, 1, 0]);
  assert.deepStrictEqual(s.players[2].res, [1, 0, 0, 0, 0]);
  assert.strictEqual(s.phase, 'main');
  // nobody says yes: back to the turn
  s.players[0].res = [1, 0, 0, 0, 0]; s.players[1].res = [0, 0, 0, 1, 0];
  s = E.apply(s, 0, { t: 'offer', give: [1, 0, 0, 0, 0], get: [0, 0, 0, 1, 0] });
  s = E.apply(s, 1, { t: 'answer', yes: false });
  assert.strictEqual(s.phase, 'main');
});

test('reaching 10 points on your turn wins; hidden point cards count', () => {
  const st = started(3, 13);
  let s = E.apply(st, st.turn, { t: 'roll' });
  while (s.phase !== 'main') { const p = E.actors(s)[0]; s = E.apply(s, p, AI.choose(s, p, () => 0.4)); }
  const p = s.turn;
  s.players[p].vpCards = 10 - E.vp(s, p) - 1; s.players[p].dev = Array(s.players[p].vpCards).fill('V');
  s.deck.push('V'); s.players[p].res = [0, 0, 1, 1, 1];
  s = E.apply(s, p, { t: 'buy' });
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.winner, p);
});

test('points gained on someone else\'s turn win as soon as your own turn comes', () => {
  const st = started(3, 13);
  const p = st.turn;
  st.players[p].vpCards = 10 - E.vp(st, p); st.players[p].dev = Array(st.players[p].vpCards).fill('V');
  const s = E.apply(st, p, { t: 'roll' });
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.winner, p);
});

test('any development card (not only a Knight) may be played before rolling', () => {
  const st = started(3, 9), p = st.turn;
  st.players[p].dev = ['R', 'P', 'M']; st.players[p].fresh = [];
  let s = E.apply(clone(st), p, { t: 'play', card: 'P', r1: 0, r2: 4 });
  assert.strictEqual(s.phase, 'roll'); assert.ok(s.players[p].res[0] >= 1);
  s = E.apply(clone(st), p, { t: 'play', card: 'M', r1: 2 });
  assert.strictEqual(s.phase, 'roll');
  s = E.apply(clone(st), p, { t: 'play', card: 'R' });
  assert.strictEqual(s.phase, 'roads');
  s = E.apply(s, p, { t: 'road', e: E.legalRoads(s, p)[0] });
  s = E.apply(s, p, { t: 'road', e: E.legalRoads(s, p)[0] });
  assert.strictEqual(s.phase, 'roll', 'back to rolling after the free roads');
  assert.throws(() => E.apply(clone(s), p, { t: 'end' }), /Roll/);
});

test('computer games: 60 games at every level mix end with a 10-point winner, every move legal, state is JSON', () => {
  const L = ['easy', 'medium', 'hard'];
  let rng = 1; const r = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647; };
  for (let g = 0; g < 60; g++) {
    const n = 3 + (g % 2);
    let s = E.newGame(Array.from({ length: n }, (_, i) => ({ kind: 'cpu', level: L[(g + i) % 3] })), { board: g % 3 ? 'random' : 'beginner' }, g + 1);
    let moves = 0;
    while (s.phase !== 'over') {
      const who = E.actors(s); assert.ok(who.length > 0, 'someone always acts');
      const p = who[Math.floor(r() * who.length)];
      s = E.apply(s, p, AI.choose(s, p, r));
      assert.ok(++moves < 20000);
    }
    assert.ok(E.vp(s, s.winner) >= 10, 'winner has 10');
    assert.deepStrictEqual(clone(s), s);
    // bank + hands always add up to 19 of each
    for (let k = 0; k < 5; k++) assert.strictEqual(s.bank[k] + s.players.reduce((a, P) => a + P.res[k], 0), 19);
  }
});

test('public view hides hands, dev cards, point cards, the deck and the seed', () => {
  const st = started(4, 21);
  st.players[2].dev = ['V', 'K']; st.players[2].vpCards = 1;
  st.log.push({ k: 'robber', p: 0, h: 3, from: 2, r: 4 });
  const v = E.view(st);
  assert.ok(!('seed' in v));
  assert.strictEqual(typeof v.deck, 'number');
  v.players.forEach((P, i) => { assert.strictEqual(P.res, E.sum(st.players[i].res)); assert.strictEqual(typeof P.dev, 'number'); assert.strictEqual(P.vpCards, 0); });
  assert.strictEqual(v.log[v.log.length - 1].r, -2, 'stolen card hidden');
});
