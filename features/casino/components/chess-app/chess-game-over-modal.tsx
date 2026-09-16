"use client";

import { useTranslations } from "next-intl";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { motion, useReducedMotion } from "motion/react";
import { fetchMatchAnalysis } from "@/features/casino/lib/api/chess";
import type { ChessColor, ChessMatch } from "@/features/casino/lib/api/types";
import {
  chessGameOverCounters,
  chessGameOverEventKey,
  chessGameOverPresentation,
  type ChessGameOverOutcome,
  type ChessGameOverReason,
} from "@/features/casino/lib/chess/game-over";
import { playGameEndSound } from "@/features/casino/lib/chess/sound";
import styles from "./chess-game-over-modal.module.css";

type Props = {
  match: ChessMatch;
  viewer: ChessColor | null;
  open: boolean;
  celebrate: boolean;
  announce: boolean;
  rematching: boolean;
  rematchLabel?: string;
  rematchDisabled?: boolean;
  anchorElement?: Element | null;
  onClose: () => void;
  onOpen?: () => void;
  onReview: () => void;
  onNewGame: () => void;
  onRematch?: () => Promise<void>;
};

type Seat = {
  name: string;
  rating: number | null;
  ratingDiff: number | null;
  clock: number;
};

function seat(match: ChessMatch, side: ChessColor): Seat {
  const longSide = side === "w" ? "white" : "black";
  const player = side === "w" ? match.white : match.black;
  const computer = match.computer?.side === longSide ? match.computer : null;
  const rating = side === "w" ? match.rating?.white : match.rating?.black;
  return {
    name: computer?.name ?? player?.username.trim() ?? (side === "w" ? "White" : "Black"),
    rating: rating?.rating ?? computer?.rating ?? player?.rating ?? null,
    ratingDiff: rating?.diff ?? null,
    clock: match.clocks[side],
  };
}

// next-intl's translator for this modal's namespace. Passed into the string
// helpers rather than called inside them, so they stay pure and testable.
type Translate = (key: string, values?: Record<string, string | number>) => string;

function headline(t: Translate, outcome: ChessGameOverOutcome, winner: Seat | null): string {
  if (outcome === "win") return t("won");
  if (outcome === "loss") return t("lost");
  if (outcome === "draw") return t("drawn");
  if (outcome === "aborted") return t("aborted");
  return winner ? t("winnerWon", { name: winner.name }) : t("gameOver");
}

function reasonCopy(
  t: Translate,
  reason: ChessGameOverReason,
  winner: Seat | null,
  loser: Seat | null
): string {
  switch (reason) {
    case "checkmate":
      return winner ? t("checkmateBy", { name: winner.name }) : t("checkmate");
    case "resignation":
      return loser ? t("resigned", { name: loser.name }) : t("resignation");
    case "timeout":
      return loser ? t("ranOutOfTime", { name: loser.name }) : t("onTime");
    case "stalemate":
      return t("stalemate");
    case "agreement":
      return t("agreement");
    case "repetition":
      return t("repetition");
    case "insufficient":
      return t("insufficient");
    case "fifty_move_rule":
      return t("fiftyMoveRule");
    case "timeout_insufficient":
      return t("timeoutInsufficient");
    case "variant_end":
      return t("variantEnd");
    case "aborted":
      return t("noResult");
    case "unknown":
      return winner ? t("wonTheGame", { name: winner.name }) : t("complete");
  }
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function newGameLabel(t: Translate, match: ChessMatch): string {
  if (match.clockMode === "unlimited") return t("newGame");
  const first = match.timeControl.split("+")[0] ?? "";
  return /^\d+$/.test(first) ? t("newGameMinutes", { minutes: first }) : t("newGame");
}

function coachMessage(t: Translate, outcome: ChessGameOverOutcome, analysisReady: boolean): string {
  if (analysisReady) return t("coachReady");
  if (outcome === "win") return t("coachWin");
  if (outcome === "loss") return t("coachLoss");
  if (outcome === "draw") return t("coachDraw");
  if (outcome === "spectator") return t("coachSpectator");
  return t("coachAborted");
}

function TrophyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 fill-none text-[#f6bd39]">
      <path d="M10 5h12v5c0 5-2.5 8-6 8s-6-3-6-8V5Z" fill="currentColor" />
      <path
        d="M10 8H6c0 4 1.5 6 5.5 6M22 8h4c0 4-1.5 6-5.5 6"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path d="M16 18v5m-5 4h10M13 23h6v4h-6z" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function LossIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 fill-none text-[#e86b60]">
      <path d="M9 27V5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path
        d="M10 6h14l-3.5 5L24 16H10"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DrawIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 fill-none text-[#b7b5b2]">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 13h12M10 19h12" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}

function AbortedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 fill-none text-[#8d8a86]">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M11.5 11.5l9 9m0-9-9 9"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResultIcon({ outcome }: { outcome: ChessGameOverOutcome }) {
  if (outcome === "loss") return <LossIcon />;
  if (outcome === "draw") return <DrawIcon />;
  if (outcome === "aborted") return <AbortedIcon />;
  return <TrophyIcon />;
}

function ScoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 fill-none text-[#d6b66e]">
      <rect x="5" y="5" width="22" height="22" rx="3" stroke="currentColor" strokeWidth="2.2" />
      <path d="M16 5v22M5 16h22" stroke="currentColor" strokeWidth="2" />
      <path d="M6 6h9v9H6zm11 11h9v9h-9z" fill="currentColor" opacity=".4" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className="h-14 w-14 fill-none">
      <path d="M8 64c1-14 10-21 24-21s23 7 24 21H8Z" fill="#365262" />
      <path d="M25 39h14v10H25z" fill="#d29a6a" />
      <path
        d="M18 23c0-10 5-17 14-17s14 7 14 17v8c0 10-6 17-14 17S18 41 18 31v-8Z"
        fill="#e4ad7b"
      />
      <path d="M18 24C15 11 23 4 33 4c9 0 16 6 14 18-5-1-10-4-13-9-3 6-9 9-16 11Z" fill="#654225" />
      <path
        d="M20 32c2 9 6 14 12 14s10-5 12-14c-2 2-5 3-8 2-2 3-6 3-8 0-3 1-6 0-8-2Z"
        fill="#754c2c"
      />
      <path d="M20 27h10v6H20zm14 0h10v6H34zM30 29h4" stroke="#302e2b" strokeWidth="2" />
      <circle cx="25" cy="30" r="1" fill="#302e2b" />
      <circle cx="39" cy="30" r="1" fill="#302e2b" />
      <path d="M29 39c2 1.5 4 1.5 6 0" stroke="#f5dfc4" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m23 47 9 8 9-8 5 17H18l5-17Z" fill="#f1f1ef" />
    </svg>
  );
}

function RatingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 fill-none text-[#81b64c]">
      <circle cx="16" cy="17" r="10" fill="currentColor" />
      <path d="M16 10v7l4 3" stroke="#f4f4f2" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M13 3h6M16 3v4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Counter({
  tone,
  value,
  label,
}: {
  tone: "good" | "mistake" | "blunder";
  value: number | null;
  label: string;
}) {
  const colors = {
    good: "text-[#81b64c]",
    mistake: "text-[#f0c75e]",
    blunder: "text-[#e86b60]",
  } as const;
  const symbols = { good: "★", mistake: "!", blunder: "x" } as const;
  return (
    <div className={styles.counter}>
      <div className={`${styles.counterIcon} ${colors[tone]}`}>{symbols[tone]}</div>
      {value === null ? null : <p className={styles.counterValue}>{value}</p>}
      {value === null ? null : <p className={styles.counterLabel}>{label}</p>}
    </div>
  );
}

export function ChessGameOverModal({
  match,
  viewer,
  open,
  celebrate,
  announce,
  rematching,
  rematchLabel,
  rematchDisabled = false,
  anchorElement,
  onClose,
  onOpen,
  onReview,
  onNewGame,
  onRematch,
}: Props) {
  const t = useTranslations("casino.chess.gameOver");
  const reduceMotion = useReducedMotion();
  const closeModal = useEffectEvent(onClose);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const announcedRef = useRef<string | null>(null);
  const celebratedRef = useRef<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState({ left: "50vw", top: "50dvh" });
  const presentation = chessGameOverPresentation(match, viewer);
  const eventKey = chessGameOverEventKey(match);
  const white = seat(match, "w");
  const black = seat(match, "b");
  const viewerSeat = viewer === "b" ? black : viewer === "w" ? white : null;
  const opponentSeat = viewer === "b" ? white : black;
  const winner = presentation.winner === "w" ? white : presentation.winner === "b" ? black : null;
  const loser = presentation.loser === "w" ? white : presentation.loser === "b" ? black : null;
  const analysis = useQuery({
    queryKey: ["casino", "chess", "game-over-analysis", match.id],
    queryFn: () => fetchMatchAnalysis(match.id),
    enabled: open && match.state === "settled",
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 3_000 : false;
    },
  });
  const counters = chessGameOverCounters(analysis.data, viewer);

  useLayoutEffect(() => {
    if (!open) return;
    const updateAnchor = () => {
      const rect = anchorElement?.getBoundingClientRect();
      if (window.innerWidth >= 900 && rect && rect.width > 0 && rect.height > 0) {
        setAnchor({
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.top + rect.height / 2}px`,
        });
      } else setAnchor({ left: "50vw", top: "50dvh" });
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    const observer = anchorElement ? new ResizeObserver(updateAnchor) : null;
    if (anchorElement) observer?.observe(anchorElement);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      observer?.disconnect();
    };
  }, [anchorElement, open]);

  useEffect(() => {
    if (!open) return;
    setActionError(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [eventKey, open]);

  useEffect(() => {
    if (!open || !announce || announcedRef.current === eventKey) return;
    announcedRef.current = eventKey;
    if (presentation.outcome === "win" || presentation.outcome === "loss")
      playGameEndSound(presentation.outcome);
    else if (presentation.outcome === "draw") playGameEndSound("draw");
  }, [announce, eventKey, open, presentation.outcome]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !celebrate || reduceMotion || !canvas || celebratedRef.current === eventKey)
      return;
    celebratedRef.current = eventKey;
    const burst = confetti.create(canvas, { resize: true, useWorker: true });
    burst({
      particleCount: 90,
      spread: 76,
      startVelocity: 34,
      gravity: 0.9,
      origin: { x: 0.5, y: 0.35 },
      colors: ["#81b64c", "#f6bd39", "#ffffff", "#5d9cec"],
    });
    const timer = window.setTimeout(() => {
      burst({ particleCount: 36, angle: 60, spread: 55, origin: { x: 0, y: 0.65 } });
      burst({ particleCount: 36, angle: 120, spread: 55, origin: { x: 1, y: 0.65 } });
    }, 240);
    return () => {
      window.clearTimeout(timer);
      burst.reset();
    };
  }, [celebrate, eventKey, open, reduceMotion]);

  if (typeof document === "undefined") return null;
  if (!open) {
    return onOpen
      ? createPortal(
          <button type="button" className={styles.reopenButton} onClick={onOpen}>
            <span aria-hidden="true">★</span>
            {t("gameResult")}
          </button>,
          document.body
        )
      : null;
  }
  const resultScore =
    match.result?.kind === "draw"
      ? "1/2 - 1/2"
      : presentation.winner === "w"
        ? "1 - 0"
        : presentation.winner === "b"
          ? "0 - 1"
          : "-";
  const analysisReady = analysis.data?.status === "completed" && !!counters;
  const rematch = async () => {
    if (!onRematch) return;
    setActionError(null);
    try {
      await onRematch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("rematchFailed"));
    }
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[10000]">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 h-full w-full" />
      <div className={styles.positioner} style={anchor}>
        <motion.section
          role="dialog"
          aria-labelledby="ark-chess-game-over-title"
          className={styles.card}
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
        >
          <button
            type="button"
            aria-label={t("closeGameResult")}
            className={styles.closeButton}
            onClick={onClose}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" />
            </svg>
          </button>
          <header className={styles.header}>
            <div className={styles.headlineRow}>
              <ResultIcon outcome={presentation.outcome} />
              <h2 id="ark-chess-game-over-title" className={styles.title}>
                {headline(t, presentation.outcome, winner)}
              </h2>
            </div>
            <p className={styles.reason}>{reasonCopy(t, presentation.reason, winner, loser)}</p>
          </header>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <RatingIcon />
              <div className={styles.metricCopy}>
                <p className={styles.metricValue}>
                  {viewerSeat?.rating ?? t("unrated")}
                  {viewerSeat?.ratingDiff !== null && viewerSeat?.ratingDiff !== undefined ? (
                    <span
                      className={
                        viewerSeat.ratingDiff >= 0 ? styles.positiveChange : styles.negativeChange
                      }
                    >
                      {viewerSeat.ratingDiff >= 0 ? "+" : ""}
                      {viewerSeat.ratingDiff}
                    </span>
                  ) : null}
                </p>
                <p className={styles.metricLabel}>{t("rating")}</p>
              </div>
            </div>
            <div className={styles.metric}>
              <ScoreIcon />
              <div className={styles.metricCopy}>
                <p className={styles.metricValue}>{resultScore}</p>
                <p className={styles.metricLabel}>{t("finalScore")}</p>
              </div>
            </div>
          </div>
          <div className={styles.analysisStage}>
            <div className={styles.coachRow}>
              <div className={styles.coachAvatar}>
                <CoachIcon />
              </div>
              <div className={styles.coachBubble}>
                {coachMessage(t, presentation.outcome, analysisReady)}
              </div>
            </div>
            {presentation.outcome !== "aborted" ? (
              <div className={styles.counters}>
                <Counter tone="good" value={counters?.bestAndGood ?? null} label={t("bestGood")} />
                <Counter
                  tone="mistake"
                  value={counters?.mistakesAndInaccuracies ?? null}
                  label={t("mistakes")}
                />
                <Counter tone="blunder" value={counters?.blunders ?? null} label={t("blunders")} />
              </div>
            ) : null}
          </div>
          <div className={styles.gameMeta}>
            {viewerSeat ? (
              <span>
                {t("you")} {formatClock(viewerSeat.clock)}
              </span>
            ) : null}
            {viewerSeat ? <span aria-hidden="true">/</span> : null}
            <span>
              {viewerSeat
                ? `${opponentSeat.name} ${formatClock(opponentSeat.clock)}`
                : match.timeControl}
            </span>
            {match.stakeUsdc ? (
              <span className={styles.stake}>/ {match.stakeUsdc} USDC</span>
            ) : null}
          </div>
          {actionError ? (
            <p role="alert" className={styles.actionError}>
              {actionError}
            </p>
          ) : null}
          <footer className={styles.footer}>
            <button type="button" className={styles.primaryAction} onClick={onReview}>
              <span className={styles.reviewIcon}>★</span>
              {t("gameReview")}
            </button>
            <div className={styles.secondaryActions}>
              <button type="button" className={styles.secondaryAction} onClick={onNewGame}>
                <span aria-hidden="true">+</span> {newGameLabel(t, match)}
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={!onRematch || rematching || rematchDisabled}
                onClick={() => void rematch()}
              >
                <span aria-hidden="true">↻</span>
                {rematching ? t("requesting") : (rematchLabel ?? t("rematch"))}
              </button>
            </div>
          </footer>
        </motion.section>
      </div>
    </div>,
    document.body
  );
}
