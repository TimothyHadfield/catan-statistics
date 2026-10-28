# Catan: chat log

## 2026-10-27 — tracker becomes a playable game (builder, manager brief)
- **Asked:** full base Catan vs measured computers, online via `_online` (with the free-tier guard), `_table`/`_fx` look, trading, robber, dev cards, awards, keep the tracker tab, fix or remove the photo button, phone + laptop layouts.
- **Built:** engine/ai/adapter/app (see CLAUDE.md); tracker moved to `tracker.html`; photo button removed; online built but switched off.
- **Measured:** 21 tests; 400 self-play games per table (js/strength.js); `tools/guard.cjs` writes per online game 952 (2 people) / 1,219 (3) / 1,710 (4); ui-check at 393/320/landscape/1280/1440 no scroll, no errors; ui-soak whole games through the page, 0 illegal moves.
- **Reviewer (one read-only pass vs Colonist) fixed:** discard steppers hidden on phone → tap hand cards; any dev card before rolling; win on own turn after points gained on another's turn; stolen card shown to thief/victim; phone feed sheet; end screen breakdown; 2:1 harbour icons; "next turn" on new cards; "said no" on trades.
- **Open (Tim):** turn online on despite cost? 5–6 players? Offer cap of 3 per turn.

## 2026-10-28 — wave 3: 5–6 players, house rules, Learn videos (builder, manager brief)
- **Asked (Tim):** "Just make the games better" — variants, house rules, YouTube how-to links, iPhone layout. Brief: 5–6 players with extension rules, friendly robber / balanced board / points 8–13 as options, 2–5 verified videos.
- **Built:** per-board geometry (`geo(st)`), 30-tile big board + extra build step, house rules section in Settings, 4 Learn videos in the rules sheet, Green/Brown seats, 6-seat online rooms. Fixed: robbing from a view (tapping a robber tile next to an opponent did nothing).
- **Measured:** 31 tests (10 new, each failed on the old code first); measure.js 300 games/table incl. 5–6p (progress.md); ui-check 4p and 6p at 393/320/landscape/1280/1440 no scroll, no errors; ui-soak 3 six-player + 2 four-player games through the page, 0 illegal moves, 0 errors.
- **Open (Tim):** special build phase vs paired players; balanced/friendly definitions; 5–6p online cost unmeasured.
- **Kit sweep (same day, builder A1):** seat + "Points to win" selects get the dark own-drawn look (appearance none, SVG arrow; WebKit computed `appearance:none`, text #e8eaf0 on #161923); Settings 320 px already had no sideways scroll; 31/31 tests; no coach/pwa kit added (none here).
