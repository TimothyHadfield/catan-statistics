// Advisor suggestions (Tim 2026-11-25): "if the advisor setting is turned on, I want there to be suggestions for
// many different decisions ... a gold circle around a odds number showing high suggestion ... a silver circle
// around to show less suggestion". Pure decision logic for Online play (js/app.js draws the rings). No DOM.
// Built on js/advisor.js (corner scores on the dot scale) and the engine's rules/geometry.
//
// setup(g, seat) -> {gold: [v], silver: [v], opp: [{p, v}], goldEdges, silverEdges}
//   My town step, more towns to come: for each of my 6 best corners v1 (Advisor score), place it, predict the
//   opponents who place before my next town (greedy, in snake order, each by the Advisor score from THEIR seat,
//   each pick removing its corner and neighbours), then take my best remaining corner v2.
//   (Speed: their picks are predicted once without my town; when v1 or an earlier re-pick takes a pick away,
//   that player takes their next best corner still open, by the scores they had in that first prediction.)
//   plan value = score(v1) + score(v2 after those picks). Gold pair = best plan; silver pair = best plan with a
//   different first town (and, when possible, no corner shared with the gold pair).
//   My last setup town: gold = best corner, silver = second best.
//   opp = the predicted picks of opponents who place before my next town (during my first pick: before my
//   second, assuming my gold first town).
//   Setup road (sub 'road', my turn): the edges from the town just placed, ranked like a main-game road
//   (below), with the opponents' predicted picks already removed from the targets.
//
// upgrades(g, seat) -> [{kind: 'city'|'settle', v, d, value}] best first ("next upgrade", gold #1, silver #2)
//   city on my town v:   value = my Mine-weighted pips at v (the extra production a city adds)
//   town on open corner: value = (Advisor score + port bonus + 2) x [1, 0.7, 0.5][d] x race, d = roads still
//                        needed (0-2; only if I have that many roads and a town left; d = 0 means legal now).
//                        +2 = a town also claims the corner for good and opens a later city spot (a city spot
//                        never runs out, an open corner does); race = 1.25 when an opponent is 0-1 roads from it.
//
// roads(g, seat, edges) -> [{e, score}] best first (gold #1, silver #2). For each legal edge e:
//   targets  = open corners with value = Advisor score + port bonus (2:1 port: 0.3 x (my pips of it - 4);
//              3:1: 0.1 x (my total pips - 10); 0 if I have that port already)
//   progress = sum over targets of value x urgency x (R[dist after e] - R[dist before]), R = [1, .6, .35, .15, .05]
//              by roads needed (direction of opportunity / future towns); urgency 1.5 when an opponent is 0-1
//              roads from that target
//   block    = sum over opponents o and targets within 2 of o of value_o x (R[o's dist before] - R[after]):
//              my road on e closes that edge to them
//   longest  = +1 road length on my longest road x 3 when Longest Road is in play (I hold it and someone is
//              within 1, or I'd get within 2 of taking it), else x 0.7 (setup: 0)
//   score    = progress + 0.5 x block + longest
//
// buttons(g, seat, can) -> ['city'|'settle'|'road'|'buy'] up to 2, among affordable+enabled buttons `can`:
//   1) for the top 2 upgrades in order: city -> City, town legal now -> Town, town 1-2 roads away -> Road
//   2) any city upgrade -> City; any legal town -> Town
//   3) Card
//   4) Road, if the best road scores above 0
//   first two different affordable ones = gold, silver.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const A = node ? require('./advisor.js') : root.CatanAdvisor;
  const E = node ? require('./engine.js') : root.CatanEngine;
  const W = node ? require('./weights.js') : root.TrackerWeights;
  const K = { CANDS: 6, R: [1, 0.6, 0.35, 0.15, 0.05], DISC: [1, 0.7, 0.5], URG: 1.5, BLOCK: 0.5, LR_HOT: 3, LR: 0.7, EXPAND: 2, RACE: 1.25 };
  const MAXD = K.R.length - 1;
  const RR = d => (d <= MAXD ? K.R[d] : 0);

  const input = g => A.fromEngine(g, E.geo(g), E.pips);
  const withOwner = (inp, v, p) => { const corners = inp.corners.slice(); corners[v] = Object.assign({}, corners[v], { owner: p }); return Object.assign({}, inp, { corners }); };
  const scoreFor = (inp, p) => A.scores(Object.assign({}, inp, { me: p })).score;
  const argBest = (sc, skip) => { let b = -1; sc.forEach((s, v) => { if (s != null && !(skip && skip.has(v)) && (b < 0 || s > sc[b])) b = v; }); return b; };
  const ranked = sc => sc.map((s, v) => [s, v]).filter(x => x[0] != null).sort((a, b) => b[0] - a[0]).map(x => x[1]);

  // greedy picks of the players placing at steps [from, to) of the snake order
  function predict(g, inp, from, to, seat) {
    const out = [];
    for (let s = from; s < to && s < g.order.length; s++) {
      const p = g.order[s]; if (p === seat) continue;
      const sc = scoreFor(inp, p), v = argBest(sc);
      if (v < 0) break;
      out.push({ p, v, sc }); inp = withOwner(inp, v, p);
    }
    return { picks: out, inp };
  }
  const nextStep = (g, seat, from) => { for (let s = from; s < g.order.length; s++) if (g.order[s] === seat) return s; return -1; };

  // ------------------------------------------------------------ road distances
  // d[v] = roads p still needs so that v is on p's network (end of p's road, or p's town). Roads can't use
  // edges someone else owns and can't go on through someone else's town. extra = an edge counted as p's.
  function netDist(g, p, extra, eOwner) {
    const Gm = E.geo(g), eo = eOwner || g.eOwner, d = new Array(Gm.V.length).fill(Infinity), q = [];
    const mineE = e => eo[e] === p || e === extra;
    const seed = v => { if (d[v] > 0) { d[v] = 0; q.push(v); } };
    g.vOwner.forEach((o, v) => { if (o === p) seed(v); });
    eo.forEach((o, e) => { if (o === p) Gm.E[e].v.forEach(seed); });
    if (extra != null && extra >= 0) Gm.E[extra].v.forEach(seed);
    while (q.length) {
      const v = q.shift();
      if (d[v] >= MAXD) continue;
      if (g.vOwner[v] >= 0 && g.vOwner[v] !== p) continue;
      Gm.V[v].edges.forEach(e => {
        if (eo[e] >= 0 && !mineE(e)) return;
        const u = Gm.E[e].v[0] === v ? Gm.E[e].v[1] : Gm.E[e].v[0], nd = d[v] + (mineE(e) ? 0 : 1);
        if (nd < d[u]) { d[u] = nd; if (nd === d[v]) q.unshift(u); else q.push(u); }
      });
    }
    return d;
  }

  function ownPips(g, p) {
    const Gm = E.geo(g), own = [0, 0, 0, 0, 0];
    g.vOwner.forEach((o, v) => { if (o === p) Gm.V[v].hexes.forEach(h => { if (g.hexRes[h] >= 0) own[g.hexRes[h]] += E.pips(g.hexNum[h]) * (g.vLevel[v] === 2 ? 2 : 1); }); });
    return own;
  }
  // a harbour corner is worth more when I already make a lot of its resource
  function portBonus(g, p) {
    const Gm = E.geo(g), own = ownPips(g, p), tot = own.reduce((a, b) => a + b, 0), have = E.portsOf(g, p), out = new Map();
    g.ports.forEach(pt => {
      if (have.has(pt.type)) return;
      const r = E.RES.indexOf(pt.type), b = r >= 0 ? 0.3 * Math.max(0, own[r] - 4) : 0.1 * Math.max(0, tot - 10);
      if (b > 0) Gm.E[pt.e].v.forEach(v => out.set(v, Math.max(out.get(v) || 0, b)));
    });
    return out;
  }

  // ------------------------------------------------------------ roads
  function roads(g, seat, edges, inpIn) {
    if (!edges || !edges.length) return [];
    const Gm = E.geo(g), inp = inpIn || input(g), players = g.players.map((_, i) => i);
    const sMe = scoreFor(inp, seat), port = portBonus(g, seat);
    const val = v => (sMe[v] == null ? 0 : sMe[v] + (port.get(v) || 0));
    const dMe = netDist(g, seat);
    const targets = sMe.map((s, v) => v).filter(v => sMe[v] != null && dMe[v] <= MAXD + 1);
    const opps = players.filter(p => p !== seat).map(p => ({ p, d: netDist(g, p), s: scoreFor(inp, p) }));
    const oppMin = v => Math.min(...opps.map(o => o.d[v]));
    // longest road context (none in setup)
    const setup = g.phase === 'setup';
    let lrBefore = 0, hot = false;
    if (!setup) {
      lrBefore = E.longestRoad(g, seat);
      const others = opps.map(o => (g.roadLen && g.roadLen[o.p] != null ? g.roadLen[o.p] : E.longestRoad(g, o.p)));
      const oMax = others.length ? Math.max(...others) : 0, L = g.longest || { p: -1, len: 0 };
      if (L.p === seat) hot = oMax >= lrBefore - 1;
      else { const need = Math.max(5, L.p >= 0 ? L.len + 1 : oMax + 1); hot = lrBefore + 1 >= need - 2; }
    }
    return edges.map(e => {
      const dA = netDist(g, seat, e);
      let progress = 0;
      targets.forEach(t => {
        const gain = RR(dA[t]) - RR(dMe[t]);
        if (gain > 0) progress += val(t) * gain * (oppMin(t) <= 1 ? K.URG : 1);
      });
      let block = 0;
      const eo = g.eOwner.slice(); eo[e] = seat;
      opps.forEach(o => {
        const near = targets.filter(t => o.d[t] <= 2);
        if (!near.length) return;
        const dO = netDist(g, o.p, null, eo);
        near.forEach(t => { const loss = RR(o.d[t]) - RR(dO[t]); if (loss > 0) block += (o.s[t] || 0) * loss; });
      });
      let longest = 0;
      if (!setup) {
        const after = E.longestRoad(Object.assign({}, g, { eOwner: eo }), seat);
        longest = Math.max(0, after - lrBefore) * (hot ? K.LR_HOT : K.LR);
      }
      return { e, score: progress + K.BLOCK * block + longest, progress, block, longest };
    }).sort((a, b) => b.score - a.score || a.e - b.e);
  }

  // ------------------------------------------------------------ setup
  function setup(g, seat) {
    const out = { gold: [], silver: [], opp: [], goldEdges: [], silverEdges: [] };
    if (g.phase !== 'setup') return out;
    const inp = input(g), nowSeat = g.order[g.step];
    const pending = g.step + (g.sub === 'road' ? 1 : 0); // first town still to be placed
    if (nowSeat === seat && g.sub === 'settle') {
      const after = nextStep(g, seat, g.step + 1);
      const s0 = scoreFor(inp, seat), order = ranked(s0);
      if (after < 0) { out.gold = order.slice(0, 1); out.silver = order.slice(1, 2); return out; }
      // speed: the opponents' picks are predicted once without my town (see the header)
      const base = predict(g, inp, g.step + 1, after, seat).picks;
      const plans = order.slice(0, K.CANDS).map(v1 => {
        let i1 = withOwner(inp, v1, seat);
        const picks = [];
        base.forEach(x => {
          // taken away: that player takes their next best corner still open (by the scores they had then)
          let v = x.v;
          if (!A.isOpen(i1.corners, v)) { v = -1; x.sc.forEach((s, u) => { if (s != null && A.isOpen(i1.corners, u) && (v < 0 || s > x.sc[v])) v = u; }); }
          if (v < 0) return;
          picks.push({ p: x.p, v }); i1 = withOwner(i1, v, x.p);
        });
        const pr = { picks, inp: i1 };
        const s2 = scoreFor(pr.inp, seat), v2 = argBest(s2);
        return { v1, v2, value: s0[v1] + (v2 >= 0 ? s2[v2] : 0), opp: pr.picks };
      }).sort((a, b) => b.value - a.value);
      const G0 = plans[0]; if (!G0) return out;
      const used = new Set([G0.v1, G0.v2]);
      const S0 = plans.find(p => p.v1 !== G0.v1 && !used.has(p.v1) && !used.has(p.v2)) || plans.find(p => p.v1 !== G0.v1);
      out.gold = [G0.v1, G0.v2].filter(v => v >= 0);
      if (S0) out.silver = [S0.v1, S0.v2].filter(v => v >= 0);
      out.opp = G0.opp;
      return out;
    }
    const mine = nextStep(g, seat, pending);
    let after = inp;
    if (mine > pending) { const pr = predict(g, inp, pending, mine, seat); out.opp = pr.picks.map(x => ({ p: x.p, v: x.v })); after = pr.inp; }
    if (nowSeat === seat && g.sub === 'road' && g.lastV >= 0) {
      const Gm = E.geo(g), edges = Gm.V[g.lastV].edges.filter(e => g.eOwner[e] < 0);
      const r = roads(g, seat, edges, after);
      if (r[0]) out.goldEdges = [r[0].e];
      if (r[1]) out.silverEdges = [r[1].e];
    }
    return out;
  }

  // ------------------------------------------------------------ main game: next upgrade
  function upgrades(g, seat) {
    if (g.phase === 'setup' || g.phase === 'over') return [];
    const Gm = E.geo(g), inp = input(g), out = [];
    if (E.citiesLeft(g, seat) > 0) {
      const openTot = W.openDots(inp.corners.map((c, i) => ({ open: A.isOpen(inp.corners, i), hexes: c.hexes })));
      const own = {}; ownPips(g, seat).forEach((n, r) => { own[W.RES[r]] = n; });
      const w = W.personal(own, openTot, inp.board);
      g.vOwner.forEach((o, v) => {
        if (o !== seat || g.vLevel[v] !== 1) return;
        out.push({ kind: 'city', v, d: 0, value: inp.corners[v].hexes.reduce((a, h) => a + h.pips * (w[h.resource] || 0), 0) });
      });
    }
    if (E.settlesLeft(g, seat) > 0) {
      const s = scoreFor(inp, seat), port = portBonus(g, seat), d = netDist(g, seat), left = E.roadsLeft(g, seat);
      const opp = g.players.map((_, i) => i).filter(i => i !== seat).map(i => netDist(g, i));
      s.forEach((x, v) => {
        if (x == null || d[v] > 2 || d[v] > left) return;
        const race = opp.some(o => o[v] <= 1) ? K.RACE : 1;
        out.push({ kind: 'settle', v, d: d[v], value: (x + (port.get(v) || 0) + K.EXPAND) * K.DISC[d[v]] * race });
      });
    }
    return out.sort((a, b) => b.value - a.value || a.v - b.v);
  }

  // ------------------------------------------------------------ build buttons
  // can = {road, settle, city, buy}: true when that button is affordable and enabled
  function buttons(g, seat, can, ups, bestRoad) {
    const out = [], push = k => { if (can[k] && !out.includes(k)) out.push(k); };
    (ups || []).slice(0, 2).forEach(u => push(u.kind === 'city' ? 'city' : u.d === 0 ? 'settle' : 'road'));
    if ((ups || []).some(u => u.kind === 'city')) push('city');
    if ((ups || []).some(u => u.kind === 'settle' && u.d === 0)) push('settle');
    push('buy');
    if (bestRoad > 0) push('road');
    return out.slice(0, 2);
  }

  const api = { K, setup, upgrades, roads, buttons, netDist, predict };
  if (node) module.exports = api; else root.CatanAdvice = api;
})(typeof window !== 'undefined' ? window : globalThis);
