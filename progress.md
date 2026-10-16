# Catan Statistics Tracker: progress

## START HERE
Last updated 2026-10-16. Read this file, then `CLAUDE.md` (file map, how to test, math, traps). There is no `chat.md` yet.

## Goal right now
No active goal. The app is finished and live; only fixes when Tim asks.

## Status
| Area | State |
|---|---|
| Dice Tracker + chart | Working (live) |
| Board Builder, Auto Place, Lock & Calculate, settlements/roads/ports, stats | Working (live) |
| Upload Board Photo | Broken on the live site: calls the Anthropic API with no key. Needs Tim's decision |
| Tests | None (single HTML file); verified with phone-view |

## Authorized next steps
None.

## Standing instructions
- Tim's global rules apply (`~/.claude/CLAUDE.md`). No project-specific quotes from Tim recorded yet.

## Traps
- See `CLAUDE.md` Traps (photo upload has no API key; exact `button:text-is(...)` selectors needed in phone-view).

## Decisions
- 2026-10-16 sweep: chart y-axis grows past 20% when actual rolls exceed it (was clipped); dice buttons 10/11/12 no longer cut off at iPhone width (smaller digits below 640px); duplicate "+" ghost tiles removed; CDN libraries pinned to exact versions, React production builds; aria-labels on color buttons and dropdowns; meta description; blank favicon.

## NOT verified
- Real iPhone (only Safari-engine simulation at 393px).
- Road taps on a phone: road lines are 1px wide, likely hard to hit with a finger (not changed, reported to Tim).

## Rejected / parked
- (none yet)
