// Board art shared by Online play (js/app.js) and In-person play (tracker.html), so both draw the
// same tiles, resource pictures, towns and corner-odds colours. Plain strings; window.CatanArt.
(function (root) {
  'use strict';
  // resources in engine order: wood, brick, sheep, wheat, ore
  const RES_COL = ['#3f7d3a', '#b55a3c', '#8fbf5a', '#e2b845', '#8a929b'];
  const RES_ICON = [
    '<path d="M10 2l6 10H4z" fill="#2c5f2a"/><path d="M10 7l6 9H4z" fill="#3f7d3a"/><rect x="9" y="15" width="2" height="4" fill="#5a3b22"/>',
    '<rect x="2" y="5" width="16" height="10" fill="#b55a3c"/><path d="M2 10h16M8 5v5M13 10v5" stroke="#7d3522" stroke-width="1.3"/>',
    '<ellipse cx="9" cy="11" rx="6.5" ry="4.6" fill="#f4f1e6"/><circle cx="15.5" cy="9" r="2.4" fill="#3b3b3b"/><path d="M6 15v3M11 15v3" stroke="#3b3b3b" stroke-width="1.4"/>',
    '<path d="M10 19V5M6 18V8M14 18V8" stroke="#b78b26" stroke-width="1.6"/><ellipse cx="10" cy="4.5" rx="1.6" ry="3" fill="#e2b845"/><ellipse cx="6" cy="7.5" rx="1.4" ry="2.6" fill="#e2b845"/><ellipse cx="14" cy="7.5" rx="1.4" ry="2.6" fill="#e2b845"/>',
    '<path d="M1 18l7-13 5 7 2-3 4 9z" fill="#6c737c"/><path d="M6.3 8.2L8 5l2 2.8z" fill="#e9edf0"/>',
  ];
  // original tile prints (pt0..pt4 = resources, pt5 = desert), tile shading, sea and waves
  const DEFS = `<pattern id="pt0" width="20" height="18" patternUnits="userSpaceOnUse"><rect width="20" height="18" fill="#3f7d3a"/><path d="M5 3l4 8H1zM15 9l4 8h-8z" fill="#2c5f2a"/><path d="M5 11v2M15 17v1" stroke="#5a3b22" stroke-width="1.4"/></pattern>
  <pattern id="pt1" width="16" height="10" patternUnits="userSpaceOnUse"><rect width="16" height="10" fill="#b55a3c"/><path d="M0 .5h16M0 5.5h16M4 0v5M12 5v5" stroke="#8c3e27" stroke-width="1.1"/></pattern>
  <pattern id="pt2" width="22" height="18" patternUnits="userSpaceOnUse"><rect width="22" height="18" fill="#8fbf5a"/><ellipse cx="6" cy="6" rx="3.6" ry="2.6" fill="#f4f1e6"/><circle cx="9.4" cy="5.2" r="1.3" fill="#3b3b3b"/><ellipse cx="16" cy="14" rx="3.2" ry="2.3" fill="#f4f1e6"/><circle cx="19" cy="13.3" r="1.2" fill="#3b3b3b"/><path d="M1 16l1-2M12 4l1-2" stroke="#6f9f42" stroke-width="1"/></pattern>
  <pattern id="pt3" width="10" height="14" patternUnits="userSpaceOnUse"><rect width="10" height="14" fill="#e2b845"/><path d="M3 14V4M8 12V2" stroke="#b78b26" stroke-width="1.2"/><path d="M3 4l-1.6-2M3 4l1.6-2M8 2l-1.4-1.8M8 2l1.4-1.8" stroke="#b78b26" stroke-width="1"/></pattern>
  <pattern id="pt4" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#8a929b"/><path d="M2 15l7-11 7 11zM13 15l5-8 5 8z" fill="#6c737c"/><path d="M7.2 6.8L9 4l1.8 2.8zM16.8 9.6L18 7l1.4 2.6z" fill="#e9edf0"/></pattern>
  <pattern id="pt5" width="26" height="12" patternUnits="userSpaceOnUse"><rect width="26" height="12" fill="#dcc48e"/><path d="M0 8q6.5-5 13 0t13 0" fill="none" stroke="#c4a76b" stroke-width="1.2"/></pattern>
  <radialGradient id="tileShade" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
  <radialGradient id="seaG" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#4f93b8"/><stop offset="1" stop-color="#2f6d92"/></radialGradient>
  <pattern id="waves" width="34" height="14" patternUnits="userSpaceOnUse"><path d="M0 9q8.5-6 17 0t17 0" fill="none" stroke="#bfe0f0" stroke-opacity=".18" stroke-width="1.2"/></pattern>`;
  const patterns = () => `<defs>${DEFS}</defs>`;
  // a town: k = half width in svg units
  const houseD = (x, y, k) => `M${x - k},${y + k * .75}V${y - k * .15}L${x},${y - k * .95}L${x + k},${y - k * .15}V${y + k * .75}Z`;
  // corner odds badge colour: red (3 dots or fewer) to green (12 or more)
  const oddsFill = odds => `hsl(${Math.round(Math.max(0, Math.min(1, (odds - 3) / 9)) * 120)},70%,80%)`;
  // corner odds badge: small, a thin dark hairline instead of a coloured ring (Tim 2026-11-24:
  // "making the odds circles smaller and removing the red circle around them"). Sizes in hex radii.
  const ODDS = { r: 0.21, ty: 0.105, tyLong: 0.085 };
  const oddsBadge = (x, y, U, odds) => {
    const txt = String(odds), long = txt.length > 2;
    return `<circle cx="${x}" cy="${y}" r="${ODDS.r * U}" class="hl-c" style="fill:${oddsFill(odds)}"/><text x="${x}" y="${y + (long ? ODDS.tyLong : ODDS.ty) * U}" class="hl-t${long ? ' long' : ''}">${txt}</text>`;
  };
  // summarized odds (the default): only yellow and green corners get a number; red ones (under 7 dots,
  // as shown rounded) are hidden. Tim 2026-11-25: "shows only yellow or green odds, no red, because you'd
  // never go there anyways". all = the "Red odds" setting.
  const ODDS_MIN = 7;
  const oddsShown = (odds, all) => !!all || Math.round(odds) >= ODDS_MIN;
  // dice chart: expected % for 2..12 (n/36) drawn as one smooth line over the rolled bars. Tim 2026-11-25:
  // "a smooth line showing the expected curve of the dice probability rather than a bar for each number".
  // curveD = SVG path in a 0..11 x 0..100 box (column i centred at i+0.5), Catmull-Rom through every point
  // so it still passes through the exact n/36 values.
  const DICE_EXP = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map(k => k / 36 * 100);
  const curveD = (vals, max) => {
    const P = vals.map((v, i) => [i + 0.5, 100 - v / max * 100]), f = p => p.map(x => +x.toFixed(2)).join(',');
    let d = 'M' + f(P[0]);
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      d += ` C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
    }
    return d;
  };
  const diceCurve = max => `<svg class="curve" viewBox="0 0 11 100" preserveAspectRatio="none" aria-hidden="true"><path d="${curveD(DICE_EXP, max)}"/></svg>`;
  root.CatanArt = { RES_COL, RES_ICON, DEFS, patterns, houseD, oddsFill, ODDS, oddsBadge, ODDS_MIN, oddsShown, DICE_EXP, curveD, diceCurve };
})(typeof window !== 'undefined' ? window : globalThis);
