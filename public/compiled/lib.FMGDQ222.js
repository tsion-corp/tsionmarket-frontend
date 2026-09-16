import {
  SquareSet
} from "./lib.X7H2PLEK.js";
import {
  FILE_NAMES
} from "./lib.53PYQRAK.js";

// ../editor/src/chess960.ts
var darkSquares = [0, 2, 4, 6];
var lightSquares = [1, 3, 5, 7];
var KRN = [
  ["N", "N", "R", "K", "R"],
  ["N", "R", "N", "K", "R"],
  ["N", "R", "K", "N", "R"],
  ["N", "R", "K", "R", "N"],
  ["R", "N", "N", "K", "R"],
  ["R", "N", "K", "N", "R"],
  ["R", "N", "K", "R", "N"],
  ["R", "K", "N", "N", "R"],
  ["R", "K", "N", "R", "N"],
  ["R", "K", "R", "N", "N"]
];
function chess960IdToFEN(id) {
  const rank1 = chess960IdToRank(id);
  return `${rank1.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${rank1} w KQkq - 0 1`;
}
function chess960CastlingSquares(id) {
  const rank1 = chess960IdToRank(id != null ? id : 518);
  const kingFile = rank1.indexOf("K");
  const rookKFile = rank1.lastIndexOf("R");
  const rookQFile = rank1.indexOf("R");
  return {
    white: {
      king: FILE_NAMES[kingFile] + "1",
      rookK: FILE_NAMES[rookKFile] + "1",
      rookQ: FILE_NAMES[rookQFile] + "1"
    },
    black: {
      king: FILE_NAMES[kingFile] + "8",
      rookK: FILE_NAMES[rookKFile] + "8",
      rookQ: FILE_NAMES[rookQFile] + "8"
    }
  };
}
function castlingRooksFromBoard(board, color) {
  const backRank = SquareSet.fromRank(color === "white" ? 0 : 7), king = board.king.intersect(board[color]).intersect(backRank).singleSquare();
  if (king === void 0) return {};
  const rooks = board.rook.intersect(board[color]).intersect(backRank), queenside = rooks.first(), kingside = rooks.last();
  return {
    rookQ: queenside !== void 0 && queenside < king ? queenside : void 0,
    rookK: kingside !== void 0 && kingside > king ? kingside : void 0
  };
}
var randomPositionId = () => Math.floor(Math.random() * 960);
var isValidPositionId = (id) => Number.isInteger(id) && id >= 0 && id <= 959;
function boardFenToChess960Id(boardFen) {
  if (boardFen.includes(" ")) throw new Error("`boardFen` should only be the piece placement portion");
  const ranks = boardFen.split("/");
  if (ranks.length !== 8) return void 0;
  const rank = ranks[7];
  if (rank.toLowerCase() !== ranks[0] || rank.length !== 8 || rank !== rank.toUpperCase()) return void 0;
  const king = rank.indexOf("K");
  const queen = rank.indexOf("Q");
  const rook1 = rank.indexOf("R");
  const rook2 = rank.lastIndexOf("R");
  const bishop1 = rank.indexOf("B");
  const bishop2 = rank.lastIndexOf("B");
  const knight1 = rank.indexOf("N");
  const knight2 = rank.lastIndexOf("N");
  if ([king, queen, rook1, rook2, bishop1, bishop2, knight1, knight2].includes(-1)) {
    return void 0;
  }
  const lightBishopFile = bishop1 % 2 === 1 ? bishop1 : bishop2;
  const darkBishopFile = bishop1 % 2 === 0 ? bishop1 : bishop2;
  const lightBishopIndex = lightSquares.indexOf(lightBishopFile);
  const darkBishopIndex = darkSquares.indexOf(darkBishopFile);
  if (lightBishopIndex === -1 || darkBishopIndex === -1) return void 0;
  const freeSquaresAfterBishops = [...Array(8).keys()].filter(
    (i) => ![lightBishopFile, darkBishopFile].includes(i)
  );
  const queenFile = queen;
  const queenIndex = freeSquaresAfterBishops.indexOf(queenFile);
  if (queenIndex === -1 || queenIndex >= 6) return void 0;
  const remainingPieces = [...Array(8).keys()].filter((i) => ![lightBishopFile, darkBishopFile, queenFile].includes(i)).map((file) => rank[file]);
  const krnIndex = KRN.findIndex((arr) => arr.every((p, i) => p === remainingPieces[i]));
  return krnIndex === -1 ? void 0 : lightBishopIndex + 4 * darkBishopIndex + 16 * queenIndex + 96 * krnIndex;
}
function fenToChess960Id(fen) {
  const parts = fen.split(" ");
  return parts.length < 1 ? void 0 : boardFenToChess960Id(parts[0]);
}
function chess960IdToRank(id) {
  if (!isValidPositionId(id)) {
    throw new Error("Chess960 id must be between 0 and 959");
  }
  const backRank = Array(8).fill("");
  const place = (piece, file) => {
    backRank[file] = piece;
  };
  let n = id;
  const b1 = lightSquares[n % 4];
  n = Math.floor(n / 4);
  place("B", b1);
  const b2 = darkSquares[n % 4];
  n = Math.floor(n / 4);
  place("B", b2);
  const freeSquares = () => [...Array(8).keys()].filter((i) => backRank[i] === "");
  const q = freeSquares()[n % 6];
  n = Math.floor(n / 6);
  place("Q", q);
  const remaining = freeSquares();
  for (let i = 0; i < 5; i++) {
    place(KRN[n][i], remaining[i]);
  }
  return backRank.join("");
}

export {
  chess960IdToFEN,
  chess960CastlingSquares,
  castlingRooksFromBoard,
  randomPositionId,
  isValidPositionId,
  boardFenToChess960Id,
  fenToChess960Id
};
//# sourceMappingURL=lib.FMGDQ222.js.map
