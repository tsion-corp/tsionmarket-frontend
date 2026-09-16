import {
  files,
  ranks
} from "./lib.XAEDCBGD.js";

// ../../../../../node_modules/.pnpm/@lichess-org+chessground@10.1.1/node_modules/@lichess-org/chessground/dist/util.js
var invRanks = [...ranks].reverse();
var allKeys = files.flatMap((f) => ranks.map((r) => f + r));
var pos2key = (pos) => pos.every((x) => x >= 0 && x <= 7) ? allKeys[8 * pos[0] + pos[1]] : void 0;
var pos2keyUnsafe = (pos) => pos2key(pos);
var key2pos = (k) => [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49];
var uciToMove = (uci) => {
  if (!uci)
    return void 0;
  if (uci[1] === "@")
    return [uci.slice(2, 4)];
  return [uci.slice(0, 2), uci.slice(2, 4)];
};
var allPos = allKeys.map(key2pos);
var allPosAndKey = allKeys.map((key, i) => ({ key, pos: allPos[i] }));
function memo(f) {
  let v;
  const ret = () => {
    if (v === void 0)
      v = f();
    return v;
  };
  ret.clear = () => {
    v = void 0;
  };
  return ret;
}
var timer = () => {
  let startAt;
  return {
    start() {
      startAt = performance.now();
    },
    cancel() {
      startAt = void 0;
    },
    stop() {
      if (!startAt)
        return 0;
      const time = performance.now() - startAt;
      startAt = void 0;
      return time;
    }
  };
};
var opposite = (c) => c === "white" ? "black" : "white";
var distanceSq = (pos1, pos2) => (pos1[0] - pos2[0]) ** 2 + (pos1[1] - pos2[1]) ** 2;
var samePiece = (p1, p2) => p1.role === p2.role && p1.color === p2.color;
var samePos = (p1, p2) => p1[0] === p2[0] && p1[1] === p2[1];
var posToTranslate = (bounds) => (pos, asWhite) => [
  (asWhite ? pos[0] : 7 - pos[0]) * bounds.width / 8,
  (asWhite ? 7 - pos[1] : pos[1]) * bounds.height / 8
];
var translate = (el, pos) => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};
var translateAndScale = (el, pos, scale = 1) => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px) scale(${scale})`;
};
var setVisible = (el, v) => {
  el.style.display = v ? "" : "none";
};
var eventPosition = (e) => {
  var _a;
  if (e.clientX || e.clientX === 0)
    return [e.clientX, e.clientY];
  if ((_a = e.targetTouches) == null ? void 0 : _a[0])
    return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return;
};
var isFireMac = memo(() => !("ontouchstart" in window) && ["macintosh", "firefox"].every((x) => navigator.userAgent.toLowerCase().includes(x)));
var isRightButton = (e) => e.button === 2 && !(e.ctrlKey && isFireMac());
var createEl = (tagName, className) => {
  const el = document.createElement(tagName);
  if (className)
    el.className = className;
  return el;
};
function computeSquareCenter(key, asWhite, bounds) {
  const pos = key2pos(key);
  if (!asWhite) {
    pos[0] = 7 - pos[0];
    pos[1] = 7 - pos[1];
  }
  return [
    bounds.left + bounds.width * pos[0] / 8 + bounds.width / 16,
    bounds.top + bounds.height * (7 - pos[1]) / 8 + bounds.height / 16
  ];
}
var diff = (a, b) => Math.abs(a - b);
var knightDir = (x1, y1, x2, y2) => diff(x1, x2) * diff(y1, y2) === 2;
var rookDir = (x1, y1, x2, y2) => x1 === x2 !== (y1 === y2);
var bishopDir = (x1, y1, x2, y2) => diff(x1, x2) === diff(y1, y2) && x1 !== x2;
var queenDir = (x1, y1, x2, y2) => rookDir(x1, y1, x2, y2) || bishopDir(x1, y1, x2, y2);
var kingDirNonCastling = (x1, y1, x2, y2) => Math.max(diff(x1, x2), diff(y1, y2)) === 1;
var pawnDirCapture = (x1, y1, x2, y2, isDirectionUp) => diff(x1, x2) === 1 && y2 === y1 + (isDirectionUp ? 1 : -1);
var pawnDirAdvance = (x1, y1, x2, y2, isDirectionUp) => {
  const step = isDirectionUp ? 1 : -1;
  return x1 === x2 && (y2 === y1 + step || // allow 2 squares from first two ranks, for horde
  y2 === y1 + 2 * step && (isDirectionUp ? y1 <= 1 : y1 >= 6));
};
var squaresBetween = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx && dy && Math.abs(dx) !== Math.abs(dy))
    return [];
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const squares = [];
  let x = x1 + stepX, y = y1 + stepY;
  while (x !== x2 || y !== y2) {
    squares.push([x, y]);
    x += stepX;
    y += stepY;
  }
  return squares.map(pos2key).filter((k) => k !== void 0);
};
var adjacentSquares = (square) => {
  const pos = key2pos(square);
  const adjacentSquares2 = [];
  if (pos[0] > 0)
    adjacentSquares2.push([pos[0] - 1, pos[1]]);
  if (pos[0] < 7)
    adjacentSquares2.push([pos[0] + 1, pos[1]]);
  return adjacentSquares2.map(pos2key).filter((k) => k !== void 0);
};
var squareShiftedVertically = (square, delta) => {
  const pos = key2pos(square);
  pos[1] += delta;
  return pos2key(pos);
};

export {
  invRanks,
  allKeys,
  pos2key,
  pos2keyUnsafe,
  key2pos,
  uciToMove,
  allPos,
  allPosAndKey,
  memo,
  timer,
  opposite,
  distanceSq,
  samePiece,
  samePos,
  posToTranslate,
  translate,
  translateAndScale,
  setVisible,
  eventPosition,
  isRightButton,
  createEl,
  computeSquareCenter,
  diff,
  knightDir,
  rookDir,
  bishopDir,
  queenDir,
  kingDirNonCastling,
  pawnDirCapture,
  pawnDirAdvance,
  squaresBetween,
  adjacentSquares,
  squareShiftedVertically
};
//# sourceMappingURL=lib.RPQH5UYI.js.map
