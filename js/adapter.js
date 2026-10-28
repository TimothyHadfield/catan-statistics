// Catan as the shared online module expects it (js/online.js, copied unchanged from ../_online/).
// Seats 0..n-1 are the players in colour order. The host's browser holds the full state and runs
// the computers; everyone else sees publicView plus their own privateView.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./engine.js') : root.CatanEngine;
  const AI = node ? require('./ai.js') : root.CatanAI;
  const LEVELS = ['easy', 'medium', 'hard'];
  const order = c => 'KVRPM'.indexOf(c);

  const game = {
    id: 'catan', minSeats: 3, maxSeats: 6,
    // options: { rules: { board, vp, friendly, balanced }, levels: ['hard', ...] } (5-6 seats get the big board)
    setup(n, options, rng, seats) {
      const o = options || {}, lv = o.levels || [];
      const S = Array.from({ length: n }, (_, i) => {
        const s = (seats && seats[i]) || {};
        const level = LEVELS.includes(lv[i]) ? lv[i] : 'medium';
        if (s.kind === 'computer') return { name: E.COLORS[i].name, kind: 'cpu', level };
        return { name: String(s.name || E.COLORS[i].name).slice(0, 20), kind: 'human', level };
      });
      return E.newGame(S, o.rules || {}, Math.floor(rng() * 4294967296) || 1);
    },
    toAct(st) { return E.actors(st); },
    apply(st, seat, action) { return E.apply(st, seat, action); },
    publicView(st) { return E.view(st); },
    // only this seat's secrets, sorted so the doc stays the same until the hand really changes
    privateView(st, seat) {
      const P = st.players[seat]; if (!P) return null;
      // the last steal this seat took part in (thief or victim): which card it was
      let steal = null;
      for (let i = st.log.length - 1; i >= 0; i--) { const e = st.log[i]; if (e.k === 'robber' && e.from >= 0 && (e.p === seat || e.from === seat)) { steal = { n: e.n, r: e.r }; break; } }
      return { res: P.res.slice(), dev: P.dev.slice().sort((a, b) => order(a) - order(b)), fresh: P.fresh.slice().sort((a, b) => order(a) - order(b)), vpCards: P.vpCards, steal };
    },
    bot(ctx, seat, rng) { return AI.choose(ctx.state, seat, rng); },
    isOver(st) { return st.phase === 'over'; },
  };

  // the state a player's screen draws: the public table plus their own hand
  function merge(pub, mine, seat) {
    const g = JSON.parse(JSON.stringify(pub));
    if (mine && g.players[seat]) Object.assign(g.players[seat], { res: mine.res.slice(), dev: mine.dev.slice(), fresh: mine.fresh.slice(), vpCards: mine.vpCards });
    if (mine && mine.steal) { const e = g.log.find(x => x.n === mine.steal.n); if (e) e.r = mine.steal.r; }
    return g;
  }

  const api = { game, merge };
  if (node) module.exports = api; else root.CatanGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
