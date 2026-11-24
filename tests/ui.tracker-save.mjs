// In-person page in Safari's engine: play a bit, reload, check everything came back.
// Usage: node tests/ui.tracker-save.mjs http://127.0.0.1:<port>/tracker.html
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const pw = require(path.join(os.homedir(), '.claude/tools/node_modules/playwright'));

const url = process.argv[2];
if (!url) { console.error('usage: node tests/ui.tracker-save.mjs <tracker.html url>'); process.exit(2); }
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };

const browser = await pw.webkit.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 659 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url);
await page.waitForSelector('[data-act=random]', { timeout: 30000 });

// what the page shows: board, pieces, harbours, rolls, stage
const snap = () => page.evaluate(() => ({
  tiles: [...document.querySelectorAll('[data-board] svg > g > polygon')].map(p => p.getAttribute('fill')).join(),
  numbers: [...document.querySelectorAll('[data-board] svg > g > text')].map(t => t.textContent).join(),
  rows: [...document.querySelectorAll('[data-summary] [data-row]')].map(r => r.innerText.replace(/\s+/g, ' ')),
  ports: [...document.querySelectorAll('[data-vertex] rect')].map(r => r.parentNode.parentNode.dataset.vertex + r.getAttribute('fill')).sort().join(),
  roads: document.querySelectorAll('[data-edge] line[stroke-width="6"]').length,
  total: document.querySelector('[data-total]').textContent,
  counts: [...document.querySelectorAll('[data-roll]')].map(b => b.innerText.replace(/\s+/g, ' ')).join('|'),
  locked: !!document.querySelector('[data-act=edit]'),
  player: document.querySelector('[data-players] .ring-black')?.getAttribute('aria-label'),
}));

await page.click('[data-act=random]');
const verts = await page.$$eval('[data-vertex]', gs => gs.map(g => g.dataset.vertex));
await page.click('[aria-label="blue player"]');
await page.dispatchEvent(`[data-vertex="${verts[20]}"]`, 'click');
await page.click('[aria-label="red player"]');
await page.dispatchEvent(`[data-vertex="${verts[33]}"]`, 'click');
await page.click('[data-mode=road]');
const edge = await page.$eval(`[data-edge*="${verts[33]}"]`, g => g.dataset.edge);
await page.dispatchEvent(`[data-edge="${edge}"]`, 'click');
await page.click('[data-mode=port]');
await page.dispatchEvent(`[data-vertex="${verts[0]}"]`, 'click'); // 3:1 on a new corner (or steps an existing one)
await page.click('[data-mode=settlement]');
for (const n of [6, 8, 7, 5, 9, 7, 4, 10]) await page.click(`[data-roll="${n}"]`);
await page.click('[data-act=undo]');
const before = await snap();
check(before.rows.length === 3 && before.roads === 1 && before.total === '7 rolls', `played: ${JSON.stringify(before.rows)} roads ${before.roads} ${before.total}`);

await page.reload();
await page.waitForSelector('[data-summary]', { timeout: 30000 });
const after = await snap();
for (const k of Object.keys(before)) check(JSON.stringify(before[k]) === JSON.stringify(after[k]), `after reload, same ${k}`);

// Clear rolls clears only the rolls
page.once('dialog', d => d.accept());
await page.click('[data-act=reset-rolls]');
const cleared = await snap();
check(cleared.total === '0 rolls' && cleared.tiles === before.tiles && JSON.stringify(cleared.rows) === JSON.stringify(before.rows) && cleared.roads === 1, 'Clear rolls keeps board and pieces');

// Edit -> Random starts a new board (no pieces); rolls stay
for (const n of [6, 6]) await page.click(`[data-roll="${n}"]`);
await page.click('[data-act=edit]');
check(!!(await page.$('[data-act=back]')), 'Edit shows Random / Manual / Back');
await page.click('[data-act=random]');
const fresh = await snap();
check(fresh.locked && fresh.rows.length === 1 && fresh.roads === 0 && fresh.total === '2 rolls', 'Edit -> Random: new board, no pieces, rolls kept');
await page.reload();
await page.waitForSelector('[data-summary]', { timeout: 30000 });
check(JSON.stringify(await snap()) === JSON.stringify(fresh), 'new board survives reload');

// Edit -> Manual starts an empty board
await page.click('[data-act=edit]');
await page.click('[data-act=manual]');
const manual = await page.evaluate(() => [...document.querySelectorAll('[data-board] svg > g > polygon:not([stroke-dasharray])')].map(p => p.getAttribute('fill')));
check(manual.length === 19 && manual.every(f => f === '#F5F5DC'), 'Edit -> Manual: empty 19-tile board');
await page.reload();
await page.waitForSelector('[data-act=lock]', { timeout: 30000 });
check(true, 'manual stage survives reload');

check(!errors.length, `no page errors ${errors.join(' | ')}`);
await browser.close();
console.log(fails.length ? `${fails.length} FAILED` : 'all ok');
process.exit(fails.length ? 1 : 0);
