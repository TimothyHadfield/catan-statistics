// Headless soak: plays whole games through the real page (iPhone size, Safari engine). Your seat's
// moves come from the Medium computer, sent through the same act() the buttons use, so every panel
// (setup, roll, discard, robber, trade answers, end screen) gets drawn many times.
//   node tools/ui-soak.mjs <baseUrl> <outPng> [games] [players]
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const pw = require(path.join(os.homedir(), '.claude/tools/node_modules/playwright'));
const [base, out, nGames] = process.argv.slice(2);
const browser = await pw.webkit.launch({ headless: true });
const report = [];
try {
  const ctx = await browser.newContext({ ...pw.devices['iPhone 15'] });
  const nPl = +process.argv[5] || 4; // optional 4th arg: players (5-6 = big board + extra build)
  await ctx.addInitScript(n => { try { localStorage.setItem('catan.settings', JSON.stringify({ speed: 'test', n, seats: ['human', 'hard', 'medium', 'easy', 'medium', 'easy'] })); } catch (e) {} }, nPl);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  for (let g = 0; g < (+nGames || 3); g++) {
    await page.goto(base + '#play');
    await page.click('#startBtn');
    const r = await page.evaluate(() => new Promise(resolve => {
      const C = window.__catan, seen = {}; let illegal = 0, renders = 0;
      const t0 = Date.now();
      const iv = setInterval(() => {
        const c = C.current(); if (!c) return;
        if (C.app.coverFor >= 0) { document.querySelector('#readyBtn')?.click(); return; }
        if (c.g.phase === 'over') { clearInterval(iv); resolve({ winner: c.g.winner, turns: c.g.turns, seen, illegal, ms: Date.now() - t0, panel: document.querySelector('#panel .h')?.textContent }); return; }
        if (Date.now() - t0 > 170000) { clearInterval(iv); resolve({ timeout: true, phase: c.g.phase, seen }); return; }
        if (!c.toAct.includes(c.seat)) return;
        const key = c.g.phase + (c.g.offer ? ':' + c.g.offer.stage : '');
        seen[key] = (seen[key] || 0) + 1;
        const a = window.CatanAI.choose(C.app.st, c.seat, Math.random);
        try { C.E.apply(JSON.parse(JSON.stringify(C.app.st)), c.seat, a); } catch (e) { illegal++; return; }
        // the panel for this phase must have drawn without throwing
        renders += document.querySelector('#panel .phase') ? 1 : 0;
        C.act(a);
      }, 15);
    }));
    report.push(r);
    if (g === 0) await page.screenshot({ path: out });
  }
  report.push({ errors: errs });
} finally { await browser.close(); }
console.log(JSON.stringify(report, null, 1));
