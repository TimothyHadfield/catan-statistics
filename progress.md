# Catan: progress

## START HERE
Last updated 2026-10-27. Read this file, then `CLAUDE.md` (file map, tests, traps), then `chat.md`.

## Goal right now
Catan went from a dice tracker to a playable base game vs computer (manager brief 2026-10-27: on par with the other wave games). Online rooms (friend codes) are **ON** since 2026-10-27, Tim's go: "enable it to all games for now and we can disable it later if it becomes too much".

## Status
| Area | State |
|---|---|
| Play vs computer, 3–4 players, random + beginner board | Live 2026-10-27 |
| Rules: setup snake, robber/discards, dev cards (any before roll), longest road / largest army, bank 4:1 / harbours 3:1 2:1, player trades (computers answer fairly), 10 VP | Done, 21 tests |
| Computers (400 self-play games/table) | 3p H/M/E 66/33/1 %; Hard vs 2 Medium 48 % (fair 33); Medium vs 2 Easy 85 %; Hard vs 3 Medium 41 % (fair 25) |
| Look: `_table` wood, `_fx` sounds/animations + settings, original tile art | Done |
| Phone 393 / SE 320 / landscape / 1280 / 1440 | No page scroll; number tokens 13.7 / 9.5 (zoom) / 12 / 28 / 33 px |
| Tracker tab (old app, `tracker.html`) | Kept; photo button **removed** (needed a paid API key) |
| Online rooms (`_online` v2) | **ON** (`ONLINE=true` in app.js). Kit cost harness: ~507 writes / 1,120 reads per game. Two headless phones played a game on real Firestore (`tests/ui.online.mjs`). |
| 5–6 players | Not built |

## Authorized next steps
- 2026-10-27: online on for all games (Tim). Done.

## Standing instructions
- Tim (brief 2026-10-27): "I want to make our boardgames the best in every single metric we can." Online: "talk to me before you're going to set something up that requires anything more than the firebase system we already have set up or takes up a large portion of our free plan."
- Keep the tracker as its own tab (Tim uses it at real tables).

## Traps
- **online.js cache stamp (2026-10-27):** every import of `js/online.js` uses `?v=a3d0418b`, the `_online` content stamp. After a re-copy: put the new stamp from `node ../_online/tools/stamp.mjs` there, bump the importing file's `?v=` (and pwa.js `data-version`), then `node ../_online/tools/stamp.mjs --check .` must say OK.
- See `CLAUDE.md` Traps (online cost, log `n` field, kit copies byte-identical).

## Decisions
- 2026-10-27 photo button removed (not fixed): it needed a paid Anthropic key.
- 2026-10-27 beginner board uses the standard tile/number/harbour layout but no fixed starting towns.
- 2026-10-27 player offers capped at 3 per turn (stops computer offer spam); computers accept only fair-or-better trades and refuse near-winners.
- 2026-10-27 short bank: nobody gets a resource when two players need more than the bank has.
- 2026-10-27 thief and victim see the stolen card; others don't.

## NOT verified
- Real iPhone (Safari engine at 393 only). Sounds not heard by a person.
- Online play on two real iPhones (two headless WebKit phones on real Firestore only, 2026-10-27).
- Pass-the-phone with 2+ people only lightly checked headless.

## Rejected / parked
- ~~Online rooms off by default~~: switched on 2026-10-27 (Tim's go); `ONLINE=false` turns it off again.
- ~~5–6 player extension~~: not cheap (bigger board, special build phase); parked.
