// Online guard estimate: count Firestore writes/reads per online Catan game using the real adapter.
// Model of online.js: each applied move = 1 publish = room update + host/state + changed human hands.
// A non-host human move also = action add + action delete. Heartbeats: 1 write / 25 s per human.
// Reads: each room update is read by every human listener; each hand write by its owner;
// each presence write by every human; host reads each action doc once.
//   node tools/guard.cjs
const W = process.argv[2] || require('path').join(__dirname, '..');
const { game } = require(W + '/js/adapter.js');
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const GAMES = 40, out = [];
for (const humans of [2, 3, 4]) {
  let W_ = 0, R = 0, moves = 0, secs = 0;
  for (let g = 0; g < GAMES; g++) {
    const rng = mulberry(100 + g + humans * 1000), n = 4;
    const isH = i => i < humans; // seat 0 = host
    let s = game.setup(n, { levels: ['medium', 'medium', 'medium', 'medium'] }, rng, []);
    let last = Array.from({ length: n }, (_, i) => JSON.stringify(game.privateView(s, i)));
    let humanMoves = 0;
    while (!game.isOver(s)) {
      const seat = game.toAct(s)[0];
      s = game.apply(s, seat, game.bot({ state: s }, seat, rng)); moves++;
      let w = 2, r = humans; // host/state + room; room read by all humans
      for (let i = 0; i < n; i++) if (isH(i)) { const j = JSON.stringify(game.privateView(s, i)); if (j !== last[i]) { last[i] = j; w++; r++; } }
      if (isH(seat)) { humanMoves++; if (seat !== 0) { w += 2; r += 1; } }
      W_ += w; R += r;
    }
    // humans think ~6 s a move, computers ~1.5 s with the 700 ms bot delay + animation
    const t = humanMoves * 6 + 0; secs += t;
  }
  const perGame = { humans, writes: Math.round(W_ / GAMES), reads: Math.round(R / GAMES), moves: Math.round(moves / GAMES), minutes: +(secs / GAMES / 60).toFixed(1) };
  // heartbeats: one write per human per 25 s, read by every human
  const hb = Math.round(perGame.minutes * 60 / 25) * humans;
  perGame.writes += hb; perGame.reads += hb * humans;
  out.push(perGame);
}
console.log(JSON.stringify(out));
