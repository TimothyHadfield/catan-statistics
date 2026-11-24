// One history stack for the in-person page's back button: whole-state snapshots, newest last.
(function (root) {
  'use strict';
  const MAX = 200;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // remember `prev` before a change to `next`; nothing is stored when nothing changed
  function record(stack, prev, next, max) {
    if (!prev || same(prev, next)) return stack;
    const out = stack.concat([JSON.parse(JSON.stringify(prev))]);
    const cap = max || MAX;
    return out.length > cap ? out.slice(out.length - cap) : out;
  }

  // -> { stack, state } with state = the snapshot to go back to (null when empty)
  function back(stack) {
    if (!stack.length) return { stack, state: null };
    return { stack: stack.slice(0, -1), state: stack[stack.length - 1] };
  }

  const api = { MAX, record, back, same };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrackerUndo = api;
})(typeof window !== 'undefined' ? window : globalThis);
