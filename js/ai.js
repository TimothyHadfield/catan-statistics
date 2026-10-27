// Catan computer players. choose(state, seat, rng) -> one legal action.
// They only read the public table plus their own hand (never another player's cards or the deck).
// Easy: rough placements, builds whatever it can, no trading with people, random robber.
// Medium: good placements, builds toward a plan, bank/port trades, fair 1-for-1 offers.
// Hard: Medium plus resource-balanced starts, ports, leader-aware robber and trades, dev-card timing.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./engine.js') : root.CatanEngine;
  const { G, COST, pips, sum, canPay } = E;
  const BASE = [1.0, 1.0, 0.85, 1.05, 1.0];

  // scarce resources (fewer pips on this board) are worth more
  const HARD = BASE; // tried wheat/ore-heavy weights for Hard (400 games each): no measurable gain
  function weights(st, lvl) {
    const tot = [0, 0, 0, 0, 0];
    st.hexRes.forEach((r, h) => { if (r >= 0) tot[r] += pips(st.hexNum[h]); });
    const avg = sum(tot) / 5, B = lvl === 'hard' ? HARD : BASE;
    return tot.map((t, r) => B[r] * Math.sqrt(avg / Math.max(3, t)));
  }
  function prodOf(st, p) { // expected cards per 36 rolls, per resource
    const out = [0, 0, 0, 0, 0];
    st.vOwner.forEach((o, v) => { if (o !== p) return; G.V[v].hexes.forEach(h => { const r = st.hexRes[h]; if (r >= 0 && h !== st.robber) out[r] += pips(st.hexNum[h]) * st.vLevel[v]; }); });
    return out;
  }
  function spotValue(st, v, w, have, lvl) {
    let s = 0; const got = new Set();
    for (const h of G.V[v].hexes) {
      const r = st.hexRes[h]; if (r < 0) continue;
      const pv = pips(st.hexNum[h]);
      s += pv * w[r] * (h === st.robber ? 0.5 : 1);
      if (lvl === 'hard' && have) s += pv * 0.35 * w[r] * (have[r] < 3 ? 1 : 0); // fills a gap in what I produce
      got.add(r);
    }
    if (lvl !== 'easy') s += got.size * 0.9;
    const port = st.ports.find(pt => G.E[pt.e].v.includes(v));
    if (port && lvl !== 'easy') {
      if (port.type === 'any') s += 1.2;
      else { const r = E.RES.indexOf(port.type); s += have ? Math.min(3, have[r] * 0.25) : 0.6; }
    }
    return s;
  }
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

  // ------------------------------------------------------------ setup
  function setupMove(st, p, lvl, rng) {
    const w = weights(st, lvl);
    if (st.sub === 'settle') {
      const spots = E.setupSpots(st);
      const have = prodOf(st, p), first = have.every(x => x === 0);
      const scored = spots.map(v => ({ v, s: lvl === 'easy' ? G.V[v].hexes.reduce((a, h) => a + pips(st.hexNum[h]), 0) : spotValue(st, v, w, first ? null : have, lvl) }));
      scored.sort((a, b) => b.s - a.s);
      if (lvl === 'easy') return { t: 'settle', v: pick(scored.slice(0, 10), rng).v };
      if (lvl === 'medium') return { t: 'settle', v: pick(scored.slice(0, 2), rng).v };
      return { t: 'settle', v: scored[0].v };
    }
    // road from the new town toward the best open corner two steps away
    const opts = G.V[st.lastV].edges.filter(e => st.eOwner[e] < 0);
    if (lvl === 'easy') return { t: 'road', e: pick(opts, rng) };
    let best = opts[0], bs = -1;
    for (const e of opts) {
      const far = G.E[e].v[0] === st.lastV ? G.E[e].v[1] : G.E[e].v[0];
      let s = 0;
      for (const u of G.V[far].adj) if (u !== st.lastV && E.farEnough(st, u)) s = Math.max(s, spotValue(st, u, w, null, lvl));
      if (s > bs) { bs = s; best = e; }
    }
    return { t: 'road', e: best };
  }

  // ------------------------------------------------------------ planning helpers
  // shortest path of empty edges from my network to a target corner (returns first edge, length)
  function pathTo(st, p, target) {
    const dist = new Map(), first = new Map(), q = [];
    st.vOwner.forEach((o, v) => { if (o === p) { dist.set(v, 0); q.push(v); } });
    st.eOwner.forEach((o, e) => { if (o === p) for (const v of G.E[e].v) if (!dist.has(v) && (st.vOwner[v] < 0 || st.vOwner[v] === p)) { dist.set(v, 0); q.push(v); } });
    for (let i = 0; i < q.length; i++) {
      const v = q[i], d = dist.get(v);
      if (d >= 4) continue;
      if (st.vOwner[v] >= 0 && st.vOwner[v] !== p) continue;
      for (const e of G.V[v].edges) {
        if (st.eOwner[e] >= 0) continue;
        const u = G.E[e].v[0] === v ? G.E[e].v[1] : G.E[e].v[0];
        if (dist.has(u)) continue;
        dist.set(u, d + 1); first.set(u, d === 0 ? e : first.get(v)); q.push(u);
      }
    }
    if (!dist.has(target)) return null;
    return { e: first.get(target), len: dist.get(target) };
  }
  function bestTarget(st, p, w, lvl) {
    const have = prodOf(st, p);
    let best = null;
    for (let v = 0; v < G.V.length; v++) {
      if (!E.farEnough(st, v)) continue;
      const path = E.settleOk(st, p, v) ? { e: -1, len: 0 } : pathTo(st, p, v);
      if (!path || path.len > (lvl === 'hard' ? 3 : 2)) continue;
      const s = spotValue(st, v, w, have, lvl) - path.len * 2.2;
      if (!best || s > best.s) best = { v, s, path };
    }
    return best;
  }
  function needValue(st, p, w) { // how much I want one more of each resource right now
    const P = st.players[p], have = prodOf(st, p);
    return w.map((x, r) => x * (1 + 0.6 / (1 + P.res[r])) * (have[r] < 4 ? 1.3 : 1));
  }

  // what to build next and what it costs
  function plans(st, p, w, lvl) {
    const out = [];
    const myS = []; st.vOwner.forEach((o, v) => { if (o === p && st.vLevel[v] === 1) myS.push(v); });
    if (E.citiesLeft(st, p) && myS.length) {
      myS.sort((a, b) => spotValue(st, b, w, null, 'medium') - spotValue(st, a, w, null, 'medium'));
      out.push({ kind: 'city', cost: COST.city, act: { t: 'city', v: myS[0] } });
    }
    const tgt = E.settlesLeft(st, p) ? bestTarget(st, p, w, lvl) : null;
    if (tgt && tgt.path.len === 0) out.push({ kind: 'settle', cost: COST.settle, act: { t: 'settle', v: tgt.v } });
    if (tgt && tgt.path.len > 0 && E.roadsLeft(st, p)) out.push({ kind: 'road', cost: COST.road, act: { t: 'road', e: tgt.path.e } });
    if (st.deck.length) out.push({ kind: 'dev', cost: COST.dev, act: { t: 'buy' } });
    // settlement first when a spot is ready (it's the cheaper point), else city
    const order = { settle: 0, city: 1, road: 2, dev: 3 };
    if (lvl === 'hard' && myS.length && E.settlesLeft(st, p) <= 1) order.city = -1;
    out.sort((a, b) => order[a.kind] - order[b.kind]);
    return { list: out, tgt };
  }

  function bankTrade(st, p, plan) {
    const P = st.players[p], miss = plan.cost.map((c, r) => Math.max(0, c - P.res[r]));
    const need = sum(miss); if (!need) return null;
    const spare = P.res.map((c, r) => c - plan.cost[r]);
    let trades = 0, getR = miss.findIndex(x => x > 0);
    let giveBest = -1, giveRate = 9;
    for (let r = 0; r < 5; r++) { const k = E.rate(st, p, r); if (spare[r] >= k) trades += Math.floor(spare[r] / k); if (spare[r] >= k && (k < giveRate || (k === giveRate && spare[r] > spare[giveBest]))) { giveBest = r; giveRate = k; } }
    if (trades < need || giveBest < 0 || st.bank[getR] < 1) return null;
    return { t: 'bank', give: giveBest, get: getR };
  }
  function offerFor(st, p, plan, lvl) {
    const P = st.players[p], miss = plan.cost.map((c, r) => Math.max(0, c - P.res[r]));
    if (sum(miss) !== 1 || st.offers >= (lvl === 'hard' ? 2 : 1)) return null;
    const spare = P.res.map((c, r) => c - plan.cost[r]);
    let g = -1; for (let r = 0; r < 5; r++) if (spare[r] > 0 && (g < 0 || spare[r] > spare[g])) g = r;
    if (g < 0) return null;
    const give = [0, 0, 0, 0, 0], get = [0, 0, 0, 0, 0]; give[g] = 1; get[miss.findIndex(x => x)] = 1;
    // nobody can pay? don't bother
    if (!st.players.some((Q, i) => i !== p && (typeof Q.res === 'number' ? Q.res > 0 : sum(Q.res) > 0))) return null;
    return { t: 'offer', give, get };
  }

  // ------------------------------------------------------------ robber
  function robberMove(st, p, lvl, rng) {
    const vpOf = i => E.publicVP(st, i);
    const cards = i => (typeof st.players[i].res === 'number' ? st.players[i].res : sum(st.players[i].res));
    const cands = [];
    for (let h = 0; h < 19; h++) {
      if (h === st.robber) continue;
      let mine = 0, hurt = 0;
      for (const v of G.hexVerts[h]) {
        const o = st.vOwner[v]; if (o < 0) continue;
        if (o === p) mine += st.vLevel[v];
        else hurt += st.vLevel[v] * (1 + (lvl === 'hard' ? vpOf(o) * 0.25 : 0.1 * vpOf(o)));
      }
      const s = (st.hexRes[h] < 0 ? 0 : pips(st.hexNum[h])) * (hurt - mine * 2.5) + (E.victims(st, p, h).length ? 1 : 0);
      cands.push({ h, s });
    }
    cands.sort((a, b) => b.s - a.s);
    const h = lvl === 'easy' ? pick(cands.slice(0, 8), rng).h : cands[0].h;
    const vs = E.victims(st, p, h);
    let from = -1;
    if (vs.length) from = lvl === 'easy' ? pick(vs, rng) : vs.slice().sort((a, b) => (vpOf(b) - vpOf(a)) || (cards(b) - cards(a)))[0];
    return { t: 'robber', h, from };
  }

  function discardMove(st, p, lvl) {
    const P = st.players[p], n = st.discard[p];
    const keep = P.res.slice(), out = [0, 0, 0, 0, 0], w = weights(st, lvl);
    const goal = lvl === 'easy' ? [1, 1, 1, 1, 1] : [1, 1, 1, 2, 3];
    for (let k = 0; k < n; k++) {
      let r = -1, rs = 1e9;
      for (let i = 0; i < 5; i++) {
        if (!keep[i]) continue;
        const s = w[i] * (keep[i] <= goal[i] ? 3 : 1) / keep[i];
        if (s < rs) { rs = s; r = i; }
      }
      keep[r]--; out[r]++;
    }
    return { t: 'discard', cards: out };
  }

  // ------------------------------------------------------------ answering a trade offer
  function answer(st, p, lvl, rng) {
    const o = st.offer, w = weights(st, lvl);
    if (lvl === 'easy') return { t: 'answer', yes: sum(o.give) >= sum(o.get) && rng() < 0.5 };
    if (E.publicVP(st, o.from) >= st.rules.vp - 2) return { t: 'answer', yes: false }; // don't feed a near-winner
    const nv = needValue(st, p, w), P = st.players[p];
    let gain = 0, loss = 0;
    for (let r = 0; r < 5; r++) { gain += o.give[r] * nv[r]; loss += o.get[r] * w[r] * (P.res[r] - o.get[r] < 1 ? 1.5 : 1); }
    return { t: 'answer', yes: gain > loss * (lvl === 'hard' ? 1.1 : 1.0) };
  }

  // ------------------------------------------------------------ the turn
  function devMove(st, p, lvl, w, pl) {
    if (st.devUsed || lvl === 'easy' && st.phase !== 'main') return null;
    const P = st.players[p];
    const has = k => E.playable(st, p, k) > 0;
    const myOnRobber = G.hexVerts[st.robber].some(v => st.vOwner[v] === p);
    if (has('K')) {
      const armyGain = P.knights + 1 >= 3 && P.knights + 1 > st.army.size && st.army.p !== p;
      if (myOnRobber || armyGain || (lvl === 'easy')) return { t: 'play', card: 'K' };
    }
    if (st.phase !== 'main') return null;
    if (has('R') && pl.tgt && pl.tgt.path.len > 0 && E.roadsLeft(st, p) >= 1) return { t: 'play', card: 'R' };
    const first = pl.list.find(x => x.kind !== 'dev' && x.kind !== 'road') || pl.list[0];
    if (has('P') && first) {
      const miss = first.cost.map((c, r) => Math.max(0, c - P.res[r]));
      if (sum(miss) >= 1 && sum(miss) <= 2) {
        const rs = []; miss.forEach((m, r) => { for (let i = 0; i < m; i++) rs.push(r); });
        while (rs.length < 2) rs.push(w.indexOf(Math.max(...w)));
        if (rs.every((r, i) => st.bank[r] >= rs.filter(x => x === r).length)) return { t: 'play', card: 'P', r1: rs[0], r2: rs[1] };
      }
    }
    if (has('M') && lvl !== 'easy') {
      const others = st.players.reduce((a, Q, i) => a + (i === p ? 0 : (typeof Q.res === 'number' ? Q.res : sum(Q.res))), 0);
      if (others >= 10) { // ask for what I most need for my next build
        const miss = first ? first.cost.map((c, r) => Math.max(0, c - P.res[r])) : [0, 0, 0, 0, 0];
        let r = miss.indexOf(Math.max(...miss)); if (!miss[r]) r = 3;
        return { t: 'play', card: 'M', r1: r };
      }
    }
    return null;
  }

  function mainMove(st, p, lvl, rng) {
    const P = st.players[p], w = weights(st, lvl);
    const pl = plans(st, p, w, lvl);
    const dev = devMove(st, p, lvl, w, pl); if (dev) return dev;
    if (lvl === 'easy') {
      const opts = pl.list.filter(x => canPay(P.res, x.cost));
      if (opts.length && rng() < 0.85) return opts[0].act;
      // occasionally a plain 4:1 when drowning in one card
      for (let r = 0; r < 5; r++) if (P.res[r] >= 5 && E.rate(st, p, r) <= P.res[r]) { const miss = [3, 4, 1, 0].find(x => P.res[x] === 0); if (miss !== undefined && st.bank[miss]) return { t: 'bank', give: r, get: miss }; }
      return { t: 'end' };
    }
    for (const x of pl.list) {
      if (x.kind === 'dev' && lvl === 'medium' && pl.list.some(y => y.kind === 'settle' || y.kind === 'road')) {
        if (!canPay(P.res, COST.dev) || sum(P.res) < 6) continue;
      }      if (canPay(P.res, x.cost)) return x.act;
    }
    for (const x of pl.list) {
      if (x.kind === 'road' && pl.list.some(y => y.kind === 'city')) continue; // don't trade for roads when saving for a city
      const b = bankTrade(st, p, x); if (b) return b;
      if (x.kind !== 'dev') { const o = offerFor(st, p, x, lvl); if (o) return o; }
    }
    if (lvl === 'hard' && sum(P.res) > 7) { // dump cards before a 7 eats them
      for (let r = 0; r < 5; r++) { const k = E.rate(st, p, r); if (P.res[r] >= k + 1) { const g = [3, 4, 2, 0, 1].find(x => x !== r && st.bank[x] > 0); if (g !== undefined) return { t: 'bank', give: r, get: g }; } }
    }
    return { t: 'end' };
  }

  function choose(st, p, rng) {
    rng = rng || Math.random;
    const lvl = st.players[p].level || 'medium';
    switch (st.phase) {
      case 'setup': return setupMove(st, p, lvl, rng);
      case 'discard': return discardMove(st, p, lvl);
      case 'robber': return robberMove(st, p, lvl, rng);
      case 'roads': { const w = weights(st, lvl), pl = plans(st, p, w, lvl); const opts = E.legalRoads(st, p);
        const want = pl.tgt && pl.tgt.path.len > 0 ? pl.tgt.path.e : -1;
        return opts.length ? { t: 'road', e: opts.includes(want) ? want : opts[0] } : { t: 'stop' }; }
      case 'trade': {
        const o = st.offer;
        if (o.stage === 'ask') return answer(st, p, lvl, rng);
        const yes = o.resp.map((r, i) => (r ? i : -1)).filter(i => i >= 0);
        yes.sort((a, b) => E.publicVP(st, a) - E.publicVP(st, b));
        return { t: 'deal', with: yes[0] };
      }
      case 'roll': { const d = devMove(st, p, lvl, weights(st, lvl), { list: [], tgt: null }); return d && d.card === 'K' && lvl !== 'easy' ? d : { t: 'roll' }; }
      case 'main': return mainMove(st, p, lvl, rng);
    }
    return { t: 'end' };
  }

  const api = { choose, weights, prodOf, spotValue, answer };
  if (node) module.exports = api; else root.CatanAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
