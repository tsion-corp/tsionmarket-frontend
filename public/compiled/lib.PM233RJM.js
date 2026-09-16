// ../../node_modules/.pnpm/chessops@0.15.1/node_modules/chessops/dist/esm/types.js
var FILE_NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];
var RANK_NAMES = ["1", "2", "3", "4", "5", "6", "7", "8"];
var COLORS = ["white", "black"];
var ROLES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
var CASTLING_SIDES = ["a", "h"];
var isDrop = (v) => "role" in v;
var isNormal = (v) => "from" in v;

// ../../node_modules/.pnpm/chessops@0.15.1/node_modules/chessops/dist/esm/util.js
var defined = (v) => v !== void 0;
var opposite = (color) => color === "white" ? "black" : "white";
var squareRank = (square) => square >> 3;
var squareFile = (square) => square & 7;
var squareFromCoords = (file, rank) => 0 <= file && file < 8 && 0 <= rank && rank < 8 ? file + 8 * rank : void 0;
var roleToChar = (role) => {
  switch (role) {
    case "pawn":
      return "p";
    case "knight":
      return "n";
    case "bishop":
      return "b";
    case "rook":
      return "r";
    case "queen":
      return "q";
    case "king":
      return "k";
  }
};
function charToRole(ch) {
  switch (ch.toLowerCase()) {
    case "p":
      return "pawn";
    case "n":
      return "knight";
    case "b":
      return "bishop";
    case "r":
      return "rook";
    case "q":
      return "queen";
    case "k":
      return "king";
    default:
      return;
  }
}
function parseSquare(str) {
  if (str.length !== 2)
    return;
  return squareFromCoords(str.charCodeAt(0) - "a".charCodeAt(0), str.charCodeAt(1) - "1".charCodeAt(0));
}
var makeSquare = (square) => FILE_NAMES[squareFile(square)] + RANK_NAMES[squareRank(square)];
var parseUci = (str) => {
  if (str[1] === "@" && str.length === 4) {
    const role = charToRole(str[0]);
    const to = parseSquare(str.slice(2));
    if (role && defined(to))
      return { role, to };
  } else if (str.length === 4 || str.length === 5) {
    const from = parseSquare(str.slice(0, 2));
    const to = parseSquare(str.slice(2, 4));
    let promotion;
    if (str.length === 5) {
      promotion = charToRole(str[4]);
      if (!promotion)
        return;
    }
    if (defined(from) && defined(to))
      return { from, to, promotion };
  }
  return;
};
var makeUci = (move) => isDrop(move) ? `${roleToChar(move.role).toUpperCase()}@${makeSquare(move.to)}` : makeSquare(move.from) + makeSquare(move.to) + (move.promotion ? roleToChar(move.promotion) : "");
var kingCastlesTo = (color, side) => color === "white" ? side === "a" ? 2 : 6 : side === "a" ? 58 : 62;
var rookCastlesTo = (color, side) => color === "white" ? side === "a" ? 3 : 5 : side === "a" ? 59 : 61;

export {
  FILE_NAMES,
  RANK_NAMES,
  COLORS,
  ROLES,
  CASTLING_SIDES,
  isDrop,
  isNormal,
  defined,
  opposite,
  squareRank,
  squareFile,
  squareFromCoords,
  roleToChar,
  charToRole,
  parseSquare,
  makeSquare,
  parseUci,
  makeUci,
  kingCastlesTo,
  rookCastlesTo
};
//# sourceMappingURL=lib.PM233RJM.js.map
