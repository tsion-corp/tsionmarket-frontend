"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialBoard,
  applyMove,
  legalMovesForPiece,
  gameStatus,
  pickBotMove,
  squareName,
  type Board,
  type GameStatus,
  type Move,
  type PieceColor,
  type PieceType,
  type Square,
} from "@/lib/casino/chess/engine";

export interface ChessMatchConfig {
  // Seconds on each clock at the start.
  baseSeconds: number;
  // Seconds added to a player's clock after each of their moves.
  increment: number;
}

interface MatchState {
  board: Board;
  turn: PieceColor;
  selected: Square | null;
  legalTargets: Square[];
  status: GameStatus;
  clocks: Record<PieceColor, number>;
  lastMove: Move | null;
  moveList: string[];
  captured: Record<PieceColor, PieceType[]>;
  resigned: boolean;
  flagged: PieceColor | null;
}

function freshMatch(baseSeconds: number): MatchState {
  return {
    board: initialBoard(),
    turn: "w",
    selected: null,
    legalTargets: [],
    status: "ongoing",
    clocks: { w: baseSeconds, b: baseSeconds },
    lastMove: null,
    moveList: [],
    captured: { w: [], b: [] },
    resigned: false,
    flagged: null,
  };
}

function isLive(s: MatchState): boolean {
  return !s.resigned && !s.flagged && (s.status === "ongoing" || s.status === "check");
}

// Simple algebraic notation for the move list: piece letter, x on capture,
// destination square. Enough to read a game back, not full SAN.
function notate(board: Board, from: Square, to: Square): string {
  const piece = board[from.r][from.c];
  const target = board[to.r][to.c];
  const letter = piece && piece.type !== "p" ? piece.type.toUpperCase() : "";
  return letter + (target ? "x" : "") + squareName(to.r, to.c);
}

// Applies one move to a match state: board, notation, captures, clocks with
// increment for the mover, and the status the opponent now faces.
function stepMatch(s: MatchState, from: Square, to: Square, increment: number): MatchState {
  const mover = s.turn;
  const target = s.board[to.r][to.c];
  const captured = target
    ? { ...s.captured, [mover]: [...s.captured[mover], target.type] }
    : s.captured;
  const board = applyMove(s.board, from, to);
  const next = mover === "w" ? "b" : "w";
  return {
    ...s,
    board,
    turn: next,
    selected: null,
    legalTargets: [],
    status: gameStatus(board, next),
    clocks: { ...s.clocks, [mover]: s.clocks[mover] + increment },
    lastMove: { from, to },
    moveList: [...s.moveList, notate(s.board, from, to)],
    captured,
  };
}

// A staked match against a local bot: the player is white, the bot answers as
// black after a short thinking delay. Owns the board, both clocks, capture
// lists, and the terminal states (mate, stalemate, resignation, flag fall).
export function useChessMatch({ baseSeconds, increment }: ChessMatchConfig) {
  const [state, setState] = useState<MatchState>(() => freshMatch(baseSeconds));
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One ticking interval drains whichever clock is to move while the game is
  // live, and flags the side that hits zero.
  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => {
        if (!isLive(s)) return s;
        const next = Math.max(0, s.clocks[s.turn] - 1);
        return {
          ...s,
          clocks: { ...s.clocks, [s.turn]: next },
          flagged: next === 0 ? s.turn : s.flagged,
        };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // The bot replies whenever it is black's turn in a live game.
  useEffect(() => {
    if (state.turn !== "b" || !isLive(state)) return;
    botTimer.current = setTimeout(
      () => {
        setState((s) => {
          if (s.turn !== "b" || !isLive(s)) return s;
          const move = pickBotMove(s.board, "b");
          if (!move) return s;
          return stepMatch(s, move.from, move.to, increment);
        });
      },
      500 + Math.random() * 900
    );
    return () => {
      if (botTimer.current) clearTimeout(botTimer.current);
    };
  }, [state, increment]);

  const clickSquare = useCallback(
    (r: number, c: number) => {
      setState((s) => {
        if (s.turn !== "w" || !isLive(s)) return s;
        if (s.selected && s.legalTargets.some((t) => t.r === r && t.c === c)) {
          return stepMatch(s, s.selected, { r, c }, increment);
        }
        const piece = s.board[r][c];
        if (piece && piece.color === "w") {
          return { ...s, selected: { r, c }, legalTargets: legalMovesForPiece(s.board, r, c) };
        }
        return { ...s, selected: null, legalTargets: [] };
      });
    },
    [increment]
  );

  const resign = useCallback(() => {
    setState((s) => (isLive(s) ? { ...s, resigned: true } : s));
  }, []);

  const reset = useCallback(() => {
    setState(freshMatch(baseSeconds));
  }, [baseSeconds]);

  const live = isLive(state);
  const youWon = state.flagged === "b" || (state.status === "checkmate" && state.turn === "b");
  const youLost =
    state.resigned || state.flagged === "w" || (state.status === "checkmate" && state.turn === "w");
  const drawn = state.status === "stalemate";

  return { ...state, live, youWon, youLost, drawn, clickSquare, resign, reset };
}
