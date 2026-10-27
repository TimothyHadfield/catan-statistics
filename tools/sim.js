// Self-play: computers only, in plain node (no browser).
//   node tools/sim.js [games] [levels...]     e.g. node tools/sim.js 200 hard medium easy
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function play(levels, seed, rules) {
  const st0 = E.newGame(levels.map((l, i) => ({ name: 'P' + i, kind: 'cpu', level: l })), rules || {}, seed);
  let st = st0, moves = 0;
  const rng = mulberry(seed * 7 + 1);
  while (st.phase !== 'over') {
    const seat = E.actors(st)[0];
    const a = AI.choose(st, seat, rng);
    st = E.apply(st, seat, a);
    if (++moves > 20000) throw new Error('stuck at ' + st.phase + ' ' + JSON.stringify(a));
  }
  return { winner: st.winner, turns: st.turns, moves, timeout: st.log.some(e => e.k === 'win' && e.timeout), st };
}

// seats rotate so nobody always goes first; wins counted per level
function table(levels, games, rules) {
  const wins = {}, n = levels.length; let turns = 0, timeouts = 0;
  levels.forEach(l => { wins[l] = 0; });
  for (let g = 0; g < games; g++) {
    const rot = levels.map((_, i) => levels[(i + g) % n]);
    const r = play(rot, 1000 + g, rules);
    wins[rot[r.winner]]++; turns += r.turns; if (r.timeout) timeouts++;
  }
  return { wins, avgTurns: Math.round(turns / games), timeouts };
}

module.exports = { play, table, mulberry };
if (require.main === module) {
  const games = +process.argv[2] || 100;
  const lv = process.argv.slice(3); const levels = lv.length ? lv : ['hard', 'medium', 'easy'];
  const t0 = Date.now();
  console.log(JSON.stringify(table(levels, games)), (Date.now() - t0) + 'ms');
}
