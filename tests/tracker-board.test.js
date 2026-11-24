// The in-person tracker's Random board must always be a legal standard base board.
const test = require('node:test');
const assert = require('node:assert');
const TB = require('../js/tracker-board.js');

const HW = 40 * Math.sqrt(3);
const touching = (a, b) => Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - HW) < 0.5;
const count = arr => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});

// every corner key the tracker itself would make for this board
function corners(hexes) {
  const out = new Map();
  hexes.forEach(h => { for (let i = 0; i < 6; i++) { const k = TB.cornerKey(h, i); out.set(k, (out.get(k) || 0) + 1); } });
  return out;
}

test('2000 random boards are legal standard boards', () => {
  const seen = new Set();
  for (let s = 1; s <= 2000; s++) {
    const { hexes, ports } = TB.randomBoard(s * 2654435761);
    assert.strictEqual(hexes.length, 19);
    assert.deepStrictEqual(count(hexes.map(h => h.resource)), { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 });
    const desert = hexes.find(h => h.resource === 'desert');
    assert.strictEqual(desert.number, '');
    const nums = hexes.filter(h => h.number).map(h => Number(h.number));
    assert.deepStrictEqual(count(nums), { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 });
    const reds = hexes.filter(h => h.number === '6' || h.number === '8');
    for (const a of reds) for (const b of reds) if (a !== b) assert.ok(!touching(a, b), `seed ${s}: 6/8 touch`);
    // harbours: 9 of them, 2 corners each, all on the coast, no corner shared
    assert.strictEqual(ports.length, 18);
    assert.deepStrictEqual(count(ports.map(p => p.type)), { '3:1': 8, wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2 });
    const cs = corners(hexes);
    ports.forEach(p => assert.ok(cs.has(p.vertex) && cs.get(p.vertex) <= 2, `seed ${s}: port corner ${p.vertex} not on the coast`));
    assert.strictEqual(new Set(ports.map(p => p.vertex)).size, 18);
    seen.add(hexes.map(h => h.resource[0] + h.number).join());
  }
  assert.ok(seen.size > 1900, 'boards vary');
});

// a fake localStorage that survives a "reload" (a new load() call), like the browser's
function fakeStore() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; }

test('save, reload, restore: board, pieces, harbours, rolls and locked state come back', () => {
  const store = fakeStore();
  const { hexes, ports } = TB.randomBoard(99);
  const k0 = TB.cornerKey(hexes[9], 0), k1 = TB.cornerKey(hexes[9], 1);
  const game = { stage: 'locked', hexes, ports,
    settlements: [{ vertex: k0, player: 'red' }, { vertex: TB.cornerKey(hexes[2], 3), player: 'blue' }],
    roads: [{ edge: [k0, k1].sort().join('|'), player: 'red' }],
    history: [6, 8, 7, 5, 9, 7, 4, 10, 6, 3, 11, 7, 8, 2, 12, 9, 6, 5], player: 'blue', weighted: true };
  assert.strictEqual(TB.save(game, store), true);
  const back = JSON.parse(JSON.stringify(TB.load(store))); // what a fresh page would read
  assert.deepStrictEqual(back, JSON.parse(JSON.stringify(game)));
  // saving again after a change overwrites (one key, latest state wins)
  TB.save({ ...game, history: game.history.slice(0, -1), stage: 'start' }, store);
  assert.strictEqual(store.m.size, 1);
  assert.strictEqual(TB.load(store).history.length, 17);
  assert.strictEqual(TB.load(store).stage, 'start');
});

test('restore never throws: nothing saved, bad JSON, wrong shape, blocked storage', () => {
  assert.strictEqual(TB.load(fakeStore()), null);
  const bad = fakeStore(); bad.setItem(TB.SAVE_KEY, '{not json'); assert.strictEqual(TB.load(bad), null);
  const wrong = fakeStore(); wrong.setItem(TB.SAVE_KEY, JSON.stringify({ v: 1, stage: 'locked', hexes: [{ id: 'x' }] })); assert.strictEqual(TB.load(wrong), null);
  const junk = fakeStore();
  junk.setItem(TB.SAVE_KEY, JSON.stringify({ v: 1, stage: 'manual', hexes: TB.randomBoard(3).hexes, history: [6, 7, 13, 'x', 1], settlements: 'no', roads: [null], ports: [{ vertex: 1 }] }));
  const j = TB.load(junk);
  assert.deepStrictEqual([j.history, j.settlements, j.roads, j.ports, j.player], [[6, 7], [], [], [], 'red']);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); } };
  assert.strictEqual(TB.load(blocked), null);
  assert.strictEqual(TB.save({ stage: 'start', hexes: [] }, blocked), false);
  // no store at all (node has no localStorage by default)
  assert.doesNotThrow(() => TB.load());
});

test('board shape matches the tracker default 3-4-5-4-3 layout', () => {
  const { hexes } = TB.randomBoard(7);
  const rows = count(hexes.map(h => Math.round(h.y)));
  assert.deepStrictEqual(Object.values(rows), [3, 4, 5, 4, 3]);
  assert.ok(Math.abs(hexes[0].x - 200) < 0.01 && Math.abs(hexes[0].y - 80) < 0.01);
  assert.ok(Math.abs(hexes[18].x - (200 + HW * 2)) < 0.01);
});
