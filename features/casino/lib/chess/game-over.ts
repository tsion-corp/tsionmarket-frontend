import type { ChessColor, ChessMatch, ChessMatchAnalysis } from "../api/types";

export const CHESS_PLAY_ONLINE_ROUTE = "/casino/chess?tab=lobby&setup=hook#game-setup";

export type ChessGameOverOutcome = "win" | "loss" | "draw" | "spectator" | "aborted";

export type ChessGameOverReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "stalemate"
  | "agreement"
  | "repetition"
  | "insufficient"
  | "fifty_move_rule"
  | "timeout_insufficient"
  | "variant_end"
  | "aborted"
  | "unknown";

export type ChessGameOverPresentation = {
  outcome: ChessGameOverOutcome;
  reason: ChessGameOverReason;
  winner: ChessColor | null;
  loser: ChessColor | null;
};

export type ChessGameOverCounters = {
  bestAndGood: number;
  mistakesAndInaccuracies: number;
  blunders: number;
};

type GameOverMatch = Pick<ChessMatch, "id" | "state" | "result" | "resultReason" | "finishedAt">;

function reasonFromWire(value?: string | null): ChessGameOverReason | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.includes("timeout") && normalized.includes("insufficient")) {
    return "timeout_insufficient";
  }
  if (normalized.includes("fifty") || normalized.includes("50")) {
    return "fifty_move_rule";
  }
  if (normalized.includes("checkmate")) return "checkmate";
  if (normalized.includes("resign")) return "resignation";
  if (normalized.includes("timeout") || normalized.includes("time_out")) return "timeout";
  if (normalized.includes("stalemate")) return "stalemate";
  if (normalized.includes("repetition")) return "repetition";
  if (normalized.includes("insufficient")) return "insufficient";
  if (normalized.includes("agreement")) return "agreement";
  if (normalized.includes("variant")) return "variant_end";
  if (normalized.includes("abort") || normalized.includes("cancel")) return "aborted";
  return "unknown";
}

export function chessGameOverReason(match: GameOverMatch): ChessGameOverReason {
  const wireReason = reasonFromWire(match.resultReason);
  if (wireReason && wireReason !== "unknown") return wireReason;

  const result = match.result;
  if (!result) return match.state === "cancelled" ? "aborted" : "unknown";
  if (result.kind === "draw") return result.reason;
  return result.kind;
}

export function chessGameOverPresentation(
  match: GameOverMatch,
  viewer: ChessColor | null
): ChessGameOverPresentation {
  const result = match.result;
  const reason = chessGameOverReason(match);
  if (!result || match.state === "cancelled") {
    return { outcome: "aborted", reason, winner: null, loser: null };
  }
  if (result.kind === "draw") {
    return { outcome: "draw", reason, winner: null, loser: null };
  }

  const winner = result.winner;
  const loser: ChessColor = winner === "w" ? "b" : "w";
  return {
    outcome: viewer ? (viewer === winner ? "win" : "loss") : "spectator",
    reason,
    winner,
    loser,
  };
}

export function chessGameOverEventKey(match: GameOverMatch): string {
  return [
    match.id,
    match.finishedAt ?? "unfinished",
    match.state,
    match.resultReason ?? chessGameOverReason(match),
  ].join(":");
}

export function chessGameOverCounters(
  analysis: ChessMatchAnalysis | null | undefined,
  viewer: ChessColor | null
): ChessGameOverCounters | null {
  if (analysis?.status !== "completed") return null;

  const side = viewer === "b" ? "black" : "white";
  const moves = analysis.moves.filter((move) => move.side === side);
  if (!moves.length) return null;

  return {
    bestAndGood: moves.filter(
      (move) => move.classification === "best" || move.classification === "good"
    ).length,
    mistakesAndInaccuracies: moves.filter(
      (move) => move.classification === "mistake" || move.classification === "inaccuracy"
    ).length,
    blunders: moves.filter((move) => move.classification === "blunder").length,
  };
}
