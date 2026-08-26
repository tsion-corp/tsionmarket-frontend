"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BoardThemePicker } from "@/features/casino/components/chess/board-theme-picker";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { CasinoEmpty, CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { LiveChatFeed } from "@/features/casino/components/live-chat-feed";
import {
  fetchCoachProgress,
  fetchMatch,
  fetchMatchAnalysis,
  fetchMatchMoves,
  fetchPgn,
  fetchPlayerWeaknessProfile,
  requestMatchAnalysis,
  saveCoachProgress,
} from "@/features/casino/lib/api/chess";
import type {
  ChessAnalysisClassification,
  ChessAnalysisMove,
  ChessAnalysisPlayerSummary,
  ChessColor,
  ChessInsightBucket,
  ChessMatch,
  ChessMatchAnalysis,
  ChessMatchRatingSide,
  ChessPlayer,
  ChessProductKey,
} from "@/features/casino/lib/api/types";
import { useChessMatchSocial, CHESS_KEYS } from "@/features/casino/hooks/use-casino-chess";
import { useChessEngine } from "@/features/casino/hooks/use-chess-engine";
import { CHESS_PRODUCT_KEYS, useChessProducts } from "@/features/casino/hooks/use-chess-products";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { newChessIdempotencyKey } from "@/features/casino/lib/api/chess-idempotency";
import { useBoardTheme } from "@/features/casino/lib/chess/board-theme";
import { pvToSan, uciToSan } from "@/features/casino/lib/chess/engine-analysis";
import {
  fromUci,
  isInCheck,
  kingPos,
  parseFen,
  type Move,
} from "@/features/casino/lib/chess/engine";
import { identifyOpening } from "@/features/casino/lib/chess/openings";
import {
  matchActorLabel,
  playerDisplayName,
  playerIdentityLabel,
} from "@/features/casino/lib/chess/social";
import { errorCode } from "@/lib/api/envelope";
import { friendlyError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { toast } from "@/lib/toast";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ANALYSIS_POLL_MS = 3_000;

const CLASSIFICATION_LABEL: Record<ChessAnalysisClassification, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

const EMPTY_MATCH_RATING: {
  rated: boolean;
  perfKey: string | null;
  white: ChessMatchRatingSide;
  black: ChessMatchRatingSide;
} = {
  rated: false,
  perfKey: null,
  white: { rating: null, provisional: null, diff: null },
  black: { rating: null, provisional: null, diff: null },
};

type ReviewMove = Awaited<ReturnType<typeof fetchMatchMoves>>[number];
type UnderboardTab = "analysis" | "move-times" | "crosstable" | "export";

interface MovePair {
  turn: number;
  white: ReviewMove | null;
  black: ReviewMove | null;
}

interface SideAnalysisStats {
  inaccuracy: number;
  mistake: number;
  blunder: number;
  averageCpLoss: number;
  accuracyPercent: number | null;
}

function gatewayStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybe = error as { status?: unknown };
  return typeof maybe.status === "number" ? maybe.status : null;
}

function isMissingRoute(error: unknown): boolean {
  return errorCode(error) === "NOT_FOUND" || gatewayStatus(error) === 404;
}

function resultScore(match: ChessMatch): string {
  if (!match.result) return "*";
  if (match.result.kind === "draw") return "½–½";
  return match.result.winner === "w" ? "1–0" : "0–1";
}

function resultNarrative(match: ChessMatch): string {
  const result = match.result;
  if (!result) return match.state === "cancelled" ? "Game aborted" : "Game in progress";
  if (result.kind === "draw") {
    const reason = result.reason === "insufficient" ? "insufficient material" : result.reason;
    return `Draw by ${reason}`;
  }
  const loser = result.winner === "w" ? "Black" : "White";
  const winner = result.winner === "w" ? "White" : "Black";
  const ending =
    result.kind === "timeout"
      ? `${loser} time out`
      : result.kind === "resignation"
        ? `${loser} resigned`
        : `${loser} is checkmated`;
  return `${ending} · ${winner} is victorious`;
}

function timeControlCategory(value: string): "Bullet" | "Blitz" | "Rapid" {
  if (value.endsWith("s")) return "Bullet";
  const [initialPart, incrementPart = "0"] = value.split("+");
  const initialMinutes = Number.parseInt(initialPart, 10);
  const incrementSeconds = Number.parseInt(incrementPart, 10);
  const estimate = initialMinutes * 60 + incrementSeconds * 40;
  if (estimate <= 120) return "Bullet";
  if (estimate <= 480) return "Blitz";
  return "Rapid";
}

function formatRating(side: ChessMatchRatingSide): string | null {
  if (side.rating === null) return null;
  return String(side.rating);
}

function ratingDiff(side: ChessMatchRatingSide): string | null {
  if (side.diff === null || side.diff === 0) return null;
  return side.diff > 0 ? `+${side.diff}` : String(side.diff);
}

function decorateSeatLabel(
  label: string,
  side: ChessMatchRatingSide,
  player: ChessPlayer | null
): string {
  return playerIdentityLabel(label, player, side.rating);
}

function bucketLabel(value: string): string {
  if (!value) return value;
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function classificationTone(classification: ChessAnalysisClassification): string {
  switch (classification) {
    case "blunder":
      return "text-[#d85040]";
    case "mistake":
      return "text-[#e7a51b]";
    case "inaccuracy":
      return "text-[#4aa3d8]";
    case "best":
      return "text-[#8abf3f]";
    case "good":
    default:
      return "text-white/64";
  }
}

function classificationGlyph(classification: ChessAnalysisClassification): string {
  switch (classification) {
    case "blunder":
      return "??";
    case "mistake":
      return "?";
    case "inaccuracy":
      return "?!";
    case "best":
      return "✓";
    case "good":
    default:
      return "";
  }
}

function moveCellClass(active: boolean): string {
  return active
    ? "bg-[#3f88cc] text-white"
    : "text-white/72 hover:bg-white/[0.055] hover:text-white";
}

function formatEvaluation(cp: number | null, mate: number | null): string {
  if (mate !== null) return mate > 0 ? `#+${mate}` : `#${mate}`;
  if (cp === null) return "";
  const pawns = cp / 100;
  return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}

function figurineSan(san: string, side: "white" | "black"): string {
  const pieces =
    side === "white"
      ? { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" }
      : { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞" };
  const first = san.charAt(0) as keyof typeof pieces;
  return pieces[first] ? `${pieces[first]}${san.slice(1)}` : san;
}

function FlameBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-70" aria-hidden>
      <path
        fill="currentColor"
        d="M13.7 2.3c.4 2.1-.4 3.4-1.3 4.8-.9 1.4-1.9 2.9-1.8 5 0 1.1.3 2 .9 2.8-.1-1.4.5-2.3 1.2-3.1.9-1.1 2-2.2 2.2-4.5 2.7 1.8 5.1 4.9 5.1 8.6 0 3.8-2.9 6.9-7 6.9-4 0-7-2.8-7-6.8 0-4.7 3.3-7.5 5.1-10.1.9-1.3 1.6-2.5 1.7-4.1.3.1.6.2.9.5Z"
      />
    </svg>
  );
}

function PlayerLine({
  label,
  side,
  color,
}: {
  label: string;
  side: ChessMatchRatingSide;
  color: ChessColor;
}) {
  const diff = ratingDiff(side);
  return (
    <div className="flex min-w-0 items-center gap-2 text-[0.96rem] text-white/72">
      <span
        className={`h-3 w-3 shrink-0 rounded-full border border-white/22 ${
          color === "w" ? "bg-white/75" : "bg-black"
        }`}
      />
      <span className="min-w-0 truncate">
        {label}
        {formatRating(side) ? <span className="text-white/60"> ({formatRating(side)})</span> : null}
        {diff ? (
          <span className={side.diff && side.diff > 0 ? "text-[#78b52b]" : "text-[#d85040]"}>
            {" "}
            {diff}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function InsightBucketList({ title, buckets }: { title: string; buckets: ChessInsightBucket[] }) {
  if (buckets.length === 0) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[0.72rem] tracking-[0.04em] text-white/34 uppercase">{title}</div>
      {buckets.slice(0, 3).map((bucket) => (
        <div
          key={`${title}-${bucket.key}`}
          className="flex items-center justify-between gap-3 border-t border-white/6 py-1.5 text-[0.78rem]"
        >
          <span className="truncate text-white/66">{bucketLabel(bucket.key)}</span>
          <span className="tnum shrink-0 text-white/42">{bucket.averageCpLoss} cp</span>
        </div>
      ))}
    </div>
  );
}

function sideAnalysisStats(
  moves: ChessAnalysisMove[],
  side: "white" | "black",
  summary?: ChessAnalysisPlayerSummary
): SideAnalysisStats {
  const own = moves.filter((move) => move.side === side);
  const losses = own.map((move) => move.cpLoss).filter((loss): loss is number => loss !== null);
  return {
    inaccuracy:
      summary?.inaccuracies ?? own.filter((move) => move.classification === "inaccuracy").length,
    mistake: summary?.mistakes ?? own.filter((move) => move.classification === "mistake").length,
    blunder: summary?.blunders ?? own.filter((move) => move.classification === "blunder").length,
    averageCpLoss:
      summary?.averageCentipawnLoss ??
      (losses.length === 0
        ? 0
        : Math.round(losses.reduce((total, loss) => total + loss, 0) / losses.length)),
    accuracyPercent: summary?.accuracyPercent ?? null,
  };
}

function AnalysisSideSummary({
  label,
  color,
  rating,
  player,
  stats,
}: {
  label: string;
  color: ChessColor;
  rating: ChessMatchRatingSide;
  player: ChessPlayer | null;
  stats: SideAnalysisStats;
}) {
  return (
    <div className="border-t border-white/8 px-4 py-3.5">
      <div className="mb-2 flex min-w-0 items-center gap-2 text-[0.92rem] font-semibold text-white/72">
        <span
          className={`h-3 w-3 shrink-0 rounded-full border border-white/25 ${
            color === "w" ? "bg-white/75" : "bg-black"
          }`}
        />
        <span className="truncate">{decorateSeatLabel(label, rating, player)}</span>
        {ratingDiff(rating) ? (
          <span className={rating.diff && rating.diff > 0 ? "text-[#78b52b]" : "text-[#d85040]"}>
            {ratingDiff(rating)}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[0.78rem] leading-5">
        <span className="text-[#4aa3d8]">{stats.inaccuracy} Inaccuracies</span>
        <span className="tnum text-white/55">
          {stats.accuracyPercent === null ? "—" : `${stats.accuracyPercent.toFixed(1)}%`} accuracy
        </span>
        <span className="text-[#e7a51b]">{stats.mistake} Mistakes</span>
        <span className="tnum text-white/44">{stats.averageCpLoss} cp avg</span>
        <span className="text-[#d85040]">{stats.blunder} Blunders</span>
        <span />
      </div>
    </div>
  );
}

function AdvantageChart({
  analysis,
  selectedPly,
  lastPly,
  onSelect,
}: {
  analysis: ChessMatchAnalysis | null;
  selectedPly: number;
  lastPly: number;
  onSelect: (ply: number) => void;
}) {
  const values = useMemo(() => {
    const analysed = analysis?.moves ?? [];
    if (analysed.length === 0) return [];
    const first = analysed[0];
    const rows: { ply: number; cp: number }[] = [{ ply: 0, cp: first.cpBefore ?? 0 }];
    let previous = first.cpBefore ?? 0;
    for (const move of analysed) {
      previous = move.cpAfter ?? previous;
      rows.push({ ply: move.ply, cp: previous });
    }
    return rows;
  }, [analysis]);

  if (values.length === 0) {
    return (
      <div className="grid h-[220px] place-items-center bg-[linear-gradient(to_bottom,transparent,rgba(128,128,128,0.14),transparent)] px-6 text-center text-[0.86rem] text-white/45">
        The advantage graph appears when server analysis is ready.
      </div>
    );
  }

  const width = 1000;
  const height = 220;
  const yFor = (cp: number) => height / 2 - Math.tanh(cp / 500) * (height * 0.43);
  const xFor = (ply: number) => (lastPly > 0 ? (ply / lastPly) * width : 0);
  const line = values.map((value) => `${xFor(value.ply)},${yFor(value.cp)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const selectedX = xFor(selectedPly);
  const selected = values.reduce((nearest, value) =>
    Math.abs(value.ply - selectedPly) < Math.abs(nearest.ply - selectedPly) ? value : nearest
  );

  return (
    <button
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
        onSelect(Math.round(Math.max(0, Math.min(1, ratio)) * lastPly));
      }}
      className="relative block h-[220px] w-full cursor-crosshair overflow-hidden bg-[linear-gradient(to_bottom,transparent_0%,transparent_20%,rgba(128,128,128,0.16)_50%,transparent_80%,transparent_100%)] text-left"
      aria-label="Jump to a position on the advantage graph"
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,.14)" />
        <polygon points={area} fill="rgba(181,181,181,.38)" />
        <polyline
          points={line}
          fill="none"
          stroke="#d56a19"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={selectedX}
          y1="0"
          x2={selectedX}
          y2={height}
          stroke="#d56a19"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="pointer-events-none absolute top-3 right-3 rounded-[2px] border border-white/12 bg-black/72 px-2.5 py-1.5 text-[0.75rem] text-white/72">
        <span className="tnum font-semibold text-white/88">{selectedPly}.</span> Advantage{" "}
        {formatEvaluation(selected.cp, null)}
      </span>
    </button>
  );
}

function MoveTimesPanel({ moves }: { moves: ReviewMove[] }) {
  const bars = useMemo(() => {
    const values = moves.map((move, index) => {
      const at = Date.parse(move.createdAt);
      const previous = index > 0 ? Date.parse(moves[index - 1].createdAt) : Number.NaN;
      const duration =
        Number.isFinite(at) && Number.isFinite(previous) ? Math.max(0, (at - previous) / 1000) : 0;
      return { ply: move.ply, duration };
    });
    const max = Math.max(1, ...values.map((value) => value.duration));
    return values.map((value) => ({ ...value, height: Math.max(3, (value.duration / max) * 100) }));
  }, [moves]);

  return (
    <div className="flex h-[220px] items-end gap-px border-b border-white/12 px-3 pt-8">
      {bars.map((bar) => (
        <div
          key={bar.ply}
          className={
            bar.ply % 2 === 0 ? "min-w-0 flex-1 bg-white/34" : "min-w-0 flex-1 bg-white/62"
          }
          style={{ height: `${bar.height}%` }}
          title={`Move ${bar.ply}: ${bar.duration.toFixed(1)} seconds`}
        />
      ))}
    </div>
  );
}

function ReviewNavigation({
  current,
  last,
  onGo,
}: {
  current: number;
  last: number;
  onGo: (ply: number) => void;
}) {
  const button =
    "grid h-12 min-w-0 place-items-center text-[1.5rem] leading-none text-white/58 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:text-white/16";
  return (
    <div className="grid shrink-0 grid-cols-6 border-t border-white/8 bg-[#2d2b29]">
      <button
        type="button"
        className={button}
        onClick={() => onGo(0)}
        disabled={current === 0}
        aria-label="Start"
      >
        |‹
      </button>
      <button
        type="button"
        className={button}
        onClick={() => onGo(current - 1)}
        disabled={current === 0}
        aria-label="Previous move"
      >
        ‹
      </button>
      <button
        type="button"
        className={button}
        onClick={() => onGo(current + 1)}
        disabled={current === last}
        aria-label="Next move"
      >
        ›
      </button>
      <button
        type="button"
        className={button}
        onClick={() => onGo(last)}
        disabled={current === last}
        aria-label="End"
      >
        ›|
      </button>
      <button
        type="button"
        className={`${button} text-[1.15rem]`}
        onClick={() => onGo(last)}
        aria-label="Latest position"
      >
        ◎
      </button>
      <Link
        href="/casino/chess/history"
        className={`${button} text-[1.2rem]`}
        aria-label="Game history"
      >
        ☰
      </Link>
    </div>
  );
}

export function ReviewSection({ matchId }: { matchId: string | null }) {
  const t = useTranslations("casino.chess.common");
  const wallet = useCasinoWallet();
  const products = useChessProducts();
  const theme = useBoardTheme();
  const queryClient = useQueryClient();
  // Clamp this sentinel to the loaded move count so a completed game opens at
  // its final position without an effect-driven second render.
  const [ply, setPly] = useState(Number.MAX_SAFE_INTEGER);
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [underboardTab, setUnderboardTab] = useState<UnderboardTab>("analysis");
  const [chatDraft, setChatDraft] = useState("");
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);

  const matchQuery = useQuery({
    queryKey: CHESS_KEYS.match(matchId ?? "none"),
    queryFn: () => fetchMatch(matchId as string),
    enabled: !!matchId,
  });
  const movesQuery = useQuery({
    queryKey: ["casino", "chess", "review-moves", matchId ?? "none"],
    queryFn: () => fetchMatchMoves(matchId as string),
    enabled: !!matchId,
  });
  const analysisQuery = useQuery({
    queryKey: CHESS_KEYS.analysis(matchId ?? "none"),
    queryFn: () => fetchMatchAnalysis(matchId as string),
    enabled: !!matchId && matchQuery.data?.state === "settled",
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as ChessMatchAnalysis | null | undefined;
      return data && (data.status === "queued" || data.status === "running")
        ? ANALYSIS_POLL_MS
        : false;
    },
  });
  const insightsQuery = useQuery({
    queryKey: CHESS_KEYS.insights(wallet.address ?? "none"),
    queryFn: () => fetchPlayerWeaknessProfile(wallet.address as string, 5),
    enabled: !!wallet.address,
    retry: false,
  });
  const coachProgressQuery = useQuery({
    queryKey: CHESS_KEYS.coachProgress(wallet.address ?? "none"),
    queryFn: () => fetchCoachProgress(wallet.address as string),
    enabled: !!wallet.address,
    retry: false,
  });
  const requestAnalysisMutation = useMutation({
    mutationFn: async ({ premium }: { premium: boolean }) => {
      if (!matchId) throw new Error("No game selected.");
      if (!wallet.address) throw new Error("Connect your wallet to request analysis.");
      return requestMatchAnalysis(matchId, wallet.address, {
        premium,
        ...(premium ? { idempotencyKey: newChessIdempotencyKey() } : {}),
      });
    },
    onSuccess: (analysis) => {
      queryClient.setQueryData(CHESS_KEYS.analysis(matchId as string), analysis);
      if (wallet.address) {
        void queryClient.invalidateQueries({
          queryKey: CHESS_PRODUCT_KEYS.access(wallet.address),
        });
      }
      toast.success(analysis.status === "completed" ? "Analysis is ready." : "Analysis queued.");
    },
    onError: (error) => toast.error(friendlyError(error, "Couldn't request analysis right now.")),
  });
  const saveCoachMutation = useMutation({
    mutationFn: async (move: ChessAnalysisMove) => {
      if (!matchId) throw new Error("No game selected.");
      if (!wallet.address) throw new Error("Connect your wallet to save coach progress.");
      return saveCoachProgress(wallet.address, {
        lessonKey: move.motif,
        chapterKey: `${matchId}:${move.ply}`,
        score: Math.round(move.accuracyPercent ?? 0),
        completed: true,
      });
    },
    onSuccess: (progress) => {
      queryClient.setQueryData(CHESS_KEYS.coachProgress(progress.player), progress);
      toast.success("Lesson marked as practised.");
    },
    onError: (error) => toast.error(friendlyError(error, "Couldn't save that lesson.")),
  });

  const moves = useMemo(() => movesQuery.data ?? [], [movesQuery.data]);
  const positions = useMemo(() => [START_FEN, ...moves.map((move) => move.fenAfter)], [moves]);
  const last = positions.length - 1;
  const current = Math.min(Math.max(ply, 0), last);
  const go = (target: number) => setPly(Math.min(Math.max(target, 0), last));

  const { chatMessages, chatLoading, activeChatRoom, postChat, postingChat } = useChessMatchSocial(
    matchId,
    "spectator",
    false,
    null,
    null
  );

  const analysis = analysisQuery.data ?? null;
  const analysisUnavailable = analysisQuery.error ? isMissingRoute(analysisQuery.error) : false;
  const insightsUnavailable = insightsQuery.error ? isMissingRoute(insightsQuery.error) : false;
  const coachProgressUnavailable = coachProgressQuery.error
    ? isMissingRoute(coachProgressQuery.error)
    : false;
  const refreshedInsightsForAnalysis = useRef<string | null>(null);
  useEffect(() => {
    if (analysis?.status !== "completed" || !wallet.address) return;
    const revision = `${analysis.matchId}:${analysis.updatedAt}`;
    if (refreshedInsightsForAnalysis.current === revision) return;
    refreshedInsightsForAnalysis.current = revision;
    void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.insights(wallet.address) });
  }, [analysis, queryClient, wallet.address]);

  const analysisByPly = useMemo(
    () => new Map((analysis?.moves ?? []).map((move) => [move.ply, move])),
    [analysis]
  );
  const currentAnalysis = current > 0 ? (analysisByPly.get(current) ?? null) : null;
  const movePairs = useMemo<MovePair[]>(() => {
    const rows: MovePair[] = [];
    for (const move of moves) {
      const turn = Math.ceil(move.ply / 2);
      const row = rows[turn - 1] ?? { turn, white: null, black: null };
      if (move.ply % 2 === 1) row.white = move;
      else row.black = move;
      rows[turn - 1] = row;
    }
    return rows;
  }, [moves]);
  const topMistakes = useMemo(
    () =>
      [...(analysis?.moves ?? [])]
        .filter((move) => ["inaccuracy", "mistake", "blunder"].includes(move.classification))
        .sort((left, right) => (right.cpLoss ?? 0) - (left.cpLoss ?? 0)),
    [analysis]
  );

  const productPrice = (key: ChessProductKey, fallback: string) =>
    products.products.find((product) => product.key === key)?.priceUsdc ?? fallback;
  const purchaseProduct = async (key: ChessProductKey, label: string) => {
    const id = toast.loading(`Buying ${label}…`);
    try {
      const result = await products.purchase(key);
      toast.success(`${label} ready. ${result.priceUsdc} USDC charged.`, { id, sensitive: true });
    } catch (error) {
      toast.error(friendlyError(error, `Couldn't buy ${label}.`), { id });
    }
  };

  useEffect(() => {
    const target = activeMoveRef.current;
    if (!target) return;
    target.scrollIntoView({ block: "nearest" });
  }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") setPly((value) => Math.max(value - 1, 0));
      else if (event.key === "ArrowRight") setPly((value) => Math.min(value + 1, last));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const currentFen = positions[current] ?? START_FEN;
  const board = useMemo(() => {
    try {
      return parseFen(currentFen).board;
    } catch {
      return null;
    }
  }, [currentFen]);
  const engine = useChessEngine(engineEnabled ? currentFen : null);
  const enginePvSan = useMemo(() => pvToSan(currentFen, engine.pv), [currentFen, engine.pv]);
  const engineBestMoveSan = useMemo(
    () => uciToSan(currentFen, engine.bestMove) ?? engine.bestMove,
    [currentFen, engine.bestMove]
  );
  const lastMove: Move | null = current > 0 ? fromUci(moves[current - 1]?.uci ?? "") : null;
  const opening = useMemo(
    () => identifyOpening(moves.slice(0, current).map((move) => move.san)),
    [current, moves]
  );

  if (!matchId) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoEmpty>{t("historyEmpty")}</CasinoEmpty>
      </div>
    );
  }
  if (matchQuery.error || movesQuery.error) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoError error={matchQuery.error ?? movesQuery.error} subject={t("historyTitle")} />
      </div>
    );
  }
  if (matchQuery.isLoading || movesQuery.isLoading || !matchQuery.data || !board) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoLoading rows={5} />
      </div>
    );
  }

  const match = matchQuery.data;
  const matchRating = match.rating ?? EMPTY_MATCH_RATING;
  const orientation: ChessColor =
    match.black?.walletAddress.toLowerCase() === wallet.address?.toLowerCase() ? "b" : "w";
  const whiteName = playerDisplayName(match.white, wallet.name, wallet.address ?? null, t("white"));
  const blackName = playerDisplayName(match.black, wallet.name, wallet.address ?? null, t("black"));
  const analysisPending = analysis?.status === "queued" || analysis?.status === "running";
  const canRequestAnalysis =
    match.state === "settled" && (analysis === null || analysis.status === "failed");
  const firstAnalysis = analysis?.moves[0] ?? null;
  const storedCp =
    current === 0 ? (firstAnalysis?.cpBefore ?? null) : (currentAnalysis?.cpAfter ?? null);
  const storedMate =
    current === 0 ? (firstAnalysis?.mateBefore ?? null) : (currentAnalysis?.mateAfter ?? null);
  const evaluation = formatEvaluation(storedCp ?? engine.scoreCp, storedMate ?? engine.scoreMate);
  const whiteStats = sideAnalysisStats(
    analysis?.moves ?? [],
    "white",
    analysis?.summaries.find((summary) => summary.side === "white")
  );
  const blackStats = sideAnalysisStats(
    analysis?.moves ?? [],
    "black",
    analysis?.summaries.find((summary) => summary.side === "black")
  );
  const premiumReviewCredits = products.access?.premiumReviewCredits ?? 0;
  const topLesson = topMistakes[0] ?? null;
  const topLessonChapter = topLesson ? `${match.id}:${topLesson.ply}` : null;
  const topLessonSaved =
    !!topLessonChapter &&
    !!coachProgressQuery.data?.items.some((item) => item.chapterKey === topLessonChapter);

  const onPostChat = async () => {
    const text = chatDraft.trim();
    if (!text) return;
    try {
      await postChat({ room: activeChatRoom, text });
      setChatDraft("");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't send that message."));
    }
  };

  const downloadPgn = () => {
    void fetchPgn(match.id)
      .then((pgn) => {
        const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `chess-${match.id}.pgn`;
        anchor.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error(t("pgnFailed")));
  };

  const renderMove = (move: ReviewMove, side: "white" | "black") => {
    const analysed = analysisByPly.get(move.ply) ?? null;
    const active = current === move.ply;
    return (
      <button
        ref={active ? activeMoveRef : null}
        type="button"
        onClick={() => go(move.ply)}
        className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left text-[1rem] transition-colors ${moveCellClass(active)}`}
      >
        <span className={`truncate ${analysed ? classificationTone(analysed.classification) : ""}`}>
          {figurineSan(move.san, side)}
          {analysed ? classificationGlyph(analysed.classification) : ""}
        </span>
        <span className={`tnum text-[0.72rem] ${active ? "text-white/86" : "text-white/42"}`}>
          {analysed ? formatEvaluation(analysed.cpAfter, analysed.mateAfter) : ""}
        </span>
      </button>
    );
  };

  return (
    <div className="ws-chess-round-root ws-chess-analysis-root relative mx-auto w-full px-4 pb-12 sm:px-6 lg:px-8">
      <div className="ws-chess-round-shell ws-chess-analysis-shell grid gap-5">
        <aside className="ws-chess-round-desktop-left order-1 hidden min-h-0 flex-col gap-4 pr-1 text-[#c9c6c0]">
          <div className="rounded-[2px] border border-[#3b3936] bg-[#262421] px-5 py-5">
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center text-white/34">
                <FlameBadgeIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="ws-chess-lila-meta text-white/66">
                  {match.timeControl} · {matchRating.rated ? "Rated" : "Casual"} ·{" "}
                  {timeControlCategory(match.timeControl)}
                </div>
                <div className="mt-1 text-[0.82rem] text-white/36">{timeAgo(match.createdAt)}</div>
                <div className="mt-4 space-y-1.5">
                  <PlayerLine label={whiteName} side={matchRating.white} color="w" />
                  <PlayerLine label={blackName} side={matchRating.black} color="b" />
                </div>
                <div className="mt-4 border-t border-white/10 pt-4 text-center text-[0.9rem] text-white/62">
                  {resultNarrative(match)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-[2px] border border-[#3b3936] bg-[#262421]">
            <div className="border-b border-[#3b3936] bg-[#2b2926] px-4 py-2 text-[0.92rem] text-white/64">
              Spectator room
            </div>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
              <div className="min-h-0 overflow-hidden px-3 py-2">
                {chatLoading ? (
                  <div className="text-[0.78rem] text-white/42">Loading chat…</div>
                ) : (
                  <LiveChatFeed
                    messages={chatMessages}
                    labelFor={(line) =>
                      matchActorLabel({
                        actor: line.author,
                        match,
                        walletAddress: wallet.address,
                        whiteDisplayName: whiteName,
                        blackDisplayName: blackName,
                        youLabel: "You",
                      })
                    }
                    viewer={wallet.address ?? null}
                    emptyHint="No chat lines yet."
                    className="h-full"
                  />
                )}
              </div>
              <div className="flex items-center border-t border-[#3b3936] bg-[#211f1c]">
                <input
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) return;
                    event.preventDefault();
                    void onPostChat();
                  }}
                  disabled={!wallet.address}
                  placeholder={wallet.address ? "Please be nice in the chat!" : "Sign in to chat"}
                  className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[0.84rem] text-white outline-none placeholder:text-white/34 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => void onPostChat()}
                  disabled={!wallet.address || postingChat || chatDraft.trim().length === 0}
                  className="h-11 border-l border-white/8 px-3 text-[0.78rem] text-white/55 hover:text-white disabled:opacity-25"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="ws-chess-round-board-section order-1">
          <div className="ws-chess-analysis-mobile-meta mb-3 rounded-[2px] border border-white/8 bg-[#262421] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[0.82rem] text-white/72">
                {decorateSeatLabel(whiteName, matchRating.white, match.white)} vs{" "}
                {decorateSeatLabel(blackName, matchRating.black, match.black)}
              </span>
              <strong className="tnum text-[0.92rem] text-white/88">{resultScore(match)}</strong>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2px]">
            <ChessBoard
              board={board}
              orientation={orientation}
              lastMove={lastMove}
              checkSquare={
                isInCheck(board, current % 2 === 0 ? "w" : "b")
                  ? kingPos(board, current % 2 === 0 ? "w" : "b")
                  : null
              }
              theme={theme}
            />
          </div>

          <div className="ws-chess-analysis-underboard mt-5 overflow-hidden rounded-[2px] border border-white/8 bg-[#1f1e1b]">
            <div className="grid grid-cols-4 overflow-x-auto border-b border-white/10">
              {(
                [
                  ["analysis", "Computer analysis"],
                  ["move-times", "Move times"],
                  ["crosstable", "Crosstable"],
                  ["export", "Share & export"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setUnderboardTab(tab)}
                  className={`min-w-[128px] border-b-2 px-2 py-2.5 text-[0.78rem] transition-colors ${
                    underboardTab === tab
                      ? "border-[#d56a19] text-white/76"
                      : "border-transparent text-white/42 hover:bg-white/[0.03] hover:text-white/68"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {underboardTab === "analysis" ? (
              <div className="relative">
                <AdvantageChart
                  analysis={analysis}
                  selectedPly={current}
                  lastPly={last}
                  onSelect={go}
                />
                {analysisPending ? (
                  <div className="absolute inset-0 grid place-items-center bg-black/62 text-center text-[0.84rem] text-white/66 backdrop-blur-[1px]">
                    {analysis?.status === "queued"
                      ? "Analysis queued"
                      : "Stockfish is analysing this game"}
                  </div>
                ) : null}
                {analysisUnavailable ? (
                  <div className="absolute inset-0 grid place-items-center bg-black/68 px-6 text-center text-[0.84rem] text-white/64">
                    Saved analysis is not available on this server yet.
                  </div>
                ) : null}
                {canRequestAnalysis ? (
                  <div className="absolute inset-0 grid place-items-center bg-black/66 px-6 text-center">
                    <div>
                      <div className="mb-3 text-[0.84rem] text-white/62">
                        Run server Stockfish to save annotations and your weakness profile.
                      </div>
                      <button
                        type="button"
                        onClick={() => requestAnalysisMutation.mutate({ premium: false })}
                        disabled={requestAnalysisMutation.isPending || !wallet.address}
                        className="rounded-[2px] bg-[#3f88cc] px-4 py-2 text-[0.82rem] font-semibold text-white disabled:opacity-35"
                      >
                        {requestAnalysisMutation.isPending
                          ? "Requesting…"
                          : "Request computer analysis"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {underboardTab === "move-times" ? <MoveTimesPanel moves={moves} /> : null}
            {underboardTab === "crosstable" ? (
              <div className="grid h-[220px] place-items-center px-6">
                <div className="w-full max-w-[420px] overflow-hidden rounded-[2px] border border-white/10 text-[0.86rem]">
                  <div className="grid grid-cols-[1fr_auto] border-b border-white/8 bg-white/[0.03] px-4 py-2.5">
                    <span className="truncate text-white/68">{whiteName}</span>
                    <span className="tnum text-white/82">
                      {match.result?.kind === "draw"
                        ? "½"
                        : match.result?.winner === "w"
                          ? "1"
                          : "0"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] px-4 py-2.5">
                    <span className="truncate text-white/68">{blackName}</span>
                    <span className="tnum text-white/82">
                      {match.result?.kind === "draw"
                        ? "½"
                        : match.result?.winner === "b"
                          ? "1"
                          : "0"}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            {underboardTab === "export" ? (
              <div className="grid min-h-[220px] place-items-center px-5 py-6">
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={downloadPgn}
                    className="rounded-[2px] border border-white/12 bg-white/[0.04] px-4 py-2 text-[0.8rem] text-white/68 hover:text-white"
                  >
                    Download PGN
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(currentFen)}
                    className="rounded-[2px] border border-white/12 bg-white/[0.04] px-4 py-2 text-[0.8rem] text-white/68 hover:text-white"
                  >
                    Copy FEN
                  </button>
                  <Link
                    href="/casino/chess/history"
                    className="rounded-[2px] border border-white/12 bg-white/[0.04] px-4 py-2 text-[0.8rem] text-white/68 hover:text-white"
                  >
                    Game history
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ws-chess-analysis-training mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[2px] border border-white/8 bg-[#1f1e1b] p-4">
              <div className="mb-3 text-[0.78rem] font-semibold text-white/62">
                Weakness profile
              </div>
              {insightsUnavailable ? (
                <div className="text-[0.78rem] text-white/42">
                  Insights are not available on this server.
                </div>
              ) : insightsQuery.isLoading ? (
                <div className="text-[0.78rem] text-white/42">Updating from analysed games…</div>
              ) : (insightsQuery.data?.totalMistakes ?? 0) === 0 ? (
                <div className="text-[0.78rem] text-white/42">No recurring mistakes yet.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <InsightBucketList
                    title="Openings"
                    buckets={insightsQuery.data?.openings ?? []}
                  />
                  <InsightBucketList title="Motifs" buckets={insightsQuery.data?.motifs ?? []} />
                </div>
              )}
            </div>
            <div className="rounded-[2px] border border-white/8 bg-[#1f1e1b] p-4">
              <div className="mb-3 flex items-center justify-between gap-3 text-[0.78rem] font-semibold text-white/62">
                <span>Coach progress</span>
                {products.access?.coachActive ? (
                  <span className="text-[#78b52b]">Active</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void purchaseProduct("coach_monthly", "Coach monthly")}
                    disabled={products.purchasing || !wallet.address}
                    className="text-[#4aa3d8] hover:text-[#70bae5] disabled:opacity-35"
                  >
                    Unlock · {productPrice("coach_monthly", "7.99")} USDC
                  </button>
                )}
              </div>
              {coachProgressUnavailable ? (
                <div className="text-[0.78rem] text-white/42">
                  Coach progress is not available on this server.
                </div>
              ) : coachProgressQuery.isLoading ? (
                <div className="text-[0.78rem] text-white/42">Loading saved lessons…</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-[0.78rem]">
                  <div className="border-r border-white/8">
                    <div className="tnum text-[1.25rem] text-white/78">
                      {coachProgressQuery.data?.totalEntries ?? 0}
                    </div>
                    <div className="text-white/38">Saved lessons</div>
                  </div>
                  <div>
                    <div className="tnum text-[1.25rem] text-[#78b52b]">
                      {coachProgressQuery.data?.completedEntries ?? 0}
                    </div>
                    <div className="text-white/38">Completed</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="ws-chess-analysis-right order-3 flex min-h-0 flex-col gap-5 text-[#c9c6c0]">
          <aside className="ws-chess-analysis-tools relative flex min-h-[560px] flex-col overflow-hidden rounded-[2px] border border-[#3b3936] bg-[#262421]">
            <div className="grid h-12 shrink-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#3b3936] bg-[#302e2b] px-3">
              <button
                type="button"
                onClick={() => setEngineEnabled((enabled) => !enabled)}
                aria-pressed={engineEnabled}
                className={`grid h-7 w-10 place-items-center rounded-[2px] text-[0.9rem] font-bold ${
                  engineEnabled ? "bg-[#5c9d20] text-white" : "bg-black/28 text-white/36"
                }`}
              >
                {engineEnabled ? "✓" : "×"}
              </button>
              <strong className="tnum text-[1.15rem] text-white/84">{evaluation || "-"}</strong>
              <div className="min-w-0 text-[0.72rem] leading-4 text-white/46">
                <div className="truncate">
                  {analysis?.engineName ?? engine.label}
                  {analysis?.depth ? (
                    <span className="ml-1 text-[#78b52b]">depth {analysis.depth}</span>
                  ) : null}
                </div>
                <div className="truncate">
                  {engineEnabled
                    ? engine.status === "analyzing"
                      ? "Analysing in local browser"
                      : "Local browser engine"
                    : "Engine disabled"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEngineSettings((open) => !open)}
                className={`grid h-9 w-9 place-items-center text-[1.25rem] transition-colors ${
                  showEngineSettings ? "bg-[#3f88cc] text-white" : "text-white/52 hover:text-white"
                }`}
                aria-label="Engine settings"
              >
                ⚙
              </button>
            </div>

            {showEngineSettings ? (
              <div className="absolute inset-x-0 top-12 z-20 border-b border-[#3b3936] bg-[#282624] px-5 py-5 shadow-[0_12px_28px_rgba(0,0,0,.45)]">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 text-[0.82rem]">
                  <span className="text-white/52">Engine</span>
                  <strong className="text-white/78">Stockfish 18 Lite</strong>
                  <span className="text-white/52">Search</span>
                  <span className="text-white/72">250 ms per position</span>
                  <span className="text-white/52">Lines</span>
                  <span className="text-white/72">1 principal variation</span>
                  <span className="text-white/52">Board</span>
                  <BoardThemePicker />
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {movePairs.length === 0 ? (
                <div className="px-4 py-4 text-[0.86rem] text-white/46">Starting position</div>
              ) : (
                movePairs.map((row) => {
                  const issues = [row.white, row.black]
                    .filter((move): move is ReviewMove => move !== null)
                    .map((move) => analysisByPly.get(move.ply) ?? null)
                    .filter(
                      (move): move is ChessAnalysisMove =>
                        move !== null &&
                        ["inaccuracy", "mistake", "blunder"].includes(move.classification)
                    );
                  return (
                    <Fragment key={row.turn}>
                      <div className="grid grid-cols-[13%_43.5%_43.5%] border-b border-white/6">
                        <div className="tnum flex items-start justify-center bg-black/10 px-1 py-2 text-[0.78rem] text-white/28">
                          {row.turn}
                        </div>
                        {row.white ? renderMove(row.white, "white") : <span />}
                        {row.black ? renderMove(row.black, "black") : <span />}
                      </div>
                      {issues.map((move) => (
                        <button
                          key={`annotation-${move.ply}`}
                          type="button"
                          onClick={() => go(move.ply)}
                          className="w-full border-b border-white/8 bg-white/[0.035] px-3 py-2 text-left"
                        >
                          <div
                            className={`text-[0.82rem] ${classificationTone(move.classification)}`}
                          >
                            {CLASSIFICATION_LABEL[move.classification]}.{" "}
                            {move.coachComment ||
                              (move.bestSan
                                ? `${figurineSan(move.bestSan, move.side)} was best.`
                                : "Review this move.")}
                          </div>
                          {move.pv ? (
                            <div className="mt-1 truncate text-[0.72rem] text-white/42">
                              {move.pv}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </Fragment>
                  );
                })
              )}
              <div className="border-t border-white/8 bg-white/[0.035] px-4 py-3 text-center">
                <div className="tnum text-[1rem] font-semibold text-white/78">
                  {resultScore(match)}
                </div>
                <div className="mt-1 text-[0.78rem] text-white/48 italic">
                  {resultNarrative(match)}
                </div>
              </div>
            </div>

            <ReviewNavigation current={current} last={last} onGo={go} />

            <div className="shrink-0 border-t border-white/8 bg-[#211f1c] px-4 py-2 text-[0.72rem] text-white/44">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {opening
                    ? `${opening.eco} ${opening.name}`
                    : current === 0
                      ? "Starting position"
                      : `Move ${current}`}
                </span>
                <span className="tnum shrink-0">
                  {current} / {last}
                </span>
              </div>
              {engineEnabled && (engineBestMoveSan || enginePvSan.length > 0) ? (
                <div className="mt-1 truncate text-white/54">
                  {engineBestMoveSan ? `Best ${engineBestMoveSan}` : ""}
                  {enginePvSan.length > 0 ? ` · ${enginePvSan.join(" ")}` : ""}
                </div>
              ) : null}
            </div>
          </aside>

          <div className="overflow-hidden rounded-[2px] border border-white/8 bg-[#1f1e1b]">
            {analysis?.status === "completed" && analysis.tier === "standard" ? (
              <div className="border-b border-white/8 bg-white/[0.025] px-4 py-3 text-[0.76rem]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-white/48">
                    Deeper Stockfish review and expanded coaching.
                  </span>
                  {premiumReviewCredits > 0 ? (
                    <button
                      type="button"
                      onClick={() => requestAnalysisMutation.mutate({ premium: true })}
                      disabled={requestAnalysisMutation.isPending}
                      className="font-semibold text-[#4aa3d8] hover:text-[#70bae5] disabled:opacity-35"
                    >
                      Run premium review · {premiumReviewCredits} credit
                      {premiumReviewCredits === 1 ? "" : "s"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void purchaseProduct("premium_review_credit", "Premium review credit")
                      }
                      disabled={products.purchasing || !wallet.address}
                      className="font-semibold text-[#4aa3d8] hover:text-[#70bae5] disabled:opacity-35"
                    >
                      Buy review · {productPrice("premium_review_credit", "2.00")} USDC
                    </button>
                  )}
                </div>
              </div>
            ) : analysis?.tier === "premium" ? (
              <div className="border-b border-white/8 bg-[#315f1f]/30 px-4 py-2 text-[0.74rem] font-semibold text-[#8fca58]">
                Premium review · depth {analysis.depth}
              </div>
            ) : null}
            {topMistakes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => go(topMistakes[0].ply)}
                  className="bg-[#3f88cc] px-4 py-3 text-[0.82rem] font-semibold text-white transition-colors hover:bg-[#4a94d8]"
                >
                  ▶ Learn from your mistakes
                </button>
                {products.access?.coachActive ? (
                  <button
                    type="button"
                    onClick={() => topLesson && saveCoachMutation.mutate(topLesson)}
                    disabled={saveCoachMutation.isPending || topLessonSaved}
                    className="border-l border-white/10 bg-[#315f1f] px-4 py-3 text-[0.78rem] font-semibold text-white hover:bg-[#3b7026] disabled:cursor-default disabled:opacity-45"
                  >
                    {topLessonSaved ? "Lesson practised ✓" : "Mark lesson practised"}
                  </button>
                ) : null}
              </div>
            ) : null}
            <AnalysisSideSummary
              label={whiteName}
              color="w"
              rating={matchRating.white}
              player={match.white}
              stats={whiteStats}
            />
            <AnalysisSideSummary
              label={blackName}
              color="b"
              rating={matchRating.black}
              player={match.black}
              stats={blackStats}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
