// Fit check for a CROWDED late game (headless WebKit via Playwright from ~/.claude/tools; never opens a window).
//   node tests/fit-ui.mjs <baseUrl> <outDir> [players=6] [only]
// 6 players with long names, 20 cards in my hand, every kind of dev card (knights x3, points x2),
// longest road + largest army held by opponents. At 393x659, 320x568, 659x393, 1280x800, 1440x900
// it measures: no page scroll, number sizes (board tokens, my counts, opponents' numbers), dev card
// names readable and not cut, opponent names identifiable, build buttons on screen and tappable.
// Exits 1 if any check fails.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const pw = require(path.join(os.homedir(), '.claude/tools/node_modules/playwright'));
const E = require('../js/engine.js'), AI = require('../js/ai.js');
const [base, outDir, nArg, only] = process.argv.slice(2);
const N = +nArg || 6;
const NAMES = ['You', 'Bartholomew', 'Maximiliana', 'Christopher', 'Evangeline', 'Montgomery'];

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function crowded() {
  const lv = ['hard', 'medium', 'easy', 'medium', 'hard'];
  let st = E.newGame(Array.from({ length: N }, (_, i) => (i ? { name: NAMES[i], kind: 'cpu', level: lv[i - 1] } : { name: 'You', kind: 'human' })), { board: 'random' }, 4242);
  const r = mulberry(5);
  st.players[0].kind = 'cpu'; st.players[0].level = 'hard';
  let guard = 0;
  while (!(st.turns >= 4 * N && st.turn === 0 && st.phase === 'main')) { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, r)); if (st.phase === 'over' || ++guard > 200000) throw new Error('game ended early'); }
  st.players[0].kind = 'human';
  st.players[0].res = [4, 4, 3, 4, 5]; // 20 cards
  st.players[0].dev = ['K', 'K', 'K', 'R', 'P', 'M', 'V', 'V']; st.players[0].fresh = ['P']; // Year of plenty bought this turn: shows "next turn" st.players[0].vpCards = 2; st.players[0].knights = 2;
  st.players.forEach((P, i) => { if (i) { P.res = [3, 2, 4, 1, 3]; P.knights = i % 3; } });
  st.longest = { p: 1, len: 7 }; st.army = { p: 2, size: 3 };
  return st;
}

const shots = [
  { name: 'phone', opts: { ...pw.devices['iPhone 15'], viewport: { width: 393, height: 659 } }, tok: 12 },
  { name: 'se', opts: { ...pw.devices['iPhone SE'] }, tok: 8 }, // SE board numbers are small by design (zoom button), see progress.md
  { name: 'land', opts: { ...pw.devices['iPhone 15 landscape'] }, tok: 10 },
  { name: 'laptop', opts: { viewport: { width: 1280, height: 800 } }, tok: 12 },
  { name: 'wide', opts: { viewport: { width: 1440, height: 900 } }, tok: 12 },
];
const browser = await pw.webkit.launch({ headless: true });
const results = []; let bad = 0;
try {
  for (const sc of shots) {
    if (only && sc.name !== only) continue;
    const ctx = await browser.newContext(sc.opts);
    await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('catan.game', s); localStorage.setItem('catan.settings', JSON.stringify({ speed: 'test' })); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, JSON.stringify(crowded()));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + '#play');
    try { await page.waitForSelector('#endBtn', { timeout: 8000 }); }
    catch (e) { await page.screenshot({ path: path.join(outDir, `fit-${sc.name}-${N}p-stuck.png`) }); throw new Error('no #endBtn ' + errs.join(' | ')); }
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const de = document.documentElement, vh = innerHeight, vw = innerWidth;
      const all = s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      const fs = e => parseFloat(getComputedStyle(e).fontSize);
      const min = a => (a.length ? Math.min(...a) : NaN);
      const onScreen = e => { const r = e.getBoundingClientRect(); return r.top >= -0.5 && r.bottom <= vh + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5; };
      const offs = s => all(s).filter(e => !onScreen(e)).length;
      const cut = e => e.scrollWidth > e.clientWidth + 1;
      const devNames = all('.devc span');
      const oppNames = all('.opp .nm');
      return {
        vw, vh, scroll: Math.max(0, de.scrollHeight - vh), sideScroll: Math.max(0, de.scrollWidth - vw),
        tokenPx: +min(all('#static .tokn').map(t => t.getBoundingClientRect().height)).toFixed(1),
        handCountPx: min(all('.hand .rc b').map(fs)),
        handIconPx: +min(all('.hand .rc .ri').map(e => e.getBoundingClientRect().height)).toFixed(1),
        myVpPx: min(all('.myvp b').map(fs)),
        oppNumPx: min(all('.opp .st b').map(fs)),
        oppNamePx: min(oppNames.map(fs)),
        oppNameCharsShown: min(oppNames.map(e => { // letters actually visible before the ellipsis
          const cx = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e);
          cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const t = e.textContent; if (cx.measureText(t).width <= e.clientWidth + 0.5) return t.length;
          const room = e.clientWidth - cx.measureText('…').width; let k = 0;
          while (k < t.length && cx.measureText(t.slice(0, k + 1)).width <= room) k++;
          return k; })),
        devCards: all('.devc').length,
        devNamePx: min(devNames.map(fs)), devNamesCut: devNames.filter(cut).map(e => e.textContent),
        devCountPx: min(all('.devc b').map(fs)),
        devTapPx: +min(all('.devc').map(e => e.getBoundingClientRect().height)).toFixed(1),
        buildTapPx: +min(all('[data-build]').map(e => e.getBoundingClientRect().height)).toFixed(1),
        awards: all('.opp .aw').length,
        offScreen: offs('.hand .rc') + offs('.devc') + offs('.opp') + offs('[data-build]') + offs('#endBtn') + offs('#tradeBtn'),
        // hidden = covered by something else, or cut by a scrolling/clipping box (the panel used to scroll inside)
        oppSpill: all('.opp .st, .opp .aw').filter(e => { const r = e.getBoundingClientRect(), q = e.closest('.opp').getBoundingClientRect(); return r.left < q.left - 1.5 || r.right > q.right + 1.5; }).length,
        hidden: all('.hand .rc, .devc, .opp .st, .opp .aw, [data-build], #endBtn, #tradeBtn').filter(e => {
          const r = e.getBoundingClientRect();
          for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p); if (o.overflow === 'visible' && o.overflowY === 'visible' && o.overflowX === 'visible') continue;
            const q = p.getBoundingClientRect(); if (r.top < q.top - 1.5 || r.bottom > q.bottom + 1.5 || r.left < q.left - 1.5 || r.right > q.right + 1.5) return true;
          }
          return [[.5, .5], [.5, .85], [.15, .5], [.85, .5]].some(([fx, fy]) => { const h = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return !h || !(e === h || e.contains(h)); });
        }).map(e => e.id || e.dataset.build || e.dataset.dev || e.dataset.r || e.textContent.trim().slice(0, 12)),
      };
    });
    m.errors = errs;
    const fail = [];
    if (m.scroll > 1) fail.push('page scrolls ' + m.scroll);
    if (m.sideScroll > 1) fail.push('sideways ' + m.sideScroll);
    if (!(m.tokenPx >= sc.tok)) fail.push('board numbers ' + m.tokenPx);
    if (!(m.handCountPx >= 12)) fail.push('hand counts ' + m.handCountPx);
    if (!(m.myVpPx >= 12)) fail.push('my points ' + m.myVpPx);
    if (!(m.oppNumPx >= 12)) fail.push('opponent numbers ' + m.oppNumPx);
    if (!(m.oppNamePx >= 10)) fail.push('opponent names ' + m.oppNamePx + 'px');
    if (!(m.oppNameCharsShown >= 4)) fail.push('opponent names show ~' + m.oppNameCharsShown + ' chars');
    if (m.devCards !== 5) fail.push('dev cards shown ' + m.devCards + '/5');
    if (!(m.devNamePx >= 10)) fail.push('dev names ' + m.devNamePx + 'px');
    if (m.devNamesCut.length) fail.push('dev names cut: ' + m.devNamesCut.join(', '));
    if (!(m.devCountPx >= 12)) fail.push('dev counts ' + m.devCountPx);
    if (!(m.devTapPx >= 32)) fail.push('dev tap ' + m.devTapPx);
    if (!(m.buildTapPx >= 36)) fail.push('build tap ' + m.buildTapPx);
    if (m.awards !== 2) fail.push('awards shown ' + m.awards + '/2');
    if (m.offScreen) fail.push(m.offScreen + ' items off screen');
    if (m.oppSpill) fail.push(m.oppSpill + ' opponent numbers spill out of their card');
    if (m.hidden.length) fail.push('covered/cut: ' + m.hidden.join(','));
    if (errs.length) fail.push('console errors');
    m.fail = fail; bad += fail.length;
    await page.screenshot({ path: path.join(outDir, `fit-${sc.name}-${N}p.png`) });
    results.push({ name: sc.name, ...m });
    await ctx.close();
  }
} finally { await browser.close(); }
for (const r of results) console.log(r.name.padEnd(7), r.fail.length ? 'FAIL ' + r.fail.join('; ') : 'ok', JSON.stringify(r));
process.exit(bad ? 1 : 0);
