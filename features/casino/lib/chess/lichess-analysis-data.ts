import { applyUciToFen } from "./engine";
import { identifyOpeningAtPly } from "./openings";

type LichessColor = "white" | "black";

type ReplayPlayer = {
  id: string;
  username: string;
  walletAddress: string;
};

type ReplayRatingSide = {
  rating: number | null;
  provisional: boolean | null;
  diff: number | null;
};

type ReplayMatch = {
  id: string;
  state: string;
  variant: string;
  initialFen: string;
  fen: string;
  timeControl: string;
  clockMode: string;
  turn: "w" | "b";
  clocks: { w: number; b: number };
  result: { kind: string; winner?: "w" | "b"; reason?: string } | null;
  rating?: {
    rated: boolean;
    perfKey: string | null;
    white: ReplayRatingSide;
    black: ReplayRatingSide;
  };
  white: ReplayPlayer | null;
  black: ReplayPlayer | null;
  computer?: {
    player: string;
    name: string;
    side: LichessColor;
    level: number;
  } | null;
};

type ReplayMove = {
  ply: number;
  uci: string;
  san: string;
  fenAfter: string;
  clockMsRemaining: number | null;
  createdAt?: string;
};

type ReplayAnalysisMove = {
  ply: number;
  side: LichessColor;
  classification: "best" | "good" | "inaccuracy" | "mistake" | "blunder";
  fen: string;
  playedUci: string;
  playedSan: string;
  bestUci: string | null;
  bestSan: string | null;
  pv: string | null;
  cpBefore: number | null;
  cpAfter: number | null;
  mateBefore: number | null;
  mateAfter: number | null;
  coachComment: string;
  phase?: "opening" | "middlegame" | "endgame";
  accuracyPercent?: number | null;
};

type ReplaySummary = {
  side: LichessColor;
  accuracyPercent: number | null;
  averageCentipawnLoss: number | null;
  bestMoves: number;
  goodMoves: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
};

type ReplayAnalysis = {
  matchId: string;
  depth: number;
  engineName: string | null;
  summaries: ReplaySummary[];
  moves: ReplayAnalysisMove[];
};

export type LichessTreePart = {
  ply: number;
  fen: string;
  uci?: string;
  san?: string;
  clock?: number;
  comp?: boolean;
  eval?: Record<string, unknown>;
  glyphs?: Array<{ id: number; name: string; symbol: string }>;
  comments?: Array<{ id: string; by: string; text: string }>;
  children?: LichessTreePart[];
};

const glyphs = {
  inaccuracy: { id: 6, name: "Inaccuracy", symbol: "?!" },
  mistake: { id: 2, name: "Mistake", symbol: "?" },
  blunder: { id: 4, name: "Blunder", symbol: "??" },
} as const;

const SAN_TOKEN = String.raw`(?:O-O-O|O-O|[KQRBN]?[a-h1-8]{0,2}x?[a-h][1-8](?:=[QRBN])?[+#]?)`;
const SAN_PATTERN = new RegExp(`^${SAN_TOKEN}$`);
const SAN_IN_TEXT_PATTERN = new RegExp(`\\b(${SAN_TOKEN})`, "g");
const CONSIDER_SAN_PATTERN = new RegExp(`\\bConsider\\s+(${SAN_TOKEN})`, "g");

const PIECE_NAMES: Record<string, string> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
};

type DescribedSan = {
  piece: string;
  destination: string;
  capture: boolean;
  promotion: string | null;
  suffix: string;
};

function parseSan(san: string): DescribedSan | null {
  const normalized = san.trim().replaceAll("0", "O");
  if (!SAN_PATTERN.test(normalized) || normalized.startsWith("O-O")) return null;
  const match = /^([KQRBN])?([a-h1-8]{0,2})(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/.exec(normalized);
  if (!match) return null;
  return {
    piece: PIECE_NAMES[match[1] ?? ""] ?? "pawn",
    destination: match[4],
    capture: !!match[3],
    promotion: match[5] ? PIECE_NAMES[match[5]] : null,
    suffix: match[6] === "#" ? ", checkmate" : match[6] === "+" ? ", check" : "",
  };
}

export function describeChessMove(san: string, capitalize = false): string {
  const normalized = san.trim().replaceAll("0", "O");
  let description: string;
  if (/^O-O-O[+#]?$/.test(normalized)) description = "castle queenside";
  else if (/^O-O[+#]?$/.test(normalized)) description = "castle kingside";
  else {
    const move = parseSan(normalized);
    if (!move) return san;
    description = move.capture
      ? `${move.piece} captures on ${move.destination}`
      : `${move.piece} to ${move.destination}`;
    if (move.promotion) description += ` and promotes to ${move.promotion}`;
    description += move.suffix;
  }
  return capitalize ? description[0].toUpperCase() + description.slice(1) : description;
}

function describeChessAction(san: string): string {
  const normalized = san.trim().replaceAll("0", "O");
  if (/^O-O-O[+#]?$/.test(normalized)) return "castling queenside";
  if (/^O-O[+#]?$/.test(normalized)) return "castling kingside";
  const move = parseSan(normalized);
  if (!move) return san;
  const action = move.capture
    ? `capturing on ${move.destination} with the ${move.piece}`
    : `moving the ${move.piece} to ${move.destination}`;
  return `${action}${move.promotion ? ` and promoting to a ${move.promotion}` : ""}${move.suffix}`;
}

export function explainCoachComment(comment: string): string {
  const actions: string[] = [];
  const withActions = comment.replace(CONSIDER_SAN_PATTERN, (_match, san: string) => {
    const index = actions.push(`Consider ${describeChessAction(san)}`) - 1;
    return `__ARK_CHESS_ACTION_${index}__`;
  });
  return withActions
    .replace(SAN_IN_TEXT_PATTERN, (san: string) => describeChessMove(san))
    .replace(
      /__ARK_CHESS_ACTION_(\d+)__/g,
      (_match, index: string) => actions[Number(index)] ?? ""
    );
}

function color(value: "w" | "b"): LichessColor {
  return value === "w" ? "white" : "black";
}

function status(match: ReplayMatch) {
  if (match.state !== "settled") return { id: 20, name: "started" };
  if (!match.result) return { id: 38, name: "unknownFinish" };
  if (match.result.kind === "checkmate") return { id: 30, name: "mate" };
  if (match.result.kind === "resignation") return { id: 31, name: "resign" };
  if (match.result.kind === "timeout") return { id: 35, name: "outoftime" };
  if (match.result.kind === "draw") {
    return match.result.reason === "stalemate"
      ? { id: 32, name: "stalemate" }
      : { id: 34, name: "draw" };
  }
  return { id: 38, name: "unknownFinish" };
}

function speed(timeControl: string): string {
  const [minutesText = "10", incrementText = "0"] = timeControl.split("+");
  const estimate = Number(minutesText) * 60 + Number(incrementText) * 40;
  if (estimate <= 29) return "ultraBullet";
  if (estimate <= 179) return "bullet";
  if (estimate <= 479) return "blitz";
  if (estimate <= 1499) return "rapid";
  return "classical";
}

function player(
  seat: ReplayPlayer | null,
  side: LichessColor,
  rating: ReplayRatingSide | undefined,
  version: number,
  computer?: ReplayMatch["computer"]
) {
  const bot = computer?.side === side ? computer : null;
  const id = bot?.player ?? seat?.id ?? `${side}-anonymous`;
  const name = bot?.name ?? seat?.username?.trim() ?? "Anonymous";
  return {
    id,
    name,
    color: side,
    onGame: false,
    isGone: false,
    ai: bot?.level,
    rating: bot ? undefined : (rating?.rating ?? undefined),
    provisional: bot ? false : (rating?.provisional ?? false),
    ratingDiff: bot ? undefined : (rating?.diff ?? undefined),
    version,
    user: bot ? undefined : { id, username: name, online: false, perfs: {} },
  };
}

function serverEval(
  fen: string,
  depth: number,
  cp: number | null,
  mate: number | null,
  best: string | null,
  variation: string | null
): Record<string, unknown> | undefined {
  if (cp === null && mate === null) return undefined;
  const score = mate === null ? { cp } : { mate };
  return {
    ...score,
    fen,
    depth,
    knodes: 1000,
    best: best ?? undefined,
    pvs: variation ? [{ ...score, moves: variation }] : [],
  };
}

function phaseAccuracy(
  moves: ReplayAnalysisMove[],
  side: LichessColor
): Partial<Record<"opening" | "middlegame" | "endgame", number>> | undefined {
  const phases = ["opening", "middlegame", "endgame"] as const;
  const result = Object.fromEntries(
    phases.flatMap((phase) => {
      const values = moves
        .filter((move) => move.side === side && move.phase === phase)
        .map((move) => move.accuracyPercent)
        .filter((value): value is number => value !== null && value !== undefined);
      return values.length
        ? [[phase, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)]]
        : [];
    })
  );
  return Object.keys(result).length ? result : undefined;
}

function summary(
  value: ReplaySummary | undefined,
  moves: ReplayAnalysisMove[],
  side: LichessColor
) {
  return {
    acpl: Math.round(value?.averageCentipawnLoss ?? 0),
    accuracy: Math.round(value?.accuracyPercent ?? 0),
    inaccuracy: value?.inaccuracies ?? 0,
    mistake: value?.mistakes ?? 0,
    blunder: value?.blunders ?? 0,
    phases: phaseAccuracy(moves, side),
  };
}

function annotateNode(node: LichessTreePart, move: ReplayAnalysisMove): void {
  if (move.classification === "best" || move.classification === "good") return;
  const glyph = glyphs[move.classification];
  node.glyphs = [glyph];
  node.comments = [
    {
      id: `analysis-${move.ply}`,
      by: "lichess",
      text:
        explainCoachComment(move.coachComment) ||
        `${glyph.name}.${move.bestSan ? ` ${describeChessMove(move.bestSan, true)} was best.` : " Review this move."}`,
    },
  ];
}

function addComputerLine(
  parent: LichessTreePart,
  move: ReplayAnalysisMove,
  depth: number,
  variant: string
): void {
  if (!move.bestUci || move.bestUci === move.playedUci) return;
  const next = applyUciToFen(parent.fen, move.bestUci, variant as "standard");
  if (!next) return;
  parent.children = [
    {
      ply: move.ply,
      fen: next.fen,
      uci: move.bestUci,
      san: move.bestSan ?? move.bestUci,
      comp: true,
      eval: serverEval(next.fen, depth, move.cpBefore, move.mateBefore, move.bestUci, move.pv),
    },
  ];
}

export function buildLichessAnalysisData({
  match,
  moves,
  analysis,
  orientation,
}: {
  match: ReplayMatch;
  moves: ReplayMove[];
  analysis: ReplayAnalysis | null;
  orientation: LichessColor;
}) {
  const byPly = new Map((analysis?.moves ?? []).map((move) => [move.ply, move]));
  const firstAnalysis = analysis?.moves[0];
  const root: LichessTreePart = {
    ply: 0,
    fen: match.initialFen,
    eval: serverEval(
      match.initialFen,
      analysis?.depth ?? 18,
      firstAnalysis?.cpBefore ?? null,
      firstAnalysis?.mateBefore ?? null,
      firstAnalysis?.bestUci ?? null,
      firstAnalysis?.pv ?? null
    ),
  };
  const treeParts = [
    root,
    ...moves.map<LichessTreePart>((move) => {
      const analysed = byPly.get(move.ply);
      const node: LichessTreePart = {
        ply: move.ply,
        fen: move.fenAfter,
        uci: move.uci,
        san: move.san,
        clock: move.clockMsRemaining === null ? undefined : Math.round(move.clockMsRemaining / 10),
        eval: analysed
          ? serverEval(
              move.fenAfter,
              analysis?.depth ?? 18,
              analysed.cpAfter,
              analysed.mateAfter,
              analysed.bestUci,
              analysed.pv
            )
          : undefined,
      };
      if (analysed) annotateNode(node, analysed);
      return node;
    }),
  ];

  for (const analysed of analysis?.moves ?? []) {
    const parent = treeParts[analysed.ply - 1];
    if (parent) addComputerLine(parent, analysed, analysis?.depth ?? 18, match.variant);
  }

  const whiteSummary = analysis?.summaries.find((item) => item.side === "white");
  const blackSummary = analysis?.summaries.find((item) => item.side === "black");
  const whiteRating = match.rating?.white;
  const blackRating = match.rating?.black;
  const viewedSeat = orientation === "white" ? match.white : match.black;
  const otherSeat = orientation === "white" ? match.black : match.white;
  const viewedRating = orientation === "white" ? whiteRating : blackRating;
  const otherRating = orientation === "white" ? blackRating : whiteRating;
  const winner = match.result?.winner ? color(match.result.winner) : undefined;
  const middle = analysis?.moves.find((move) => move.phase === "middlegame")?.ply;
  const end = analysis?.moves.find((move) => move.phase === "endgame")?.ply;
  const opening = identifyOpeningAtPly(moves.map((move) => move.san));

  return {
    game: {
      id: match.id,
      status: status(match),
      player: color(match.turn),
      turns: moves.length,
      fen: match.fen,
      initialFen: match.initialFen,
      source: match.computer ? "ai" : "friend",
      speed: speed(match.timeControl),
      variant: {
        key: match.variant,
        name: match.variant === "standard" ? "Standard" : match.variant,
        short: match.variant === "standard" ? "Std" : match.variant,
      },
      winner,
      perf: match.rating?.perfKey ?? speed(match.timeControl),
      rated: match.rating?.rated ?? false,
      moveCentis: moves.map(() => 100),
      division: middle || end ? { middle, end } : undefined,
      opening: opening ?? undefined,
    },
    player: player(viewedSeat, orientation, viewedRating, moves.length, match.computer),
    opponent: player(
      otherSeat,
      orientation === "white" ? "black" : "white",
      otherRating,
      moves.length,
      match.computer
    ),
    orientation,
    spectator: true,
    takebackable: false,
    moretimeable: false,
    userAnalysis: false,
    treeParts,
    analysis: analysis
      ? {
          id: analysis.matchId,
          nodesPerMove: 1_000_000,
          white: summary(whiteSummary, analysis.moves, "white"),
          black: summary(blackSummary, analysis.moves, "black"),
        }
      : undefined,
    pref: {
      animationDuration: 200,
      coords: 1,
      destination: true,
      highlight: true,
      is3d: false,
      keyboardMove: false,
      moveEvent: 2,
      rookCastle: true,
      showCaptured: true,
      showDests: true,
    },
  };
}
