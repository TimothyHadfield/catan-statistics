// "Weighted" spot odds (Tim 2026-11-24): a dot of a scarce resource is worth more than a dot of a common one.
// P_r = the board's total dots for resource r; mean = sum(P_r) / 5; w_r = clamp(mean / P_r, 0.5, 2), w_r = 2 when P_r = 0.
// Pure, no DOM (UMD: window.CatanWeights / require). The in-person tracker uses the same maths.
(function (root) {
  'use strict';
  const pips = n => (n >= 2 && n <= 12 && n !== 7 ? 6 - Math.abs(7 - n) : 0);
  // hexRes: resource index 0..4 per tile (-1 = desert); hexNum: the number token per tile (0 = none)
  function resourcePips(hexRes, hexNum) {
    const P = [0, 0, 0, 0, 0];
    hexRes.forEach((r, h) => { if (r >= 0 && r < 5) P[r] += pips(hexNum[h]); });
    return P;
  }
  function weights(hexRes, hexNum) {
    const P = resourcePips(hexRes, hexNum), mean = P.reduce((a, b) => a + b, 0) / 5;
    return P.map(p => (p === 0 ? 2 : Math.min(2, Math.max(0.5, mean / p))));
  }
  // a corner's weighted dots: sum of dots x weight over its tiles (skip tiles in `skip`, e.g. the robber), 1 decimal
  function weightedSpot(hexes, hexRes, hexNum, w, skip) {
    let s = 0;
    hexes.forEach(h => { if (h !== skip && hexRes[h] >= 0) s += pips(hexNum[h]) * w[hexRes[h]]; });
    return Math.round(s * 10) / 10;
  }
  const api = { pips, resourcePips, weights, weightedSpot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CatanWeights = api;
})(typeof window !== 'undefined' ? window : globalThis);
