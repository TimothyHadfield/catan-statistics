// Random standard board for the in-person tracker (tracker.html), built from the game's own
// engine (CatanEngine.newGame), so it follows the same rules: 19 tiles, base counts, 18 numbers,
// desert without a number, 6/8 never touching, 9 harbours (4 x 3:1 + one 2:1 of each resource).
// Output is in the tracker's own shape: hexes [{id, resource, number, x, y}] and ports [{vertex, type}].
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.CatanEngine;
  const SIZE = 40, OX = 200, OY = 80, S3 = Math.sqrt(3);
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const red = n => n === 6 || n === 8;

  // same corner maths and key format as tracker.html calculateVerticesAndEdges
  function cornerKey(hex, i) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const vx = Math.round((hex.x + SIZE * Math.cos(a)) * 10) / 10;
    const vy = Math.round((hex.y + SIZE * Math.sin(a)) * 10) / 10;
    return `${vx.toFixed(1)}_${vy.toFixed(1)}`;
  }

  // engine hex h (unit coords, rows 3-4-5-4-3) -> tracker pixel coords (hex 0 at 200,80)
  const toPx = h => ({ x: OX + SIZE * (h.x + S3), y: OY + SIZE * (h.y + 3) });

  function legal(hexes) {
    const byId = hexes.map(h => Number(h.number) || 0);
    return !hexes.some((h, i) => red(byId[i]) && E.hexAdj[i].some(j => red(byId[j])));
  }

  function randomBoard(seed) {
    let s = (seed >>> 0) || 1;
    for (let tries = 0; tries < 50; tries++) {
      const st = E.newGame([{}, {}, {}], { board: 'random' }, s);
      const hexes = E.HEXES.map((h, i) => {
        const r = st.hexRes[i], p = toPx(h);
        return { id: i, resource: r < 0 ? 'desert' : RES[r], number: r < 0 ? '' : String(st.hexNum[i]), x: p.x, y: p.y };
      });
      if (!legal(hexes)) { s = (s * 1103515245 + 12345) >>> 0 || 1; continue; }
      const ports = [];
      st.ports.forEach(pt => {
        const type = pt.type === 'any' ? '3:1' : pt.type;
        const h = E.G.E[pt.e].hexes[0];
        E.G.E[pt.e].v.forEach(v => {
          const i = E.G.hexVerts[h].indexOf(v);
          ports.push({ vertex: cornerKey(hexes[h], i), type });
        });
      });
      return { hexes, ports };
    }
    throw new Error('no legal board');
  }

  const api = { randomBoard, cornerKey, legal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrackerBoard = api;
})(typeof window !== 'undefined' ? window : globalThis);
