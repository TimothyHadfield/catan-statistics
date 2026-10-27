// Catan: the page. Local games run here (you + computers, or pass-the-phone);
// online games go through js/net.js (shared online.js). Rules live in js/engine.js.
// ONLINE is off: one online game costs ~950-1,700 Firestore writes (measured by
// tools/guard.cjs), far over the free-plan budget. Turning it on is Tim's call; flip this to true.
const ONLINE = false;
if (ONLINE) import('./net.js?v=1');
const E =window.CatanEngine, AI = window.CatanAI, CG = window.CatanGame;
const { G, RES, COST } = E;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const U = 40; // svg units per hex radius

// ------------------------------------------------------------ storage + settings
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const S = Object.assign({ n: 4, seats: ['human', 'medium', 'medium', 'medium'], board: 'random', speed: 'normal', spotOdds: true, netName: '' }, store.get('catan.settings', {}));
if (!ONLINE) S.seats = S.seats.map(s => (s === 'online' ? 'medium' : s));
const saveSettings = () => store.set('catan.settings', S);

// ------------------------------------------------------------ app state
const app = {
  tab: 'play', st: null, viewer: 0, coverFor: -1, mode: null, robHex: -1, logN: 0, prevRes: null,
  net: null, netBusy: false, botTimer: null, busyAnim: false, give: [0, 0, 0, 0, 0], get: [0, 0, 0, 0, 0], discard: [0, 0, 0, 0, 0],
};
const RES_NAME = ['Wood', 'Brick', 'Sheep', 'Wheat', 'Ore'];
const RES_COL = ['#3f7d3a', '#b55a3c', '#8fbf5a', '#e2b845', '#8a929b'];
const DEV_NAME = { K: 'Knight', V: 'Victory point', R: 'Road building', P: 'Year of plenty', M: 'Monopoly' };
const colorOf = p => E.COLORS[p].hex;

// ------------------------------------------------------------ the game the screen shows
function current() { // { g, seat, toAct, online, isHost }
  if (app.net && app.net.pub) {
    const s = app.net;
    return { g: CG.merge(s.pub, s.mine, s.mySeat), seat: s.mySeat, toAct: s.toAct || [], online: true };
  }
  if (!app.st) return null;
  const st = app.st, seat = app.viewer;
  const g = CG.merge(CG.game.publicView(st), CG.game.privateView(st, seat), seat);
  return { g, seat, toAct: E.actors(st), online: false };
}
const humans = st => st.players.map((P, i) => (P.kind === 'human' ? i : -1)).filter(i => i >= 0);

// ------------------------------------------------------------ tabs, sheet, toast
const TABS = [
  ['play', 'Play', '<path d="M12 3l8 4.6v8.8L12 21l-8-4.6V7.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
  ['tracker', 'Tracker', '<path d="M5 20V10M10 20V5M15 20v-7M20 20v-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
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
}
function closeSheet(fromPop) { $('#sheet').hidden = true; $('#sheetBack').hidden = true; if (!fromPop && history.state && history.state.sheet) history.back(); }
$('#sheetBack').addEventListener('click', () => closeSheet());
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2400); }
const why = key => `<button class="q" data-why="${key}" aria-label="Why?">?</button>`;
const WHY = {
  game: ['How to play', 'Roll, collect from tiles next to your towns, build. Road = wood + brick. Town = wood, brick, sheep, wheat. City = 2 wheat + 3 ore. Card = sheep, wheat, ore. First to 10 points wins. A 7 moves the robber: anyone with more than 7 cards gives back half.'],
  odds: ['Spot odds', 'Numbers on open corners add up the dots of the tiles around them (a 6 or 8 is 5 dots, a 2 or 12 is 1). Each dot is one roll in 36, the same count as the Tracker.'],
  online: ['Online', 'Make a room with an "Online friend" seat, then friends type its code here. Seats nobody takes become computers.'],
  trade: ['Trading', 'Bank: 4 of one for 1. A 3:1 harbour or a 2:1 harbour of that kind is cheaper once you have a town on it. Offers to players: computers say yes when the deal helps them and you are not about to win.'],
  strong: ['How strong?', 'Measured in computer-only games in node; see Settings.'],
};
document.addEventListener('click', e => {
  const q = e.target.closest('[data-why]'); if (!q) return;
  const [t, b] = WHY[q.dataset.why] || ['', ''];
  openSheet(`<div class="sheet-h"><span class="h">${t}</span><button class="btn sm ghost" data-close>Close</button></div><p class="why">${b}</p>${q.dataset.why === 'strong' ? strengthTable() : ''}`);
});

// ------------------------------------------------------------ board drawing
const pt = v => [G.V[v].x * U, G.V[v].y * U];
const hexPts = h => [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i - 90); return [(E.HEXES[h].x + Math.cos(a) * 0.985) * U, (E.HEXES[h].y + Math.sin(a) * 0.985) * U]; });
const FIT = { x: -5.6 * U, y: -4.85 * U, w: 11.2 * U, h: 9.7 * U };
const view = { vb: Object.assign({}, FIT), sig: '' };
function patterns() {
  // original tile prints: pines, brick courses, grazing dots, wheat rows, rock facets, dunes
  return `<defs>
  <pattern id="pt0" width="20" height="18" patternUnits="userSpaceOnUse"><rect width="20" height="18" fill="#3f7d3a"/><path d="M5 3l4 8H1zM15 9l4 8h-8z" fill="#2c5f2a"/><path d="M5 11v2M15 17v1" stroke="#5a3b22" stroke-width="1.4"/></pattern>
  <pattern id="pt1" width="16" height="10" patternUnits="userSpaceOnUse"><rect width="16" height="10" fill="#b55a3c"/><path d="M0 .5h16M0 5.5h16M4 0v5M12 5v5" stroke="#8c3e27" stroke-width="1.1"/></pattern>
  <pattern id="pt2" width="22" height="18" patternUnits="userSpaceOnUse"><rect width="22" height="18" fill="#8fbf5a"/><ellipse cx="6" cy="6" rx="3.6" ry="2.6" fill="#f4f1e6"/><circle cx="9.4" cy="5.2" r="1.3" fill="#3b3b3b"/><ellipse cx="16" cy="14" rx="3.2" ry="2.3" fill="#f4f1e6"/><circle cx="19" cy="13.3" r="1.2" fill="#3b3b3b"/><path d="M1 16l1-2M12 4l1-2" stroke="#6f9f42" stroke-width="1"/></pattern>
  <pattern id="pt3" width="10" height="14" patternUnits="userSpaceOnUse"><rect width="10" height="14" fill="#e2b845"/><path d="M3 14V4M8 12V2" stroke="#b78b26" stroke-width="1.2"/><path d="M3 4l-1.6-2M3 4l1.6-2M8 2l-1.4-1.8M8 2l1.4-1.8" stroke="#b78b26" stroke-width="1"/></pattern>
  <pattern id="pt4" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#8a929b"/><path d="M2 15l7-11 7 11zM13 15l5-8 5 8z" fill="#6c737c"/><path d="M7.2 6.8L9 4l1.8 2.8zM16.8 9.6L18 7l1.4 2.6z" fill="#e9edf0"/></pattern>
  <pattern id="pt5" width="26" height="12" patternUnits="userSpaceOnUse"><rect width="26" height="12" fill="#dcc48e"/><path d="M0 8q6.5-5 13 0t13 0" fill="none" stroke="#c4a76b" stroke-width="1.2"/></pattern>
  <radialGradient id="tileShade" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
  <radialGradient id="seaG" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#4f93b8"/><stop offset="1" stop-color="#2f6d92"/></radialGradient>
  <pattern id="waves" width="34" height="14" patternUnits="userSpaceOnUse"><path d="M0 9q8.5-6 17 0t17 0" fill="none" stroke="#bfe0f0" stroke-opacity=".18" stroke-width="1.2"/></pattern>
  </defs>`;
}
function drawStatic(g) {
  const sig = g.hexRes.join() + '|' + g.hexNum.join() + '|' + g.ports.map(p => p.type).join();
  if (view.sig === sig) return;
  view.sig = sig;
  const sea = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i; return (Math.cos(a) * 5.55 * U).toFixed(1) + ',' + (Math.sin(a) * 5.55 * U).toFixed(1); }).join(' ');
  let h = patterns();
  h += `<polygon class="frame" points="${sea}" /><polygon points="${sea}" fill="url(#seaG)"/><polygon points="${sea}" fill="url(#waves)"/>`;
  // harbours: two piers and a token
  g.ports.forEach(p => {
    const [a, b] = G.E[p.e].v, [ax, ay] = pt(a), [bx, by] = pt(b), mx = (ax + bx) / 2, my = (ay + by) / 2;
    const len = Math.hypot(mx, my), ox = mx / len, oy = my / len, tx = mx + ox * 0.66 * U, ty = my + oy * 0.66 * U;
    const r = RES.indexOf(p.type);
    h += `<g class="port"><path d="M${ax},${ay}L${tx},${ty}M${bx},${by}L${tx},${ty}" class="pier"/>
      <circle cx="${tx}" cy="${ty}" r="${0.42 * U}" class="ptok" ${r >= 0 ? `style="stroke:${RES_COL[r]}"` : ''}/>
      ${r >= 0 ? `<svg x="${tx - 0.17 * U}" y="${ty - 0.4 * U}" width="${0.34 * U}" height="${0.34 * U}" viewBox="0 0 20 20" aria-hidden="true">${RES_ICON[r]}</svg>` : ''}
      <text x="${tx}" y="${ty + (r >= 0 ? 0.2 : 0.13) * U}" class="ptxt">${r >= 0 ? '2:1' : '3:1'}</text></g>`;
  });
  g.hexRes.forEach((r, i) => {
    const P = hexPts(i).map(q => q.map(x => x.toFixed(1)).join(',')).join(' ');
    h += `<g class="hex" data-h="${i}"><polygon points="${P}" fill="url(#pt${r < 0 ? 5 : r})"/><polygon points="${P}" fill="url(#tileShade)" class="hedge"/></g>`;
  });
  g.hexNum.forEach((n, i) => {
    if (!n) return;
    const cx = E.HEXES[i].x * U, cy = E.HEXES[i].y * U, pp = E.pips(n), red = n === 6 || n === 8;
    let dots = ''; for (let k = 0; k < pp; k++) dots += `<circle cx="${cx + (k - (pp - 1) / 2) * 0.1 * U}" cy="${cy + 0.25 * U}" r="${0.034 * U}" />`;
    h += `<g class="tok${red ? ' red' : ''}" data-num="${i}"><circle cx="${cx}" cy="${cy}" r="${0.4 * U}" class="tokc"/><text x="${cx}" y="${cy + 0.1 * U}" class="tokn">${n}</text><g class="pips">${dots}</g></g>`;
  });
  $('#static').innerHTML = h;
}
function house(x, y, s, cls, col) {
  const k = s * U;
  return `<path class="${cls}" style="fill:${col}" d="M${x - k},${y + k * .75}V${y - k * .15}L${x},${y - k * .95}L${x + k},${y - k * .15}V${y + k * .75}Z"/>`;
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
  const rh = E.HEXES[g.robber];
  const rx = rh.x * U - 0.52 * U, ry = rh.y * U + 0.05 * U;
  h += `<g class="robber" transform="translate(${rx},${ry})"><ellipse cx="0" cy="${0.36 * U}" rx="${0.2 * U}" ry="${0.07 * U}" fill="rgba(0,0,0,.35)"/><path d="M${-0.17 * U},${0.36 * U}Q${-0.2 * U},${0.02 * U} ${-0.09 * U},${-0.1 * U}A${0.12 * U},${0.12 * U} 0 1 1 ${0.09 * U},${-0.1 * U}Q${0.2 * U},${0.02 * U} ${0.17 * U},${0.36 * U}Z" fill="#3b3640" stroke="#16131a" stroke-width="1.5"/></g>`;
  // buildings
  g.vOwner.forEach((o, v) => {
    if (o < 0) return;
    const [x, y] = pt(v);
    h += g.vLevel[v] === 2 ? city(x, y, colorOf(o)) : house(x, y, 0.27, 'bld', colorOf(o));
  });
  // what I may tap now
  const hl = targets(c);
  hl.hexes.forEach(i => { const P = hexPts(i).map(q => q.join(',')).join(' '); h += `<polygon points="${P}" class="hl-hex" data-h="${i}"/>`; });
  hl.edges.forEach(e => {
    const [a, b] = G.E[e].v, [ax, ay] = pt(a), [bx, by] = pt(b);
    h += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="hl-edge" style="stroke:${colorOf(me)}"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="hit-edge" data-e="${e}"/>`;
  });
  hl.verts.forEach(v => {
    const [x, y] = pt(v);
    const odds = S.spotOdds && hl.kind === 'settle' ? spotPips(g, v) : '';
    const fill = odds !== '' ? `;fill:hsl(${Math.round(Math.max(0, Math.min(1, (odds - 3) / 9)) * 120)},70%,80%)` : '';
    h += `<g class="hl-v" data-v="${v}"><circle cx="${x}" cy="${y}" r="${0.3 * U}" class="hl-c" style="stroke:${colorOf(me)}${fill}"/>${odds !== '' ? `<text x="${x}" y="${y + 0.13 * U}" class="hl-t">${odds}</text>` : ''}<circle cx="${x}" cy="${y}" r="${0.42 * U}" class="hit"/></g>`;
  });
  hl.cities.forEach(v => { const [x, y] = pt(v); h += `<g class="hl-v" data-v="${v}"><circle cx="${x}" cy="${y}" r="${0.42 * U}" class="hl-city"/><circle cx="${x}" cy="${y}" r="${0.45 * U}" class="hit"/></g>`; });
  $('#live').innerHTML = h;
}
const spotPips = (g, v) => G.V[v].hexes.reduce((a, h) => a + (h === g.robber ? 0 : E.pips(g.hexNum[h])), 0);

// what the viewer can tap on the board right now
function targets(c) {
  const out = { verts: [], edges: [], hexes: [], cities: [], kind: '' };
  const { g, seat } = c;
  if (!c.toAct.includes(seat) || app.coverFor >= 0) return out;
  if (g.phase === 'setup') {
    if (g.sub === 'settle') { out.verts = E.setupSpots(g); out.kind = 'settle'; }
    else out.edges = G.V[g.lastV].edges.filter(e => g.eOwner[e] < 0);
  } else if (g.phase === 'robber' && g.turn === seat) {
    for (let i = 0; i < 19; i++) if (i !== g.robber) out.hexes.push(i);
  } else if (g.phase === 'roads' && g.turn === seat) out.edges = E.legalRoads(g, seat);
  else if (g.phase === 'main' && g.turn === seat) {
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
  try { app.st = E.apply(JSON.parse(JSON.stringify(app.st)), c.seat, a); }
  catch (err) { toast(err.message); FX.play('error'); return; }
  afterMyMove(a);
  changed();
}
function afterMyMove(a) {
  if (['road', 'settle', 'city'].includes(a.t)) {
    const c = current();
    const still = c && c.g.phase === 'main' && a.t !== 'city' && E.canPay(c.g.players[c.seat].res, COST[a.t === 'settle' ? 'settle' : 'road']);
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
function scheduleBots() {
  clearTimeout(app.botTimer);
  const st = app.st; if (!st || st.phase === 'over' || app.net) return;
  const bots = E.actors(st).filter(i => st.players[i].kind === 'cpu');
  if (!bots.length) return;
  const fast = S.speed === 'fast';
  const lastRoll = st.log.length && st.log[st.log.length - 1].k === 'roll';
  const delay = S.speed === 'test' ? 1 : (fast ? 260 : 650) + (lastRoll ? (fast ? 350 : 700) : 0); // 'test' = headless soak runs only
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
  for (const e of newer) {
    if (e.k === 'roll') {
      FX.play('diceRoll');
      const dice = document.querySelectorAll('#dice .tbl-die');
      if (dice.length === 2) { TABLE.roll(dice[0], e.d[0]); TABLE.roll(dice[1], e.d[1]); }
      const t = e.d[0] + e.d[1];
      if (t === 7) { setTimeout(() => FX.play('stamp'), 500); continue; }
      setTimeout(() => flashNumber(t), 600);
      if (e.gain) setTimeout(() => showGains(g, c.seat, e.gain, t), 650);
    } else if (e.k === 'settle' || e.k === 'city' || e.k === 'road') FX.play(e.k === 'road' ? 'slide' : 'place', { pitch: e.k === 'city' ? 0.8 : 1 });
    else if (e.k === 'robber') { FX.play('stamp'); if (e.from === c.seat) toast(`${nm(g, e.p)} robbed you`); }
    else if (e.k === 'buy') FX.play('cardFlip');
    else if (e.k === 'play') { FX.play('cardSlide'); if (e.p !== c.seat) toast(`${nm(g, e.p)} played ${DEV_NAME[e.card]}${e.card === 'M' ? ': all ' + RES[e.r] : ''}`); }
    else if (e.k === 'deal') FX.play('cardDeal');
    else if (e.k === 'longest' && e.p >= 0) { FX.play('ding'); toast(`${nm(g, e.p)} take${e.p === c.seat ? '' : 's'} Longest Road`); }
    else if (e.k === 'army') { FX.play('ding'); toast(`${nm(g, e.p)} take${e.p === c.seat ? '' : 's'} Largest Army`); }
    else if (e.k === 'win') {
      const mine = e.p === c.seat;
      setTimeout(() => FX.celebrate({ kind: mine ? 'win' : 'lose', colors: [colorOf(e.p), '#f5d76e', '#fff'] }), 400);
    } else if (e.k === 'end' && g.turn === c.seat && g.players[c.seat].kind !== 'cpu') FX.play('turn');
  }
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
    const [sx, sy] = svgToScreen(E.HEXES[h].x * U, E.HEXES[h].y * U);
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
const RES_ICON = [
  '<path d="M10 2l6 10H4z" fill="#2c5f2a"/><path d="M10 7l6 9H4z" fill="#3f7d3a"/><rect x="9" y="15" width="2" height="4" fill="#5a3b22"/>',
  '<rect x="2" y="5" width="16" height="10" fill="#b55a3c"/><path d="M2 10h16M8 5v5M13 10v5" stroke="#7d3522" stroke-width="1.3"/>',
  '<ellipse cx="9" cy="11" rx="6.5" ry="4.6" fill="#f4f1e6"/><circle cx="15.5" cy="9" r="2.4" fill="#3b3b3b"/><path d="M6 15v3M11 15v3" stroke="#3b3b3b" stroke-width="1.4"/>',
  '<path d="M10 19V5M6 18V8M14 18V8" stroke="#b78b26" stroke-width="1.6"/><ellipse cx="10" cy="4.5" rx="1.6" ry="3" fill="#e2b845"/><ellipse cx="6" cy="7.5" rx="1.4" ry="2.6" fill="#e2b845"/><ellipse cx="14" cy="7.5" rx="1.4" ry="2.6" fill="#e2b845"/>',
  '<path d="M1 18l7-13 5 7 2-3 4 9z" fill="#6c737c"/><path d="M6.3 8.2L8 5l2 2.8z" fill="#e9edf0"/>',
];
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
    <div class="myvp" style="--pc:${colorOf(seat)}" title="Your points"><b>${vpOf(g, seat, true)}</b><span>pts</span></div>
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
    else t = `${esc(g.players[c.toAct[0]] ? g.players[c.toAct[0]].name : '')}'s turn`;
    return `<div class="phase"><div class="row">${diceHTML(g)}<div class="grow"><div class="h hs">${t}</div>${status}</div></div>${o ? `<div class="offer small">${offerText(g, o, seat)}</div>` : ''}</div>`;
  }
  switch (g.phase) {
    case 'setup': return `<div class="phase">${head(g.sub === 'settle' ? 'Place a town' : 'Place a road', S.spotOdds && g.sub === 'settle' ? why('odds') : '')}<div class="small muted">${g.sub === 'settle' ? (g.step >= g.n ? 'Your second town pays its tiles now.' : 'Numbers show each corner\'s dots.') : 'Next to the town you just placed.'}</div></div>`;
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
    case 'main': {
      const res = P.res;
      const b = (id, label, cost, ok) => `<button class="bld-btn${app.mode === id ? ' on' : ''}" data-build="${id}" ${ok ? '' : 'disabled'}><span>${label}</span><span class="cost">${costHTML(cost)}</span></button>`;
      const canR = E.canPay(res, COST.road) && E.roadsLeft(g, seat) && E.legalRoads(g, seat).length;
      const canS = E.canPay(res, COST.settle) && E.settlesLeft(g, seat) && E.legalSettles(g, seat).length;
      const canC = E.canPay(res, COST.city) && E.citiesLeft(g, seat) && g.vOwner.some((o, v) => o === seat && g.vLevel[v] === 1);
      const canD = E.canPay(res, COST.dev) && g.deck > 0;
      const hint = app.mode ? `<div class="last small">Tap a ${app.mode === 'road' ? 'glowing edge' : app.mode === 'city' ? 'ringed town' : 'glowing corner'} · <button class="link" id="cancelMode">cancel</button></div>` : `<div class="last small muted">${esc(lastLine(c))}</div>`;
      return `<div class="phase"><div class="row">${diceHTML(g)}<div class="grow">${hint}</div></div>
        <div class="builds">${b('road', 'Road', COST.road, canR)}${b('settle', 'Town', COST.settle, canS)}${b('city', 'City', COST.city, canC)}${b('buy', 'Card', COST.dev, canD)}<button class="bld-btn" id="tradeBtn"><span>Trade</span><span class="cost tr">⇄</span></button><button class="bld-btn end" id="endBtn"><span>End</span><span class="cost tr">turn</span></button></div></div>`;
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
function newGamePanel() {
  const n = S.n, net = S.seats.slice(1, n).includes('online');
  const rows = Array.from({ length: n }, (_, i) => `<div class="seat"><i style="background:${colorOf(i)}"></i><span>${E.COLORS[i].name}</span>${seatChoice(i)}</div>`).join('');
  return `<div class="phase">
    <div class="head"><span class="h">New game</span>${why('game')}<button class="btn primary sm" id="startBtn" style="min-width:96px" ${app.netBusy ? 'disabled' : ''}>${net ? 'Make room' : 'Start'}</button></div>
    <div class="seg" id="nPl" aria-label="Players">${[3, 4].map(k => `<button aria-pressed="${k === n}" data-n="${k}">${k} players</button>`).join('')}</div>
    <div style="margin-top:6px">${rows}</div>
    <div class="seg" id="boardSeg" style="margin-top:8px" aria-label="Board">${[['random', 'Random board'], ['beginner', 'Beginner board']].map(([k, l]) => `<button aria-pressed="${S.board === k}" data-board="${k}">${l}</button>`).join('')}</div>
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
  app.st = E.newGame(def, { board: S.board }, (Math.random() * 4294967296) >>> 0);
  app.viewer = 0; app.coverFor = -1; app.mode = null; app.robHex = -1; app.logN = 0; app.freshGame = true;
  view.sig = ''; setVB(Object.assign({}, FIT));
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
  const r = await window.CatanNet.createRoom({ name: netName(), seats: kinds, options: { rules: { board: S.board }, levels: seats.map(s => (['easy', 'medium', 'hard'].includes(s) ? s : 'medium')) } });
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
  return `<div class="chart">${bars}</div><div class="small muted"><i class="key a"></i> rolled % <i class="key t"></i> expected (n/36, as in the Tracker) · ${g.rolls.reduce((a, b) => a + b, 0)} rolls</div>`;
}
function diceSheet(g) {
  openSheet(`<div class="sheet-h"><span class="h">Dice this game</span><button class="btn sm ghost" data-close>Close</button></div>${chartHTML(g)}`);
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
function sideHTML(c) {
  const { g } = c;
  return `<div class="phase side-only"><div class="cap">Table</div><ul class="feed">${feedLines(c, 9)}</ul></div>
    <div class="phase side-only"><div class="cap">Dice this game</div>${chartHTML(g)}</div>`;
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
    </div>
    <div class="phase"><div class="head"><span class="h">Sound &amp; effects</span></div><div id="fxSet"></div></div>
    <div class="phase"><div class="head"><span class="h">How strong are the computers?</span></div>${strengthTable()}<div class="small muted" style="margin-top:6px">Computer-only games in node, seats rotated. A fair share is 33% at a 3-player table, 25% at 4.</div></div>
  </div>`;
}

// ------------------------------------------------------------ render
function render() {
  document.body.dataset.tab = app.tab;
  $('#playView').hidden = app.tab !== 'play';
  $('#trackerView').hidden = app.tab !== 'tracker';
  $('#settingsView').hidden = app.tab !== 'settings';
  if (app.tab === 'tracker') { const f = $('#trackerFrame'); if (!f.src) f.src = 'tracker.html'; return; }
  if (app.tab === 'settings') { renderSettings(); return; }
  const c = current();
  const lobby = app.net && (app.net.status === 'lobby' || app.net.status === 'joining');
  document.body.classList.toggle('at-table', !!c && !lobby);
  document.body.classList.toggle('game-over', !!c && !lobby && c.g.phase === 'over');
  if (!c || lobby) {
    const demo = demoBoard();
    drawStatic(demo); $('#live').innerHTML = '';
    $('#seats').hidden = true; $('#mine').hidden = true;
    $('#panel').innerHTML = lobby ? lobbyPanel() : newGamePanel();
    bindPanel(); return;
  }
  drawStatic(c.g);
  fxStep(c);
  drawLive(c);
  $('#seats').hidden = false; $('#seats').innerHTML = seatsHTML(c);
  const noHand = app.coverFor >= 0 || c.g.phase === 'over'; // the end screen needs the room for the scores
  $('#mine').hidden = noHand; $('#mine').innerHTML = noHand ? '' : mineHTML(c);
  $('#panel').innerHTML = app.coverFor >= 0 ? `<div class="phase cover"><div class="h">Pass to ${esc(c.g.players[app.coverFor].name)}</div><button class="btn primary block" id="readyBtn" style="margin-top:10px">I'm ${esc(c.g.players[app.coverFor].name)}</button></div>` : panelHTML(c);
  if (app.coverFor < 0) $('#panel').insertAdjacentHTML('beforeend', sideHTML(c));
  if (c.online) $('#panel').insertAdjacentHTML('beforeend', `<div class="row netbar small muted"><span class="grow">Room ${esc(app.net.code)}</span><button class="btn sm ghost" id="leaveBtn">Leave</button></div>`);
  else if (c.g.phase !== 'over') $('#panel').insertAdjacentHTML('beforeend', `<div class="row netbar small muted"><button class="btn sm ghost" id="diceBtn">Dice</button><span class="grow"></span><button class="btn sm ghost" id="quitBtn">Quit game</button></div>`);
  document.querySelectorAll('#dice .tbl-die').forEach(d => TABLE.die(d, +d.dataset.v));
  bindPanel();
}
let demoCache = null;
function demoBoard() { // the beginner board, shown behind the new-game panel
  if (!demoCache) demoCache = E.newGame([{}, {}, {}], { board: 'beginner' }, 1);
  return demoCache;
}
function renderSettings() {
  $('#settingsView').innerHTML = settingsPanel();
  FX.renderSettings($('#fxSet'));
  document.querySelectorAll('[data-set] [data-v]').forEach(b => b.addEventListener('click', () => { S[b.closest('[data-set]').dataset.set] = b.dataset.v; saveSettings(); renderSettings(); }));
  $('#oddsSw').addEventListener('change', e => { S.spotOdds = e.target.checked; saveSettings(); });
}
function bindPanel() {
  const on = (sel, f) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => f(b, e)));
  on('#nPl [data-n]', b => { S.n = +b.dataset.n; saveSettings(); render(); });
  on('#boardSeg [data-board]', b => { S.board = b.dataset.board; saveSettings(); render(); });
  document.querySelectorAll('[data-seat]').forEach(sel => sel.addEventListener('change', () => { S.seats[+sel.dataset.seat] = sel.value; saveSettings(); render(); }));
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
    app.mode = app.mode === k ? null : k; render();
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
  on('#diceBtn', () => { const c = current(); if (c) diceSheet(c.g); });
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
