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

  // at most one decimal: 7 -> "7", 7.25 -> "7.3"
  function fmt(x) { const v = Math.round(x * 10) / 10; return String(Object.is(v, -0) ? 0 : v); }

  // sum of pips x weight over a list of {resource, pips}
  function weightedSum(list, w) { return (list || []).reduce((a, h) => a + h.pips * (w ? w[h.resource] || 1 : 1), 0); }

  const api = { RES, PIPS, totals, weights, fmt, weightedSum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrackerWeights = api;
})(typeof window !== 'undefined' ? window : globalThis);
