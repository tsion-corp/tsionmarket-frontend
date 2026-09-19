import {
  applyPositionFrame,
  applyStateFrame,
  toChessMatch,
  type ChessMatchWire,
  type ChessPositionFrame,
} from "@/features/casino/lib/api/chess-wire";
import type { ChessMatch } from "@/features/casino/lib/api/types";
import type { GatewayFrame } from "@/features/casino/lib/chess/live-socket";

function frameMatchId(frame: GatewayFrame): string | null {
  if (!frame.data || typeof frame.data !== "object") return null;
  const data = frame.data as { matchId?: unknown; id?: unknown };
  if (typeof data.matchId === "string") return data.matchId;
  return typeof data.id === "string" ? data.id : null;
}

export function applyLiveGamesFrame(
  previous: ChessMatch[] | undefined,
  frame: GatewayFrame
): ChessMatch[] | undefined {
  if (!previous) return previous;
  const matchId = frameMatchId(frame);
  if (!matchId) return previous;

  if (frame.type === "gameOver") {
    return previous.filter((match) => match.id !== matchId);
  }
  if (frame.type === "position") {
    return previous.map((match) =>
      match.id === matchId ? applyPositionFrame(match, frame.data as ChessPositionFrame) : match
    );
  }
  if (frame.type !== "state") return previous;

  const wire = frame.data as ChessMatchWire;
  const index = previous.findIndex((match) => match.id === matchId);
  const next = index >= 0 ? applyStateFrame(previous[index], wire) : toChessMatch(wire);
  if (next.state !== "in_progress") {
    return previous.filter((match) => match.id !== matchId);
  }
  if (index < 0) return [next, ...previous];
  return previous.map((match, matchIndex) => (matchIndex === index ? next : match));
}
