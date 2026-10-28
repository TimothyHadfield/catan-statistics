// Catan rules engine: pure functions, JSON-safe state, all randomness from state.seed.
// Base game for 3-4 players: setup snake, production, 7 = discard + robber, building, dev cards,
// bank/port trades, player trades (offer -> answers -> pick), longest road, largest army, 10 VP.
(function (root) {
  'use strict';
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const COST = { road: [1, 1, 0, 0, 0], settle: [1, 1, 1, 1, 0], city: [0, 0, 0, 2, 3], dev: [0, 0, 1, 1, 1] };
  const PIECES = { road: 15, settle: 5, city: 4 };
  const DEV = { K: 14, V: 5, R: 2, P: 2, M: 2 }; // knight, victory point, road building, year of plenty, monopoly
  const DEV_BIG = { K: 6, V: 0, R: 1, P: 1, M: 1 }; // added for 5-6 players (34 cards)
  const COLORS = [
    { id: 'red', name: 'Red', hex: '#d2463c' }, { id: 'blue', name: 'Blue', hex: '#3d74d6' },
    { id: 'white', name: 'White', hex: '#ece6d8' }, { id: 'orange', name: 'Orange', hex: '#e8892f' },
    { id: 'green', name: 'Green', hex: '#4fae5c' }, { id: 'brown', name: 'Brown', hex: '#9a6a3e' },
  ];
  const pips = n => (n ? 6 - Math.abs(7 - n) : 0);

  // ------------------------------------------------------------ board geometry (unit size hexes)
  // Base board: pointy-top hexes in rows of 3-4-5-4-3. The 5-6 player board: flat-top hexes in
  // columns of 3-4-5-6-5-4-3 (30 tiles), so it lies wide like the base board on a phone screen.
  const S3 = Math.sqrt(3);
  function layout(lines, flat) {
    const out = [];
    lines.forEach((L, i) => {
      const r = i - (lines.length - 1) / 2;
      for (let k = 0; k < L; k++) {
        const along = S3 * (k - (L - 1) / 2);
        out.push(flat ? { x: 1.5 * r, y: along } : { x: along, y: 1.5 * r });
      }
    });
    return out;
  }
  function build(HEXES, rot, gaps) {
    const vmap = new Map(), verts = [];
    const key = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
    const hexV = HEXES.map(h => {
      const ids = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i + rot), x = h.x + Math.cos(a), y = h.y + Math.sin(a), k = key(x, y);
        if (!vmap.has(k)) { vmap.set(k, verts.length); verts.push({ x, y }); }
        ids.push(vmap.get(k));
      }
      return ids;
    });
    // renumber vertices top-to-bottom, left-to-right so ids are stable and readable
    const order = verts.map((v, i) => i).sort((a, b) => (Math.round(verts[a].y * 100) - Math.round(verts[b].y * 100)) || (verts[a].x - verts[b].x));
    const re = []; order.forEach((old, nw) => { re[old] = nw; });
    const V = order.map(o => ({ x: verts[o].x, y: verts[o].y, hexes: [], edges: [], adj: [] }));
    const hexVerts = hexV.map(ids => ids.map(i => re[i]));
    hexVerts.forEach((ids, h) => ids.forEach(v => V[v].hexes.push(h)));
    const emap = new Map(), E0 = [];
    hexVerts.forEach((ids, h) => {
      for (let i = 0; i < 6; i++) {
        const a = ids[i], b = ids[(i + 1) % 6], k = Math.min(a, b) + '-' + Math.max(a, b);
        if (!emap.has(k)) { emap.set(k, E0.length); E0.push({ v: [Math.min(a, b), Math.max(a, b)], hexes: [] }); }
        E0[emap.get(k)].hexes.push(h);
      }
    });
    const eo = E0.map((e, i) => i).sort((a, b) => {
      const ma = (V[E0[a].v[0]].y + V[E0[a].v[1]].y), mb = (V[E0[b].v[0]].y + V[E0[b].v[1]].y);
      return (Math.round(ma * 100) - Math.round(mb * 100)) || ((V[E0[a].v[0]].x + V[E0[a].v[1]].x) - (V[E0[b].v[0]].x + V[E0[b].v[1]].x));
    });
    const E = eo.map(o => E0[o]);
    E.forEach((e, i) => { const [a, b] = e.v; V[a].edges.push(i); V[b].edges.push(i); V[a].adj.push(b); V[b].adj.push(a); });
    // coast: edges with one hex, walked round the island by angle; harbours spaced by `gaps`
    const coast = E.map((e, i) => i).filter(i => E[i].hexes.length === 1);
    const ang = i => { const [a, b] = E[i].v; return Math.atan2((V[a].y + V[b].y) / 2, (V[a].x + V[b].x) / 2); };
    coast.sort((a, b) => ang(a) - ang(b));
    const portEdges = []; let at = 1;
    for (const g of gaps) { portEdges.push(coast[at % coast.length]); at += g; }
    const hexAdj = HEXES.map((h, i) => HEXES.map((o, j) => j).filter(j => j !== i && Math.abs(Math.hypot(HEXES[j].x - h.x, HEXES[j].y - h.y) - S3) < 0.01));
    return { V, E, hexVerts, coast, portEdges, HEXES, hexAdj, rot };
  }
  const HEXES = layout([3, 4, 5, 4, 3], false);
  const G = build(HEXES, -90, [3, 3, 4, 3, 3, 4, 3, 3, 4]);
  // 38 coast edges, 11 harbours: gaps add up to 38 and never put two harbours on one corner
  const BIG = build(layout([3, 4, 5, 6, 5, 4, 3], true), 0, [4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 3]);
  const geo = st => (st && st.rules && st.rules.big ? BIG : G);

  // ------------------------------------------------------------ rng
  function rnd(st) { let a = (st.seed = (st.seed + 0x6d2b79f5) | 0); let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function shuffle(st, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(st) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  // ------------------------------------------------------------ boards
  // Beginner board (the well-known fixed layout), rows of 3-4-5-4-3, -1 = desert.
  const BEGIN_RES = [4, 2, 0, 3, 1, 2, 1, 3, 0, -1, 0, 4, 0, 4, 3, 2, 1, 3, 2];
  const BEGIN_NUM = [10, 2, 9, 12, 6, 4, 10, 9, 11, 0, 3, 8, 8, 3, 4, 5, 5, 6, 11];
  const BEGIN_PORTS = ['any', 'sheep', 'any', 'any', 'brick', 'wood', 'any', 'wheat', 'ore'];
  const hexAdj = G.hexAdj;
  const red = n => n === 6 || n === 8;

  function randomBoard(st) {
    const res = shuffle(st, [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, -1]);
    let nums;
    for (let tries = 0; tries < 500; tries++) { // official advice: the red numbers (6 and 8) never touch
      nums = shuffle(st, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      const full = []; let k = 0; res.forEach(r => full.push(r < 0 ? 0 : nums[k++]));
      if (!full.some((n, i) => red(n) && hexAdj[i].some(j => red(full[j])))) { nums = full; break; }
      nums = full;
    }
    const ports = shuffle(st, ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore']);
    return { res, nums, ports };
  }

  // Fill tiles one at a time in random order, each taking a random item that clashes with no filled
  // neighbour (and keeps every corner at or under maxDots); start again on a dead end.
  function placeAll(st, Gm, items, holes, clash, maxDots) {
    const n = Gm.HEXES.length;
    for (let tries = 0; tries < 4000; tries++) {
      const out = new Array(n).fill(null), bag = shuffle(st, items.slice());
      holes.forEach(h => { out[h] = 0; });
      const order = shuffle(st, [...Array(n).keys()].filter(h => out[h] === null));
      let ok = true;
      for (const h of order) {
        const pickAt = bag.findIndex(x => !Gm.hexAdj[h].some(j => out[j] !== null && clash(x, out[j])) &&
          (!maxDots || Gm.hexVerts[h].every(v => Gm.V[v].hexes.reduce((a, k) => a + (k === h ? pips(x) : out[k] === null ? 0 : pips(out[k])), 0) <= maxDots)));
        if (pickAt < 0) { ok = false; break; }
        out[h] = bag.splice(pickAt, 1)[0];
      }
      if (ok) return out;
    }
    return null;
  }
  // 5-6 players: 30 tiles (6 wood, 5 brick, 6 sheep, 6 wheat, 5 ore, 2 deserts), 28 numbers, 11 harbours.
  // balanced: same resources never touch, same numbers never touch, 6/8 apart, no corner over 12 dots.
  function bigOrBalancedBoard(st, big, balanced) {
    const Gm = big ? BIG : G;
    const tiles = big ? [6, 5, 6, 6, 5] : [4, 3, 4, 4, 3], deserts = big ? 2 : 1;
    const numbers = big ? [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12]
      : [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    const all = []; tiles.forEach((c, r) => { for (let i = 0; i < c; i++) all.push(r); });
    let res = null, nums = null;
    for (let round = 0; round < 50 && !nums; round++) {
      if (balanced) {
        const placed = placeAll(st, Gm, all.concat(Array(deserts).fill(-1)), [], (a, b) => a >= 0 && a === b);
        if (!placed) continue;
        res = placed;
      } else res = shuffle(st, all.concat(Array(deserts).fill(-1)));
      const holes = res.map((r, h) => (r < 0 ? h : -1)).filter(h => h >= 0);
      nums = placeAll(st, Gm, numbers, holes, balanced ? (a, b) => a === b || (red(a) && red(b)) : (a, b) => red(a) && red(b), balanced ? 12 : 0);
    }
    const ports = shuffle(st, big ? ['any', 'any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'sheep', 'wheat', 'ore']
      : ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore']);
    return { res, nums, ports };
  }

  // ------------------------------------------------------------ new game
  // seats: [{ name, kind: 'human'|'cpu', level }] (3-6 of them)
  // rules: { board: 'random'|'beginner', vp: 10, friendly: false, balanced: false }; big (5-6 players) is set here
  function newGame(seats, rules, seed) {
    const n = seats.length;
    const st = { v: 1, seed: (seed >>> 0) || 1 };
    const R = Object.assign({ board: 'random', vp: 10, maxTurns: 600 }, rules || {});
    if (!(Number.isInteger(R.vp) && R.vp >= 8 && R.vp <= 13)) throw new Error('Play to 8-13 points');
    if (n >= 5) R.big = true; else delete R.big;
    if (R.big) R.maxTurns = Math.max(R.maxTurns, 900);
    // balanced applies to random boards (the beginner board is a fixed layout); 5-6 players are always random
    const b = R.big || (R.balanced && R.board !== 'beginner') ? bigOrBalancedBoard(st, !!R.big, !!R.balanced)
      : R.board === 'beginner' ? { res: BEGIN_RES.slice(), nums: BEGIN_NUM.slice(), ports: BEGIN_PORTS.slice() } : randomBoard(st);
    const Gm = R.big ? BIG : G;
    const deck = []; for (const k in DEV) for (let i = 0; i < DEV[k] + (R.big ? DEV_BIG[k] : 0); i++) deck.push(k);
    shuffle(st, deck);
    const order = []; for (let i = 0; i < n; i++) order.push(i); for (let i = n - 1; i >= 0; i--) order.push(i);
    Object.assign(st, {
      rules: R, n,
      players: seats.map((s, i) => ({ name: s.name || COLORS[i].name, kind: s.kind || 'human', level: s.level || 'medium', color: COLORS[i].id,
        res: [0, 0, 0, 0, 0], dev: [], fresh: [], knights: 0, vpCards: 0 })),
      hexRes: b.res, hexNum: b.nums, ports: b.ports.map((type, i) => ({ e: Gm.portEdges[i], type })),
      robber: b.res.indexOf(-1),
      vOwner: new Array(Gm.V.length).fill(-1), vLevel: new Array(Gm.V.length).fill(0), eOwner: new Array(Gm.E.length).fill(-1),
      bank: new Array(5).fill(R.big ? 24 : 19), deck, build: null,
      phase: 'setup', order, step: 0, sub: 'settle', lastV: -1,
      turn: 0, turns: 0, dice: null, devUsed: false, freeRoads: 0, discard: null, robberBack: 'main', offer: null, offers: 0,
      longest: { p: -1, len: 0 }, army: { p: -1, size: 0 }, roadLen: new Array(n).fill(0),
      winner: -1, log: [], rolls: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    return st;
  }

  // ------------------------------------------------------------ helpers
  const sum = a => (typeof a === 'number' ? a : a.reduce((x, y) => x + y, 0)); // views hold other hands as counts
  const canPay = (res, cost) => cost.every((c, i) => res[i] >= c);
  function pay(st, p, cost) { const P = st.players[p]; cost.forEach((c, i) => { P.res[i] -= c; st.bank[i] += c; }); }
  const count = (st, p, lvl) => st.vLevel.reduce((a, l, v) => a + (st.vOwner[v] === p && l === lvl ? 1 : 0), 0);
  const roadsLeft = (st, p) => PIECES.road - st.eOwner.filter(o => o === p).length;
  const settlesLeft = (st, p) => PIECES.settle - count(st, p, 1);
  const citiesLeft = (st, p) => PIECES.city - count(st, p, 2);
  function publicVP(st, p) { return count(st, p, 1) + 2 * count(st, p, 2) + (st.longest.p === p ? 2 : 0) + (st.army.p === p ? 2 : 0); }
  function vp(st, p) { return publicVP(st, p) + st.players[p].vpCards; }
  function log(st, e) { e.n = st.logN = (st.logN || 0) + 1; st.log.push(e); if (st.log.length > 40) st.log.splice(0, st.log.length - 40); }
  function farEnough(st, v) { return st.vOwner[v] < 0 && geo(st).V[v].adj.every(u => st.vOwner[u] < 0); }
  function portsOf(st, p) {
    const out = new Set();
    st.ports.forEach(pt => { if (geo(st).E[pt.e].v.some(v => st.vOwner[v] === p)) out.add(pt.type); });
    return out;
  }
  function rate(st, p, r) { const ps = portsOf(st, p); return ps.has(RES[r]) ? 2 : ps.has('any') ? 3 : 4; }
  // a road may go on edge e if it's empty and touches p's building, or p's road through a vertex nobody else holds
  function roadOk(st, p, e) {
    if (st.eOwner[e] >= 0) return false;
    return geo(st).E[e].v.some(v => st.vOwner[v] === p || (st.vOwner[v] < 0 && geo(st).V[v].edges.some(f => f !== e && st.eOwner[f] === p)));
  }
  function settleOk(st, p, v) { return farEnough(st, v) && geo(st).V[v].edges.some(e => st.eOwner[e] === p); }
  function legalRoads(st, p) { const out = []; for (let e = 0; e < geo(st).E.length; e++) if (roadOk(st, p, e)) out.push(e); return out; }
  function legalSettles(st, p) { const out = []; for (let v = 0; v < geo(st).V.length; v++) if (settleOk(st, p, v)) out.push(v); return out; }
  function setupSpots(st) { const out = []; for (let v = 0; v < geo(st).V.length; v++) if (farEnough(st, v)) out.push(v); return out; }
  function playable(st, p, k) { const P = st.players[p]; return P.dev.filter(c => c === k).length - P.fresh.filter(c => c === k).length; }

  // longest continuous road for p (roads are cut by other players' buildings)
  function longestRoad(st, p) {
    const mine = []; st.eOwner.forEach((o, e) => { if (o === p) mine.push(e); });
    if (!mine.length) return 0;
    let best = 0; const used = new Set();
    function dfs(v, len) {
      if (len > best) best = len;
      if (st.vOwner[v] >= 0 && st.vOwner[v] !== p && len > 0) return;
      for (const e of geo(st).V[v].edges) {
        if (st.eOwner[e] !== p || used.has(e)) continue;
        used.add(e); const [a, b] = geo(st).E[e].v; dfs(a === v ? b : a, len + 1); used.delete(e);
      }
    }
    for (const e of mine) for (const v of geo(st).E[e].v) dfs(v, 0);
    return best;
  }
  function updateLongest(st) {
    const L = st.players.map((_, p) => longestRoad(st, p)); st.roadLen = L;
    const h = st.longest.p;
    const max = Math.max(...L);
    if (h >= 0 && L[h] >= 5 && L[h] === max) { st.longest.len = L[h]; return; } // holder keeps it on a tie
    const top = L.map((l, i) => i).filter(i => L[i] === max);
    const prev = h;
    if (max >= 5 && top.length === 1) st.longest = { p: top[0], len: max };
    else st.longest = { p: -1, len: 0 }; // holder broken and a tie (or nobody at 5): set aside
    if (st.longest.p !== prev) log(st, { k: 'longest', p: st.longest.p, from: prev, len: st.longest.len });
  }
  function checkWin(st) {
    if (st.phase === 'over') return;
    const p = st.turn;
    if (vp(st, p) >= st.rules.vp) { st.winner = p; st.phase = 'over'; log(st, { k: 'win', p }); }
  }

  function produce(st, roll) {
    const want = st.players.map(() => [0, 0, 0, 0, 0]);
    st.hexNum.forEach((num, h) => {
      if (num !== roll || h === st.robber) return;
      const r = st.hexRes[h];
      for (const v of geo(st).hexVerts[h]) if (st.vOwner[v] >= 0) want[st.vOwner[v]][r] += st.vLevel[v];
    });
    const got = st.players.map(() => [0, 0, 0, 0, 0]);
    for (let r = 0; r < 5; r++) {
      const total = want.reduce((a, w) => a + w[r], 0), who = want.filter(w => w[r] > 0).length;
      if (!total) continue;
      if (total <= st.bank[r]) want.forEach((w, p) => { got[p][r] = w[r]; });
      else if (who === 1) want.forEach((w, p) => { if (w[r]) got[p][r] = st.bank[r]; }); // short bank, one taker: gets what's left
      // short bank, several takers: nobody gets that resource
    }
    got.forEach((g, p) => g.forEach((c, r) => { st.players[p].res[r] += c; st.bank[r] -= c; }));
    return got;
  }

  // ------------------------------------------------------------ who acts
  function actors(st) {
    if (st.phase === 'over') return [];
    if (st.phase === 'setup') return [st.order[st.step]];
    if (st.phase === 'discard') return Object.keys(st.discard).map(Number).sort((a, b) => a - b);
    if (st.phase === 'trade' && st.offer && st.offer.stage === 'ask') return st.offer.resp.map((r, i) => (r === null ? i : -1)).filter(i => i >= 0);
    if (st.phase === 'build') return [st.build.queue[0]];
    return [st.turn];
  }

  // ------------------------------------------------------------ 5-6 players: special build phase
  // After each turn, every other player in order may build (roads, towns, cities, cards) but not
  // trade or play cards. Players who can't afford anything they could place are skipped.
  function canBuildAny(st, q) {
    const R = st.players[q].res;
    if (canPay(R, COST.dev) && st.deck.length) return true;
    if (canPay(R, COST.city) && citiesLeft(st, q) && st.vOwner.some((o, v) => o === q && st.vLevel[v] === 1)) return true;
    if (canPay(R, COST.settle) && settlesLeft(st, q) && legalSettles(st, q).length) return true;
    return canPay(R, COST.road) && roadsLeft(st, q) > 0 && legalRoads(st, q).length > 0;
  }
  function advanceBuild(st) {
    const Q = st.build.queue;
    while (Q.length && !canBuildAny(st, Q[0])) Q.shift();
    if (Q.length) { st.phase = 'build'; return; }
    st.build = null; nextTurn(st);
  }
  function endTurn(st, p) {
    log(st, { k: 'end', p });
    if (st.rules.big) {
      const queue = []; for (let i = 1; i < st.n; i++) queue.push((st.turn + i) % st.n);
      st.build = { queue }; advanceBuild(st);
    } else nextTurn(st);
  }
  function nextTurn(st) {
    st.turn = (st.turn + 1) % st.n; st.turns++; st.phase = 'roll'; st.devUsed = false; st.offers = 0;
    st.players.forEach(Q => { Q.fresh = []; }); st.dice = null;
    if (st.turns >= st.rules.maxTurns) { // safety valve for endless games: most points wins
      let best = 0; for (let i = 1; i < st.n; i++) if (vp(st, i) > vp(st, best)) best = i;
      st.winner = best; st.phase = 'over'; log(st, { k: 'win', p: best, timeout: 1 });
    }
  }

  // ------------------------------------------------------------ apply
  function fail(msg) { throw new Error(msg); }
  const isHand = a => Array.isArray(a) && a.length === 5 && a.every(x => Number.isInteger(x) && x >= 0);

  function apply(st, seat, a) {
    if (!a || typeof a !== 'object') fail('No move');
    if (!actors(st).includes(seat)) fail('Not your turn');
    const P = st.players[seat];
    switch (st.phase) {
      case 'setup': return setupMove(st, seat, a);
      case 'discard': {
        if (a.t !== 'discard' || !isHand(a.cards)) fail('Discard cards');
        if (sum(a.cards) !== st.discard[seat]) fail('Discard exactly ' + st.discard[seat]);
        if (!canPay(P.res, a.cards)) fail('You don\'t have those');
        pay(st, seat, a.cards); delete st.discard[seat];
        log(st, { k: 'discard', p: seat, c: sum(a.cards) });
        if (!Object.keys(st.discard).length) { st.discard = null; st.phase = 'robber'; }
        return st;
      }
      case 'robber': return robberMove(st, seat, a);
      case 'roads': {
        if (a.t === 'road') {
          if (!roadOk(st, seat, a.e)) fail('Can\'t build there');
          st.eOwner[a.e] = seat; st.freeRoads--; log(st, { k: 'road', p: seat, e: a.e, free: 1 });
          updateLongest(st);
        } else if (a.t !== 'stop') fail('Place your free roads');
        if (a.t === 'stop' || st.freeRoads <= 0 || !roadsLeft(st, seat) || !legalRoads(st, seat).length) { st.freeRoads = 0; st.phase = st.roadsBack || 'main'; }
        checkWin(st); return st;
      }
      case 'trade': return tradeMove(st, seat, a);
      case 'roll':
        if (a.t === 'play') return playDev(st, seat, a); // any card may be played before the roll
        if (a.t !== 'roll') fail('Roll the dice first');
        return roll(st);
      case 'main': return mainMove(st, seat, a);
      case 'build':
        if (!['road', 'settle', 'city', 'buy', 'end'].includes(a.t)) fail('Extra build: build or pass only');
        return mainMove(st, seat, a);
    }
    fail('Game over');
  }

  function setupMove(st, p, a) {
    if (st.sub === 'settle') {
      if (a.t !== 'settle' || !(a.v >= 0 && a.v < geo(st).V.length) || !farEnough(st, a.v)) fail('Pick an open corner (not next to a town)');
      st.vOwner[a.v] = p; st.vLevel[a.v] = 1; st.lastV = a.v; st.sub = 'road';
      const second = st.step >= st.n, gain = [0, 0, 0, 0, 0];
      if (second) geo(st).V[a.v].hexes.forEach(h => { const r = st.hexRes[h]; if (r >= 0 && st.bank[r] > 0) { st.players[p].res[r]++; st.bank[r]--; gain[r]++; } });
      log(st, { k: 'settle', p, v: a.v, setup: 1, gain: second ? gain : null });
      return st;
    }
    if (a.t !== 'road' || !(a.e >= 0 && a.e < geo(st).E.length) || st.eOwner[a.e] >= 0 || !geo(st).E[a.e].v.includes(st.lastV)) fail('Put the road next to your new town');
    st.eOwner[a.e] = p; st.sub = 'settle'; st.lastV = -1; st.step++;
    log(st, { k: 'road', p, e: a.e, setup: 1 });
    if (st.step >= st.order.length) { st.phase = 'roll'; st.turn = 0; updateLongest(st); }
    return st;
  }

  function roll(st) {
    checkWin(st); if (st.phase === 'over') return st; // points gained on another's turn win now
    const d =[1 + Math.floor(rnd(st) * 6), 1 + Math.floor(rnd(st) * 6)], t = d[0] + d[1];
    st.dice = d; st.rolls[t]++;
    if (t === 7) {
      const dis = {};
      st.players.forEach((P, i) => { const c = sum(P.res); if (c > 7) dis[i] = Math.floor(c / 2); });
      log(st, { k: 'roll', p: st.turn, d, gain: null });
      st.robberBack = 'main';
      if (Object.keys(dis).length) { st.discard = dis; st.phase = 'discard'; } else st.phase = 'robber';
      return st;
    }
    const gain = produce(st, t);
    log(st, { k: 'roll', p: st.turn, d, gain });
    st.phase = 'main';
    return st;
  }

  // victims you may rob at hex h: other players with a building there and at least one card
  function victims(st, p, h) {
    const s = new Set();
    for (const v of geo(st).hexVerts[h]) { const o = st.vOwner[v]; if (o >= 0 && o !== p && sum(st.players[o].res) > 0) s.add(o); }
    return [...s].sort((a, b) => a - b);
  }
  // tiles the robber may move to. Friendly robber: not a tile touching another player on 2 points
  // or fewer (shown points), unless that rules out every tile.
  function robberHexes(st, p) {
    const n = geo(st).HEXES.length, all = [];
    for (let h = 0; h < n; h++) if (h !== st.robber) all.push(h);
    if (!st.rules.friendly) return all;
    const ok = all.filter(h => !geo(st).hexVerts[h].some(v => { const o = st.vOwner[v]; return o >= 0 && o !== p && publicVP(st, o) <= 2; }));
    return ok.length ? ok : all;
  }
  function robberMove(st, p, a) {
    if (a.t !== 'robber' || !(a.h >= 0 && a.h < geo(st).HEXES.length) || a.h === st.robber) fail('Move the robber to another tile');
    if (!robberHexes(st, p).includes(a.h)) fail('Friendly robber: not next to a player on 2 points');
    const vs = victims(st, p, a.h);
    let from = -1;
    if (vs.length) { if (!vs.includes(a.from)) fail('Pick who to rob'); from = a.from; }
    st.robber = a.h;
    let got = -1;
    if (from >= 0) {
      const R = st.players[from].res, tot = sum(R); let k = Math.floor(rnd(st) * tot);
      for (let r = 0; r < 5; r++) { if (k < R[r]) { got = r; break; } k -= R[r]; }
      R[got]--; st.players[p].res[got]++;
    }
    log(st, { k: 'robber', p, h: a.h, from, r: got });
    st.phase = st.robberBack;
    checkWin(st);
    return st;
  }

  function playDev(st, p, a) {
    const P = st.players[p];
    if (st.devUsed) fail('One development card per turn');
    if (!['K', 'R', 'P', 'M'].includes(a.card) || playable(st, p, a.card) < 1) fail('You can\'t play that card now');
    P.dev.splice(P.dev.indexOf(a.card), 1); st.devUsed = true;
    if (a.card === 'K') {
      P.knights++;
      if (P.knights >= 3 && P.knights > st.army.size && st.army.p !== p) { const from = st.army.p; st.army = { p, size: P.knights }; log(st, { k: 'army', p, from }); }
      else if (st.army.p === p) st.army.size = P.knights;
      st.robberBack = st.phase === 'roll' ? 'roll' : 'main'; st.phase = 'robber';
      log(st, { k: 'play', p, card: 'K' });
    } else if (a.card === 'R') {
      st.freeRoads = Math.min(2, roadsLeft(st, p));
      log(st, { k: 'play', p, card: 'R' });
      st.roadsBack = st.phase === 'roll' ? 'roll' : 'main';
      if (st.freeRoads > 0 && legalRoads(st, p).length) st.phase = 'roads'; else st.freeRoads = 0;
    } else if (a.card === 'P') {
      const want = [a.r1, a.r2];
      if (!want.every(r => r >= 0 && r < 5)) fail('Pick two resources');
      const need = [0, 0, 0, 0, 0]; want.forEach(r => need[r]++);
      if (!need.every((c, r) => st.bank[r] >= c)) fail('The bank is out of that');
      want.forEach(r => { P.res[r]++; st.bank[r]--; });
      log(st, { k: 'play', p, card: 'P', got: want });
    } else {
      const r = a.r1; if (!(r >= 0 && r < 5)) fail('Pick a resource');
      let n = 0; st.players.forEach((Q, i) => { if (i !== p) { n += Q.res[r]; Q.res[r] = 0; } });
      P.res[r] += n;
      log(st, { k: 'play', p, card: 'M', r, n });
    }
    checkWin(st);
    return st;
  }

  function mainMove(st, p, a) {
    const P = st.players[p];
    switch (a.t) {
      case 'road':
        if (!roadsLeft(st, p)) fail('No roads left');
        if (!canPay(P.res, COST.road)) fail('Need wood + brick');
        if (!(a.e >= 0 && a.e < geo(st).E.length) || !roadOk(st, p, a.e)) fail('Roads must join your roads or towns');
        pay(st, p, COST.road); st.eOwner[a.e] = p; log(st, { k: 'road', p, e: a.e });
        updateLongest(st); break;
      case 'settle':
        if (!settlesLeft(st, p)) fail('No settlements left');
        if (!canPay(P.res, COST.settle)) fail('Need wood, brick, sheep, wheat');
        if (!(a.v >= 0 && a.v < geo(st).V.length) || !settleOk(st, p, a.v)) fail('Needs your road and no town next door');
        pay(st, p, COST.settle); st.vOwner[a.v] = p; st.vLevel[a.v] = 1; log(st, { k: 'settle', p, v: a.v });
        updateLongest(st); break;
      case 'city':
        if (!citiesLeft(st, p)) fail('No cities left');
        if (!canPay(P.res, COST.city)) fail('Need 2 wheat + 3 ore');
        if (!(a.v >= 0) || st.vOwner[a.v] !== p || st.vLevel[a.v] !== 1) fail('Upgrade one of your settlements');
        pay(st, p, COST.city); st.vLevel[a.v] = 2; log(st, { k: 'city', p, v: a.v }); break;
      case 'buy': {
        if (!st.deck.length) fail('No development cards left');
        if (!canPay(P.res, COST.dev)) fail('Need sheep, wheat, ore');
        pay(st, p, COST.dev); const c = st.deck.pop(); P.dev.push(c); P.fresh.push(c);
        if (c === 'V') P.vpCards++;
        log(st, { k: 'buy', p }); break;
      }
      case 'play': return playDev(st, p, a);
      case 'bank': {
        const g = a.give, w = a.get;
        if (!(g >= 0 && g < 5 && w >= 0 && w < 5) || g === w) fail('Pick what to give and get');
        const k = rate(st, p, g);
        if (P.res[g] < k) fail('Need ' + k + ' ' + RES[g]);
        if (st.bank[w] < 1) fail('The bank is out of ' + RES[w]);
        P.res[g] -= k; st.bank[g] += k; P.res[w]++; st.bank[w]--;
        log(st, { k: 'bank', p, give: g, c: k, get: w }); break;
      }
      case 'offer': {
        if (!isHand(a.give) || !isHand(a.get) || !sum(a.give) || !sum(a.get)) fail('Pick cards to give and get');
        if (a.give.some((c, r) => c && a.get[r])) fail('Don\'t ask for what you give');
        if (!canPay(P.res, a.give)) fail('You don\'t have those');
        if (st.offers >= 3) fail('Three offers a turn');
        st.offers++;
        const resp = st.players.map((Q, i) => (i === p ? false : canPay(Q.res, a.get) ? null : false));
        st.offer = { from: p, give: a.give.slice(), get: a.get.slice(), resp, stage: 'ask' };
        st.phase = 'trade';
        log(st, { k: 'offer', p, give: a.give.slice(), get: a.get.slice() });
        if (resp.every(r => r !== null)) settleAsk(st);
        return st;
      }
      case 'end':
        if (st.phase === 'build') { log(st, { k: 'pass', p }); st.build.queue.shift(); advanceBuild(st); return st; }
        endTurn(st, p);
        return st;
      default: fail('Not a move');
    }
    if (st.phase === 'build') { // points built here count when your own turn comes
      if (!canBuildAny(st, p)) { st.build.queue.shift(); advanceBuild(st); }
      return st;
    }
    checkWin(st);
    return st;
  }

  function settleAsk(st) {
    const o = st.offer;
    if (o.resp.some(r => r === true)) o.stage = 'pick';
    else { log(st, { k: 'nodeal', p: o.from }); st.offer = null; st.phase = 'main'; }
  }
  function tradeMove(st, seat, a) {
    const o = st.offer;
    if (o.stage === 'ask') {
      if (a.t !== 'answer') fail('Accept or decline');
      o.resp[seat] = !!a.yes && canPay(st.players[seat].res, o.get);
      if (o.resp.every(r => r !== null)) settleAsk(st);
      return st;
    }
    if (a.t === 'cancel') { log(st, { k: 'nodeal', p: o.from }); st.offer = null; st.phase = 'main'; return st; }
    if (a.t !== 'deal' || o.resp[a.with] !== true) fail('Pick who to trade with');
    const A = st.players[o.from], B = st.players[a.with];
    if (!canPay(A.res, o.give) || !canPay(B.res, o.get)) fail('Someone no longer has the cards');
    for (let r = 0; r < 5; r++) { A.res[r] += o.get[r] - o.give[r]; B.res[r] += o.give[r] - o.get[r]; }
    log(st, { k: 'deal', p: o.from, with: a.with, give: o.give, get: o.get });
    st.offer = null; st.phase = 'main';
    checkWin(st);
    return st;
  }

  // ------------------------------------------------------------ views
  // what everyone at the table can see: hands and dev cards as counts, no deck order, no seed,
  // no hidden victory-point cards, and a steal shows who robbed whom but not the card
  function view(st) {
    const g = JSON.parse(JSON.stringify(st));
    delete g.seed;
    g.deck = st.deck.length;
    g.players.forEach((P, i) => { P.res = sum(st.players[i].res); P.dev = st.players[i].dev.length; P.fresh = st.players[i].fresh.length; P.vpCards = 0; });
    g.log.forEach(e => { if (e.k === 'robber') e.r = e.from >= 0 ? -2 : -1; });
    if (g.phase !== 'over') g.winner = -1;
    else g.players.forEach((P, i) => { P.vpCards = st.players[i].vpCards; });
    return g;
  }

  const api = { RES, COST, PIECES, DEV, DEV_BIG, COLORS, G, BIG, geo, HEXES, pips, hexAdj, newGame, apply, actors, vp, publicVP, rate, portsOf,
    robberHexes, canBuildAny,
    roadOk, settleOk, legalRoads, legalSettles, setupSpots, farEnough, playable, longestRoad, victims, view, sum, canPay,
    roadsLeft, settlesLeft, citiesLeft, rnd, BEGIN_RES, BEGIN_NUM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CatanEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
