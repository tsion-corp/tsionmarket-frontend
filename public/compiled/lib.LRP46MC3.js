import {
  shuffle
} from "./lib.HMFK7OOB.js";
import {
  normalizeMove
} from "./lib.X7H2PLEK.js";
import {
  makeUci,
  opposite,
  parseUci
} from "./lib.53PYQRAK.js";

// ../lib/src/game/chess.ts
var fixCrazySan = (san) => san.startsWith("P") ? san.slice(1) : san;
var destsToUcis = (destMap) => Array.from(destMap).reduce((acc, [orig, dests]) => acc.concat(dests.map((dest) => orig + dest)), []);
var fenColor = (fen) => fen.includes(" w") ? "white" : "black";
var fenToEpd = (fen) => fen.split(" ").slice(0, 4).join(" ");
var plyToTurn = (ply) => Math.floor((ply - 1) / 2) + 1;
var plyColor = (ply) => ply % 2 === 0 ? "white" : "black";
var plyOpponentColor = (ply) => opposite(plyColor(ply));
var pieceCount = (fen) => fen.split(/\s/)[0].split(/[nbrqkp]/i).length - 1;
function fen960() {
  const [dark, light] = [2 * Math.floor(Math.random() * 4), 1 + 2 * Math.floor(Math.random() * 4)];
  const files = shuffle([0, 1, 2, 3, 4, 5, 6, 7].filter((f) => f !== dark && f !== light));
  const [leftRook, king, rightRook] = files.slice(0, 3).sort();
  const [queen, knight1, knight2] = files.slice(3);
  const board = Array(8);
  board[dark] = board[light] = "b";
  board[leftRook] = board[rightRook] = "r";
  board[king] = "k";
  board[queen] = "q";
  board[knight1] = board[knight2] = "n";
  return `${board.join("")}/pppppppp/8/8/8/8/PPPPPPPP/${board.join("").toUpperCase()}`;
}
function normalMove(chess, uci) {
  const bareMove = parseUci(uci);
  const move = bareMove && "from" in bareMove ? { ...bareMove, ...normalizeMove(chess, bareMove) } : void 0;
  return move && chess.isLegal(move) ? { uci: makeUci(move), move } : void 0;
}
function isUci(maybeUci) {
  return !!parseUci(maybeUci != null ? maybeUci : "");
}
function validUci(maybeUci) {
  return isUci(maybeUci) ? maybeUci : void 0;
}

export {
  fixCrazySan,
  destsToUcis,
  fenColor,
  fenToEpd,
  plyToTurn,
  plyColor,
  plyOpponentColor,
  pieceCount,
  fen960,
  normalMove,
  isUci,
  validUci
};
//# sourceMappingURL=lib.LRP46MC3.js.map
