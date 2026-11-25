# Catan: progress

## START HERE
Last updated 2026-11-24, late (42/42 `node --test "tests/*.test.*"`; ui-check 4p + 6p, 5 sizes, no page scroll, no errors; live 75d0fc4). Versions now style.css v6, app.js v8. Read this file, then `CLAUDE.md` (file map, tests, traps), then `chat.md`.

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
| Tabs renamed **Online play / In-person play** (2026-11-24) | Live c3d2289 |
| **In-person play** (`tracker.html`, one page) | Live 2026-11-24: board on top, Random (legal board, `js/tracker-board.js`) or Manual (builder); lock hides builder, Edit unlocks (with Back). Side summary (Table + per player pips), small exp/actual dice bars, 2–12 boxes at bottom. Weighted switch (`js/weights.js`; Table row shows weights ×N). Blocked corners show a grey dot. ◀ top-left undoes anything (`js/undo.js`, 200 steps, not saved). Game saved in localStorage after every change. Photo button removed earlier |
| **Online play extras** (2026-11-24) | Odds + Weighted switches in the "Place a town"/"Place a road" heading and main-phase road mode (also in Settings); harbour tokens turned square to the coast (0 covered); no odds on blocked corners; ◀ undoes UI choices + own local-game builds/trades until anyone moves, greyed otherwise (online.js has no take-back) |
| **Online odds while building roads** (75d0fc4) | With Odds on, every open corner shows its dots whenever you're not placing a town (look-only `.odds-p`, `pointer-events:none`) |
| **Online dots table** (75d0fc4) | `dotsHTML(c, cards)` in app.js = In-person summary layout: Weighted switch, icon header, bold warm Table row (×weights when Weighted), per player colour dot + towns, grey zeros, bold all; laptop side box `#dotsBox` adds a cards-held column (replaced the hands box); phone: in the Dice sheet between chart and hands. Player dots: city ×2, robber tile 0, × weight when on. Feed shows `8 - n` lines at 5–6p so 6p fits 1280×800 |
| Online rooms (`_online` v2) | **ON** (`ONLINE=true` in app.js). ~507 writes / 1,120 reads per 4p game (kit harness). 5–6p cost not measured. |

## Authorized next steps
- 2026-10-27: online on for all games (Tim). Done.
- 2026-10-28: wave 3 (manager brief): 5–6 players, variants as options, Learn videos. Done.

## Standing instructions
- Tim (brief 2026-10-27): "I want to make our boardgames the best in every single metric we can." Online: "talk to me before you're going to set something up that requires anything more than the firebase system we already have set up or takes up a large portion of our free plan."
- Tim (2026-10-28): "Just make the games better." Base rules stay the default; variants only behind options. Original art and generic names (no "Seafarers"/extension trademarks).
- Keep the tracker as its own tab (Tim uses it at real tables).
- Tim (2026-11-24): "The two sections should be online play and in-person play"; odds numbers "should be a lever ... and they should never cover the little port simbles"; in-person: "combine the dice tracker and the board builder pages ... "random" button ... "manual" ..."; "make the resource totals for each player shown on the side ... live"; "weighted" numbers (scarce resource = more valuable, "you decide" the maths); no vertex sums where a settlement can't be built; "a universal back button in the top left".
- Tim (2026-11-24, later): "for online play, don't remove the probability tiles when you're supposed to build a road, always make them available if the user wants them"; "show the totals probability points of each resource in online play, just like for each user"; "Make it very similar to in-person play. The two designs should be virtually the same, but the in-person you touch the specific things manually."

## Traps
- **online.js cache stamp (2026-10-27):** every import of `js/online.js` uses `?v=a3d0418b`, the `_online` content stamp. After a re-copy: put the new stamp from `node ../_online/tools/stamp.mjs` there, bump the importing file's `?v=` (and pwa.js `data-version`), then `node ../_online/tools/stamp.mjs --check .` must say OK.
- **Geometry is per board:** engine/ai must use `E.geo(st)`, app must call `useGeo()` before drawing. A stray `G.` works on 3–4p and silently breaks 5–6p.
- **Views have hand counts (numbers), not arrays:** `sum()` accepts both. Before 2026-10-28 `victims()` threw on a view, so tapping a robber tile next to an opponent did nothing.
- **Dark selects (2026-10-28 w3-sweep):** the seat and "Points to win" `<select>`s draw their own look (`appearance:none`, theme background, SVG arrow) because iPhone Safari shows a native white box with pale text. Settings at 320 px measured: no sideways scroll. No coach/pwa kit here on purpose.
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
- 2026-11-24 weight per resource = clamp((mean pips per resource)/(its pips), 0.5, 2), 0 pips → 2; weighted corner sums shown as whole numbers in both modes.
- 2026-11-24 (a4a1325) Tim: "make the turns a slower unless you have fast play setting turned on ... make the dice rolls animated and centralized ... make the resources more visibally come straight out of the tile to the player". Normal: median gap per computer move 676→1237 ms, roll 1370→2349 ms; Fast unchanged (~283 ms). Centre dice overlay every roll (both speeds), card flights tile→player box/hand (Normal), ring on new pieces, robber glow + steal flight, reduced-motion = fades. Not verified: online room, real iPhone.
- 2026-11-24 (afb7aa8) Tim: "still make the starting player random" → `rules.first` in engine (snake order from it, first roll too); app + adapter pick it at random.
- 2026-11-24 (fcb0208) Tim: sheep/wheat hard to see on harbour tokens, piers hard to see → harbour icons get a dark outline (CSS `.port svg *`), piers light planks 5.5 wide, token offset 0.66→0.76U, radius 0.42→0.38U.
- 2026-11-24 (f4a2453) Tim: "make the online play and in person play have almost identical styles" + "optimize the layout ... in the computer display so that it maximizes the size of the board while pushing the other things to the side". In-person adopted Online's look (tracker.html loads css/style.css + js/board-art.js, dots table/chart use Online's classes); laptop: board full height, everything else in a right column on both pages. Board height measured Online 413→539 (1280×720), 561→687 (1440×900), 709→835 (1920×1080); In-person ~same on laptop, phone 225→191 (sea frame). Unasked look choices: dark dice pad + soft-red Clear, orange ring on chosen colour, dashed empty edges in Road mode, Edit top-right of side column on laptop. Not verified: 900–1023 px widths (In-person uses phone layout there), real iPhone.
- 2026-11-24 (a35b796) Tim: "a personalized weighted setting ... weights each resource based on how much you specifically need it, and how available it is to you aswell (eliminated verticies don't count) ... stop not counting tiles that have the robber on them". Built: "Mine" switch shown next to Weighted only while Weighted is on (both modes + Settings). `W.personal(own, open, board)`: supply = open dots × (own dots + 3) / NEED (road+town+city+card: wood/brick/sheep 2, wheat/ore 4), w = clamp(mean supply / supply, 0.5, 2); open = corners not taken or next to a town (`W.openDots`); none open → whole board. Perspective: In-person = the selected colour; online = your seat. Robber tile now counts everywhere in online dots/odds. Tests 44/44; headless WebKit 393 + laptop both modes. The NEED basket and +3 are my choices (flag to Tim if he questions the numbers).
- 2026-11-24 online dots table keeps the dark theme (In-person is light) but copies its structure and sizes; online shows dot + town count instead of player names, like In-person.
- 2026-10-28 "of N" shown next to your points when points-to-win isn't 10; phone seats hide dev/knight counts in 5–6p games.

## NOT verified
- Real iPhone (Safari engine at 393 only). Sounds not heard by a person.
- Online play on two real iPhones; a 5–6 seat online room only in the local `_online` test, not on real Firestore. 5–6p Firestore cost per game not measured (more seats = more writes).
- Pass-the-phone with 2+ people only lightly checked headless.
- Whether Tim finds the dark online dots table "virtually the same" as the light In-person one (he may want the light card look).

## Rejected / parked
- ~~Online rooms off by default~~: switched on 2026-10-27 (Tim's go); `ONLINE=false` turns it off again.
- ~~5–6 player extension parked~~: built 2026-10-28 (wave-3 brief asked for it).
