// "Advisor" corner numbers (js/advisor.js) on real engine boards and a real In-person random board.
const test = require('node:test');
const assert = require('node:assert');
const A = require('../js/advisor.js');
const W = require('../js/weights.js');
const E = require('../js/engine.js');
const TB = require('../js/tracker-board.js');

const game = (seed, n = 4) => E.newGame(Array.from({ length: n }, () => ({})), { board: 'random' }, seed);
const input = (st, me, players) => Object.assign(A.fromEngine(st, E.geo(st), E.pips), { me }, players ? { players } : {});
const dots = (inp, v) => inp.corners[v].hexes.reduce((a, h) => a + h.pips, 0);
const has = (inp, v, r) => inp.corners[v].hexes.some(h => h.resource === r && h.pips > 0);
const far = (Gm, a, b) => a !== b && !Gm.V[a].edges.some(e => Gm.E[e].v.includes(b)) &&
  !Gm.V[a].edges.some(e => Gm.E[e].v.some(u => u !== a && Gm.V[u].edges.some(f => Gm.E[f].v.includes(b))));

// road distance between corners on the engine board
function dist(Gm, a) {
  const d = Gm.V.map(() => Infinity), q = [a]; d[a] = 0;
  while (q.length) { const v = q.shift(); Gm.V[v].edges.forEach(e => Gm.E[e].v.forEach(u => { if (d[u] > d[v] + 1) { d[u] = d[v] + 1; q.push(u); } })); }
  return d;
}
const orePips = (inp, v) => inp.corners[v].hexes.filter(h => h.resource === 'ore').reduce((s, h) => s + h.pips, 0);

test('denial: an opponent short on ore loses more when you take the ore corner', () => {
  let checked = 0, above = 0;
  for (let seed = 1; seed <= 200 && checked < 6; seed++) {
    const st = game(seed, seed % 2 ? 4 : 6), Gm = E.geo(st), inp0 = input(st, 0), V = [...Array(Gm.V.length).keys()];
    const land = v => inp0.corners[v].hexes.length === 3;
    // a = corner with real ore, b = corner with no ore and the same plain dots, apart from each other
    let a, b;
    for (const x of V) {
      if (!land(x) || orePips(inp0, x) < 4 || dots(inp0, x) < 8) continue;
      const dx = dist(Gm, x), y = V.find(y => land(y) && !has(inp0, y, 'ore') && dots(inp0, y) === dots(inp0, x) && dx[y] >= 3);
      if (y !== undefined) { a = x; b = y; break; }
    }
    if (a === undefined) continue;
    const da = dist(Gm, a), db = dist(Gm, b), away = v => land(v) && da[v] >= 4 && db[v] >= 4;
    const mineAt = V.find(v => away(v) && orePips(inp0, v) === 0);
    if (mineAt === undefined) continue;
    const dm = dist(Gm, mineAt), ok = v => away(v) && dm[v] >= 2;
    const oppA = V.find(v => ok(v) && !has(inp0, v, 'ore') && dots(inp0, v) >= 9); // opponent with no ore at all
    const oppB = V.find(v => ok(v) && orePips(inp0, v) >= 5);                     // opponent rich in ore
    if (oppA === undefined || oppB === undefined) continue;
    const run = opp => {
      const s = JSON.parse(JSON.stringify(st));
      s.vOwner[mineAt] = 0; s.vLevel[mineAt] = 1; s.vOwner[opp] = 1; s.vLevel[opp] = 1; // setup: one town each
      const r = A.scores(input(s, 0, [0, 1]));
      const keep = A.K.DENY; A.K.DENY = 0; const r0 = A.scores(input(s, 0, [0, 1])); A.K.DENY = keep;
      return { gain: (r.parts[a].raw - r.parts[b].raw) - (r0.parts[a].raw - r0.parts[b].raw), deny: [r.parts[a].deny, r.parts[b].deny] };
    };
    const short = run(oppA), rich = run(oppB);
    assert.ok(short.deny[0] > rich.deny[0], `seed ${seed}: an ore-short opponent loses more from the ore corner (${short.deny[0]} vs ${rich.deny[0]})`);
    assert.ok(short.gain > rich.gain, `seed ${seed}: denial lifts the ore corner over the equal-dots one more when the opponent lacks ore (${short.gain} vs ${rich.gain})`);
    if (short.gain > 0) above++;
    checked++;
  }
  assert.ok(checked >= 3, `found ${checked} real boards to check`);
  // usually (not always: the other corner may hold something else the opponent lacks) the ore corner ends higher
  assert.ok(above * 2 >= checked, `ore corner lifted above the equal-dots one on ${above} of ${checked} boards`);
});

test('diversity: new resources and new numbers add, ones you already have do not', () => {
  const st = game(7), Gm = E.geo(st);
  // my two setup towns
  const spots = E.setupSpots(st).sort((x, y) => Gm.V[y].hexes.length - Gm.V[x].hexes.length);
  const t1 = spots[0], t2 = spots.find(v => far(Gm, v, t1));
  st.vOwner[t1] = 0; st.vLevel[t1] = 1; st.vOwner[t2] = 0; st.vLevel[t2] = 1;
  const inp = input(st, 0), r = A.scores(inp);
  const own = new Set(), nums = new Set();
  [t1, t2].forEach(v => inp.corners[v].hexes.forEach(h => { own.add(h.resource); nums.add(h.number); }));
  let sawNew = 0, sawOld = 0;
  inp.corners.forEach((c, v) => {
    if (!r.parts[v]) return;
    const live = c.hexes.filter(h => h.pips > 0);
    const newRes = new Set(live.filter(h => !own.has(h.resource)).map(h => h.resource));
    if (live.length && !newRes.size && live.every(h => nums.has(h.number))) { assert.strictEqual(r.parts[v].div, 0); sawOld++; }
    if (newRes.size) { assert.ok(r.parts[v].div >= A.K.NEWRES * Math.min(...live.filter(h => !own.has(h.resource)).map(h => h.pips)) - 1e-9); sawNew++; }
  });
  assert.ok(sawNew > 3, 'corners with a new resource found');
  assert.ok(sawOld + sawNew > 10);
  // nothing owned yet: three different resources on three numbers get the full bonus; a repeated resource less
  const empty = input(game(7), 0), re = A.scores(empty);
  let full = 0, part = 0;
  empty.corners.forEach((c, v) => {
    if (!re.parts[v] || c.hexes.length !== 3) return;
    const sum = dots(empty, v), max = (A.K.NEWRES + A.K.NEWNUM) * sum;
    if (new Set(c.hexes.map(h => h.resource)).size === 3 && new Set(c.hexes.map(h => h.number)).size === 3) { assert.ok(Math.abs(re.parts[v].div - max) < 1e-9); full++; }
    if (new Set(c.hexes.map(h => h.resource)).size < 3) { assert.ok(re.parts[v].div < max - 1e-9); part++; }
  });
  assert.ok(full >= 3 && part > 0, `${full} full, ${part} repeated`);
});

test('positional blocking: a corner at the end of an opponent road blocks, a far corner does not', () => {
  let checked = 0;
  for (let seed = 1; seed <= 30 && checked < 4; seed++) {
    const st = game(seed), Gm = E.geo(st);
    // opponent 1: two towns and a road of 2 going out from the first (main phase, no free town)
    const s1 = E.setupSpots(st)[seed * 3 % 40];
    st.vOwner[s1] = 1; st.vLevel[s1] = 1;
    const s2far = E.setupSpots(st).reverse().find(v => far(Gm, v, s1));
    st.vOwner[s2far] = 1; st.vLevel[s2far] = 1;
    const e1 = Gm.V[s1].edges[0], mid = Gm.E[e1].v.find(u => u !== s1);
    const e2 = Gm.V[mid].edges.find(e => e !== e1), end = Gm.E[e2].v.find(u => u !== mid);
    const before = A.scores(input(st, 0, [0, 1]));
    st.eOwner[e1] = 1; st.eOwner[e2] = 1;
    const inp = input(st, 0, [0, 1]), r = A.scores(inp);
    if (!r.parts[end]) continue; // the road end must be an open corner
    assert.ok(r.parts[end].block > 0, `seed ${seed}: road end blocks`);
    assert.ok(r.parts[end].block > before.parts[end].block, `seed ${seed}: the road made the end corner a better block`);
    assert.ok(r.parts[end].raw > before.parts[end].raw, `seed ${seed}: road end corner rises`);
    // corners 4+ roads from every opponent piece get no block and no denial in the main phase
    const d = A.reachDist(inp.corners, inp.roads, 1);
    inp.corners.forEach((c, v) => { if (r.parts[v] && d[v] >= 5 && c.nbrs.every(u => d[u] >= 4)) { assert.strictEqual(r.parts[v].block, 0); assert.strictEqual(r.parts[v].deny, 0); } });
    checked++;
  }
  assert.ok(checked >= 3, `found ${checked} road ends to check`);
});

test('scale: open corners average their plain dots; numbers only on open corners; inputs untouched', () => {
  for (const n of [4, 6]) for (const seed of [3, 11]) {
    const st = game(seed, n), Gm = E.geo(st);
    const a = E.setupSpots(st)[5]; st.vOwner[a] = 0; st.vLevel[a] = 1;
    const b = E.setupSpots(st)[20]; st.vOwner[b] = 1; st.vLevel[b] = 1;
    const inp = input(st, 0), copy = JSON.stringify(inp), r = A.scores(inp);
    assert.strictEqual(JSON.stringify(inp), copy, 'scores() changes nothing it is given');
    let sd = 0, ss = 0, k = 0;
    inp.corners.forEach((c, v) => {
      const open = A.isOpen(inp.corners, v);
      assert.strictEqual(r.score[v] !== null, open);
      if (open) { sd += dots(inp, v); ss += r.score[v]; k++; assert.ok(Number.isFinite(r.score[v]) && r.score[v] >= 0); }
    });
    assert.ok(Math.abs(sd / k - ss / k) < 1e-9, 'same average as plain dots');
    assert.strictEqual(Gm.V.length, inp.corners.length);
  }
});

test('In-person board shape gives the same numbers as the engine shape', () => {
  // build the tracker's corners exactly as tracker.html does from a real Random board
  const b = TB.randomBoard(12345), V = {}, edges = new Set();
  const P = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  b.hexes.forEach(h => {
    const ks = [0, 1, 2, 3, 4, 5].map(i => TB.cornerKey(h, i));
    ks.forEach(k => { V[k] = V[k] || { adjacentHexes: [] }; if (h.number && h.resource !== 'desert') V[k].adjacentHexes.push({ resource: h.resource, pips: P[+h.number], number: +h.number }); });
    ks.forEach((k, i) => edges.add([k, ks[(i + 1) % 6]].sort().join('|')));
  });
  const nb = {};
  edges.forEach(e => { const [x, y] = e.split('|'); (nb[x] = nb[x] || []).push(y); (nb[y] = nb[y] || []).push(x); });
  const keys = Object.keys(V);
  const sett = [{ vertex: keys[10], player: 'red' }, { vertex: keys[40], player: 'blue' }];
  const inp = A.fromTracker(V, nb, sett, [], W.totals(b.hexes));
  inp.me = 'red';
  const r = A.scores(inp);
  assert.strictEqual(keys.length, 54);
  assert.deepStrictEqual(inp.players.sort(), ['blue', 'red']);
  const open = r.score.filter(x => x !== null);
  assert.ok(open.length > 40 && open.length < 54);
  assert.ok(open.every(Number.isFinite));
  assert.ok(r.parts.some(p => p && p.deny > 0), 'blue still has a free town, so denial counts');
});
