import {
  fixCrazySan
} from "./lib.LRP46MC3.js";
import {
  charToRole,
  makeSquare
} from "./lib.53PYQRAK.js";

// ../lib/src/game/sanWriter.ts
function decomposeUci(uci) {
  return [uci.slice(0, 2), uci.slice(2, 4), uci.slice(4, 5)];
}
function square(name) {
  return name.charCodeAt(0) - 97 + (name.charCodeAt(1) - 49) * 8;
}
function squareDist(a, b) {
  const x1 = a & 7, x2 = b & 7;
  const y1 = a >> 3, y2 = b >> 3;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
function isBlack(p) {
  return p === p.toLowerCase();
}
function readFen(fen) {
  const parts = fen.split(" "), board = {
    pieces: {},
    turn: parts[1] === "w"
  };
  parts[0].split("/").slice(0, 8).forEach((row, y) => {
    let x = 0;
    row.split("").forEach((v) => {
      if (v === "~") return;
      const nb = parseInt(v, 10);
      if (nb) x += nb;
      else {
        board.pieces[(7 - y) * 8 + x] = v;
        x++;
      }
    });
  });
  return board;
}
function kingMovesTo(s) {
  return [s - 1, s - 9, s - 8, s - 7, s + 1, s + 9, s + 8, s + 7].filter(function(o) {
    return o >= 0 && o < 64 && squareDist(s, o) === 1;
  });
}
function knightMovesTo(s) {
  return [s + 17, s + 15, s + 10, s + 6, s - 6, s - 10, s - 15, s - 17].filter(function(o) {
    return o >= 0 && o < 64 && squareDist(s, o) <= 2;
  });
}
var ROOK_DELTAS = [8, 1, -8, -1];
var BISHOP_DELTAS = [9, -9, 7, -7];
var QUEEN_DELTAS = [...ROOK_DELTAS, ...BISHOP_DELTAS];
function slidingMovesTo(s, deltas, board) {
  const result = [];
  deltas.forEach(function(delta) {
    for (let square2 = s + delta; square2 >= 0 && square2 < 64 && squareDist(square2, square2 - delta) === 1; square2 += delta) {
      result.push(square2);
      if (board.pieces[square2]) break;
    }
  });
  return result;
}
function almostSanOf(board, uci, legalUcis) {
  if (uci.includes("@")) return fixCrazySan(uci);
  const move = decomposeUci(uci);
  const from = square(move[0]);
  const to = square(move[1]);
  const p = board.pieces[from];
  const d = board.pieces[to];
  const pt = board.pieces[from].toLowerCase();
  if (pt === "p") {
    let san2;
    if (uci.startsWith(uci[2])) san2 = move[1];
    else san2 = uci[0] + "x" + move[1];
    if (move[2]) san2 += "=" + move[2].toUpperCase();
    return san2;
  }
  if (pt === "k" && (d && isBlack(p) === isBlack(d) || squareDist(from, to) > 1)) {
    if (to < from) return "O-O-O";
    else return "O-O";
  }
  let san = pt.toUpperCase();
  let candidates = [];
  if (pt === "k") candidates = kingMovesTo(to);
  else if (pt === "n") candidates = knightMovesTo(to);
  else if (pt === "r") candidates = slidingMovesTo(to, ROOK_DELTAS, board);
  else if (pt === "b") candidates = slidingMovesTo(to, BISHOP_DELTAS, board);
  else if (pt === "q") candidates = slidingMovesTo(to, QUEEN_DELTAS, board);
  let rank = false, file = false;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] === from || board.pieces[candidates[i]] !== p) continue;
    if (legalUcis && !legalUcis.has(makeSquare(candidates[i]) + move[1])) continue;
    if (from >> 3 === candidates[i] >> 3) file = true;
    if ((from & 7) === (candidates[i] & 7)) rank = true;
    else file = true;
  }
  if (file) san += uci[0];
  if (rank) san += uci[1];
  if (d) san += "x";
  san += move[1];
  return san;
}
function sanWriter(fen, ucis) {
  const board = readFen(fen);
  const sans = {};
  const legalUcis = new Set(ucis);
  ucis.forEach(function(uci) {
    const san = almostSanOf(board, uci, legalUcis);
    sans[san] = uci;
    if (san.includes("x")) sans[san.replace("x", "")] = uci;
  });
  return sans;
}
function sanToUci(san, legalSans) {
  if (san in legalSans) return legalSans[san];
  const lowered = san.toLowerCase();
  for (const i in legalSans) if (i.toLowerCase() === lowered) return legalSans[i];
  return void 0;
}
var sanToWords = (san) => san.split("").map((c) => {
  if (c === "x") return i18n.nvui.sanTakes;
  if (c === "+") return i18n.nvui.sanCheck;
  if (c === "#") return i18n.nvui.sanCheckmate;
  if (c === "=") return i18n.nvui.sanPromotesTo;
  if (c === "@") return i18n.nvui.sanDroppedOn;
  const code = c.charCodeAt(0);
  if (code > 48 && code < 58) return c;
  if (code > 96 && code < 105) return c.toUpperCase();
  const role = charToRole(c);
  return role ? transRole(role) : c;
}).join(" ").replace("O - O - O", i18n.nvui.sanLongCastling).replace("O - O", i18n.nvui.sanShortCastling);
var transRole = (role) => i18n.nvui[role] || role;
function speakable(san) {
  return !san ? i18n.nvui.gameStart : sanToWords(san).replace(/^A /, '"A"').replace(/(\d) E (\d)/, "$1,E $2").replace(/C /, "c ").replace(/F /, "f ").replace(/(\d) H (\d)/, "$1H$2").replace(/(\d) H (\d)/, "$1H$2");
}

export {
  square,
  squareDist,
  readFen,
  almostSanOf,
  sanWriter,
  sanToUci,
  sanToWords,
  transRole,
  speakable
};
//# sourceMappingURL=lib.GD6YSPBF.js.map
