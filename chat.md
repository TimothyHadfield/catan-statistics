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

## 2026-11-24 — Online play / In-person play (manager + 2 builders)
- **Asked (Tim):** tabs "online play and in-person play"; odds numbers on a lever, never covering ports; in-person = one page (board top, Random/Manual, lock hides builder, side resource totals, small exp/actual dice graph, 2–12 boxes); live per-player resource totals online; "weighted" numbers (scarce = worth more); no sums where a settlement can't go; universal back button top-left.
- **Decided:** weight formula clamp(mean/pips, 0.5, 2); Table row shows weights when Weighted is on; weighted corner sums whole numbers; online back only undoes UI + own local moves (online.js has no take-back); in-person game saved in localStorage.
- **Built:** tracker.html rewrite + js/tracker-board.js, js/weights.js, js/undo.js; app.js levers, port token turn, cards box, blocked-corner filter, back button. Merges 8502fbd, then online-tweaks + c3d2289.
- **Verified:** 42/42 `node --test "tests/*.test.*"`; builders' phone-view WebKit 393 px + 1440 px no page/sideways scroll; ui.tracker-save.mjs (save/reload/undo); real online room laptop + headless phone, 12 rolls; my smoke phone-view of merged main: no errors. Live c3d2289.
- **Open:** real iPhone; 320 px for in-person.
- **Later same day (75d0fc4):** Tim: "don't remove the probability tiles when you're supposed to build a road"; "show the totals probability points of each resource in online play, just like for each user"; "Make it very similar to in-person play". Built: odds badges on every open corner whenever Odds is on (look-only during road placement); `dotsHTML` dots table = In-person layout (Weighted switch, icon header, bold Table row, colour dot + towns per player, grey zeros, bold all) + cards column on laptop side (replaced hands box); phone has it in the Dice sheet. 6p feed shows 2 lines so it fits 1280×800. Verified: 42/42 tests; ui-check 4p + 6p all 5 sizes, no page scroll, no errors.

## 2026-11-27 — fit pass (builder, manager brief)
- **Asked (Tim, all games):** "make sure that the user can actually see the full screen and everything" — spacing/sizing only, no restyle.
- **Found (new tests/fit-ui.mjs, crowded 4p + 6p: long names, 20 cards, 5 dev kinds, LR/LA held):** phone/320/sideways dev row scrolled off the side (Monopoly cut, Victory point hidden); LR/LA badges clipped away on phones; with 3 opponents the knights number was cut; 320 px 6p names showed 2 letters. Laptop already fine.
- **Built (style.css v22, CSS only):** dev cards share one row with two-line names (<900 px); "next turn" = tag on the card edge; LR/LA = tag on the opponent's colour bar (<900 px); 320 px tighter seats, colour dot hidden in 5-opponent row.
- **Verified:** fit-ui 4p + 6p all 5 sizes green (failed on old code); 68/68 unit tests; ui-check 4p 5 sizes no scroll/errors.
- **Open:** real iPhone; 320 px board numbers still 8.5–9.5 px (zoom button, unchanged).
