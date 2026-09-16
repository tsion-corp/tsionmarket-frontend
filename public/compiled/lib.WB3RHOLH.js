import {
  squareDist
} from "./lib.GD6YSPBF.js";
import {
  charToRole
} from "./lib.53PYQRAK.js";

// ../voice/src/util.ts
var mode = { del: true, sub: 2 };
function findTransforms(h, x, pos = 0, line = [], lines = [], crumbs = /* @__PURE__ */ new Map()) {
  if (h === x) return [line];
  if (pos >= x.length && !mode.del) return [];
  if (crumbs.has(h + pos) && crumbs.get(h + pos) <= line.length) return [];
  crumbs.set(h + pos, line.length);
  return validOps(h, x, pos).flatMap(
    ({ hnext, op }) => findTransforms(
      hnext,
      x,
      pos + (op === "skip" ? 1 : op.to.length),
      op === "skip" ? line : [...line, op],
      lines,
      crumbs
    )
  );
}
function validOps(h, x, pos) {
  var _a;
  const validOps2 = [];
  if (h[pos] === x[pos]) validOps2.push({ hnext: h, op: "skip" });
  const minSlice = !mode.del || validOps2.length > 0 ? 1 : 0;
  let slen = Math.min((_a = mode.sub) != null ? _a : 0, x.length - pos);
  while (slen >= minSlice) {
    const slice = x.slice(pos, pos + slen);
    if (pos < h.length && !(slen > 0 && h.startsWith(slice, pos)))
      validOps2.push({
        hnext: h.slice(0, pos) + slice + h.slice(pos + 1),
        op: { from: h[pos], at: pos, to: slice }
      });
    slen--;
  }
  return validOps2;
}
function movesTo(s, role, board) {
  const deltas = (d, s2 = 0) => d.flatMap((x) => [s2 - x, s2 + x]);
  if (role === "K") return deltas([1, 7, 8, 9], s).filter((o) => o >= 0 && o < 64 && squareDist(s, o) === 1);
  else if (role === "N")
    return deltas([6, 10, 15, 17], s).filter((o) => o >= 0 && o < 64 && squareDist(s, o) <= 2);
  const dests = [];
  for (const delta of deltas(
    role === "Q" ? [1, 7, 8, 9] : role === "R" ? [1, 8] : role === "B" ? [7, 9] : []
  )) {
    for (let square = s + delta; square >= 0 && square < 64 && squareDist(square, square - delta) === 1; square += delta) {
      dests.push(square);
      if (board.pieces[square]) break;
    }
  }
  return dests;
}
function as(v, f) {
  return () => {
    f();
    return v;
  };
}
function spread(v) {
  return v === void 0 ? [] : v instanceof Set ? [...v] : [v];
}
function spreadMap(m) {
  return [...m].map(([k, v]) => [k, spread(v)]);
}
function getSpread(m, key) {
  return spread(m.get(key));
}
function remove(m, key, val) {
  const v = m.get(key);
  if (v === val) m.delete(key);
  else if (v instanceof Set) v.delete(val);
}
function pushMap(m, key, val) {
  const v = m.get(key);
  if (!v) m.set(key, val);
  else {
    if (v instanceof Set) v.add(val);
    else if (v !== val) m.set(key, /* @__PURE__ */ new Set([v, val]));
  }
}
function src(uci) {
  return uci.slice(0, 2);
}
function dest(uci) {
  return uci.slice(2, 4);
}
var promo = (uci) => charToRole(uci.slice(4, 5));
function flash() {
  const div = document.querySelector("#voice-status-row");
  div.classList.add("flash");
  div.onanimationend = () => div.classList.remove("flash");
}

export {
  findTransforms,
  movesTo,
  as,
  spread,
  spreadMap,
  getSpread,
  remove,
  pushMap,
  src,
  dest,
  promo,
  flash
};
//# sourceMappingURL=lib.WB3RHOLH.js.map
