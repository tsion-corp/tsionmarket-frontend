"use client";

import { useCallback, useMemo, useState } from "react";
import { DraughtsBoardView } from "@/features/casino/components/draughts/draughts-board";
import {
  applyMove,
  completedMove,
  legalMoves,
  movableFields,
  nextTargets,
  parseFen,
  type DraughtsMove,
  type DraughtsSide,
  type DraughtsVariant,
} from "@/features/casino/lib/draughts/engine";

const EMPTY_PATH: readonly number[] = [];

export function DraughtsTrainingBoard({
  fen,
  variant,
  orientation,
  enabled = true,
  lastMove = [],
  hintPath = [],
  onMove,
}: {
  fen: string;
  variant: DraughtsVariant;
  orientation: DraughtsSide;
  enabled?: boolean;
  lastMove?: readonly number[];
  hintPath?: readonly number[];
  onMove: (move: DraughtsMove) => void | Promise<void>;
}) {
  const position = useMemo(() => parseFen(fen, variant), [fen, variant]);
  const moves = useMemo(() => (enabled ? legalMoves(position) : []), [enabled, position]);
  const positionKey = `${variant}:${fen}`;
  const [selection, setSelection] = useState<{ positionKey: string; path: number[] }>({
    positionKey,
    path: [],
  });
  const path = useMemo(
    () => (selection.positionKey === positionKey ? selection.path : EMPTY_PATH),
    [positionKey, selection]
  );
  const setPath = useCallback(
    (next: number[]) => setSelection({ positionKey, path: next }),
    [positionKey]
  );

  const preview = useMemo(() => {
    if (path.length < 2) return null;
    const move = completedMove(moves, path);
    return move ? applyMove(position, move) : null;
  }, [moves, path, position]);

  const targets = useMemo(() => nextTargets(moves, path), [moves, path]);
  const movable = useMemo(() => movableFields(moves), [moves]);
  const doomed = useMemo(() => {
    if (path.length < 2) return [];
    const continuation = moves.find(
      (move) =>
        path.every((field, index) => move.path[index] === field) && move.path.length >= path.length
    );
    return continuation?.captured.slice(0, path.length - 1) ?? [];
  }, [moves, path]);

  const click = useCallback(
    (field: number) => {
      if (!enabled) return;
      const piece = position.board[field];
      if (piece?.side === position.turn) {
        setPath(movable.includes(field) ? [field] : []);
        return;
      }
      if (!path.length || !targets.includes(field)) {
        setPath([]);
        return;
      }
      const next = [...path, field];
      const complete = completedMove(moves, next);
      if (complete && nextTargets(moves, next).length === 0) {
        setPath([]);
        void onMove(complete);
      } else {
        setPath(next);
      }
    },
    [enabled, movable, moves, onMove, path, position.board, position.turn, setPath, targets]
  );

  return (
    <DraughtsBoardView
      board={preview?.board ?? position.board}
      variant={variant}
      orientation={orientation}
      path={path}
      targets={targets}
      lastMove={hintPath.length ? hintPath : lastMove}
      doomed={doomed}
      onFieldClick={enabled ? click : undefined}
    />
  );
}
