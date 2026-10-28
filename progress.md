# Catan: progress

## START HERE
Last updated 2026-10-28. Read this file, then `CLAUDE.md` (file map, tests, traps), then `chat.md`.

## Goal right now
Catan is a playable base game vs computer, 3–6 players, with online rooms (friend codes, ON since 2026-10-27, Tim's go: "enable it to all games for now and we can disable it later if it becomes too much"). Wave 3 (2026-10-28, Tim: "Just make the games better") added 5–6 players, house-rule options and Learn videos.

## Status
| Area | State |
|---|---|
| Play vs computer, 3–4 players, random + beginner board | Live 2026-10-27 |
| **5–6 players** (30-tile big board, 11 harbours, 34 dev cards, bank 24, extra build step after each turn) | Live 2026-10-28; computers play it; online rooms seat 6 |
| **House rules** in Settings, all off by default: friendly robber, balanced board, points to win 8–13 | Live 2026-10-28; summary line on the new-game panel |
| **Learn videos** in the rules sheet (4 YouTube links, oEmbed-checked 2026-10-28) | Live 2026-10-28 |
| Rules: setup snake, robber/discards, dev cards (any before roll), longest road / largest army, bank 4:1 / harbours 3:1 2:1, player trades (computers answer fairly) | Done, 31 tests |
| Computers (300 self-play games/table, 2026-10-28) | 3p H/M/E 67/32/1 %; Hard vs 2 Medium 45 % (fair 33); Medium vs 2 Easy 83 %; Hard vs 3 Medium 41 % (fair 25); 5p Hard vs 4 Medium 30 % (fair 20); 6p Hard vs 5 Medium 23 % (fair 17); 6p Medium vs 5 Easy 72 % |
| Look: `_table` wood, `_fx` sounds/animations + settings, original tile art | Done |
| Phone 393 / SE 320 / landscape / 1280 / 1440 | No page scroll at 4 and 6 players. Number tokens 4p: 13.7 / 9.5 / 12 / 28 / 33 px; 6p: 12.3 / 8.5 / 10.7 / 26 / 30 px (zoom button for SE) |
| Tracker tab (old app, `tracker.html`) | Kept; photo button **removed** (needed a paid API key) |
| Online rooms (`_online` v2) | **ON** (`ONLINE=true` in app.js). ~507 writes / 1,120 reads per 4p game (kit harness). 5–6p cost not measured. |

## Authorized next steps
- 2026-10-27: online on for all games (Tim). Done.
- 2026-10-28: wave 3 (manager brief): 5–6 players, variants as options, Learn videos. Done.

## Standing instructions
- Tim (brief 2026-10-27): "I want to make our boardgames the best in every single metric we can." Online: "talk to me before you're going to set something up that requires anything more than the firebase system we already have set up or takes up a large portion of our free plan."
- Tim (2026-10-28): "Just make the games better." Base rules stay the default; variants only behind options. Original art and generic names (no "Seafarers"/extension trademarks).
- Keep the tracker as its own tab (Tim uses it at real tables).

## Traps
- **online.js cache stamp (2026-10-27):** every import of `js/online.js` uses `?v=a3d0418b`, the `_online` content stamp. After a re-copy: put the new stamp from `node ../_online/tools/stamp.mjs` there, bump the importing file's `?v=` (and pwa.js `data-version`), then `node ../_online/tools/stamp.mjs --check .` must say OK.
- **Geometry is per board:** engine/ai must use `E.geo(st)`, app must call `useGeo()` before drawing. A stray `G.` works on 3–4p and silently breaks 5–6p.
- **Views have hand counts (numbers), not arrays:** `sum()` accepts both. Before 2026-10-28 `victims()` threw on a view, so tapping a robber tile next to an opponent did nothing.
- PowerShell drops empty-string args (`''`): ui-check takes `all` instead of an empty "only".
- See `CLAUDE.md` Traps (online cost, log `n` field, kit copies byte-identical).

## Decisions
- 2026-10-27 photo button removed (not fixed): it needed a paid Anthropic key.
- 2026-10-27 beginner board uses the standard tile/number/harbour layout but no fixed starting towns.
- 2026-10-27 player offers capped at 3 per turn; computers accept only fair-or-better trades and refuse near-winners.
- 2026-10-27 short bank: nobody gets a resource when two players need more than the bank has.
- 2026-10-27 thief and victim see the stolen card; others don't.
- 2026-10-28 5–6p uses the **special build phase** (not paired players): after each turn every other seat in order may build/buy (no trades, no dev cards); seats that can afford nothing are skipped automatically.
- 2026-10-28 big board is flat-top, 7 columns 3-4-5-6-5-4-3, so it lies wide on a phone; colours 5–6 are Green and Brown.
- 2026-10-28 5–6p: no beginner board (always random); balanced board applies to random boards only.
- 2026-10-28 friendly robber: may not touch a player on 2 public points or fewer; if every tile is blocked, any tile is allowed.
- 2026-10-28 balanced board: same resources never touch, same numbers never touch, 6/8 never touch, no corner over 12 dots.
- 2026-10-28 "of N" shown next to your points when points-to-win isn't 10; phone seats hide dev/knight counts in 5–6p games.

## NOT verified
- Real iPhone (Safari engine at 393 only). Sounds not heard by a person.
- Online play on two real iPhones; a 5–6 seat online room only in the local `_online` test, not on real Firestore. 5–6p Firestore cost per game not measured (more seats = more writes).
- Pass-the-phone with 2+ people only lightly checked headless.

## Rejected / parked
- ~~Online rooms off by default~~: switched on 2026-10-27 (Tim's go); `ONLINE=false` turns it off again.
- ~~5–6 player extension parked~~: built 2026-10-28 (wave-3 brief asked for it).
