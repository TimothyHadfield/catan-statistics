// Headless screenshots of the wave-3 screens (Safari engine): new game for 6, House rules in Settings,
// the rules sheet with videos, and the extra build step of a 5-player game.
//   node tools/ui-screens.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const pw = require(path.join(os.homedir(), '.claude/tools/node_modules/playwright'));
const E = require('../js/engine.js'), AI = require('../js/ai.js');
const [base, outDir] = process.argv.slice(2);

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a 5-player game stopped at your extra build step
function buildStep() {
  let st = E.newGame(Array.from({ length: 5 }, (_, i) => ({ name: i ? E.COLORS[i].name : 'You', kind: 'cpu', level: 'medium' })), { board: 'random' }, 77);
  const r = mulberry(3);
  while (!(st.turns >= 12 && st.phase === 'main' && st.turn === 4)) { const p = E.actors(st)[0]; st = E.apply(st, p, AI.choose(st, p, r)); }
  st.players[0].res = [2, 2, 1, 1, 0];
  st = E.apply(st, 4, { t: 'end' });
  if (!(st.phase === 'build' && st.build.queue[0] === 0)) throw new Error('not at my build step: ' + st.phase);
  st.players[0].kind = 'human';
  return st;
}
const sizes = [['phone', { ...pw.devices['iPhone 15'] }], ['se', { ...pw.devices['iPhone SE'] }], ['laptop', { viewport: { width: 1280, height: 800 } }]];
const browser = await pw.webkit.launch({ headless: true });
const out = [];
try {
  for (const [name, opts] of sizes) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const fits = () => page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, vw: innerWidth, scrollH: document.documentElement.scrollHeight, vh: innerHeight }));
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('catan.settings', JSON.stringify({ n: 6, friendly: true, vp: 12 })); sessionStorage.setItem('s', '1'); } } catch (e) {} });
    await page.goto(base + '#play'); await page.waitForSelector('#startBtn'); await page.waitForTimeout(300);
    const m = { name, newGame: await fits() };
    m.startVisible = await page.evaluate(() => { const r = document.querySelector('#startBtn').getBoundingClientRect(); return r.bottom <= innerHeight; });
    await page.screenshot({ path: path.join(outDir, `scr-${name}-newgame6.png`) });
    await page.click('[data-why="game"]'); await page.waitForTimeout(250);
    m.videos = await page.$$eval('.vids a', a => a.map(x => x.target + ' ' + x.rel));
    await page.screenshot({ path: path.join(outDir, `scr-${name}-rules.png`) });
    await page.goto(base + '#settings'); await page.reload(); await page.waitForSelector('#vpSel'); await page.waitForTimeout(300);
    m.settings = await fits();
    await page.screenshot({ path: path.join(outDir, `scr-${name}-settings.png`) });
    await page.evaluate(s => { localStorage.setItem('catan.game', s); }, JSON.stringify(buildStep()));
    await page.goto(base + '#play'); await page.reload(); await page.waitForSelector('#endBtn'); await page.waitForTimeout(300);
    m.build = await fits();
    m.buildPanel = await page.$eval('#panel .phase', el => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
    await page.screenshot({ path: path.join(outDir, `scr-${name}-build.png`) });
    await page.click('[data-build="road"]'); await page.waitForTimeout(150);
    m.buildRoadTargets = await page.locator('.hit-edge').count();
    m.errors = errs; out.push(m);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(out, null, 1));
