// "Advisor" corner numbers (Tim 2026-11-25): "takes into account personalized weight but also considers
// diversified resources, and blocking opponents both positionally (like roads) and with settlement placing".
// Shared by Online play (js/app.js) and In-person play (tracker.html). Pure functions, no DOM.
//
// For every open corner v, seen by player "me" (Online: your seat; In-person: the selected colour):
//   mine(v)  = sum of pips x my "Mine" weight              (W.personal: what I already get vs what building needs)
//   div(v)   = 0.30 x pips of each tile whose resource I get none of yet (first tile of it at this corner)
//            + 0.15 x pips of each tile whose number I don't have yet   (spreads income over more rolls)
//   deny(v)  = max over opponents o of reach_o(v) x value_o(v)
//              value_o = pips x o's own Mine weights (an opponent short on ore values an ore corner more)
//              reach_o = 1 while o still has a free setup town (fewer than 2 towns), else by road distance
//                        from o's towns/roads: 0 -> 1, 1 -> 0.75, 2 -> 0.4, 3 -> 0.15, further -> 0
//   block(v) = max over opponents o of the sum, over v's open neighbours u (a town at v kills them), of
//              reachNet_o(u) x value_o(u)   (reachNet = road distance only: it is about cutting expansion)
//   raw(v)   = mine + div + 0.30 x deny + 0.15 x block
//   shown(v) = raw(v) x (mean plain dots of open corners) / (mean raw of open corners)
// The last step keeps the numbers on the usual dot scale, so the red-to-green colours and the "hide under 7"
// summary still mean "below / above an average corner".
(function (root) {
  'use strict';
  const W = typeof module !== 'undefined' && module.exports ? require('./weights.js') : root.TrackerWeights;
  const K = { NEWRES: 0.3, NEWNUM: 0.15, DENY: 0.3, BLOCK: 0.15, REACH: [1, 0.75, 0.4, 0.15] };
  const RES = W.RES;
  const zero = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  const ekey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // corners: [{hexes: [{resource, pips, number}], owner: null | player, city: bool, nbrs: [corner index]}]
  // roads: [{a, b, owner}] (corner indexes); board: resource totals (W.totals of the tiles)
  const isOpen = (corners, i) => corners[i].owner == null && corners[i].nbrs.every(u => corners[u].owner == null);

  function ownDots(corners, p) {
    const own = zero();
    corners.forEach(c => { if (c.owner === p) c.hexes.forEach(h => { if (own[h.resource] !== undefined) own[h.resource] += h.pips * (c.city ? 2 : 1); }); });
    return own;
  }
  function ownNums(corners, p) {
    const s = new Set();
    corners.forEach(c => { if (c.owner === p) c.hexes.forEach(h => { if (h.pips) s.add(Number(h.number)); }); });
    return s;
  }
  // road distance from p's towns and roads; can't pass another player's town or road
  function reachDist(corners, roads, p) {
    const d = corners.map(() => Infinity), eOwn = new Map();
    roads.forEach(r => eOwn.set(ekey(r.a, r.b), r.owner));
    const q = [];
    const seed = i => { if (d[i] > 0) { d[i] = 0; q.push(i); } };
    corners.forEach((c, i) => { if (c.owner === p) seed(i); });
    roads.forEach(r => { if (r.owner === p) { seed(r.a); seed(r.b); } });
    while (q.length) {
      const i = q.shift();
      if (d[i] >= K.REACH.length - 1) continue;
      if (corners[i].owner != null && corners[i].owner !== p) continue; // can't build through someone's town
      corners[i].nbrs.forEach(u => {
        const o = eOwn.get(ekey(i, u));
        if (o != null && o !== p) return;
        if (d[u] > d[i] + 1) { d[u] = d[i] + 1; q.push(u); }
      });
    }
    return d;
  }
  const reachOf = d => (d < K.REACH.length ? K.REACH[d] : 0);
  const valueWith = (c, w) => c.hexes.reduce((a, h) => a + h.pips * (w[h.resource] || 0), 0);

  function diversity(c, own, nums) {
    const seenR = new Set(), seenN = new Set();
    let b = 0;
    c.hexes.forEach(h => {
      if (!h.pips) return;
      if (!(own[h.resource] > 0) && !seenR.has(h.resource)) b += K.NEWRES * h.pips;
      seenR.add(h.resource);
      const n = Number(h.number);
      if (!nums.has(n) && !seenN.has(n)) b += K.NEWNUM * h.pips;
      seenN.add(n);
    });
    return b;
  }

  // -> {score: [number | null per corner], parts: [{mine, div, deny, block, raw} | null]}
  function scores({ corners, roads = [], me, players, board }) {
    const open = corners.map((_, i) => isOpen(corners, i));
    const openTot = W.openDots(corners.map((c, i) => ({ open: open[i], hexes: c.hexes })));
    const wOf = p => W.personal(ownDots(corners, p), openTot, board);
    const wMe = wOf(me), ownMe = ownDots(corners, me), numsMe = ownNums(corners, me);
    const opps = (players || []).filter(p => p !== me).map(p => {
      const towns = corners.filter(c => c.owner === p).length;
      return { p, w: wOf(p), free: towns < 2, d: reachDist(corners, roads, p) };
    });
    const parts = corners.map((c, i) => {
      if (!open[i]) return null;
      const mine = valueWith(c, wMe), div = diversity(c, ownMe, numsMe);
      let deny = 0, block = 0;
      opps.forEach(o => {
        deny = Math.max(deny, (o.free ? 1 : reachOf(o.d[i])) * valueWith(c, o.w));
        block = Math.max(block, c.nbrs.reduce((a, u) => a + (open[u] ? reachOf(o.d[u]) * valueWith(corners[u], o.w) : 0), 0));
      });
      return { mine, div, deny, block, raw: mine + div + K.DENY * deny + K.BLOCK * block };
    });
    let dotSum = 0, rawSum = 0;
    parts.forEach((x, i) => { if (x) { dotSum += corners[i].hexes.reduce((a, h) => a + h.pips, 0); rawSum += x.raw; } });
    const f = rawSum > 0 ? dotSum / rawSum : 1;
    return { score: parts.map(x => (x ? x.raw * f : null)), parts };
  }

  // the engine's board (Online play) in the shape above; Gm = E.geo(g), resources 0..4 = W.RES
  function fromEngine(g, Gm, pips) {
    const corners = Gm.V.map((V, v) => ({
      hexes: V.hexes.filter(h => g.hexRes[h] >= 0).map(h => ({ resource: RES[g.hexRes[h]], pips: pips(g.hexNum[h]), number: g.hexNum[h] })),
      owner: g.vOwner[v] >= 0 ? g.vOwner[v] : null, city: g.vLevel[v] === 2,
      nbrs: V.edges.map(e => Gm.E[e].v.find(u => u !== v)),
    }));
    const roads = [];
    g.eOwner.forEach((o, e) => { if (o >= 0) roads.push({ a: Gm.E[e].v[0], b: Gm.E[e].v[1], owner: o }); });
    const board = W.totals(g.hexRes.map((r, h) => ({ resource: RES[r], number: g.hexNum[h] })));
    return { corners, roads, board, players: g.players.map((_, i) => i) };
  }

  // In-person play's board: vertices {key: {adjacentHexes}}, neighbours {key: [key]},
  // settlements [{vertex, player}], roads [{edge: 'k1|k2', player}] -> same shape; idx maps key -> index
  function fromTracker(vertices, neighbours, settlements, roads, board) {
    const keys = Object.keys(vertices), idx = {};
    keys.forEach((k, i) => { idx[k] = i; });
    const own = {};
    settlements.forEach(s => { own[s.vertex] = s.player; });
    const corners = keys.map(k => ({ hexes: vertices[k].adjacentHexes, owner: own[k] == null ? null : own[k], city: false,
      nbrs: (neighbours[k] || []).filter(u => idx[u] !== undefined).map(u => idx[u]) }));
    const rs = [];
    roads.forEach(r => { const [a, b] = r.edge.split('|'); if (idx[a] !== undefined && idx[b] !== undefined) rs.push({ a: idx[a], b: idx[b], owner: r.player }); });
    const players = [...new Set(settlements.map(s => s.player))];
    return { corners, roads: rs, board, players, keys, idx };
  }

  const api = { K, scores, fromEngine, fromTracker, reachDist, isOpen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CatanAdvisor = api;
})(typeof window !== 'undefined' ? window : globalThis);
