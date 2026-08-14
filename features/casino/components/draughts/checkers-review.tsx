"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DraughtsBoardView } from "@/features/casino/components/draughts/draughts-board";
import {
  DraughtsMoveTable,
  DraughtsReplayControls,
} from "@/features/casino/components/draughts/draughts-move-table";
import {
  DRAUGHTS_PANEL_BUTTON_CLASS,
  DRAUGHTS_PANEL_HEADER_CLASS,
  DraughtsWorkspace,
} from "@/features/casino/components/draughts/draughts-workspace";
import { MatchComments } from "@/features/casino/components/draughts/match-comments";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  fetchMatch,
  fetchMatchAnalysis,
  fetchMatchMoves,
  requestMatchAnalysis,
} from "@/features/casino/lib/api/draughts";
import { parseFen, parseUci, type DraughtsSide } from "@/features/casino/lib/draughts/engine";
import type {
  DraughtsAnalysisClassification,
  DraughtsMatch,
} from "@/features/casino/lib/draughts/types";
import { variantOption } from "@/features/casino/lib/draughts/variants";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const ANALYSIS_POLL_MS = 2_000;
const EMPTY_MOVES: Awaited<ReturnType<typeof fetchMatchMoves>> = [];

type ReviewTab = "moves" | "comments";

function resultText(match: DraughtsMatch): string {
  if (!match.result) return match.state === "in_progress" ? "Game in progress" : "No result";
  if (match.result.kind === "draw") return "Draw";
  return `${match.result.winner === "white" ? "White" : "Black"} won`;
}

function playerName(match: DraughtsMatch, side: DraughtsSide): string {
  return (side === "white" ? match.white : match.black)?.username ?? side;
}

function ratingLine(match: DraughtsMatch, side: DraughtsSide): string | null {
  const value = match.rating?.[side];
  if (!value || value.rating === null) return null;
  const diff = value.diff;
  const suffix = diff == null ? "" : ` ${diff >= 0 ? "+" : ""}${diff}`;
  return `${value.rating}${value.provisional ? "?" : ""}${suffix}`;
}

function markFor(classification: DraughtsAnalysisClassification) {
  switch (classification) {
    case "best":
      return { symbol: "!", tone: "good" as const };
    case "good":
      return { symbol: "✓", tone: "good" as const };
    case "inaccuracy":
      return { symbol: "?!", tone: "neutral" as const };
    case "mistake":
      return { symbol: "?", tone: "bad" as const };
    case "blunder":
      return { symbol: "??", tone: "bad" as const };
  }
}

function AnalysisCard({
  match,
  activePly,
  canRequest,
  requesting,
  onRequest,
  analysis,
}: {
  match: DraughtsMatch;
  activePly: number;
  canRequest: boolean;
  requesting: boolean;
  onRequest: () => void;
  analysis: Awaited<ReturnType<typeof fetchMatchAnalysis>>;
}) {
  const position = analysis?.positions.find((entry) => entry.ply === activePly) ?? null;

  if (!analysis) {
    return (
      <div className="border-b border-white/10 px-4 py-4 text-[12px] text-white/45">
        <p>
          {match.state === "settled"
            ? canRequest
              ? "Run a saved Stockfish review for this finished game."
              : "Either player can request the saved analysis."
            : "Saved analysis becomes available after the game ends."}
        </p>
        {canRequest ? (
          <button
            type="button"
            onClick={onRequest}
            disabled={requesting}
            className={`${DRAUGHTS_PANEL_BUTTON_CLASS} mt-3 w-full`}
          >
            {requesting ? "Queueing..." : "Request analysis"}
          </button>
        ) : null}
      </div>
    );
  }

  if (analysis.status === "queued" || analysis.status === "running") {
    return (
      <div className="border-b border-white/10 px-4 py-4 text-[12px] text-white/50">
        <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
        {analysis.status === "queued" ? "Analysis queued" : "Stockfish is analysing this game"}
      </div>
    );
  }

  if (analysis.status === "failed") {
    return (
      <div className="border-b border-white/10 px-4 py-4 text-[12px] text-red-300/80">
        <p>{analysis.lastError ?? "Analysis could not be completed."}</p>
        {canRequest ? (
          <button
            type="button"
            onClick={onRequest}
            disabled={requesting}
            className={`${DRAUGHTS_PANEL_BUTTON_CLASS} mt-3 w-full`}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (!position || activePly === 0) {
    return (
      <div className="border-b border-white/10 px-4 py-4 text-[12px] text-white/45">
        Select a move to see its analysis.
      </div>
    );
  }

  return (
    <div className="border-b border-white/10 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[14px] text-white/82 capitalize">{position.classification}</strong>
        {position.loss != null ? (
          <span className="font-mono text-[11px] text-white/35">loss {position.loss}</span>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
        <dt className="text-white/32">Played</dt>
        <dd className="font-mono text-white/68">{position.playedUci ?? "-"}</dd>
        <dt className="text-white/32">Best</dt>
        <dd className="font-mono text-white/68">{position.bestUci ?? "-"}</dd>
        <dt className="text-white/32">Theme</dt>
        <dd className="text-white/68">{position.motif || "general"}</dd>
      </dl>
      {position.principalVariation ? (
        <p className="mt-2 font-mono text-[10.5px] leading-4 break-words text-white/38">
          {position.principalVariation}
        </p>
      ) : null}
    </div>
  );
}

export function CheckersReview({ matchId }: { matchId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address } = useCasinoWallet();
  const wallet = address ?? null;
  const [tab, setTab] = useState<ReviewTab>("moves");
  const [selectedPly, setSelectedPly] = useState<number | null>(null);

  const matchQuery = useQuery({
    queryKey: ["casino", "draughts", "review", matchId, "match"],
    queryFn: () => fetchMatch(matchId),
  });
  const movesQuery = useQuery({
    queryKey: ["casino", "draughts", "review", matchId, "moves"],
    queryFn: () => fetchMatchMoves(matchId),
  });
  const analysisKey = ["casino", "draughts", "review", matchId, "analysis"] as const;
  const analysisQuery = useQuery({
    queryKey: analysisKey,
    queryFn: () => fetchMatchAnalysis(matchId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? ANALYSIS_POLL_MS : false;
    },
  });
  const request = useMutation({
    mutationFn: (player: string) =>
      requestMatchAnalysis(matchId, player, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: (analysis) => queryClient.setQueryData(analysisKey, analysis),
    onError: (cause) => toast.error(friendlyError(cause, "Couldn't request analysis.")),
  });

  const match = matchQuery.data ?? null;
  const moves = movesQuery.data ?? EMPTY_MOVES;
  const activePly = selectedPly ?? moves.length;

  const timeline = useMemo(
    () => (match ? [match.startingFen, ...moves.map((move) => move.fenAfter)] : []),
    [match, moves]
  );
  const safePly = Math.min(activePly, Math.max(0, timeline.length - 1));
  const activeFen = timeline[safePly] ?? match?.fen ?? null;
  const position = useMemo(
    () => (activeFen && match ? parseFen(activeFen, match.variant) : null),
    [activeFen, match]
  );
  const lastMove = useMemo(
    () =>
      safePly > 0 && moves[safePly - 1]
        ? (parseUci(moves[safePly - 1].uci, match?.variant) ?? [])
        : [],
    [match?.variant, moves, safePly]
  );
  const marks = useMemo(() => {
    const result: Record<number, ReturnType<typeof markFor>> = {};
    for (const entry of analysisQuery.data?.positions ?? []) {
      if (entry.ply > 0) result[entry.ply] = markFor(entry.classification);
    }
    return result;
  }, [analysisQuery.data?.positions]);

  if (matchQuery.isPending || movesQuery.isPending) {
    return <p className="py-16 text-center text-[14px] text-white/45">Loading review...</p>;
  }
  if (!match || !position || matchQuery.error || movesQuery.error) {
    const cause = matchQuery.error ?? movesQuery.error;
    return (
      <p className="py-16 text-center text-[14px] text-red-300">
        {friendlyError(cause, "This game could not be loaded.")}
      </p>
    );
  }

  const walletLower = wallet?.toLowerCase();
  const isWhite = match.white?.walletAddress.toLowerCase() === walletLower;
  const isBlack = match.black?.walletAddress.toLowerCase() === walletLower;
  const orientation: DraughtsSide = isBlack ? "black" : "white";
  const canRequest = match.state === "settled" && !!wallet && (isWhite || isBlack);

  return (
    <DraughtsWorkspace
      aside={
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => router.push(`/casino/checkers/play?match=${match.id}`)}
            className="cursor-pointer text-[13px] text-white/45 hover:text-white/80"
          >
            ← Back to game
          </button>
          <div className="border border-white/10 bg-white/[0.025] p-4">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] text-white/30 uppercase">
              {variantOption(match.variant).label}
            </p>
            <p className="mt-2 text-[18px] font-semibold text-white/85">{resultText(match)}</p>
            <div className="mt-3 space-y-2 text-[12px] text-white/48">
              <p>
                {playerName(match, "white")}
                {ratingLine(match, "white") ? ` · ${ratingLine(match, "white")}` : ""}
              </p>
              <p>
                {playerName(match, "black")}
                {ratingLine(match, "black") ? ` · ${ratingLine(match, "black")}` : ""}
              </p>
              <p>{match.timeControl}</p>
            </div>
          </div>
        </div>
      }
      board={
        <DraughtsBoardView
          board={position.board}
          variant={match.variant}
          orientation={orientation}
          lastMove={lastMove}
        />
      }
      panel={
        <div className="flex h-full min-h-0 flex-col">
          <div className={DRAUGHTS_PANEL_HEADER_CLASS}>
            <button
              type="button"
              onClick={() => setTab("moves")}
              className={`relative h-12 px-4 text-[12px] font-semibold ${tab === "moves" ? "text-white" : "text-white/38"}`}
            >
              Moves
            </button>
            <button
              type="button"
              onClick={() => setTab("comments")}
              className={`relative h-12 px-4 text-[12px] font-semibold ${tab === "comments" ? "text-white" : "text-white/38"}`}
            >
              Comments
            </button>
          </div>
          {tab === "comments" ? (
            <MatchComments
              match={match}
              wallet={wallet}
              ply={safePly}
              className="min-h-0 flex-1 p-4"
            />
          ) : (
            <>
              <DraughtsMoveTable
                moves={moves.map((move) => move.san)}
                activePly={safePly}
                marks={marks}
                onSelect={setSelectedPly}
              />
              <AnalysisCard
                match={match}
                activePly={safePly}
                canRequest={canRequest}
                requesting={request.isPending}
                onRequest={() => wallet && request.mutate(wallet)}
                analysis={analysisQuery.data ?? null}
              />
              <DraughtsReplayControls
                activePly={safePly}
                totalPlies={moves.length}
                onSelect={setSelectedPly}
              />
            </>
          )}
        </div>
      }
      controls={
        <div className="pr-[2.6%] text-right text-[12px] text-white/38">
          Saved server review · depth {analysisQuery.data?.depth ?? "-"}
        </div>
      }
    />
  );
}
