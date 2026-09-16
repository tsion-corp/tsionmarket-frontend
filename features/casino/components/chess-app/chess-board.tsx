"use client";

import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Color, Dests, Key } from "@lichess-org/chessground/types";
import { useEffect, useRef, type CSSProperties } from "react";
import type {
  Board,
  Move,
  PieceColor,
  PieceType,
  Square,
} from "@/features/casino/lib/chess/engine";
import { DEFAULT_THEME, type BoardTheme } from "@/features/casino/lib/chess/board-theme";

export type ChessPieceSet = "neo" | "cburnett";

interface ChessBoardProps {
  board: Board;
  selected?: Square | null;
  legalTargets?: Square[];
  lastMove?: Move | null;
  checkSquare?: Square | null;
  orientation?: PieceColor;
  turn?: PieceColor;
  playerColor?: PieceColor;
  theme?: BoardTheme;
  pieceSet?: ChessPieceSet;
  onSquareClick?: (r: number, c: number) => void;
  onSquareDrop?: (from: Square, to: Square) => void | Promise<void>;
}

interface CurrentBoardState {
  board: Board;
  fen: string;
  selected: Key | undefined;
  targets: Set<Key>;
  orientation: Color;
  turnColor: Color;
  checkedColor: Color | false;
  lastMove: Key[] | undefined;
  theme: BoardTheme;
  movableColor: Color | "both" | undefined;
  clickEnabled: boolean;
  dropEnabled: boolean;
  onSquareClick: ChessBoardProps["onSquareClick"];
  onSquareDrop: ChessBoardProps["onSquareDrop"];
}

const FILES = "abcdefgh";

function toColor(color: PieceColor): Color {
  return color === "w" ? "white" : "black";
}

function toKey(square: Square): Key {
  return `${FILES[square.c]}${8 - square.r}` as Key;
}

function fromKey(key: Key): Square {
  return {
    r: 8 - Number(key[1]),
    c: FILES.indexOf(key[0]),
  };
}

function pieceFen(type: PieceType, color: PieceColor): string {
  return color === "w" ? type.toUpperCase() : type;
}

function toFen(board: Board): string {
  return board
    .map((row) => {
      let empty = 0;
      let rank = "";
      for (const piece of row) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty > 0) rank += empty;
        empty = 0;
        rank += pieceFen(piece.type, piece.color);
      }
      if (empty > 0) rank += empty;
      return rank;
    })
    .join("/");
}

function destinationMap(selected: Key | undefined, targets: Key[]): Dests {
  return selected ? new Map([[selected, targets]]) : new Map();
}

function keysFromSerial(serial: string): Key[] {
  return serial ? (serial.split(",") as Key[]) : [];
}

function boardBackground(theme: BoardTheme): string | undefined {
  if (theme.id === "brown") return undefined;
  return `conic-gradient(from 90deg, ${theme.dark} 25%, ${theme.light} 0 50%, ${theme.dark} 0 75%, ${theme.light} 0)`;
}

function applyTheme(api: Api, theme: BoardTheme) {
  const board = api.state.dom.elements.board;
  board.style.backgroundColor = theme.light;
  board.style.backgroundImage = boardBackground(theme) ?? "";
  board.style.backgroundSize = theme.id === "brown" ? "cover" : "25% 25%";
}

export function ChessBoard({
  board,
  selected = null,
  legalTargets = [],
  lastMove = null,
  checkSquare = null,
  orientation = "w",
  turn = orientation,
  playerColor,
  theme = DEFAULT_THEME,
  pieceSet = "cburnett",
  onSquareClick,
  onSquareDrop,
}: ChessBoardProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);
  const fen = toFen(board);
  const selectedKey = selected ? toKey(selected) : undefined;
  const targetKeys = legalTargets.map(toKey);
  const targetSerial = targetKeys.join(",");
  const lastMoveKeys = lastMove ? [toKey(lastMove.from), toKey(lastMove.to)] : undefined;
  const lastMoveSerial = lastMoveKeys?.join(",") ?? "";
  const checkedColor = checkSquare ? toColor(board[checkSquare.r][checkSquare.c]?.color ?? turn) : false;
  const clickEnabled = Boolean(onSquareClick);
  const dropEnabled = Boolean(onSquareDrop);
  const movableColor: Color | "both" | undefined = dropEnabled
    ? playerColor
      ? toColor(playerColor)
      : "both"
    : undefined;
  const currentRef = useRef<CurrentBoardState>({
    board,
    fen,
    selected: selectedKey,
    targets: new Set(targetKeys),
    orientation: toColor(orientation),
    turnColor: toColor(turn),
    checkedColor,
    lastMove: lastMoveKeys,
    theme,
    movableColor,
    clickEnabled,
    dropEnabled,
    onSquareClick,
    onSquareDrop,
  });

  useEffect(() => {
    currentRef.current = {
      board,
      fen,
      selected: selectedKey,
      targets: new Set(keysFromSerial(targetSerial)),
      orientation: toColor(orientation),
      turnColor: toColor(turn),
      checkedColor,
      lastMove: keysFromSerial(lastMoveSerial),
      theme,
      movableColor,
      clickEnabled,
      dropEnabled,
      onSquareClick,
      onSquareDrop,
    };
  }, [
    board,
    checkedColor,
    clickEnabled,
    dropEnabled,
    fen,
    lastMoveSerial,
    movableColor,
    onSquareClick,
    onSquareDrop,
    orientation,
    selectedKey,
    targetSerial,
    theme,
    turn,
  ]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const current = currentRef.current;
    const api = Chessground(element, {
      fen: current.fen,
      orientation: current.orientation,
      turnColor: current.turnColor,
      check: current.checkedColor,
      lastMove: current.lastMove,
      selected: current.selected,
      coordinates: true,
      coordinatesOnSquares: false,
      disableContextMenu: true,
      blockTouchScroll: true,
      viewOnly: !current.clickEnabled && !current.dropEnabled,
      highlight: { lastMove: true, check: true },
      animation: { enabled: true, duration: 200 },
      draggable: { enabled: current.dropEnabled, showGhost: true },
      selectable: { enabled: current.clickEnabled },
      movable: {
        free: false,
        color: current.movableColor,
        dests: destinationMap(current.selected, [...current.targets]),
        showDests: true,
        rookCastle: true,
        events: {
          after: (origin, destination) => {
            const latest = currentRef.current;
            const from = fromKey(origin);
            const to = fromKey(destination);
            const movingPiece = latest.board[from.r]?.[from.c];
            const promotion = movingPiece?.type === "p" && (to.r === 0 || to.r === 7);
            const result = latest.onSquareDrop?.(from, to);

            // Promotion remains server-authoritative until the dialog supplies a piece.
            if (promotion) apiRef.current?.set({ fen: latest.fen });
            if (result instanceof Promise) {
              void result.catch(() => apiRef.current?.set({ fen: latest.fen }));
            }
          },
        },
      },
      premovable: { enabled: false },
      drawable: { enabled: true, visible: true },
      events: {
        select: (key) => {
          const latest = currentRef.current;
          if (latest.selected && latest.targets.has(key)) return;
          const square = fromKey(key);
          latest.onSquareClick?.(square.r, square.c);
        },
      },
    });

    apiRef.current = api;
    applyTheme(api, current.theme);
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.set({
      fen,
      orientation: toColor(orientation),
      turnColor: toColor(turn),
      check: checkedColor,
      lastMove: keysFromSerial(lastMoveSerial),
    });
    applyTheme(api, theme);
  }, [checkedColor, fen, lastMoveSerial, orientation, theme, turn]);

  useEffect(() => {
    apiRef.current?.set({
      selected: selectedKey,
      viewOnly: !clickEnabled && !dropEnabled,
      draggable: { enabled: dropEnabled, showGhost: true },
      selectable: { enabled: clickEnabled },
      movable: {
        free: false,
        color: movableColor,
        dests: destinationMap(selectedKey, keysFromSerial(targetSerial)),
        showDests: true,
        rookCastle: true,
      },
    });
  }, [clickEnabled, dropEnabled, movableColor, selectedKey, targetSerial]);

  const style = {
    "--cg-light-last": theme.lightLast,
    "--cg-dark-last": theme.darkLast,
    "--cg-light-selected": theme.lightSelected,
    "--cg-dark-selected": theme.darkSelected,
  } as CSSProperties;

  return (
    <div
      ref={elementRef}
      className={`cg-wrap lichess-board aspect-square w-full overflow-visible rounded-[3px] shadow-[0_2px_5px_rgba(0,0,0,0.5)] piece-${pieceSet}`}
      style={style}
    />
  );
}
