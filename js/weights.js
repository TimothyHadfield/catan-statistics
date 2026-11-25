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

  // "Mine" (personal) weights, for one player (rewritten 2026-11-25: the first version let open-corner scarcity
  // swamp what you already have; Tim had the most ore and ore showed 2x).
  //   need_r  = NEED_r / 16          share of building that uses r (2 roads + town + city + card)
  //   have_r  = (own_r + 2) / (T + 10) your share of r (own dots, city twice; T = all your dots; +2/+10 smooths)
  //   nudge_r = clamp(sqrt(mean open / open_r), 0.7, 1.4)   scarce on corners still open -> a bit more
  //   w_r = clamp(raw_r / mean raw, 0.5, 2), raw_r = need_r / have_r × nudge_r
  // open_r = dots of r on corners nobody can still build on removed; none open at all -> whole board.
  const NEED = { wood: 3, brick: 3, sheep: 2, wheat: 4, ore: 4 };
  function personal(own, open, board) {
    const avail = RES.some(r => (open[r] || 0) > 0) ? open : board;
    const T = RES.reduce((a, r) => a + (own[r] || 0), 0), nTot = RES.reduce((a, r) => a + NEED[r], 0);
    const there = RES.filter(r => (avail[r] || 0) > 0), meanA = there.reduce((a, r) => a + avail[r], 0) / (there.length || 1);
    const raw = {};
    RES.forEach(r => {
      const need = NEED[r] / nTot, have = ((own[r] || 0) + 2) / (T + 10);
      const nudge = avail[r] > 0 ? Math.min(1.4, Math.max(0.7, Math.sqrt(meanA / avail[r]))) : 1;
      raw[r] = need / have * nudge;
    });
    const mean = RES.reduce((a, r) => a + raw[r], 0) / 5, w = {};
    RES.forEach(r => { w[r] = Math.min(2, Math.max(0.5, raw[r] / mean)); });
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
