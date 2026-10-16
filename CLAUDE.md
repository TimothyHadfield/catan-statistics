# Catan Statistics Tracker

Tim's tool for the Catan table, used on his iPhone during games (and on a laptop). Two tabs:
- **Dice Tracker**: tap the number rolled (2-12); a Chart.js bar chart compares each number's actual % with the theoretical 2d6 %.
- **Board Builder**: a 19-hex board (add/remove tiles via the dashed "+" ghosts), set resource + number per hex (tap a hex, or the guided **Auto Place** steps), then **Lock & Calculate** to show pip totals on every corner and place settlements / roads / ports for six player colors, with per-player and per-resource pip totals.

No accounts, no backend, no saved data: everything lives in React state and is lost on reload.

- Live: https://timothyhadfield.github.io/catan-statistics/
- Repo: `TimothyHadfield/catan-statistics` (public), branch `main`, deployed by GitHub Pages from the repo root on push.

## Files
- `index.html`: the whole app. React 18 + ReactDOM (UMD production builds), in-browser Babel compiles the `<script type="text/babel">` block, Tailwind Play CDN for styling, Chart.js 4.4.1. All CDN URLs are pinned to exact versions.
- `README.md`: GitHub showcase (screenshots in `docs/screenshots/`).
- No build step, no package.json, no test suite.

## Run locally
`python -m http.server 8109` in the repo root (background), then open http://localhost:8109/.

## How to test
No test framework (don't add one without Tim). Verify with phone-view:
- `node ~/.claude/tools/phone-view.mjs http://localhost:8109/ --out shot.png` (+ `--desktop`).
- Use exact selectors: `--do "click:button:text-is('Auto Place')"`. Plain `text=Auto Place` / `text=Next` hits the help paragraphs instead of the buttons.
- Hexes are `svg > g` elements. In Auto Place mode the ghost tiles are hidden, so `svg > g:nth-child(1) polygon` is hex 0; otherwise the 18 ghosts come first.
- Read chart state with `--eval "Chart.getChart(document.querySelector('canvas')).scales.y.max"`.

## Math (checked 2026-10-16)
- Theoretical %: 2/12 = 2.78, 3/11 = 5.56, 4/10 = 8.33, 5/9 = 11.11, 6/8 = 13.89, 7 = 16.67 (n/36).
- Pips: 2/12 = 1, 3/11 = 2, 4/10 = 3, 5/9 = 4, 6/8 = 5. Corner score = sum of adjacent non-desert hexes' pips.
- Standard board gives 54 corners and 72 edges (corner keys are rounded to 0.1 px so shared corners merge).
- Chart y-axis uses `suggestedMax: 20`, so it stays at 20% normally but grows when an actual % is higher (early in a game).

## Traps
- **Upload Board Photo does not work on the live site**: it calls `api.anthropic.com` from the browser with no API key (code written for a Claude.ai artifact sandbox). It always shows "Failed to analyze". Fixing it needs an API key = money, so it's Tim's call.
- The `Hexagon` component is defined inside the main component, so all hexes remount on each render. Harmless today; don't rely on hex DOM nodes surviving a state change.
- The board SVG is a fixed 600x500 inside a scrollable box; on a phone you scroll sideways inside the box. Tiles added far off-centre can fall outside the SVG.
- Console warnings about Tailwind Play CDN and in-browser Babel are expected (no build step on purpose).

## Standing instructions
- Tim owns looks, wording, layout and game rules; fix only clear defects without asking.
- Sweep 2026-10-16 report: `C:\Users\timha\laptop-ops\coding-and-claude\reports\sweep-2026-10-16\catan-statistics.md`.
