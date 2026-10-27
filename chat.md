# Catan: chat log

## 2026-10-27 — tracker becomes a playable game (builder, manager brief)
- **Asked:** full base Catan vs measured computers, online via `_online` (with the free-tier guard), `_table`/`_fx` look, trading, robber, dev cards, awards, keep the tracker tab, fix or remove the photo button, phone + laptop layouts.
- **Built:** engine/ai/adapter/app (see CLAUDE.md); tracker moved to `tracker.html`; photo button removed; online built but switched off.
- **Measured:** 21 tests; 400 self-play games per table (js/strength.js); `tools/guard.cjs` writes per online game 952 (2 people) / 1,219 (3) / 1,710 (4); ui-check at 393/320/landscape/1280/1440 no scroll, no errors; ui-soak whole games through the page, 0 illegal moves.
- **Reviewer (one read-only pass vs Colonist) fixed:** discard steppers hidden on phone → tap hand cards; any dev card before rolling; win on own turn after points gained on another's turn; stolen card shown to thief/victim; phone feed sheet; end screen breakdown; 2:1 harbour icons; "next turn" on new cards; "said no" on trades.
- **Open (Tim):** turn online on despite cost? 5–6 players? Offer cap of 3 per turn.
