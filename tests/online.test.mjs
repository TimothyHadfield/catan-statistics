// Catan through the shared online module: adapter games, secrecy, a local room played to the end.
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { game, merge } = require('../js/adapter.js');
const E = require('../js/engine.js');
const { createLocal } = await import('../js/online.js');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('adapter games: bot moves always legal, someone always to act, JSON-safe, 3 and 4 seats', () => {
  for (let g = 0; g < 12; g++) {
    const n = 3 + (g % 2), rng = mulberry(g + 3);
    const seats = Array.from({ length: n }, (_, i) => ({ kind: i % 2 ? 'computer' : 'human', name: 'P' + i }));
    let s = game.setup(n, { rules: { board: g % 2 ? 'beginner' : 'random' }, levels: ['hard', 'medium', 'easy', 'medium'] }, rng, seats);
    let moves = 0;
    while (!game.isOver(s)) {
      const who = game.toAct(s); assert.ok(who.length >= 1);
      for (const seat of who) {
        if (game.isOver(s) || !game.toAct(s).includes(seat)) continue;
        const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
        s = game.apply(JSON.parse(JSON.stringify(s)), seat, game.bot(ctx, seat, rng));
      }
      assert.ok(++moves < 20000);
    }
    assert.ok(s.winner >= 0);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
  }
});

test('a move out of turn is refused', () => {
  const s = game.setup(3, {}, mulberry(5), []);
  const other = (game.toAct(s)[0] + 1) % 3;
  assert.throws(() => game.apply(s, other, { t: 'settle', v: 0 }), /Not your turn/);
});

test('secrecy: public view and other seats never see a hand, dev cards, point cards or the deck', () => {
  const rng = mulberry(77);
  let s = game.setup(4, {}, rng, Array.from({ length: 4 }, () => ({ kind: 'computer' })));
  for (let k = 0; k < 3000 && !game.isOver(s); k++) {
    const seat = game.toAct(s)[0];
    s = game.apply(s, seat, game.bot({ state: s }, seat, rng));
    if (s.players.filter(P => P.dev.length).length >= 2 && s.phase === 'main') break;
  }
  const pub = game.publicView(s), txt = JSON.stringify(pub);
  assert.ok(!('seed' in pub)); assert.strictEqual(typeof pub.deck, 'number');
  assert.ok(!/"K"|"V"|"M"|"P"|"R"/.test(JSON.stringify(pub.players)), 'no dev card letters in public players');
  pub.players.forEach((P, i) => { assert.strictEqual(P.res, E.sum(s.players[i].res)); assert.strictEqual(P.vpCards, 0); });
  assert.ok(!txt.includes('"fresh":['), 'fresh cards are a count');
  for (let j = 0; j < 4; j++) {
    const mine = game.privateView(s, j);
    assert.deepStrictEqual(Object.keys(mine).sort(), ['dev', 'fresh', 'res', 'vpCards']);
    const g = merge(pub, mine, j);
    g.players.forEach((P, i) => { if (i !== j) { assert.strictEqual(typeof P.res, 'number'); assert.strictEqual(typeof P.dev, 'number'); } });
    assert.deepStrictEqual(g.players[j].res, s.players[j].res);
  }
});

test('a private doc only changes when that hand changes (saves free-tier writes)', () => {
  const rng = mulberry(11);
  let s = game.setup(3, {}, rng, Array.from({ length: 3 }, () => ({ kind: 'computer' })));
  let same = 0, total = 0;
  for (let k = 0; k < 400 && !game.isOver(s); k++) {
    const seat = game.toAct(s)[0];
    const before = [0, 1, 2].map(i => JSON.stringify(game.privateView(s, i)));
    s = game.apply(s, seat, game.bot({ state: s }, seat, rng));
    [0, 1, 2].forEach(i => { total++; if (before[i] === JSON.stringify(game.privateView(s, i))) same++; });
  }
  assert.ok(same / total > 0.6, `most private docs unchanged per move (${same}/${total})`);
});

test('a local room with computers in every seat plays to the end', async () => {
  const room = createLocal({ game, seats: ['computer', 'computer', 'computer'], options: { rules: { board: 'beginner' }, levels: ['easy', 'medium', 'hard'] }, botDelayMs: 0, rng: mulberry(9) });
  const end = await new Promise((resolve, reject) => {
    room.on('error', reject);
    room.on('change', snap => { if (snap.status === 'finished') resolve(snap); });
    room.start();
  });
  room.close();
  assert.ok(end.pub.winner >= 0);
  assert.strictEqual(end.pub.phase, 'over');
});
