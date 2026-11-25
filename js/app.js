// Catan: the page. Local games run here (you + computers, or pass-the-phone);
// online games go through js/net.js (shared online.js). Rules live in js/engine.js.
// ONLINE is on (Tim 2026-10-27: "enable it to all games for now and we can disable it later").
// One online game costs ~500 Firestore writes with online.js v2 (_online/test/cost.mjs). false hides it.
const ONLINE = true;
if (ONLINE) import('./net.js?v=3');
const E =window.CatanEngine, AI = window.CatanAI, CG = window.CatanGame, W = window.TrackerWeights;
const { RES, COST } = E;
let G = E.G; // the board shown now (E.G for 3-4 players, E.BIG for 5-6); set by useGeo()
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const U = 40; // svg units per hex radius

// ------------------------------------------------------------ storage + settings
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const S = Object.assign({ n: 4, seats: ['human', 'medium', 'medium', 'medium', 'medium', 'medium'], board: 'random', speed: 'normal', spotOdds: true, weighted: false, mine: false, netName: '',
  friendly: false, balanced: false, vp: 10 }, store.get('catan.settings', {}));
while (S.seats.length < 6) S.seats.push('medium');
if (![3, 4, 5, 6].includes(S.n)) S.n = 4;
if (!(S.vp >= 8 && S.vp <= 13)) S.vp = 10;
if (!ONLINE) S.seats = S.seats.map(s => (s === 'online' ? 'medium' : s));
// the rules a new game starts with (house rules are off by default, set in Settings)
const gameRules = () => ({ board: S.board, vp: S.vp, friendly: !!S.friendly, balanced: !!S.balanced });
const saveSettings = () => store.set('catan.settings', S);

// ------------------------------------------------------------ app state
const app = {
  tab: 'play', st: null, viewer: 0, coverFor: -1, mode: null, robHex: -1, logN: 0, prevRes: null,
  net: null, netBusy: false, botTimer: null, busyAnim: false, give: [0, 0, 0, 0, 0], get: [0, 0, 0, 0, 0], discard: [0, 0, 0, 0, 0],
};
const RES_NAME = ['Wood', 'Brick', 'Sheep', 'Wheat', 'Ore'];
const ART = window.CatanArt; // shared board art (js/board-art.js), also used by In-person play
const RES_COL = ART.RES_COL;
const DEV_NAME = { K: 'Knight', V: 'Victory point', R: 'Road building', P: 'Year of plenty', M: 'Monopoly' };
const colorOf = p => E.COLORS[p].hex;

// ------------------------------------------------------------ the game the screen shows
function current() { // { g, seat, toAct, online, isHost }
  if (app.net && app.net.pub) {
    const s = app.net;
    const g = CG.merge(s.pub, s.mine, s.mySeat); useGeo(g);
    return { g, seat: s.mySeat, toAct: s.toAct || [], online: true };
  }
  if (!app.st) return null;
  const st = app.st, seat = app.viewer;
  const g = CG.merge(CG.game.publicView(st), CG.game.privateView(st, seat), seat); useGeo(g);
  return { g, seat, toAct: E.actors(st), online: false };
}
// switch the drawn board (and its zoom frame) when a 5-6 player game is shown, and back
function useGeo(g) {
  const want = E.geo(g);
  if (want === G) return;
  G = want; FIT = fitFor(G); view.sig = '';
  setVB(Object.assign({}, FIT));
}
const humans = st => st.players.map((P, i) => (P.kind === 'human' ? i : -1)).filter(i => i >= 0);

// ------------------------------------------------------------ tabs, sheet, toast
const TABS = [
  ['play', 'Online play', '<path d="M12 3l8 4.6v8.8L12 21l-8-4.6V7.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
  ['tracker', 'In-person play', '<path d="M5 20V10M10 20V5M15 20v-7M20 20v-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
  ['settings', 'Settings', '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
];
function renderTabs() {
  const html = TABS.map(([id, label, svg]) => `<button data-tab="${id}" ${app.tab === id ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span>${label}</span></button>`).join('');
  $('#tabsBottom').innerHTML = html; $('#tabsTop').innerHTML = html;
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab, true)));
}
function goTab(id, push) {
  if (app.tab === id) return;
  app.tab = id;
  if (push) history.pushState({ tab: id }, '', '#' + id);
  renderTabs(); render();
}
addEventListener('popstate', e => {
  if (!$('#sheet').hidden) { closeSheet(true); return; }
  const id = (e.state && e.state.tab) || location.hash.slice(1) || 'play';
  if (TABS.some(t => t[0] === id)) { app.tab = id; renderTabs(); render(); }
});
function openSheet(html, onMount) {
  const sh = $('#sheet'); sh.innerHTML = html; sh.hidden = false; $('#sheetBack').hidden = false;
  history.pushState(Object.assign({}, history.state, { sheet: 1 }), '', location.hash || '#play');
  sh.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet()));
  if (onMount) onMount(sh);
  updateBack();
}
function closeSheet(fromPop) { $('#sheet').hidden = true; $('#sheetBack').hidden = true; if (!fromPop && history.state && history.state.sheet) history.back(); updateBack(); }
$('#sheetBack').addEventListener('click', () => closeSheet());
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2400); }
const why = key => `<button class="q" data-why="${key}" aria-label="Why?">?</button>`;
const WHY = {
  game: ['How to play', 'Roll, collect from tiles next to your towns, build. Road = wood + brick. Town = wood, brick, sheep, wheat. City = 2 wheat + 3 ore. Card = sheep, wheat, ore. First to 10 points wins. A 7 moves the robber: anyone with more than 7 cards gives back half.'],
  odds: ['Spot odds', 'Numbers on open corners add up the dots of the tiles around them (a 6 or 8 is 5 dots, a 2 or 12 is 1). Each dot is one roll in 36, the same count as In-person play.'],
  weighted: ['Weighted', 'Corner numbers count a dot of a scarce resource for more and a common one for less. Each resource weighs (average dots per resource) ÷ (its dots on this board), between 0.5 and 2.'],
  mine: ['Mine', 'With Weighted on, weights fit you instead of the whole board: a resource counts more when you get little of it, when building needs a lot of it (one road + town + city + card: wheat and ore 4 each, the rest 2), and when little of it is left on corners that are still open. Taken corners and corners next to a town don\'t count.'],
  online: ['Online','Make a room with an "Online friend" seat, then friends type its code here. Seats nobody takes become computers.'],
  trade: ['Trading', 'Bank: 4 of one for 1. A 3:1 harbour or a 2:1 harbour of that kind is cheaper once you have a town on it. Offers to players: computers say yes when the deal helps them and you are not about to win.'],
  strong: ['How strong?', 'Measured in computer-only games in node; see Settings.'],
  extra: ['Extra build', 'With 5 or 6 players, after each turn everyone else gets a build step in turn order: build or buy a card, but no trading and no playing cards. It keeps the waits short. Players who can\'t afford anything are skipped.'],
  big: ['5-6 players', 'A 30-tile board (2 deserts, 11 harbours), 34 development cards, 24 of each resource, and an extra build step for everyone after each turn.'],
};
// Learn: real videos, each checked with YouTube's oEmbed (title matches) on 2026-10-28
const VIDEOS = [
  ['How to play · Watch It Played', 'https://www.youtube.com/watch?v=oiQ6SgBzfqY'],
  ['Rules in 4 minutes · The Rules Girl', 'https://www.youtube.com/watch?v=4fUa_ZJ7beM'],
  ['Strategy guide · Colonist', 'https://www.youtube.com/watch?v=p6qsFP168Nc'],
  ['5-6 players · Cardboard Crash Course', 'https://www.youtube.com/watch?v=EMWmMAw43ic'],
];
const videosHTML = () => `<div class="cap" style="margin-top:12px">Videos</div><ul class="vids">${VIDEOS.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>`;
const rulesExtra = () => `<p class="why small muted">5-6 players: bigger board and an extra build step after each turn. House rules (friendly robber, balanced board, points to win) are in Settings.</p>${videosHTML()}`;
document.addEventListener('click', e => {
  const q = e.target.closest('[data-why]'); if (!q) return;
  const [t, b] = WHY[q.dataset.why] || ['', ''];
  openSheet(`<div class="sheet-h"><span class="h">${t}</span><button class="btn sm ghost" data-close>Close</button></div><p class="why">${b}</p>${q.dataset.why === 'strong' ? strengthTable() : ''}${q.dataset.why === 'game' ? rulesExtra() : ''}`);
});

// ------------------------------------------------------------ board drawing
const pt = v => [G.V[v].x * U, G.V[v].y * U];
const hexPts = h => [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i + G.rot); return [(G.HEXES[h].x + Math.cos(a) * 0.985) * U, (G.HEXES[h].y + Math.sin(a) * 0.985) * U]; });
// the whole-board frame; the 5-6 player board is bigger, so it gets a wider frame of the same shape
const fitFor = g => (g === E.BIG ? { x: -7.5 * U, y: -6.5 * U, w: 15 * U, h: 13 * U } : { x: -5.6 * U, y: -4.85 * U, w: 11.2 * U, h: 9.7 * U });
let FIT = fitFor(E.G);
const TK = () => (G === E.BIG ? 1.22 : 1); // number tokens a little larger on the big board so they stay readable
const view = { vb: Object.assign({}, FIT), sig: '' };
// original tile prints: pines, brick courses, grazing dots, wheat rows, rock facets, dunes (js/board-art.js)
const patterns = ART.patterns;
function drawStatic(g) {
  const sig = g.hexRes.join() + '|' + g.hexNum.join() + '|' + g.ports.map(p => p.type).join();
  if (view.sig === sig) return;
  view.sig = sig;
  const big = G === E.BIG, tk = TK();
  $('#board').classList.toggle('big', big);
  const sea = (big ? [[7.05, 0], [7.05, 3.3], [1.2, 6.45], [-1.2, 6.45], [-7.05, 3.3], [-7.05, 0], [-7.05, -3.3], [-1.2, -6.45], [1.2, -6.45], [7.05, -3.3]]
    : [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i; return [Math.cos(a) * 5.55, Math.sin(a) * 5.55]; }))
    .map(([x, y]) => (x * U).toFixed(1) + ',' + (y * U).toFixed(1)).join(' ');
  let h = patterns();
  h += `<polygon class="frame" points="${sea}" /><polygon points="${sea}" fill="url(#seaG)"/><polygon points="${sea}" fill="url(#waves)"/>`;
  // harbours: two piers and a token
  g.ports.forEach(p => {
    const [a, b] = G.E[p.e].v, [ax, ay] = pt(a), [bx, by] = pt(b), mx = (ax + bx) / 2, my = (ay + by) / 2;
    // the token sits square out from its coast edge, so both corners are equally far from it and the
    // corner markers (spot odds) never cover it (pointing it from the board centre put it on one corner)
    let ox = ay - by, oy = bx - ax; const len = Math.hypot(ox, oy); ox /= len; oy /= len;
    if (ox * mx + oy * my < 0) { ox = -ox; oy = -oy; }
    const tx = mx + ox * 0.76 * U, ty = my + oy * 0.76 * U; // far enough out that the piers show between token and corners
    const r = RES.indexOf(p.type);
    h += `<g class="port"><path d="M${ax},${ay}L${tx},${ty}M${bx},${by}L${tx},${ty}" class="pier"/>
      <circle cx="${tx}" cy="${ty}" r="${0.38 * U}" class="ptok" ${r >= 0 ? `style="stroke:${RES_COL[r]}"` : ''}/>
      ${r >= 0 ? `<svg x="${tx - 0.15 * U}" y="${ty - 0.35 * U}" width="${0.3 * U}" height="${0.3 * U}" viewBox="0 0 20 20" aria-hidden="true">${RES_ICON[r]}</svg>` : ''}
      <text x="${tx}" y="${ty + (r >= 0 ? 0.19 : 0.13) * U}" class="ptxt">${r >= 0 ? '2:1' : '3:1'}</text></g>`;
  });
  g.hexRes.forEach((r, i) => {
    const P = hexPts(i).map(q => q.map(x => x.toFixed(1)).join(',')).join(' ');
    h += `<g class="hex" data-h="${i}"><polygon points="${P}" fill="url(#pt${r < 0 ? 5 : r})"/><polygon points="${P}" fill="url(#tileShade)" class="hedge"/></g>`;
  });
  g.hexNum.forEach((n, i) => {
    if (!n) return;
    const cx = G.HEXES[i].x * U, cy = G.HEXES[i].y * U, pp = E.pips(n), red = n === 6 || n === 8;
    let dots = ''; for (let k = 0; k < pp; k++) dots += `<circle cx="${cx + (k - (pp - 1) / 2) * 0.1 * tk * U}" cy="${cy + 0.25 * tk * U}" r="${0.034 * tk * U}" />`;
    h += `<g class="tok${red ? ' red' : ''}" data-num="${i}"><circle cx="${cx}" cy="${cy}" r="${0.4 * tk * U}" class="tokc"/><text x="${cx}" y="${cy + 0.1 * tk * U}" class="tokn">${n}</text><g class="pips">${dots}</g></g>`;
  });
  $('#static').innerHTML = h;
}
function house(x, y, s, cls, col) {
  const k = s * U;
  return `<path class="${cls}" style="fill:${col}" d="${ART.houseD(x, y, k)}"/>`;
}
function city(x, y, col) {
  const k = 0.36 * U;
  return `<path class="bld" style="fill:${col}" d="M${x - k * 1.15},${y + k * .8}V${y - k * .2}L${x - k * .55},${y - k * .8}L${x + .05 * k},${y - k * .2}V${y - k * .05}H${x + k * 1.15}V${y + k * .8}Z"/>`;
}
function drawLive(c) {
  const { g } = c, me = c.seat;
  let h = '';
  // roads
  g.eOwner.forEach((o, e) => {
    if (o < 0) return;
    const [a, b] = G.E[e].v, [ax, ay] = pt(a), [bx, by] = pt(b), t = 0.17;
    const x1 = ax + (bx - ax) * t, y1 = ay + (by - ay) * t, x2 = bx - (bx - ax) * t, y2 = by - (by - ay) * t;
    h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="road-u"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="road" style="stroke:${colorOf(o)}"/>`;
  });
  // robber
  const rh = G.HEXES[g.robber];
  const rx = rh.x * U - (0.52 + (TK() - 1) * 0.4) * U, ry = rh.y * U + 0.05 * U;
  h += `<g class="robber" transform="translate(${rx},${ry})"><ellipse cx="0" cy="${0.36 * U}" rx="${0.2 * U}" ry="${0.07 * U}" fill="rgba(0,0,0,.35)"/><path d="M${-0.17 * U},${0.36 * U}Q${-0.2 * U},${0.02 * U} ${-0.09 * U},${-0.1 * U}A${0.12 * U},${0.12 * U} 0 1 1 ${0.09 * U},${-0.1 * U}Q${0.2 * U},${0.02 * U} ${0.17 * U},${0.36 * U}Z" fill="#3b3640" stroke="#16131a" stroke-width="1.5"/></g>`;
  // buildings
  g.vOwner.forEach((o, v) => {
    if (o < 0) return;
    const [x, y] = pt(v);
    h += g.vLevel[v] === 2 ? city(x, y, colorOf(o)) : house(x, y, 0.27, 'bld', colorOf(o));
  });
  // what I may tap now
  const hl = targets(c), wNow = weightsFor(g, me);
  // Odds on: when not placing a town, every open corner still shows its number (look-only, taps pass through)
  if (S.spotOdds && hl.kind !== 'settle') g.vOwner.forEach((o, v) => {
    if (!openCorner(g, v)) return;
    const [x, y] = pt(v), odds = spotPips(g, v, wNow), txt = String(odds);
    h += `<g class="odds-p"><circle cx="${x}" cy="${y}" r="${0.26 * U}" class="hl-c" style="stroke:rgba(0,0,0,.45);stroke-width:1.5;fill:${ART.oddsFill(odds)}"/><text x="${x}" y="${y + (txt.length > 2 ? 0.1 : 0.12) * U}" class="hl-t${txt.length > 2 ? ' long' : ''}">${txt}</text></g>`;
  });
  hl.hexes.forEach(i => { const P = hexPts(i).map(q => q.join(',')).join(' '); h += `<polygon points="${P}" class="hl-hex" data-h="${i}"/>`; });
  hl.edges.forEach(e => {
    const [a, b] = G.E[e].v, [ax, ay] = pt(a), [bx, by] = pt(b);
    h += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="hl-edge" style="stroke:${colorOf(me)}"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="hit-edge" data-e="${e}"/>`;
  });
  hl.verts.forEach(v => {
    const [x, y] = pt(v);
    // a number only where a town may really go: empty corner, no building one road away
    const odds = S.spotOdds && hl.kind === 'settle' && openCorner(g, v) ? spotPips(g, v, wNow) : '';
    const fill = odds !== '' ? `;fill:${ART.oddsFill(odds)}` : '';
    const txt = String(odds);
    h += `<g class="hl-v" data-v="${v}"><circle cx="${x}" cy="${y}" r="${0.3 * U}" class="hl-c" style="stroke:${colorOf(me)}${fill}"/>${odds !== '' ? `<text x="${x}" y="${y + (txt.length > 2 ? 0.1 : 0.13) * U}" class="hl-t${txt.length > 2 ? ' long' : ''}">${txt}</text>` : ''}<circle cx="${x}" cy="${y}" r="${0.42 * U}" class="hit"/></g>`;
  });
  hl.cities.forEach(v => { const [x, y] = pt(v); h += `<g class="hl-v" data-v="${v}"><circle cx="${x}" cy="${y}" r="${0.42 * U}" class="hl-city"/><circle cx="${x}" cy="${y}" r="${0.45 * U}" class="hit"/></g>`; });
  $('#live').innerHTML = h;
}
// a corner's dots; with "Weighted" on, each dot counts by how scarce its resource is on this board
// (maths shared with In-person play in js/weights.js; engine resources are 0..4 in the same order as W.RES)
// "Mine" (with Weighted): weights for one seat from what it already gets and what is left on open corners.
// The robber's tile always counts (it moves too often to matter; Tim 2026-11-24).
const boardTot = g => W.totals(g.hexRes.map((r, h) => ({ resource: W.RES[r], number: g.hexNum[h] })));
const cornerHexes = (g, v) => G.V[v].hexes.filter(h => g.hexRes[h] >= 0).map(h => ({ resource: W.RES[g.hexRes[h]], pips: E.pips(g.hexNum[h]) }));
const openCorner = (g, v) => g.vOwner[v] < 0 && G.V[v].edges.every(e => G.E[e].v.every(u => g.vOwner[u] < 0));
function ownDots(g, seat) {
  const own = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.vOwner.forEach((o, v) => { if (o === seat) cornerHexes(g, v).forEach(h => { own[h.resource] += h.pips * (g.vLevel[v] === 2 ? 2 : 1); }); });
  return own;
}
function weightsFor(g, seat) {
  if (!S.weighted) return null;
  if (!S.mine || seat < 0) return W.weights(boardTot(g));
  const open = W.openDots(g.vOwner.map((_, v) => ({ open: openCorner(g, v), hexes: cornerHexes(g, v) })));
  return W.personal(ownDots(g, seat), open, boardTot(g));
}
const spotPips = (g, v, w) => (w ? Math.round(W.weightedSum(cornerHexes(g, v), w)) : G.V[v].hexes.reduce((a, h) => a + E.pips(g.hexNum[h]), 0));

// my own turn after the roll, or my extra build step (5-6 players) on someone else's turn
const buildingNow = (g, seat) => (g.phase === 'main' && g.turn === seat) || (g.phase === 'build' && g.build && g.build.queue[0] === seat);
// what the viewer can tap on the board right now
function targets(c) {
  const out = { verts: [], edges: [], hexes: [], cities: [], kind: '' };
  const { g, seat } = c;
  if (!c.toAct.includes(seat) || app.coverFor >= 0) return out;
  if (g.phase === 'setup') {
    if (g.sub === 'settle') { out.verts = E.setupSpots(g); out.kind = 'settle'; }
    else out.edges = G.V[g.lastV].edges.filter(e => g.eOwner[e] < 0);
  } else if (g.phase === 'robber' && g.turn === seat) {
    out.hexes = E.robberHexes(g, seat);
  } else if (g.phase === 'roads' && g.turn === seat) out.edges = E.legalRoads(g, seat);
  else if (buildingNow(g, seat)) {
    if (app.mode === 'road') out.edges = E.legalRoads(g, seat);
    if (app.mode === 'settle') { out.verts = E.legalSettles(g, seat); out.kind = 'settle'; }
    if (app.mode === 'city') g.vOwner.forEach((o, v) => { if (o === seat && g.vLevel[v] === 1) out.cities.push(v); });
  }
  return out;
}

// ------------------------------------------------------------ zoom + pan (viewBox)
function setVB(vb) {
  const z = Math.max(0.32, Math.min(1, vb.w / FIT.w));
  const w = FIT.w * z, h = FIT.h * z;
  const x = Math.max(FIT.x, Math.min(FIT.x + FIT.w - w, vb.x + (vb.w - w) / 2 * (vb.w === w ? 0 : 0)));
  const y = Math.max(FIT.y, Math.min(FIT.y + FIT.h - h, vb.y));
  view.vb = { x: z === 1 ? FIT.x : x, y: z === 1 ? FIT.y : y, w, h };
  $('#board').setAttribute('viewBox', `${view.vb.x} ${view.vb.y} ${view.vb.w} ${view.vb.h}`);
  $('#fitBtn').classList.toggle('lit', z < 0.999);
}
function zoomBy(f, cx, cy) {
  const vb = view.vb;
  if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
  const w = Math.max(FIT.w * 0.32, Math.min(FIT.w, vb.w * f)), h = w * FIT.h / FIT.w;
  setVB({ x: cx - (cx - vb.x) * (w / vb.w), y: cy - (cy - vb.y) * (h / vb.h), w, h });
}
function toSvg(clientX, clientY) {
  const r = $('#board').getBoundingClientRect(), vb = view.vb;
  return [vb.x + (clientX - r.left) / r.width * vb.w, vb.y + (clientY - r.top) / r.height * vb.h];
}
(function panZoom() {
  const svg = $('#board'), pts = new Map();
  let start = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; start = { x: e.clientX, y: e.clientY, vb: Object.assign({}, view.vb) };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: Object.assign({}, view.vb), c: toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; } });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      view.vb = Object.assign({}, pinch.vb); zoomBy(pinch.d / d, pinch.c[0], pinch.c[1]); moved = true; return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 8) return;
    if (view.vb.w >= FIT.w - 0.5) return; // nothing to pan at full fit
    moved = true;
    const r = svg.getBoundingClientRect();
    setVB({ x: start.vb.x - dx / r.width * start.vb.w, y: start.vb.y - dy / r.height * start.vb.h, w: start.vb.w, h: start.vb.h });
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) start = null; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = toSvg(e.clientX, e.clientY); zoomBy(e.deltaY > 0 ? 1.15 : 0.87, x, y); }, { passive: false });
  svg.addEventListener('click', e => { if (moved) { moved = false; return; } onBoardTap(e); });
  $('#zoomIn').addEventListener('click', () => zoomBy(0.75));
  $('#zoomOut').addEventListener('click', () => zoomBy(1 / 0.75));
  $('#fitBtn').addEventListener('click', () => setVB(Object.assign({}, FIT)));
})();

function onBoardTap(e) {
  const c = current(); if (!c) return;
  const v = e.target.closest('[data-v]'), ed = e.target.closest('[data-e]'), hx = e.target.closest('.hl-hex');
  const g = c.g;
  if (v) {
    const id = +v.dataset.v;
    if (g.phase === 'setup') return act({ t: 'settle', v: id });
    if (app.mode === 'settle') return act({ t: 'settle', v: id });
    if (app.mode === 'city') return act({ t: 'city', v: id });
  }
  if (ed) return act({ t: 'road', e: +ed.dataset.e });
  if (hx) {
    const h = +hx.dataset.h, vs = E.victims(g, c.seat, h);
    if (vs.length <= 1) return act({ t: 'robber', h, from: vs.length ? vs[0] : -1 });
    app.robHex = h; render();
  }
}

// ------------------------------------------------------------ moves
function act(a) {
  const c = current(); if (!c) return;
  if (c.online) {
    if (app.net.sending) return;
    app.net.sending = true;
    window.CatanNet.act(a).then(r => { if (app.net) app.net.sending = false; if (!r.ok && !r.stale) toast(r.message); else if (r.stale) toast(r.message); });
    afterMyMove(a); return;
  }
  const before = app.st;
  try { app.st = E.apply(JSON.parse(JSON.stringify(app.st)), c.seat, a); }
  catch (err) { toast(err.message); FX.play('error'); return; }
  if (UNDO_GAME.includes(a.t) && app.st.phase !== 'over') pushUndo({ before, after: app.st, inMode: app.mode });
  afterMyMove(a);
  changed();
}

// ------------------------------------------------------------ back (top-left)
// Takes back your own last step while nothing else has happened since: a switch you flicked, a build
// choice or sheet you opened, or, in a game on this device, a town / road / city / bank trade before
// anyone else moves. Rolls, bought cards, robbing and offers reveal new information, and online moves are
// already shared with the other phones (online.js has no take-back), so those can't be undone.
const UNDO_GAME = ['settle', 'road', 'city', 'bank'];
const undo = [];
function pushUndo(u) { undo.push(u); if (undo.length > 60) undo.shift(); }
function setSetting(key, val) {
  if (S[key] === val) return;
  pushUndo({ ui: key, prev: S[key] });
  S[key] = val; saveSettings(); render();
}
function undoTop() { // the newest step that can still be taken back; game steps go stale once the game moves on
  while (undo.length) {
    const u = undo[undo.length - 1];
    if (u.ui || (u.mode && app.mode === u.mode) || (u.after && !app.net && app.st && app.st === u.after)) return u;
    undo.pop();
  }
  return null;
}
const sheetOpen = () => !$('#sheet').hidden;
function canBack() { return sheetOpen() || app.robHex >= 0 || !!app.mode || !!undoTop(); }
function updateBack() { const b = $('#backBtn'); if (b) b.disabled = !canBack(); }
function goBack() {
  if (sheetOpen()) { closeSheet(); return; }
  if (app.robHex >= 0) { app.robHex = -1; render(); return; }
  const u = undoTop();
  if (!u) { if (app.mode) { app.mode = null; render(); } return; }
  undo.pop();
  if (u.ui) { S[u.ui] = u.prev; saveSettings(); render(); return; }
  if (u.mode) { app.mode = null; render(); return; }
  clearTimeout(app.botTimer);
  app.st = u.before; app.mode = u.inMode || null; app.robHex = -1; // back where you were: Town still chosen, tap again
  FX.play('slide');
  changed();
}
$('#backBtn').addEventListener('click', goBack);
function afterMyMove(a) {
  if (['road', 'settle', 'city'].includes(a.t)) {
    const c = current();
    const still = c && buildingNow(c.g, c.seat) && a.t !== 'city' && E.canPay(c.g.players[c.seat].res, COST[a.t === 'settle' ? 'settle' : 'road']);
    if (!still) app.mode = null;
  }
  if (a.t === 'robber') app.robHex = -1;
  if (a.t === 'discard') app.discard = [0, 0, 0, 0, 0];
  if (a.t === 'offer' || a.t === 'bank') { app.give = [0, 0, 0, 0, 0]; app.get = [0, 0, 0, 0, 0]; }
}
// local game loop: save, draw, then let computers move
function changed() {
  const st = app.st;
  if (!st) return;
  store.set('catan.game', st);
  const hs = humans(st), act = E.actors(st).filter(i => st.players[i].kind === 'human');
  const next = act.length ? act[0] : (hs.includes(app.viewer) ? app.viewer : hs[0] ?? 0);
  if (next !== app.viewer && hs.length > 1) app.coverFor = next;
  app.viewer = next;
  render();
  scheduleBots();
}
// Normal speed: how long (ms) the table pauses after each kind of move before a computer moves again
const PACE = { roll: 1900, settle: 1200, city: 1200, road: 1000, buy: 1100, play: 1300, robber: 1500, bank: 1300, deal: 1400,
  offer: 1300, nodeal: 1000, discard: 1100, end: 900, pass: 600, longest: 1500, army: 1500 };
function scheduleBots() {
  clearTimeout(app.botTimer);
  const st = app.st; if (!st || st.phase === 'over' || app.net) return;
  const bots = E.actors(st).filter(i => st.players[i].kind === 'cpu');
  if (!bots.length) return;
  const fast = S.speed === 'fast';
  const lastE = st.log.length ? st.log[st.log.length - 1] : null, lastRoll = lastE && lastE.k === 'roll';
  // Normal: each action stays on screen long enough to follow (Tim 2026-11-24); a roll waits for its dice + card flights
  const delay = S.speed === 'test' ? 1 : fast ? 260 + (lastRoll ? 350 : 0) // 'test' = headless soak runs only
    : Math.max(lastE ? PACE[lastE.k] || 900 : 900, (app.fxUntil || 0) - Date.now() + 250);
  app.botTimer = setTimeout(() => {
    if (app.st !== st) return;
    let s = st;
    try {
      for (const b of bots) if (E.actors(s).includes(b)) s = E.apply(JSON.parse(JSON.stringify(s)), b, AI.choose(s, b, Math.random));
    } catch (err) { console.error(err); toast('Computer error: ' + err.message); return; }
    app.st = s; changed();
  }, delay);
}

// ------------------------------------------------------------ effects from what changed
function fxStep(c) {
  const g = c.g, newer = g.log.filter(e => e.n > app.logN);
  const first = app.logN === 0 && g.log.length && !app.freshGame;
  app.logN = g.logN || 0; app.freshGame = false;
  if (first || !newer.length) return;
  const slow = S.speed === 'normal'; // Fast (and the headless 'test' speed) keep the quick effects
  const lastRoll = newer.map(e => e.k).lastIndexOf('roll'); // after a catch-up, only the newest roll plays
  newer.forEach((e, i) => {
    const other = e.p !== c.seat;
    if (e.k === 'roll') {
      if (i !== lastRoll) return;
      FX.play('diceRoll');
      const t = e.d[0] + e.d[1];
      if (!slow) {
        diceFx(e, false);
        if (t === 7) { setTimeout(() => FX.play('stamp'), 500); return; }
        setTimeout(() => flashNumber(t), 600);
        if (e.gain) setTimeout(() => showGains(g, c.seat, e.gain, t), 650);
        return;
      }
      const land = diceFx(e, true);
      app.fxUntil = Date.now() + land.ms + 700;
      land.done.then(() => {
        if (t === 7) { FX.play('stamp'); return; }
        flashNumber(t);
        if (e.gain) { const n = flyGains(g, c.seat, e.gain, t); if (n) FX.play('cardDeal'); }
      });
      if (t !== 7 && e.gain) app.fxUntil += Math.max(0, countGains(g, e.gain, t) - 1) * FLY_GAP + FLY_MS - 700;
    } else if (e.k === 'settle' || e.k === 'city' || e.k === 'road') {
      FX.play(e.k === 'road' ? 'slide' : 'place', { pitch: e.k === 'city' ? 0.8 : 1 });
      if (slow && other) markPiece(e);
    } else if (e.k === 'robber') {
      FX.play('stamp'); if (e.from === c.seat) toast(`${nm(g, e.p)} robbed you`);
      if (slow && other) { markHex(e.h); if (e.from >= 0) flySteal(e.from, e.p, c.seat); }
    } else if (e.k === 'buy') { FX.play('cardFlip'); if (slow && other) flashSeat(e.p); }
    else if (e.k === 'play') { FX.play('cardSlide'); if (other) toast(`${nm(g, e.p)} played ${DEV_NAME[e.card]}${e.card === 'M' ? ': all ' + RES[e.r] : ''}`); if (slow && other) flashSeat(e.p); }
    else if (e.k === 'bank' || e.k === 'discard') { if (slow && other) flashSeat(e.p); }
    else if (e.k === 'deal') { FX.play('cardDeal'); if (slow) { flashSeat(e.p); flashSeat(e.with); } }
    else if (e.k === 'longest' && e.p >= 0) { FX.play('ding'); toast(`${nm(g, e.p)} take${e.p === c.seat ? '' : 's'} Longest Road`); }
    else if (e.k === 'army') { FX.play('ding'); toast(`${nm(g, e.p)} take${e.p === c.seat ? '' : 's'} Largest Army`); }
    else if (e.k === 'win') {
      const mine = e.p === c.seat;
      setTimeout(() => FX.celebrate({ kind: mine ? 'win' : 'lose', colors: [colorOf(e.p), '#f5d76e', '#fff'] }), 400);
    } else if (e.k === 'end' && g.turn === c.seat && g.players[c.seat].kind !== 'cpu') FX.play('turn');
  });
}
// ---- Normal-speed table effects: overlay layers only (nothing in the page moves or resizes), taps pass through
const still = () => !FX.settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches; // fade only
const FLY_GAP = 130, FLY_MS = 950;
// big dice tumbling in the middle of the board, landing on the real roll, then fading; returns when they land
function diceFx(e, slow) {
  const wrap = $('#boardWrap');
  if (!wrap || app.tab !== 'play') return { ms: 0, done: Promise.resolve() };
  let box = $('#diceFx');
  if (!box) { box = document.createElement('div'); box.id = 'diceFx'; box.className = 'dice-fx'; box.setAttribute('aria-hidden', 'true'); wrap.appendChild(box); }
  const gen = (box.gen || 0) + 1; box.gen = gen;
  (box.getAnimations ? box.getAnimations() : []).forEach(a => a.cancel());
  const t = e.d[0] + e.d[1], tumble = slow ? 850 : 450, hold = slow ? 750 : 350, fadeIn = slow ? 150 : 100, fadeOut = slow ? 300 : 200;
  box.innerHTML = `<div class="dfx-in" style="--pc:${colorOf(e.p)}"><div class="dfx-dice"><div class="tbl-die"></div><div class="tbl-die"></div></div><b class="dfx-sum${t === 7 ? ' seven' : ''}">${t}</b></div>`;
  box.hidden = false;
  const dice = box.querySelectorAll('.tbl-die'), sum = box.querySelector('.dfx-sum');
  TABLE.die(dice[0], 1 + Math.floor(Math.random() * 6)); TABLE.die(dice[1], 1 + Math.floor(Math.random() * 6));
  const anim = (el, f, o) => { try { return el.animate(f, Object.assign({ fill: 'forwards' }, o)); } catch (x) { return null; } };
  anim(box, [{ opacity: 0 }, { opacity: 1 }], { duration: fadeIn });
  const ms = fadeIn + tumble; // reduced motion: same timing, the dice just show their faces (no tumble)
  const done = new Promise(res => {
    if (still()) { TABLE.die(dice[0], e.d[0]); TABLE.die(dice[1], e.d[1]); setTimeout(res, ms); return; }
    setTimeout(() => Promise.all([TABLE.roll(dice[0], e.d[0], { duration: tumble }), TABLE.roll(dice[1], e.d[1], { duration: tumble })]).then(res), fadeIn);
  }).then(() => {
    if (box.gen !== gen) return;
    sum.classList.add('on');
    setTimeout(() => {
      if (box.gen !== gen) return;
      const a = anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: fadeOut });
      const hide = () => { if (box.gen === gen) { box.hidden = true; box.innerHTML = ''; } };
      if (a) a.onfinish = hide; else hide();
    }, hold);
  });
  return { ms, done };
}
// one card per resource card paid (cities 2), capped by what the bank really gave
function gainCards(g, gain, num) {
  const left = gain.map(a => (a ? a.slice() : [0, 0, 0, 0, 0])), out = [];
  g.hexNum.forEach((n, h) => {
    if (n !== num || h === g.robber) return;
    const r = g.hexRes[h];
    G.hexVerts[h].forEach(v => {
      const o = g.vOwner[v]; if (o < 0 || !left[o]) return;
      const k = Math.min(g.vLevel[v] === 2 ? 2 : 1, left[o][r]); left[o][r] -= k;
      for (let j = 0; j < k; j++) out.push({ h, r, o });
    });
  });
  return out;
}
const countGains = (g, gain, num) => gainCards(g, gain, num).length;
// each card pops out of its tile, then flies to the player's seat (your own cards: to that card in your hand)
function flyGains(g, me, gain, num) {
  const cards = gainCards(g, gain, num), fade = still();
  cards.forEach(({ h, r, o }, i) => {
    const [sx, sy] = svgToScreen(G.HEXES[h].x * U, G.HEXES[h].y * U);
    const to = o === me ? document.querySelector(`#mine .rc[data-r="${r}"]`) : document.querySelector(`.opp[data-p="${o}"]`);
    const el = document.createElement('div'); el.className = 'res-fly'; el.style.cssText = `--rc:${RES_COL[r]};left:${sx - 14}px;top:${sy - 18}px;opacity:0`;
    el.innerHTML = resIcon(r);
    document.body.appendChild(el);
    let frames;
    if (fade || !to) frames = [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }];
    else {
      const b = to.getBoundingClientRect(), dx = b.left + b.width / 2 - sx, dy = b.top + b.height / 2 - sy;
      frames = [{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { transform: 'translate(0,-6px) scale(1.15)', opacity: 1, offset: 0.18 },
        { transform: 'translate(0,-6px) scale(1.15)', opacity: 1, offset: 0.32 }, { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 0.9 }];
    }
    let a = null;
    try { a = el.animate(frames, { duration: FLY_MS, delay: i * FLY_GAP, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' }); } catch (x) { /* no animations */ }
    if (a) a.onfinish = a.oncancel = () => el.remove(); else setTimeout(() => el.remove(), 10);
  });
  return cards.length;
}
// a ring on another player's new road / town / city, and on the robber's new tile
function fxLayer() {
  let l = $('#fxg');
  if (!l) { $('#board').insertAdjacentHTML('beforeend', '<g id="fxg" style="pointer-events:none"></g>'); l = $('#fxg'); }
  return l;
}
function addMark(svg) {
  const l = fxLayer(), id = 'm' + Math.random().toString(36).slice(2);
  l.insertAdjacentHTML('beforeend', `<g class="fx-mark" id="${id}">${svg}</g>`);
  setTimeout(() => { const m = document.getElementById(id); if (m) m.remove(); }, 1300);
}
function markPiece(e) {
  const col = colorOf(e.p);
  if (e.k === 'road') {
    const [a, b] = G.E[e.e].v, [ax, ay] = pt(a), [bx, by] = pt(b);
    addMark(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="mk-glow"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="mk-line" style="stroke:${col}"/>`);
  } else {
    const [x, y] = pt(e.v);
    addMark(`<circle cx="${x}" cy="${y}" r="${0.62 * U}" class="mk-glow"/><circle cx="${x}" cy="${y}" r="${0.62 * U}" class="mk-ring" style="stroke:${col}"/>`);
  }
}
function markHex(h) {
  const P = hexPts(h).map(q => q.join(',')).join(' ');
  addMark(`<polygon points="${P}" class="mk-glow"/><polygon points="${P}" class="mk-ring" style="stroke:#1b1410"/>`);
}
function flashSeat(p) { const el = document.querySelector(`.opp[data-p="${p}"]`); if (el) FX.flash(el, colorOf(p)); }
// robber steal: a face-down card goes from the victim to the thief
function flySteal(from, to, me) {
  const src = from === me ? $('#mine') : document.querySelector(`.opp[data-p="${from}"]`);
  const dst = to === me ? $('#mine') : document.querySelector(`.opp[data-p="${to}"]`);
  if (!src || !dst) return;
  const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'res-fly back'; el.style.cssText = `left:${a.left + a.width / 2 - 14}px;top:${a.top + a.height / 2 - 18}px;opacity:0`;
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const frames = still() ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }]
    : [{ transform: 'translate(0,0)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1, offset: 0.2 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 0.9 }];
  let an = null;
  try { an = el.animate(frames, { duration: 900, delay: 350, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' }); } catch (x) { /* no animations */ }
  if (an) an.onfinish = an.oncancel = () => el.remove(); else el.remove();
}
const nm = (g, p) => (p === current()?.seat && !current()?.online && humans(app.st || g).length === 1 ? 'You' : g.players[p].name);
function flashNumber(n) {
  document.querySelectorAll('#static .tok').forEach(t => { if (+t.querySelector('.tokn').textContent === n) { t.classList.remove('hit-num'); void t.getBBox(); t.classList.add('hit-num'); } });
}
function svgToScreen(x, y) {
  const r = $('#board').getBoundingClientRect(), vb = view.vb;
  return [r.left + (x - vb.x) / vb.w * r.width, r.top + (y - vb.y) / vb.h * r.height];
}
function showGains(g, me, gain, num) {
  if (!FX.settings.animations) return;
  g.hexNum.forEach((n, h) => {
    if (n !== num || h === g.robber) return;
    const [sx, sy] = svgToScreen(G.HEXES[h].x * U, G.HEXES[h].y * U);
    G.hexVerts[h].forEach(v => {
      const o = g.vOwner[v]; if (o < 0 || !gain[o][g.hexRes[h]]) return;
      const r = g.hexRes[h];
      const chip = document.createElement('div'); chip.className = 'fly-card'; chip.style.background = RES_COL[r]; chip.style.left = sx - 9 + 'px'; chip.style.top = sy - 12 + 'px';
      document.body.appendChild(chip);
      const to = o === me ? document.querySelector(`.rc[data-r="${r}"]`) : document.querySelector(`.opp[data-p="${o}"]`);
      (to ? FX.flyTo(chip, to, { clone: false, duration: 520 }) : Promise.resolve()).then(() => chip.remove());
    });
  });
  if (gain[me] && E.sum(gain[me])) FX.play('cardDeal');
}

// ------------------------------------------------------------ small art
const resIcon = r => `<svg viewBox="0 0 20 20" class="ri" aria-hidden="true">${RES_ICON[r]}</svg>`;
const RES_ICON = ART.RES_ICON;
const costHTML = cost => cost.map((n, r) => Array(n).fill(`<i class="cdot" style="background:${RES_COL[r]}"></i>`).join('')).join('');
const vpOf = (g, p, mine) => E.publicVP(g, p) + (mine || g.phase === 'over' ? g.players[p].vpCards || 0 : 0);

// ------------------------------------------------------------ seats + hand
function seatsHTML(c) {
  const { g, seat } = c;
  return g.players.map((P, i) => {
    if (i === seat) return '';
    const on = c.toAct.includes(i), lr = g.longest.p === i, la = g.army.p === i;
    const away = app.net && app.net.seats && app.net.seats[i] && app.net.seats[i].kind === 'human' && !app.net.seats[i].online;
    return `<div class="opp${on ? ' on' : ''}" data-p="${i}" style="--pc:${colorOf(i)}">
      <div class="opp-n"><i class="pc"></i><span class="nm">${esc(P.name)}</span>${P.kind === 'cpu' ? `<span class="lv">${P.level[0].toUpperCase()}</span>` : ''}${away ? '<span class="lv">away</span>' : ''}</div>
      <div class="opp-s"><b class="vp">${vpOf(g, i, false)}</b><span title="Cards" class="ct"><i class="ic-card"></i>${P.res}</span><span title="Development cards" class="ct"><i class="ic-dev"></i>${P.dev}</span>${P.knights ? `<span title="Knights played" class="ct kn">⚔${P.knights}</span>` : ''}${lr ? '<span class="aw" title="Longest Road">LR</span>' : ''}${la ? '<span class="aw" title="Largest Army">LA</span>' : ''}</div>
    </div>`;
  }).join('');
}
function mineHTML(c) {
  const { g, seat } = c, P = g.players[seat];
  if (!P || typeof P.res === 'number') return '';
  const devs = {}; P.dev.forEach(k => { devs[k] = (devs[k] || 0) + 1; });
  const fresh = {}; (P.fresh || []).forEach(k => { fresh[k] = (fresh[k] || 0) + 1; });
  const myTurn = g.turn === seat && (g.phase === 'main' || (g.phase === 'roll')) && c.toAct.includes(seat);
  const devBtns = Object.keys(devs).sort((a, b) => 'KRPMV'.indexOf(a) - 'KRPMV'.indexOf(b)).map(k => {
    const can = k !== 'V' && myTurn && !g.devUsed && devs[k] - (fresh[k] || 0) > 0;
    return `<button class="devc${k === 'V' ? ' vp' : ''}" data-dev="${k}" ${can ? '' : 'disabled'} aria-label="${DEV_NAME[k]}"><span>${DEV_NAME[k]}</span>${devs[k] > 1 ? `<b>×${devs[k]}</b>` : ''}${k !== 'V' && devs[k] - (fresh[k] || 0) <= 0 ? '<small>next turn</small>' : ''}</button>`;
  }).join('');
  // while giving cards back, the hand itself is the picker: tap a card to give one of it
  const dis = g.phase === 'discard' && g.discard && g.discard[seat] && c.toAct.includes(seat) && app.coverFor < 0;
  const full = dis && E.sum(app.discard) >= g.discard[seat];
  const card = (n, r) => {
    const k = dis ? app.discard[r] : 0, left = n - k, at = `data-r="${r}" style="--rc:${RES_COL[r]}"`;
    if (!dis) return `<div class="rc${n ? '' : ' zero'}" ${at} aria-label="${RES_NAME[r]} ${n}">${resIcon(r)}<b>${n}</b></div>`;
    return `<button class="rc pick${left ? '' : ' zero'}" ${at} data-pick="${r}" ${!left || full ? 'disabled' : ''} aria-label="Give back 1 ${RES[r]} (${left} left)">${resIcon(r)}<b>${left}</b>${k ? `<em>−${k}</em>` : ''}</button>`;
  };
  return `<div class="hand">
    ${P.res.map(card).join('')}
    <div class="myvp" style="--pc:${colorOf(seat)}" title="Your points"><b>${vpOf(g, seat, true)}</b><span>${g.rules.vp !== 10 ? 'of ' + g.rules.vp : 'pts'}</span></div>
  </div>
  ${devBtns ? `<div class="devs">${devBtns}</div>` : ''}`;
}

// ------------------------------------------------------------ the action panel
function diceHTML(g) {
  const d = g.dice || [g.lastDice ? g.lastDice[0] : 1, 1];
  return `<div id="dice" class="dice${g.dice ? '' : ' idle'}"><div class="tbl-die" data-v="${d[0]}"></div><div class="tbl-die" data-v="${d[1]}"></div></div>`;
}
function lastLine(c) {
  const { g } = c;
  for (let i = g.log.length - 1; i >= 0; i--) { const s = describe(g, g.log[i], c.seat); if (s) return s; }
  return '';
}
function describe(g, e, me) {
  const who = e.p === me ? 'You' : (g.players[e.p] || {}).name;
  switch (e.k) {
    case 'roll': { const t = e.d[0] + e.d[1]; const mine = e.gain && e.gain[me] ? e.gain[me].map((n, r) => (n ? n + ' ' + RES[r] : '')).filter(Boolean).join(', ') : '';
      return `${who} rolled ${t}${t === 7 ? ': robber!' : ''}${mine ? ` · you got ${mine}` : ''}`; }
    case 'settle': return `${who} built a town`;
    case 'city': return `${who} built a city`;
    case 'road': return e.setup ? '' : `${who} built a road`;
    case 'buy': return `${who} bought a card`;
    case 'play': return `${who} played ${DEV_NAME[e.card]}`;
    case 'robber': return `${who} moved the robber${e.from >= 0 ? ' and robbed ' + (e.from === me ? 'you' : g.players[e.from].name) + (e.r >= 0 ? ` (1 ${RES[e.r]})` : '') : ''}`;
    case 'bank': return `${who} traded ${e.c} ${RES[e.give]} for 1 ${RES[e.get]}`;
    case 'deal': return `${who} traded with ${e.with === me ? 'you' : g.players[e.with].name}`;
    case 'nodeal': return who === 'You' ? 'Nobody took your offer' : `Nobody took ${who}'s offer`;
    case 'discard': return `${who} gave back ${e.c} card${e.c === 1 ? '' : 's'}`;
    case 'win': return `${who} won${e.timeout ? ' on points' : ''}!`;
    default: return '';
  }
}
function stepper(kind, r, v, max) {
  return `<div class="stp" style="--rc:${RES_COL[r]}">${resIcon(r)}<button data-st="${kind}" data-r="${r}" data-d="-1" ${v <= 0 ? 'disabled' : ''} aria-label="Less ${RES[r]}">−</button><output>${v}</output><button data-st="${kind}" data-r="${r}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="More ${RES[r]}">+</button></div>`;
}
function offerText(g, o, me) {
  const list = h => h.map((n, r) => (n ? n + ' ' + RES[r] : '')).filter(Boolean).join(' + ');
  return `<b>${o.from === me ? 'You' : esc(g.players[o.from].name)}</b> give ${list(o.give)} for ${list(o.get)}`;
}
// spot odds on/off right where you place a town (same setting as the Settings switch)
// plus "Weighted": the same numbers counted by how scarce each resource is (also in Settings)
const lever = (key, label) => `<label class="odds-lever">${label}<span class="switch sm"><input type="checkbox" data-lever="${key}" ${S[key] ? 'checked' : ''}><span></span></span></label>`;
// "Mine" shows only while Weighted is on
const wLevers = () => `${lever('weighted', 'Weighted')}${S.weighted ? lever('mine', 'Mine') : ''}`;
const levers = () => `${lever('spotOdds', 'Odds')}${wLevers()}`;
function panelHTML(c) {
  const { g, seat } = c, P = g.players[seat], mineTurn = c.toAct.includes(seat) && app.coverFor < 0;
  const head = (t, extra) => `<div class="head"><span class="h">${t}</span>${extra || ''}</div>`;
  const status = `<button class="last small muted" data-feed aria-label="What happened lately">${esc(lastLine(c))}<span class="more" aria-hidden="true">›</span></button>`;
  if (g.phase === 'over') {
    const w = g.winner;
    const parts = i => {
      const t = g.vLevel.filter((l, v) => l === 1 && g.vOwner[v] === i).length, ci = g.vLevel.filter((l, v) => l === 2 && g.vOwner[v] === i).length;
      return [t && `${t} town${t > 1 ? 's' : ''}`, ci && `${ci} cit${ci > 1 ? 'ies' : 'y'} (${ci * 2})`, g.longest.p === i && 'Longest road (2)', g.army.p === i && 'Largest army (2)', g.players[i].vpCards && `${g.players[i].vpCards} point card${g.players[i].vpCards > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
    };
    const rows = g.players.map((Q, i) => ({ i, vp: E.publicVP(g, i) + (Q.vpCards || 0) })).sort((a, b) => b.vp - a.vp)
      .map(x => `<div class="seat"><i style="background:${colorOf(x.i)}"></i><span class="grow">${esc(g.players[x.i].name)}${x.i === w ? ' · winner' : ''}<span class="small muted bd">${parts(x.i)}</span></span><b class="num">${x.vp}</b></div>`).join('');
    return `<div class="phase">${head(w === seat ? 'You win!' : esc(g.players[w].name) + ' wins', `<button class="btn primary sm" id="againBtn">New game</button>`)}${rows}
      <button class="btn sm block" id="diceBtn" style="margin-top:8px">Dice this game</button></div>`;
  }
  if (!mineTurn) {
    let t = '';
    const o = g.offer;
    if (g.phase === 'trade' && o && o.from === seat) t = 'Waiting for answers…';
    else if (g.phase === 'discard') t = 'Robber! Big hands give back half…';
    else if (g.phase === 'build' && g.players[c.toAct[0]]) t = `${esc(g.players[c.toAct[0]].name)}: extra build`;
    else t = `${esc(g.players[c.toAct[0]] ? g.players[c.toAct[0]].name : '')}'s turn`;
    return `<div class="phase"><div class="row">${diceHTML(g)}<div class="grow"><div class="h hs">${t}</div>${status}</div></div>${o ? `<div class="offer small">${offerText(g, o, seat)}</div>` : ''}</div>`;
  }
  switch (g.phase) {
    case 'setup': return `<div class="phase">${head(g.sub === 'settle' ? 'Place a town' : 'Place a road', `<span class="levers">${levers()}</span>`)}<div class="small muted">${g.sub === 'settle' ? (g.step >= g.n ? 'Your second town pays its tiles now.' : S.spotOdds ? 'Numbers show each corner\'s dots.' : 'Tap a glowing corner.') : 'Next to the town you just placed.'}${g.sub === 'settle' ? why('odds') : ''}</div></div>`;
    case 'roll': {
      const kn = E.playable(g, seat, 'K') > 0 && !g.devUsed;
      return `<div class="phase"><div class="row">${diceHTML(g)}<button class="btn warm grow big-btn" id="rollBtn">Roll</button>${kn ? '<button class="btn" data-dev="K">Knight first</button>' : ''}</div>${status}</div>`;
    }
    case 'discard': {
      const need = g.discard[seat], picked = E.sum(app.discard);
      return `<div class="phase">${head(`Give back ${need}`, `${picked ? '<button class="btn sm ghost" id="unpickAll">Reset</button>' : ''}<button class="btn primary sm" id="discardBtn" ${picked === need ? '' : 'disabled'}>Give ${picked}/${need}</button>`)}
        <div class="small muted">Tap your cards below to pick them.</div></div>`;
    }
    case 'robber': {
      if (app.robHex >= 0) {
        const vs = E.victims(g, seat, app.robHex);
        return `<div class="phase">${head('Rob who?', '<button class="btn sm ghost" id="robBack">Back</button>')}<div class="row wrap">${vs.map(v => `<button class="btn" data-rob="${v}" style="border-color:${colorOf(v)}"><i class="pc" style="background:${colorOf(v)}"></i>${esc(g.players[v].name)} · ${g.players[v].res}</button>`).join('')}</div></div>`;
      }
      return `<div class="phase">${head('Move the robber')}<div class="small muted">Tap a tile. You steal a card from someone there.</div></div>`;
    }
    case 'roads': return `<div class="phase">${head(`Place ${g.freeRoads} free road${g.freeRoads > 1 ? 's' : ''}`, '<button class="btn sm ghost" id="stopRoads">Done</button>')}</div>`;
    case 'trade': {
      const o = g.offer;
      if (o.stage === 'ask') return `<div class="phase">${head('Trade offer')}<div class="offer">${offerText(g, o, seat)}</div><div class="row" style="margin-top:8px"><button class="btn primary grow" data-ans="1">Accept</button><button class="btn grow" data-ans="0">Decline</button></div></div>`;
      const yes = o.resp.map((r, i) => (r === true ? i : -1)).filter(i => i >= 0);
      const no = o.resp.map((r, i) => (r === false && i !== o.from ? i : -1)).filter(i => i >= 0);
      return `<div class="phase">${head('Who gets the deal?', '<button class="btn sm ghost" id="cancelDeal">Cancel</button>')}<div class="offer small">${offerText(g, o, seat)}</div><div class="row wrap" style="margin-top:6px">${yes.map(v => `<button class="btn" data-deal="${v}"><i class="pc" style="background:${colorOf(v)}"></i>${esc(g.players[v].name)}</button>`).join('')}</div>${no.length ? `<div class="small muted" style="margin-top:4px">Said no: ${no.map(v => esc(g.players[v].name)).join(', ')}</div>` : ''}</div>`;
    }
    case 'main':
    case 'build': {
      const res = P.res, extra = g.phase === 'build';
      const b = (id, label, cost, ok) => `<button class="bld-btn${app.mode === id ? ' on' : ''}" data-build="${id}" ${ok ? '' : 'disabled'}><span>${label}</span><span class="cost">${costHTML(cost)}</span></button>`;
      const canR = E.canPay(res, COST.road) && E.roadsLeft(g, seat) && E.legalRoads(g, seat).length;
      const canS = E.canPay(res, COST.settle) && E.settlesLeft(g, seat) && E.legalSettles(g, seat).length;
      const canC = E.canPay(res, COST.city) && E.citiesLeft(g, seat) && g.vOwner.some((o, v) => o === seat && g.vLevel[v] === 1);
      const canD = E.canPay(res, COST.dev) && g.deck > 0;
      // placing a town: the two switches take the hint's place (the corners glow; Town again or Back cancels)
      const hint = app.mode === 'settle' || app.mode === 'road' ?`<div class="last small levers-line"><span class="levers">${levers()}</span><button class="link" id="cancelMode">cancel</button></div>`
        : app.mode ? `<div class="last small">Tap a ${app.mode === 'road' ? 'glowing edge' : app.mode === 'city' ? 'ringed town' : 'glowing corner'} · <button class="link" id="cancelMode">cancel</button></div>`
        : extra ? `<div class="last small"><b>Extra build</b> ${why('extra')}</div>` : `<div class="last small muted">${esc(lastLine(c))}</div>`;
      // extra build step (5-6 players): no trading or cards, so the Trade slot stays empty
      const trade = extra ? '<span></span>' : '<button class="bld-btn" id="tradeBtn"><span>Trade</span><span class="cost tr">⇄</span></button>';
      return `<div class="phase"><div class="row">${diceHTML(g)}<div class="grow">${hint}</div></div>
        <div class="builds">${b('road', 'Road', COST.road, canR)}${b('settle', 'Town', COST.settle, canS)}${b('city', 'City', COST.city, canC)}${b('buy', 'Card', COST.dev, canD)}${trade}<button class="bld-btn end" id="endBtn"><span>${extra ? 'Done' : 'End'}</span><span class="cost tr">${extra ? 'pass' : 'turn'}</span></button></div></div>`;
    }
  }
  return '';
}

// ------------------------------------------------------------ new game + online lobby
function seatChoice(i) {
  const v = S.seats[i] || 'medium';
  if (i === 0) return '<span class="you">You</span>';
  return `<select data-seat="${i}" aria-label="${E.COLORS[i].name} seat">
    <option value="human" ${v === 'human' ? 'selected' : ''}>Person</option>
    ${ONLINE ? `<option value="online" ${v === 'online' ? 'selected' : ''}>Online friend</option>` : ''}
    <option value="easy" ${v === 'easy' ? 'selected' : ''}>Computer · Easy</option>
    <option value="medium" ${v === 'medium' ? 'selected' : ''}>Computer · Medium</option>
    <option value="hard" ${v === 'hard' ? 'selected' : ''}>Computer · Hard</option></select>`;
}
const houseLine = () => [S.friendly && 'friendly robber', S.balanced && 'balanced board', S.vp !== 10 && S.vp + ' points'].filter(Boolean).join(' · ');
function newGamePanel() {
  const n = S.n, net = S.seats.slice(1, n).includes('online');
  const rows = Array.from({ length: n }, (_, i) => `<div class="seat"><i style="background:${colorOf(i)}"></i><span>${E.COLORS[i].name}</span>${seatChoice(i)}</div>`).join('');
  return `<div class="phase">
    <div class="head"><span class="h">New game</span>${why('game')}<button class="btn primary sm" id="startBtn" style="min-width:96px" ${app.netBusy ? 'disabled' : ''}>${net ? 'Make room' : 'Start'}</button></div>
    <div class="seg" id="nPl" aria-label="Players">${[3, 4, 5, 6].map(k => `<button aria-pressed="${k === n}" data-n="${k}" aria-label="${k} players">${k}<span class="pl"> players</span></button>`).join('')}</div>
    <div style="margin-top:6px">${rows}</div>
    ${n >= 5 ? `<div class="small muted" style="margin-top:8px">Big board · extra build step after each turn ${why('big')}</div>`
      : `<div class="seg" id="boardSeg" style="margin-top:8px" aria-label="Board">${[['random', S.balanced ? 'Balanced board' : 'Random board'], ['beginner', 'Beginner board']].map(([k, l]) => `<button aria-pressed="${S.board === k}" data-board="${k}">${l}</button>`).join('')}</div>`}
    ${houseLine() ? `<div class="small muted" style="margin-top:6px">House rules: ${houseLine()} · <button class="link" data-tab-go="settings">change</button></div>` : ''}
  </div>${ONLINE ? `
  <div class="phase" style="margin-top:10px">
    <div class="head"><span class="h">Online</span>${why('online')}</div>
    <div class="row"><input class="inp grow" id="netName" maxlength="20" placeholder="Your name" autocomplete="nickname" value="${esc(S.netName || '')}"></div>
    <div class="row" style="margin-top:8px"><input class="inp grow" id="netCode" maxlength="8" placeholder="Room code" autocapitalize="characters" autocomplete="off"><button class="btn sm" id="joinBtn">Join</button></div>
  </div>` : ''}`;
}
function lobbyPanel() {
  const s = app.net;
  if (s.status === 'joining') return `<div class="phase"><div class="h">Joining ${esc(s.code || '')}…</div><div class="small muted" style="margin-top:6px">${s.askingHost ? 'Waiting for the host to allow you.' : 'Waiting for the host to seat you.'}</div><div class="row" style="margin-top:10px"><button class="btn block" id="leaveBtn">Cancel</button></div></div>`;
  const rows = s.seats.map((q, i) => {
    const who = q.kind === 'computer' ? 'Computer · ' + cap(((s.options || {}).levels || [])[i] || 'medium') : q.kind === 'empty' ? '<span class="muted">Open seat</span>' : esc(q.name) + (i === s.mySeat ? ' <span class="muted">(you)</span>' : '');
    return `<div class="seat"><i style="background:${colorOf(i)}"></i><span>${E.COLORS[i].name}</span><span class="grow" style="text-align:right">${who}</span></div>`;
  }).join('');
  return `<div class="phase"><div class="cap">Room code</div><div class="code">${esc(s.code)}</div>
    <div class="small muted">Friends open this page, type the code and tap Join.</div>
    <div style="margin-top:8px">${rows}</div>
    <div class="row" style="margin-top:10px">${s.isHost ? '<button class="btn primary grow" id="netStart">Start</button>' : '<span class="small muted grow">Waiting for the host to start.</span>'}<button class="btn" id="leaveBtn">Leave</button></div></div>`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function startGame() {
  const n = S.n, seats = S.seats.slice(0, n);
  if (seats.includes('online')) { makeRoom(); return; }
  const nH = seats.filter((s, i) => i === 0 || s === 'human').length;
  const def = seats.map((s, i) => (i === 0 || s === 'human' ? { name: nH > 1 ? E.COLORS[i].name : (i === 0 ? 'You' : E.COLORS[i].name), kind: 'human', level: 'medium' } : { name: E.COLORS[i].name, kind: 'cpu', level: s }));
  app.st = E.newGame(def, Object.assign(gameRules(), { first: Math.floor(Math.random() * n) }), (Math.random() * 4294967296) >>> 0); // random starter (Tim 2026-11-24)
  app.viewer = 0; app.coverFor = -1; app.mode = null; app.robHex = -1; app.logN = 0; app.freshGame = true;
  view.sig = ''; useGeo(app.st); setVB(Object.assign({}, FIT));
  FX.play('shuffle');
  changed();
}
const netName = () => { const nmEl = $('#netName'); if (nmEl) { S.netName = nmEl.value.trim().slice(0, 20); saveSettings(); } return S.netName || 'Player'; };
function netReady() { if (window.CatanNet) return true; toast('Online is still loading'); return false; }
async function makeRoom() {
  if (!netReady() || app.netBusy) return;
  const n = S.n, seats = S.seats.slice(0, n);
  const kinds = seats.map((s, i) => (i === 0 ? 'human' : ['easy', 'medium', 'hard'].includes(s) ? 'computer' : 'empty'));
  app.netBusy = true; render();
  const r = await window.CatanNet.createRoom({ name: netName(), seats: kinds, options: { rules: gameRules(), levels: seats.map(s => (['easy', 'medium', 'hard'].includes(s) ? s : 'medium')) } });
  app.netBusy = false;
  if (!r.ok) { toast(r.message); render(); }
}
async function joinRoom() {
  if (!netReady() || app.netBusy) return;
  const code = ($('#netCode').value || '').trim().toUpperCase();
  if (code.length < 4) { toast('Type the room code'); return; }
  if (!/^[A-Z0-9]+$/.test(code)) { toast('No room with that code.'); return; }
  app.netBusy = true; render();
  const r = await window.CatanNet.joinRoom(code, netName());
  app.netBusy = false;
  if (!r.ok) { toast(r.message); app.net = null; render(); }
}
async function leaveRoom() { const R = window.CatanNet; app.net = null; app.logN = 0; view.sig = ''; render(); if (R) await R.leave(); }
function onNet(s) {
  if (!s || ['none', 'closed', 'left'].includes(s.status)) {
    if (app.net && s && s.status !== 'none') toast(s.status === 'closed' ? 'The room was closed' : 'You left the room');
    if (app.net) { app.net = null; app.logN = 0; view.sig = ''; render(); }
    return;
  }
  const key = JSON.stringify([s.status, s.code, s.mySeat, s.toAct, s.isHost, s.seats, s.mine, s.options, s.pub && s.pub.logN, s.pub && s.pub.phase, s.askingHost]);
  if (app.net && app.net.key === key) return;
  const was = app.net;
  app.net = Object.assign({}, s, { key, sending: was ? was.sending : false });
  if (!was || !was.pub) { app.logN = 0; app.freshGame = false; view.sig = ''; }
  if (was && was.pub && s.pub && was.pub.logN !== s.pub.logN) app.net.sending = false;
  render();
}
function hookNet() {
  const N = window.CatanNet; if (!N || app.netHooked) return;
  app.netHooked = true;
  N.on('change', onNet);
  N.on('error', m => toast(typeof m === 'string' ? m : (m && m.message) || 'Online error'));
  N.resume().then(ok => { if (ok) { app.tab = 'play'; renderTabs(); } });
}
addEventListener('catannet', hookNet);

// ------------------------------------------------------------ trade sheet
function tradeSheet() {
  const c = current(); if (!c) return;
  const { g, seat } = c, P = g.players[seat];
  const rates = RES.map((_, r) => E.rate(g, seat, r));
  const bankRow = RES.map((_, r) => `<button class="bank-g${app.bankGive === r ? ' on' : ''}" data-bg="${r}" ${P.res[r] >= rates[r] ? '' : 'disabled'} style="--rc:${RES_COL[r]}">${resIcon(r)}<span>${rates[r]}:1</span></button>`).join('');
  const getRow = RES.map((_, r) => `<button class="bank-g" data-bget="${r}" ${app.bankGive >= 0 && app.bankGive !== r && g.bank[r] > 0 ? '' : 'disabled'} style="--rc:${RES_COL[r]}">${resIcon(r)}<span>get</span></button>`).join('');
  const offerOk = E.sum(app.give) > 0 && E.sum(app.get) > 0 && g.offers < 3;
  const html = `<div class="sheet-h"><span class="h">Trade</span>${why('trade')}<button class="btn sm ghost" data-close>Done</button></div>
    <div class="cap">Bank &amp; harbours</div>
    <div class="bank-row">${bankRow}</div>
    <div class="bank-row">${getRow}</div>
    <div class="sep"></div>
    <div class="cap">Offer to players</div>
    <div class="trow"><span class="tl">Give</span><div class="steps">${P.res.map((n, r) => stepper('give', r, app.give[r], n)).join('')}</div></div>
    <div class="trow"><span class="tl">Get</span><div class="steps">${RES.map((_, r) => stepper('get', r, app.get[r], 9)).join('')}</div></div>
    <button class="btn primary block" id="offerBtn" ${offerOk ? '' : 'disabled'}>Offer${g.offers ? ` (${3 - g.offers} left)` : ''}</button>`;
  if ($('#sheet').hidden) openSheet(html, bindTrade); else { $('#sheet').innerHTML = html; $('#sheet').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet())); bindTrade($('#sheet')); }
}
function bindTrade(sh) {
  sh.querySelectorAll('[data-bg]').forEach(b => b.addEventListener('click', () => { app.bankGive = +b.dataset.bg; tradeSheet(); }));
  sh.querySelectorAll('[data-bget]').forEach(b => b.addEventListener('click', () => { const give = app.bankGive; act({ t: 'bank', give, get: +b.dataset.bget }); const c = current(); app.bankGive = c && c.g.players[c.seat].res[give] >= E.rate(c.g, c.seat, give) ? give : -1; tradeSheet(); }));
  sh.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => {
    const arr = b.dataset.st === 'give' ? app.give : app.get, r = +b.dataset.r;
    arr[r] = Math.max(0, arr[r] + +b.dataset.d);
    if (b.dataset.st === 'give' && arr[r]) app.get[r] = 0; if (b.dataset.st === 'get' && arr[r]) app.give[r] = 0;
    tradeSheet();
  }));
  const ob = sh.querySelector('#offerBtn'); if (ob) ob.addEventListener('click', () => { act({ t: 'offer', give: app.give.slice(), get: app.get.slice() }); closeSheet(); });
}

function chartHTML(g) {
  const tot = g.rolls.reduce((a, b) => a + b, 0) || 1, max = Math.max(17, ...g.rolls.map(n => n / tot * 100));
  const bars = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => {
    const act = g.rolls[n] / tot * 100, th = (6 - Math.abs(7 - n)) / 36 * 100;
    return `<div class="bar"><div class="bars"><i class="a" style="height:${act / max * 100}%"></i><i class="t" style="height:${th / max * 100}%"></i></div><b>${n}</b><span>${g.rolls[n]}</span></div>`;
  }).join('');
  return `<div class="chart">${bars}</div><div class="small muted"><i class="key a"></i> rolled % <i class="key t"></i> expected (n/36, as in In-person play) · ${g.rolls.reduce((a, b) => a + b, 0)} rolls</div>`;
}
// phone: the dice box, with everyone's cards under it; kept current by render() while open
const diceLiveHTML = c => `${chartHTML(c.g)}<div class="sep"></div>${dotsHTML(c)}<div class="sep"></div>${handsHTML(c)}`;
function diceSheet(c) {
  openSheet(`<div class="sheet-h"><span class="h">Dice this game</span><button class="btn sm ghost" data-close>Close</button></div><div id="diceLive">${diceLiveHTML(c)}</div>`);
}
// laptop only: the table's recent events and the dice so far (hidden on phones by CSS)
function feedLines(c, n) {
  const { g, seat } = c;
  return g.log.slice().reverse().map(e => ({ e, s: describe(g, e, seat) })).filter(x => x.s).slice(0, n)
    .map(x => `<li><i class="pc" style="background:${colorOf(x.e.p)}"></i>${esc(x.s)}</li>`).join('');
}
// phone: tap the last-move line to see what everyone did lately
function feedSheet(c) {
  openSheet(`<div class="sheet-h"><span class="h">Table</span><button class="btn sm ghost" data-close>Close</button></div><ul class="feed">${feedLines(c, 30)}</ul>`);
}
// everyone's cards, redrawn from the game state on every render: your own hand by kind; other
// players' hands are secret in the shared state, so they show only their card count
function handsHTML(c) {
  const { g, seat } = c;
  const order = [seat, ...g.players.map((_, i) => i).filter(i => i !== seat)];
  return `<ul class="hands">${order.map(i => {
    const P = g.players[i], known = Array.isArray(P.res);
    const cells = known ? P.res.map((n, r) => `<span class="hc${n ? '' : ' zero'}" aria-label="${RES_NAME[r]} ${n}">${resIcon(r)}<b>${n}</b></span>`).join('')
      : `<span class="hc" aria-label="${P.res} cards"><i class="ic-card"></i><b>${P.res}</b></span>`;
    return `<li><i class="pc" style="background:${colorOf(i)}"></i><span class="hn">${esc(P.name)}</span>${cells}</li>`;
  }).join('')}</ul>`;
}
// dots (probability points) per resource: the board's totals, then each player's from their towns
// (a city counts twice); the robber's tile counts too. Weighted on: player dots × weight, Table row shows
// weights (with Mine: the viewer's own weights).
function dotsHTML(c, cards) {
  const { g, seat } = c;
  const tot = [0, 0, 0, 0, 0];
  g.hexRes.forEach((r, h) => { if (r >= 0) tot[r] += E.pips(g.hexNum[h]); });
  const w = weightsFor(g, seat);
  const pl = g.players.map(() => [0, 0, 0, 0, 0]);
  g.vOwner.forEach((o, v) => {
    if (o < 0) return;
    G.V[v].hexes.forEach(h => { if (g.hexRes[h] >= 0) pl[o][g.hexRes[h]] += E.pips(g.hexNum[h]) * (g.vLevel[v] === 2 ? 2 : 1); });
  });
  // same look as In-person play's table: Weighted switch, icon header, bold Table row, then a row per
  // player (colour dot + towns) with grey zeros and a bold "all"; online adds a cards-held column
  const val = (n, r) => (w ? n * w[W.RES[r]] : n);
  const cell = (x, cls = '') => `<span class="dc${x ? '' : ' zero'}${cls}">${W.fmt(x)}</span>`;
  const towns = g.players.map(() => 0); g.vOwner.forEach(o => { if (o >= 0) towns[o]++; });
  const held = i => { const r = g.players[i].res; return Array.isArray(r) ? r.reduce((a, b) => a + b, 0) : r; };
  const head = `<div class="dr dh"><span></span>${[0, 1, 2, 3, 4].map(r => `<span class="dc" title="${RES_NAME[r]}">${resIcon(r)}</span>`).join('')}<span class="dc lab">all</span>${cards ? '<span class="dc lab" title="cards in hand"><i class="ic-card"></i></span>' : ''}</div>`;
  const table = `<div class="dr dt"><span class="dn">Table</span>${tot.map((n, r) => (w ? `<span class="dc">×${W.fmt(w[W.RES[r]])}</span>` : cell(n))).join('')}${cell(tot.reduce((a, b) => a + b, 0))}${cards ? '<span></span>' : ''}</div>`;
  const order = [seat, ...g.players.map((_, i) => i).filter(i => i !== seat)];
  const rows = order.map(i => {
    const vs = pl[i].map(val);
    return `<div class="dr"><span class="dn" title="${esc(g.players[i].name)}"><i class="pc" style="background:${colorOf(i)}"></i><small>${towns[i]}</small></span>${vs.map(x => cell(x)).join('')}${cell(vs.reduce((a, b) => a + b, 0), ' all')}${cards ? `<span class="dc cards" aria-label="cards in hand">${held(i)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="dots${cards ? ' wc' : ''}${w ? ' wt' : ''}"><div class="dw">${wLevers()}</div>${head}${table}${rows}</div>`;
}
function sideHTML(c) {
  const { g } = c;
  return `<div class="phase side-only"><div class="cap">Table</div><ul class="feed">${feedLines(c, g.n >= 5 ? 8 - g.n : 10 - g.n)}</ul></div>
    <div class="phase side-only"><div class="cap">Dice this game</div>${chartHTML(g)}</div>
    <div class="phase side-only" id="dotsBox">${dotsHTML(c, true)}</div>`;
}

// ------------------------------------------------------------ settings
function strengthTable() {
  const rows = window.CATAN_STRENGTH || [];
  return `<table class="str"><tr><th>Table</th><th>Games</th><th>Wins</th></tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="num">${r[1]}</td><td class="num">${esc(r[2])}</td></tr>`).join('')}</table>`;
}
function settingsPanel() {
  const seg = (key, opts) => `<div class="seg" data-set="${key}">${opts.map(([v, l]) => `<button aria-pressed="${S[key] === v}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="settings">
    <div class="phase"><div class="head"><span class="h">Game</span></div>
      <div class="set-row"><span class="grow">Computer speed</span>${seg('speed', [['normal', 'Normal'], ['fast', 'Fast']])}</div>
      <div class="set-row"><span class="grow">Spot odds ${why('odds')}</span><label class="switch"><input type="checkbox" id="oddsSw" ${S.spotOdds ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="grow">Weighted ${why('weighted')}</span><label class="switch"><input type="checkbox" data-sw="weighted" ${S.weighted ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="grow">Mine ${why('mine')}</span><label class="switch"><input type="checkbox" data-sw="mine" ${S.mine ? 'checked' : ''}><span></span></label></div>
    </div>
    <div class="phase"><div class="head"><span class="h">House rules</span></div>
      <div class="set-row"><span class="grow">Friendly robber<span class="sub">Robber can't touch a player on 2 points or fewer.</span></span><label class="switch"><input type="checkbox" data-sw="friendly" ${S.friendly ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="grow">Balanced board<span class="sub">Same numbers and same resources never touch.</span></span><label class="switch"><input type="checkbox" data-sw="balanced" ${S.balanced ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="grow">Points to win<span class="sub">10 is standard; fewer is a shorter game.</span></span><select class="inp" id="vpSel" aria-label="Points to win">${[8, 9, 10, 11, 12, 13].map(k => `<option value="${k}" ${S.vp === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="small muted" style="margin-top:6px">New games use these. Computers play by them too.</div>
    </div>
    <div class="phase"><div class="head"><span class="h">Sound &amp; effects</span></div><div id="fxSet"></div></div>
    <div class="phase"><div class="head"><span class="h">How strong are the computers?</span></div>${strengthTable()}<div class="small muted" style="margin-top:6px">Computer-only games in node, seats rotated. A fair share is 33% at a 3-player table, 25% at 4.</div></div>
  </div>`;
}

// ------------------------------------------------------------ render
function render() {
  renderMain(); updateBack();
}
function renderMain() {
  document.body.dataset.tab = app.tab;
  $('#playView').hidden = app.tab !== 'play';
  $('#trackerView').hidden = app.tab !== 'tracker';
  $('#settingsView').hidden = app.tab !== 'settings';
  if (app.tab === 'tracker') { const f = $('#trackerFrame'); if (!f.src) f.src = 'tracker.html?v=2'; return; }
  if (app.tab === 'settings') { renderSettings(); return; }
  const c = current();
  const lobby = app.net && (app.net.status === 'lobby' || app.net.status === 'joining');
  document.body.classList.toggle('at-table', !!c && !lobby);
  document.body.classList.toggle('game-over', !!c && !lobby && c.g.phase === 'over');
  if (!c || lobby) {
    const demo = demoBoard();
    useGeo(demo); drawStatic(demo); $('#live').innerHTML = '';
    $('#seats').hidden = true; $('#mine').hidden = true;
    $('#panel').innerHTML = lobby ? lobbyPanel() : newGamePanel();
    bindPanel(); return;
  }
  drawStatic(c.g);
  const dl = $('#diceLive'); if (dl && !$('#sheet').hidden) dl.innerHTML = diceLiveHTML(c);
  fxStep(c);
  drawLive(c);
  $('#seats').hidden = false; $('#seats').innerHTML = seatsHTML(c); $('#seats').classList.toggle('many', c.g.n >= 5);
  const noHand = app.coverFor >= 0 || c.g.phase === 'over'; // the end screen needs the room for the scores
  $('#mine').hidden = noHand; $('#mine').innerHTML = noHand ? '' : mineHTML(c);
  $('#panel').innerHTML = app.coverFor >= 0 ? `<div class="phase cover"><div class="h">Pass to ${esc(c.g.players[app.coverFor].name)}</div><button class="btn primary block" id="readyBtn" style="margin-top:10px">I'm ${esc(c.g.players[app.coverFor].name)}</button></div>` : panelHTML(c);
  if (app.coverFor < 0) $('#panel').insertAdjacentHTML('beforeend', sideHTML(c));
  if (c.online) $('#panel').insertAdjacentHTML('beforeend', `<div class="row netbar small muted"><button class="btn sm ghost" id="diceBtn">Dice</button><span class="grow">Room ${esc(app.net.code)}</span><button class="btn sm ghost" id="leaveBtn">Leave</button></div>`);
  else if (c.g.phase !== 'over') $('#panel').insertAdjacentHTML('beforeend', `<div class="row netbar small muted"><button class="btn sm ghost" id="diceBtn">Dice</button><span class="grow"></span><button class="btn sm ghost" id="quitBtn">Quit game</button></div>`);
  document.querySelectorAll('#dice .tbl-die').forEach(d => TABLE.die(d, +d.dataset.v));
  bindPanel();
}
let demoCache = null;
function demoBoard() { // shown behind the new-game panel: the beginner board, or a big board for 5-6 players
  const big = S.n >= 5;
  if (!demoCache || !!demoCache.rules.big !== big) demoCache = E.newGame(Array.from({ length: big ? 5 : 3 }, () => ({})), { board: 'beginner' }, 1);
  return demoCache;
}
function renderSettings() {
  $('#settingsView').innerHTML = settingsPanel();
  FX.renderSettings($('#fxSet'));
  document.querySelectorAll('[data-set] [data-v]').forEach(b => b.addEventListener('click', () => setSetting(b.closest('[data-set]').dataset.set, b.dataset.v)));
  $('#oddsSw').addEventListener('change', e => setSetting('spotOdds', e.target.checked));
  document.querySelectorAll('[data-sw]').forEach(sw => sw.addEventListener('change', () => setSetting(sw.dataset.sw, sw.checked)));
  $('#vpSel').addEventListener('change', e => setSetting('vp', +e.target.value));
}
function bindPanel() {
  const on = (sel, f) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => f(b, e)));
  on('#nPl [data-n]', b => { S.n = +b.dataset.n; saveSettings(); render(); });
  on('[data-tab-go]', b => goTab(b.dataset.tabGo, true));
  on('#boardSeg [data-board]', b => { S.board = b.dataset.board; saveSettings(); render(); });
  document.querySelectorAll('[data-seat]').forEach(sel => sel.addEventListener('change', () => { S.seats[+sel.dataset.seat] = sel.value; saveSettings(); render(); }));
  document.querySelectorAll('[data-lever]').forEach(sw => sw.addEventListener('change', () => setSetting(sw.dataset.lever, sw.checked)));
  on('#startBtn', startGame);
  on('#joinBtn', joinRoom);
  const nmEl = $('#netName'); if (nmEl) nmEl.addEventListener('change', () => { S.netName = nmEl.value.trim().slice(0, 20); saveSettings(); });
  on('#netStart', async b => { b.disabled = true; const r = await window.CatanNet.start(); if (!r.ok) { toast(r.message); b.disabled = false; } });
  on('#leaveBtn', leaveRoom);
  on('#rollBtn', () => act({ t: 'roll' }));
  on('#endBtn', () => { app.mode = null; act({ t: 'end' }); });
  on('#tradeBtn', () => { app.bankGive = -1; tradeSheet(); });
  on('[data-build]', b => {
    const k = b.dataset.build;
    if (k === 'buy') { act({ t: 'buy' }); return; }
    app.mode = app.mode === k ? null : k;
    if (app.mode) pushUndo({ mode: app.mode });
    render();
  });
  on('#cancelMode', () => { app.mode = null; render(); });
  on('[data-dev]', b => playDev(b.dataset.dev));
  on('[data-pick]', b => { const c = current(), r = +b.dataset.pick; if (!c || !c.g.discard) return; if (E.sum(app.discard) < c.g.discard[c.seat] && app.discard[r] < c.g.players[c.seat].res[r]) app.discard[r]++; render(); });
  on('#unpickAll', () => { app.discard = [0, 0, 0, 0, 0]; render(); });
  on('#discardBtn', () => act({ t: 'discard', cards: app.discard.slice() }));
  on('[data-rob]', b => act({ t: 'robber', h: app.robHex, from: +b.dataset.rob }));
  on('#robBack', () => { app.robHex = -1; render(); });
  on('#stopRoads', () => act({ t: 'stop' }));
  on('[data-ans]', b => act({ t: 'answer', yes: b.dataset.ans === '1' }));
  on('[data-deal]', b => act({ t: 'deal', with: +b.dataset.deal }));
  on('#cancelDeal', () => act({ t: 'cancel' }));
  on('#readyBtn', () => { app.coverFor = -1; render(); });
  on('#againBtn', () => { app.st = null; store.del('catan.game'); if (app.net) leaveRoom(); else render(); });
  on('#quitBtn', () => openSheet(`<div class="sheet-h"><span class="h">Quit this game?</span><button class="btn sm ghost" data-close>Keep playing</button></div><button class="btn block" id="quitYes">Quit</button>`, sh => sh.querySelector('#quitYes').addEventListener('click', () => { closeSheet(); clearTimeout(app.botTimer); app.st = null; store.del('catan.game'); render(); })));
  on('#diceBtn', () => { const c = current(); if (c) diceSheet(c); });
  on('[data-feed]', () => { const c = current(); if (c) feedSheet(c); });
}
function playDev(k) {
  if (k === 'K' || k === 'R') { act({ t: 'play', card: k }); return; }
  const pickN = k === 'P' ? 2 : 1, picks = [];
  const draw = () => {
    const html = `<div class="sheet-h"><span class="h">${DEV_NAME[k]}</span><button class="btn sm ghost" data-close>Cancel</button></div>
      <div class="small muted">${k === 'P' ? 'Take any 2 from the bank.' : 'Everyone gives you all of one kind.'}${picks.length ? ' Picked: ' + picks.map(r => RES[r]).join(', ') : ''}</div>
      <div class="bank-row" style="margin-top:8px">${RES.map((_, r) => `<button class="bank-g" data-pick="${r}" style="--rc:${RES_COL[r]}">${resIcon(r)}<span>${RES_NAME[r]}</span></button>`).join('')}</div>`;
    if ($('#sheet').hidden) openSheet(html); else $('#sheet').innerHTML = html;
    $('#sheet').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet()));
    $('#sheet').querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      picks.push(+b.dataset.pick);
      if (picks.length < pickN) { draw(); return; }
      closeSheet(); act({ t: 'play', card: k, r1: picks[0], r2: picks[1] });
    }));
  };
  draw();
}

// ------------------------------------------------------------ boot
FX.init({ game: 'catan', accent: '#e2b845' });
renderTabs();
const saved = store.get('catan.game', null);
if (saved && saved.phase && saved.phase !== 'over' && saved.v === 1) { app.st = saved; app.logN = saved.logN || 0; app.viewer = (humans(saved)[0] ?? 0); }
const startTab = location.hash.slice(1);
if (TABS.some(t => t[0] === startTab)) app.tab = startTab;
history.replaceState({ tab: app.tab }, '', '#' + app.tab);
renderTabs();
setVB(Object.assign({}, FIT));
render();
if (app.st) { app.logN = app.st.logN || 0; scheduleBots(); }
hookNet();
window.__catan = { app, current, act, E, render, changed }; // for headless checks
