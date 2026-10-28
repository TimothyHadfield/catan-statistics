// Headless layout check (Safari engine via Playwright from ~/.claude/tools). Never opens a window.
//   node tools/ui-check.mjs <baseUrl> <outDir> [scenario]
// Builds a mid-game save in node (computers play until it's your build step), loads it into the
// page, then measures: no page scroll / sideways overflow, board numbers >= 12 px, the action row
// on screen, and takes screenshots at 393, 320, 659x393 landscape, 1280 and 1440.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const pw = require(path.join(os.homedir(), '.claude/tools/node_modules/playwright'));
const E = require('../js/engine.js'), AI = require('../js/ai.js');
const [base, outDir, only, nArg] = process.argv.slice(2); // nArg 5 or 6: a 5-6 player game on the big board
const N = +nArg || 4;

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function midgame(phase) {
  const lv = ['hard', 'medium', 'easy', 'medium', 'hard'];
  let st = E.newGame(Array.from({ length: N }, (_, i) => (i ? { name: E.COLORS[i].name, kind: 'cpu', level: lv[i - 1] } : { name: 'You', kind: 'human' })), { board: 'random' }, 4242);
  const r = mulberry(5);
  // everyone (you too) played by computers until round 9, then stop on your turn
  st.players[0].kind = 'cpu'; st.players[0].level = 'hard';
  while (!(st.turns >= 32 && st.turn === 0 && st.phase === phase)) { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, r)); if (st.phase === 'over') throw new Error('game ended early'); }
  st.players[0].kind = 'human';
  st.players[0].res = [2, 2, 1, 2, 3]; st.players[0].dev = ['K', 'M', 'V']; st.players[0].fresh = []; st.players[0].vpCards = 1;
  return st;
}

const shots = [
  { name: 'phone', opts: { ...pw.devices['iPhone 15'] } },
  { name: 'se', opts: { ...pw.devices['iPhone SE'] } },
  { name: 'land', opts: { ...pw.devices['iPhone 15 landscape'] } },
  { name: 'laptop', opts: { viewport: { width: 1280, height: 800 } } },
  { name: 'wide', opts: { viewport: { width: 1440, height: 900 } } },
];
const browser = await pw.webkit.launch({ headless: true });
const results = [];
try {
  for (const sc of shots) {
    if (only && only !== 'all' && sc.name !== only) continue;
    const ctx = await browser.newContext(sc.opts);
    const st = midgame('main');
    await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('catan.game', s); localStorage.setItem('catan.settings', JSON.stringify({ speed: 'fast' })); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, JSON.stringify(st));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + '#play');
    await page.waitForSelector('#endBtn', { timeout: 8000 });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const de = document.documentElement, vh = innerHeight, vw = innerWidth;
      const toks = [...document.querySelectorAll('#static .tokn')].map(t => t.getBoundingClientRect().height);
      const ports = [...document.querySelectorAll('#static .ptxt')].map(t => t.getBoundingClientRect().height);
      const vis = sel => { const el = document.querySelector(sel); if (!el) return 'missing'; const r = el.getBoundingClientRect(); return r.bottom <= vh + 0.5 && r.top >= 0 && r.right <= vw + 0.5 ? 'yes' : `no (${Math.round(r.top)}-${Math.round(r.bottom)} of ${vh})`; };
      const fs = el => parseFloat(getComputedStyle(el).fontSize);
      return { vw, vh, scrollH: de.scrollHeight, scrollW: de.scrollWidth, minNumberPx: Math.min(...toks).toFixed(1), minPortPx: Math.min(...ports).toFixed(1),
        endBtn: vis('#endBtn'), roadBtn: vis('[data-build="road"]'), hand: vis('.rc[data-r="4"]'), seats: vis('.opp:last-child'), dev: vis('.devc') };
    });
    const tag = N === 4 ? sc.name : sc.name + '-' + N + 'p';
    await page.screenshot({ path: path.join(outDir, `ui-${tag}-main.png`) });
    // build mode shows targets; the trade sheet opens
    await page.click('[data-build="road"]');
    await page.waitForTimeout(200);
    m.roadTargets = await page.locator('.hit-edge').count();
    await page.screenshot({ path: path.join(outDir, `ui-${tag}-road.png`) });
    await page.click('#cancelMode').catch(() => {});
    await page.click('#tradeBtn');
    await page.waitForSelector('#sheet:not([hidden])');
    await page.waitForTimeout(250);
    m.sheetFits = await page.evaluate(() => { const r = document.querySelector('#sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5; });
    await page.screenshot({ path: path.join(outDir, `ui-${tag}-trade.png`) });
    m.errors = errs;
    results.push({ name: sc.name, ...m });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
