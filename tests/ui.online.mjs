// Two phones, one online room, against the real free Firebase project (th-board-games):
//   node tests/ui.online.mjs <baseUrl> [outDir]
// Host makes a 3-player room (host, an "Online friend" seat, one computer), the friend joins by
// code, both play a whole game. Each side's moves come from the Medium computer looking only at
// that phone's own screen (public table + own hand), sent through the same act() the buttons use.
// Fails on console/page errors, a phone seeing another seat's hidden cards, or no finish.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const pw = require(path.join(os.homedir(), '.claude/tools/node_modules/playwright'));
const base = process.argv[2] || 'http://127.0.0.1:18500/';
const out = process.argv[3] || '.';
const errors = [];
const browser = await pw.webkit.launch({ headless: true });
async function open(tag, name) {
  const ctx = await browser.newContext({ ...pw.devices['iPhone 15'] });
  await ctx.addInitScript((nm) => { try { if (!localStorage.getItem('catan.settings')) localStorage.setItem('catan.settings', JSON.stringify({ speed: 'test', n: 3, seats: ['human', 'online', 'medium'], netName: nm })); } catch (e) {} }, name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/firestore\.googleapis\.com.*channel/.test(e.message)) errors.push(tag + ' pageerror: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!/firestore\.googleapis\.com.*(Listen|Write)\/channel/.test(u)) errors.push(tag + ' failed: ' + u); });
  await page.goto(base + '#play', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.CatanNet, null, { timeout: 30000 });
  return page;
}
const host = await open('host', 'Tim');
const friend = await open('friend', 'Sam');
const t0 = Date.now();
try {
  await host.click('#startBtn');               // "Make room"
  await host.waitForSelector('.code', { timeout: 30000 });
  const code = (await host.textContent('.code')).trim();
  console.log('room', code);
  await friend.fill('#netCode', code.toLowerCase());
  await friend.click('#joinBtn');
  await friend.waitForSelector('.code', { timeout: 30000 });
  await host.waitForFunction(() => window.__catan.app.net && window.__catan.app.net.seats.filter((s) => s.kind === 'human').length === 2, null, { timeout: 30000 });
  await host.screenshot({ path: path.join(out, 'online-lobby-host.png') });
  await friend.screenshot({ path: path.join(out, 'online-lobby-friend.png') });
  await host.click('#netStart');
  // both phones play: a timer in each page moves for that phone's seat when it is its turn
  const driver = () => {
    const C = window.__catan; window.__drv = { moves: 0, leaks: [], over: false };
    setInterval(() => {
      const c = C.current(); if (!c || !c.online) return;
      const g = c.g, me = c.seat;
      g.players.forEach((P, i) => { if (i !== me && (Array.isArray(P.res) || Array.isArray(P.dev)) &&!window.__drv.leaks.includes(i)) window.__drv.leaks.push(i); });
      if (g.phase === 'over') { window.__drv.over = true; return; }
      if (!c.toAct.includes(me) || C.app.net.sending) return;
      // the computer's robber step sums every hand; a phone only knows the others' card COUNTS, so give it those
      const view = JSON.parse(JSON.stringify(g));
      view.players.forEach((P) => { if (typeof P.res === 'number') P.res = [P.res, 0, 0, 0, 0]; });
      let a; try { a = window.CatanAI.choose(view, me, Math.random); } catch (e) { window.__drv.err = String(e); return; }
      window.__drv.moves++; C.act(a);
    }, 250);
  };
  await host.evaluate(driver); await friend.evaluate(driver);
  let shot = false;
  while (Date.now() - t0 < 20 * 60000) {
    await host.waitForTimeout(3000);
    const [h, f] = [await host.evaluate(() => window.__drv), await friend.evaluate(() => window.__drv)];
    if (!shot && h.moves + f.moves > 20) { shot = true; await host.screenshot({ path: path.join(out, 'online-game-host.png') }); await friend.screenshot({ path: path.join(out, 'online-game-friend.png') }); }
    if (h.over && f.over) break;
  }
  const [h, f] = [await host.evaluate(() => window.__drv), await friend.evaluate(() => window.__drv)];
  if (h.leaks.length) errors.push('host sees hidden cards of seats ' + h.leaks);
  if (f.leaks.length) errors.push('friend sees hidden cards of seats ' + f.leaks);
  if (!(h.over && f.over)) errors.push('game did not finish on both phones');
  await host.screenshot({ path: path.join(out, 'online-over-host.png') });
  await friend.screenshot({ path: path.join(out, 'online-over-friend.png') });
  console.log(JSON.stringify({ code, hostMoves: h.moves, friendMoves: f.moves, over: h.over && f.over, minutes: +((Date.now() - t0) / 60000).toFixed(1) }));
  await friend.click('#leaveBtn').catch(() => {});
  await host.click('#leaveBtn').catch(() => {});
  await host.waitForTimeout(1500);
} catch (e) { errors.push('run: ' + String(e).slice(0, 300)); }
await browser.close();
console.log(JSON.stringify({ errors }, null, 1));
if (errors.length) process.exit(1);
