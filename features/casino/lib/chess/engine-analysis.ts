import { Chess } from "chess.js";

export interface EngineInfo {
  depth: number | null;
  scoreCp: number | null;
  scoreMate: number | null;
  pv: string[];
}

export function parseEngineInfoLine(line: string): EngineInfo | null {
  if (!line.startsWith("info ")) return null;

  const tokens = line.trim().split(/\s+/);
  let depth: number | null = null;
  let scoreCp: number | null = null;
  let scoreMate: number | null = null;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "depth") {
      const value = Number(tokens[i + 1]);
      if (Number.isFinite(value)) depth = value;
      i += 1;
      continue;
    }
    if (token === "score") {
      const kind = tokens[i + 1];
      const raw = Number(tokens[i + 2]);
      if (kind === "cp" && Number.isFinite(raw)) scoreCp = raw;
      if (kind === "mate" && Number.isFinite(raw)) scoreMate = raw;
      i += 2;
      continue;
    }
    if (token === "pv") {
      pv = tokens.slice(i + 1);
      break;
    }
  }

  if (depth === null && scoreCp === null && scoreMate === null && pv.length === 0) return null;

  return { depth, scoreCp, scoreMate, pv };
}

export function parseBestMoveLine(line: string): string | null {
  const match = /^bestmove\s+(\S+)/.exec(line.trim());
  return match?.[1] ?? null;
}

export function formatEngineScore(scoreCp: number | null, scoreMate: number | null): string {
  if (scoreMate !== null) return scoreMate > 0 ? `#${scoreMate}` : `#-${Math.abs(scoreMate)}`;
  if (scoreCp === null) return "—";

  const pawns = scoreCp / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}

function uciParts(
  uci: string
): { from: string; to: string; promotion?: "q" | "r" | "b" | "n" } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;
  const promotion = uci[4]?.toLowerCase();
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion:
      promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n"
        ? promotion
        : undefined,
  };
}

export function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  const move = uciParts(uci);
  if (!move) return null;
  try {
    const chess = new Chess(fen);
    return chess.move(move).san;
  } catch {
    return null;
  }
}

export function pvToSan(fen: string, pv: string[]): string[] {
  try {
    const chess = new Chess(fen);
    const san: string[] = [];
    for (const uci of pv) {
      const move = uciParts(uci);
      if (!move) break;
      san.push(chess.move(move).san);
    }
    return san;
  } catch {
    return [];
  }
}
