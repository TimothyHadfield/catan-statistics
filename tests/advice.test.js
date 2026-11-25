// Advisor suggestion rings (js/advice.js) on real games: E.newGame + moves played by the computers,
// seen through the same merged view the page draws (public view + own hand).
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const CG = require('../js/adapter.js');
const { mulberry } = require('../tools/sim.js');
let AD = null;
try { AD = require('../js/advice.js'); } catch (e) { AD = null; }
const need = () => assert.ok(AD, 'js/advice.js exists and loads');

const newGame = (seed, n) => E.newGame(Array.from({ length: n }, () => ({ kind: 'cpu', level: 'medium' })), { board: 'random', first: seed % n }, seed);
const seen = (st, seat) => CG.merge(CG.game.publicView(st), CG.game.privateView(st, seat), seat);
// play computer moves until stop(st) is true
function playUntil(st, seed, stop, max = 4000) {
  const rng = mulberry(seed * 13 + 5);
  for (let i = 0; i < max && !stop(st); i++) { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, rng)); }
  return st;
}
const nbr = (Gm, a, b) => Gm.V[a].edges.some(e => Gm.E[e].v.includes(b));

test('setup: my first town gets a gold pair and a different silver pair of open corners; opponent picks are legal', () => {
  need();
  let checked = 0;
  for (const n of [3, 4, 6]) for (let seed = 1; seed <= 4; seed++) {
    let st = newGame(seed, n);
    const seat = st.order[1]; // second to place: opponents place between my two towns
    st = playUntil(st, seed, s => s.order[s.step] === seat && s.sub === 'settle');
    const g = seen(st, seat), Gm = E.geo(g), a = AD.setup(g, seat), open = new Set(E.setupSpots(g));
    assert.strictEqual(a.gold.length, 2, 'gold pair'); assert.strictEqual(a.silver.length, 2, 'silver pair');
    assert.notStrictEqual(a.gold[0], a.gold[1]);
    assert.notStrictEqual(a.silver[0], a.silver[1]);
    assert.notStrictEqual(a.gold[0], a.silver[0], 'silver first town differs from gold');
    [...a.gold, ...a.silver].forEach(v => assert.ok(open.has(v), `corner ${v} is open now`));
    assert.ok(!nbr(Gm, a.gold[0], a.gold[1]) && !nbr(Gm, a.silver[0], a.silver[1]), 'a pair can both be built');
    // opponents placing before my second town: snake order says how many
    const between = st.order.slice(st.step + 1, st.order.indexOf(seat, st.step + 1));
    assert.deepStrictEqual(a.opp.map(x => x.p), between, 'one predicted pick per opponent placement, in order');
    const all = [a.gold[0], ...a.opp.map(x => x.v)];
    a.opp.forEach(x => assert.ok(open.has(x.v), `predicted pick ${x.v} is an open corner`));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      assert.notStrictEqual(all[i], all[j]); assert.ok(!nbr(Gm, all[i], all[j]), 'predicted picks are not neighbours');
    }
    assert.ok(!all.includes(a.gold[1]) && !a.opp.some(x => nbr(Gm, x.v, a.gold[1])), 'my planned second town is still free after them');
    checked++;
  }
  assert.strictEqual(checked, 12);
});

test('setup: while waiting, rings show the opponents placing before my next town; last town has gold + silver', () => {
  need();
  for (let seed = 1; seed <= 3; seed++) {
    let st = newGame(seed, 4);
    const seat = st.order[3]; // last in the first round: three opponents before me
    const g0 = seen(st, seat), a0 = AD.setup(g0, seat);
    assert.deepStrictEqual(a0.opp.map(x => x.p), st.order.slice(0, 3));
    assert.strictEqual(a0.gold.length, 0, 'no own pair while waiting');
    const open = new Set(E.setupSpots(g0));
    a0.opp.forEach(x => assert.ok(open.has(x.v)));
    // my second (last) setup town: no opponents before it, gold = best, silver = 2nd best
    st = playUntil(st, seed, s => s.step === 4 && s.sub === 'settle'); // order[4] = same seat (snake turn)
    assert.strictEqual(st.order[4], seat);
    const g = seen(st, seat), a = AD.setup(g, seat), ok = new Set(E.setupSpots(g));
    assert.strictEqual(a.gold.length, 1); assert.strictEqual(a.silver.length, 1);
    assert.ok(ok.has(a.gold[0]) && ok.has(a.silver[0]) && a.gold[0] !== a.silver[0]);
    assert.strictEqual(a.opp.length, 0);
  }
});

test('setup road: gold and silver edges touch the town just placed and are empty', () => {
  need();
  for (let seed = 1; seed <= 4; seed++) {
    let st = newGame(seed, seed % 2 ? 4 : 6);
    const seat = st.order[0];
    st = playUntil(st, seed, s => s.sub === 'road');
    const g = seen(st, seat), Gm = E.geo(g), a = AD.setup(g, seat);
    assert.strictEqual(a.goldEdges.length, 1); assert.strictEqual(a.silverEdges.length, 1);
    [...a.goldEdges, ...a.silverEdges].forEach(e => { assert.ok(Gm.V[g.lastV].edges.includes(e)); assert.ok(g.eOwner[e] < 0); });
    assert.notStrictEqual(a.goldEdges[0], a.silverEdges[0]);
  }
});

test('main game: upgrades are legal now or 1-2 roads away, edges legal, build pick affordable', () => {
  need();
  let checked = 0;
  for (const n of [4, 6]) for (let seed = 1; seed <= 5; seed++) {
    let st = newGame(seed, n);
    st = playUntil(st, seed, s => s.phase === 'main' && s.turns >= 12 + seed);
    if (st.phase !== 'main') continue;
    const seat = st.turn, g = seen(st, seat), Gm = E.geo(g);
    const ups = AD.upgrades(g, seat);
    assert.ok(ups.length >= 1, 'some upgrade');
    const dist = AD.netDist(g, seat);
    ups.forEach(u => {
      if (u.kind === 'city') assert.ok(g.vOwner[u.v] === seat && g.vLevel[u.v] === 1, 'city goes on my own town');
      else {
        assert.ok(E.farEnough(g, u.v), 'town corner is open');
        assert.ok(u.d <= 2 && dist[u.v] === u.d, 'within 2 roads');
        if (u.d === 0) assert.ok(E.settleOk(g, seat, u.v), 'd = 0 means legal now');
      }
    });
    for (let i = 1; i < ups.length; i++) assert.ok(ups[i - 1].value >= ups[i].value, 'ranked');
    const legal = E.legalRoads(g, seat), r = AD.roads(g, seat, legal);
    assert.strictEqual(r.length, legal.length);
    r.slice(0, 2).forEach(x => assert.ok(E.roadOk(g, seat, x.e), 'suggested edge is legal'));
    // every affordability combination: the pick is only ever an affordable button
    const res = g.players[seat].res;
    const can = { road: E.canPay(res, E.COST.road) && legal.length > 0, settle: E.canPay(res, E.COST.settle) && E.legalSettles(g, seat).length > 0,
      city: E.canPay(res, E.COST.city) && g.vLevel.some((l, v) => l === 1 && g.vOwner[v] === seat), buy: E.canPay(res, E.COST.dev) && g.deck > 0 };
    const pick = AD.buttons(g, seat, can, ups, r.length ? r[0].score : 0);
    pick.forEach(k => assert.ok(can[k], `${k} is affordable`));
    assert.ok(pick.length <= 2 && new Set(pick).size === pick.length);
    const all = AD.buttons(g, seat, { road: true, settle: true, city: true, buy: true }, ups, 1);
    assert.strictEqual(all.length, 2);
    assert.deepStrictEqual(AD.buttons(g, seat, { road: false, settle: false, city: false, buy: false }, ups, 1), []);
    checked++;
  }
  assert.ok(checked >= 8, `checked ${checked} games`);
});

test('road ranking: a road that cuts an opponent off from a corner they were heading for scores a block', () => {
  need();
  let blocks = 0, tried = 0;
  for (let seed = 1; seed <= 6; seed++) {
    let st = newGame(seed, 4);
    st = playUntil(st, seed, s => s.phase === 'main' && s.turns >= 10);
    if (st.phase !== 'main') continue;
    const seat = st.turn, g = seen(st, seat), r = AD.roads(g, seat, E.legalRoads(g, seat));
    tried++;
    if (r.some(x => x.block > 0)) blocks++;
    r.forEach(x => assert.ok(Number.isFinite(x.score) && x.score >= 0));
  }
  assert.ok(tried >= 4);
  assert.ok(blocks >= 1, `some position offers a block (${blocks}/${tried})`);
});

// Speed. The other test files run at the same time and can make any wall-clock number 3x slower, so the hard
// check is on the work done (Advisor score calls, ~0.37 ms each on the 6-player board) plus a loose clock bound.
test('speed: setup advice on the 6-player board does bounded work', () => {
  need();
  const A = require('../js/advisor.js'), orig = A.scores;
  let calls = 0;
  A.scores = x => { calls++; return orig(x); };
  try {
    let worst = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const st = newGame(seed, 6), seat = st.order[0], g = seen(st, seat);
      calls = 0; AD.setup(g, seat); worst = Math.max(worst, calls);
    }
    assert.ok(worst <= 25, `at most 25 Advisor score calls for a 6-player first pick (worst ${worst})`);
  } finally { A.scores = orig; }
  let st = newGame(7, 6);
  const seat = st.order[0], g = seen(st, seat);
  const fastest = f => { let best = Infinity; for (let i = 0; i < 6; i++) { const t = process.hrtime.bigint(); f(); best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6); } return best; };
  const ms = fastest(() => AD.setup(g, seat));
  assert.ok(ms < 100, `setup advice took ${ms.toFixed(1)} ms`);
  st = playUntil(st, 7, s => s.phase === 'main' && s.turns >= 15);
  const g2 = seen(st, st.turn);
  const ms2 = fastest(() => { AD.upgrades(g2, st.turn); AD.roads(g2, st.turn, E.legalRoads(g2, st.turn)); });
  assert.ok(ms2 < 100, `main-game advice took ${ms2.toFixed(1)} ms`);
});
