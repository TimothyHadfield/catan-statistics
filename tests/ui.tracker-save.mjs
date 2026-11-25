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
  ports: [...document.querySelectorAll('[data-port]')].map(g => g.dataset.at + g.dataset.port).sort().join(),
  roads: document.querySelectorAll('[data-edge] line[stroke-width="6"]').length,
  total: document.querySelector('[data-total]').textContent,
  counts: [...document.querySelectorAll('[data-roll]')].map(b => b.innerText.replace(/\s+/g, ' ')).join('|'),
  locked: !!document.querySelector('[data-act=edit]'),
  player: document.querySelector('[data-players] .ip-col[aria-pressed="true"]')?.getAttribute('aria-label'),
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
await page.click('[data-act=undo-all]'); // ◀ takes back the last roll
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

// ---- distance rule, Weighted and the ◀ history, on a fresh page
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('[data-act=random]', { timeout: 30000 });
check(await page.$eval('[data-act=undo-all]', b => b.disabled), '◀ greyed out with nothing to undo');
const states = []; // page snapshot before each action, newest last
const act = async (name, fn) => { states.push({ name, s: await snap() }); await fn(); };
await act('random', () => page.click('[data-act=random]'));
const vs = await page.$$eval('[data-vertex]', gs => gs.map(g => g.dataset.vertex));
const nb = await page.evaluate(k => { // corners one road away from k
  return [...document.querySelectorAll('[data-edge]')].map(g => g.dataset.edge.split('|')).filter(e => e.includes(k)).map(e => (e[0] === k ? e[1] : e[0]));
}, vs[30]);
const sumShown = k => page.$eval(`[data-vertex="${k}"]`, g => !!g.querySelector('[data-sum]'));
check(await sumShown(vs[30]) && (await Promise.all(nb.map(sumShown))).every(Boolean), 'all corner sums shown before placing');
await act('settlement', () => page.dispatchEvent(`[data-vertex="${vs[30]}"]`, 'click'));
check(nb.length >= 2 && !(await Promise.all(nb.map(sumShown))).some(Boolean), `no sums on the ${nb.length} corners next to a settlement`);
const tableRaw = (await snap()).rows[0];
const sumsRaw = await page.$$eval('[data-sum]', ts => ts.map(t => t.textContent).join());
await act('weighted', () => page.click('[data-act=weighted]'));
const wSnap = await snap();
const sumsW = await page.$$eval('[data-sum]', ts => ts.map(t => t.textContent).join());
check(wSnap.rows[0] !== tableRaw && sumsW !== sumsRaw, `Weighted changes totals (${tableRaw} -> ${wSnap.rows[0]}) and corner sums`);
await act('colour', () => page.click('[aria-label="green player"]'));
await act('road', async () => { await page.click('[data-mode=road]'); await page.dispatchEvent(`[data-edge*="${vs[30]}"]`, 'click'); });
await act('port', async () => { await page.click('[data-mode=port]'); await page.dispatchEvent(`[data-vertex="${vs[5]}"]`, 'click'); });
await act('roll', () => page.click('[data-roll="8"]'));
await act('clear', () => page.click('[data-act=reset-rolls]'));
await act('edit', () => page.click('[data-act=edit]'));
await act('manual', () => page.click('[data-act=manual]'));
await act('tile', async () => {
  await page.click('[data-board] svg > g:nth-of-type(30) polygon');
  await page.selectOption('select[aria-label=Resource]', 'ore');
});
// ◀ through every step, newest first; each must land exactly on the page before that action
for (let i = states.length - 1; i >= 0; i--) {
  await page.click('[data-act=undo-all]');
  const now = await snap();
  if (!now.locked && states[i].s.locked) await page.waitForSelector('[data-summary]');
  const same = JSON.stringify(await snap()) === JSON.stringify(states[i].s);
  check(same, `◀ undoes ${states[i].name}`);
}
check(await page.$eval('[data-act=undo-all]', b => b.disabled), '◀ greyed out again at the start');

check(!errors.length, `no page errors ${errors.join(' | ')}`);
await browser.close();
console.log(fails.length ? `${fails.length} FAILED` : 'all ok');
process.exit(fails.length ? 1 : 0);
