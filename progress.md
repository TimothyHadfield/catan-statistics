# Catan: progress

## START HERE
Last updated 2026-10-27. Read this file, then `CLAUDE.md` (file map, tests, traps), then `chat.md`.

## Goal right now
Catan went from a dice tracker to a playable base game vs computer (manager brief 2026-10-27: on par with the other wave games). Online rooms are built but switched off pending Tim (cost).

## Status
| Area | State |
|---|---|
| Play vs computer, 3–4 players, random + beginner board | Live 2026-10-27 |
| Rules: setup snake, robber/discards, dev cards (any before roll), longest road / largest army, bank 4:1 / harbours 3:1 2:1, player trades (computers answer fairly), 10 VP | Done, 21 tests |
| Computers (400 self-play games/table) | 3p H/M/E 66/33/1 %; Hard vs 2 Medium 48 % (fair 33); Medium vs 2 Easy 85 %; Hard vs 3 Medium 41 % (fair 25) |
| Look: `_table` wood, `_fx` sounds/animations + settings, original tile art | Done |
| Phone 393 / SE 320 / landscape / 1280 / 1440 | No page scroll; number tokens 13.7 / 9.5 (zoom) / 12 / 28 / 33 px |
| Tracker tab (old app, `tracker.html`) | Kept; photo button **removed** (needed a paid API key) |
| Online rooms (`_online`) | Built + tested locally, **OFF** (`ONLINE=false` in app.js): ~950–1,700 writes/game |
| 5–6 players | Not built |

## Authorized next steps
- None beyond the 2026-10-27 brief. Online needs Tim's go (cost).

## Standing instructions
- Tim (brief 2026-10-27): "I want to make our boardgames the best in every single metric we can." Online: "talk to me before you're going to set something up that requires anything more than the firebase system we already have set up or takes up a large portion of our free plan."
- Keep the tracker as its own tab (Tim uses it at real tables).

## Traps
- See `CLAUDE.md` Traps (online cost, log `n` field, kit copies byte-identical).

## Decisions
- 2026-10-27 photo button removed (not fixed): it needed a paid Anthropic key.
- 2026-10-27 beginner board uses the standard tile/number/harbour layout but no fixed starting towns.
- 2026-10-27 player offers capped at 3 per turn (stops computer offer spam); computers accept only fair-or-better trades and refuse near-winners.
- 2026-10-27 short bank: nobody gets a resource when two players need more than the bank has.
- 2026-10-27 thief and victim see the stolen card; others don't.

## NOT verified
- Real iPhone (Safari engine at 393 only). Sounds not heard by a person.
- Online play between two real devices (only the local `_online` room in node).
- Pass-the-phone with 2+ people only lightly checked headless.

## Rejected / parked
- ~~Online rooms on by default~~: ~950–1,700 Firestore writes per game vs a ~2,000/day busy-day budget; parked for Tim.
- ~~5–6 player extension~~: not cheap (bigger board, special build phase); parked.
