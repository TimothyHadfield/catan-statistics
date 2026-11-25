// "Weighted" pips: a pip of a scarce resource is worth more than a pip of a common one.
// For each resource r: P_r = the board's total pips for r, mean = sum(P_r) / 5,
// w_r = clamp(mean / P_r, 0.5, 2), and w_r = 2 when P_r = 0.
// Shared maths (the online builder uses the same formula); keep it identical.
(function (root) {
  'use strict';
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

  // board totals from tiles [{resource, number}] (desert / no number count 0)
  function totals(tiles) {
    const t = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    (tiles || []).forEach(h => { if (h && t[h.resource] !== undefined) t[h.resource] += PIPS[Number(h.number)] || 0; });
    return t;
  }

  function weights(P) {
    const sum = RES.reduce((a, r) => a + (P[r] || 0), 0), mean = sum / 5, w = {};
    RES.forEach(r => { w[r] = !P[r] ? 2 : Math.min(2, Math.max(0.5, mean / P[r])); });
    return w;
  }

  // "Mine" (personal) weights, for one player. Same shape as weights(), but each resource's supply is
  //   supply_r = open_r × (own_r + 3) / NEED_r
  // open_r = dots of r on corners nobody can still build on removed (taken or next to a town);
  // own_r = the player's own dots of r (towns; a city twice); NEED_r = one road + town + city + card.
  // The +3 keeps a resource you get nothing of from blowing up. Then w_r = clamp(mean supply / supply_r, 0.5, 2),
  // 2 when nothing of r is open. No open corners at all: open = the whole board.
  const NEED = { wood: 2, brick: 2, sheep: 2, wheat: 4, ore: 4 };
  function personal(own, open, board) {
    const avail = RES.some(r => (open[r] || 0) > 0) ? open : board, sup = {};
    RES.forEach(r => { sup[r] = (avail[r] || 0) * ((own[r] || 0) + 3) / NEED[r]; });
    const have = RES.filter(r => sup[r] > 0), mean = have.reduce((a, r) => a + sup[r], 0) / (have.length || 1), w = {};
    RES.forEach(r => { w[r] = sup[r] > 0 ? Math.min(2, Math.max(0.5, mean / sup[r])) : 2; });
    return w;
  }
  // dots per resource over corners [{open, hexes: [{resource, pips}]}], open ones only
  function openDots(corners) {
    const t = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    (corners || []).forEach(c => { if (c.open) c.hexes.forEach(h => { if (t[h.resource] !== undefined) t[h.resource] += h.pips; }); });
    return t;
  }

  // at most one decimal: 7 -> "7", 7.25 -> "7.3"
  function fmt(x) { const v = Math.round(x * 10) / 10; return String(Object.is(v, -0) ? 0 : v); }

  // sum of pips x weight over a list of {resource, pips}
  function weightedSum(list, w) { return (list || []).reduce((a, h) => a + h.pips * (w ? w[h.resource] || 1 : 1), 0); }

  const api = { RES, PIPS, NEED, totals, weights, personal, openDots, fmt, weightedSum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrackerWeights = api;
})(typeof window !== 'undefined' ? window : globalThis);
