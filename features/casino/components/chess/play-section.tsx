"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMatchMoves } from "@/features/casino/lib/api/chess";
import {
  CHESS_KEYS,
  useChessMatch,
  useChessMatchSocial,
} from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessEngine } from "@/features/casino/hooks/use-chess-engine";
import { CASHIER_KEYS, useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { useChessProducts } from "@/features/casino/hooks/use-chess-products";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { CapturedRow } from "@/features/casino/components/chess/captured-row";
import { BoardThemePicker } from "@/features/casino/components/chess/board-theme-picker";
import { useBoardTheme } from "@/features/casino/lib/chess/board-theme";
import { ModalShell } from "@/components/ui/modal-shell";
import { QrCode } from "@/components/ui/qr-code";
import {
  formatChatTime,
  matchActorLabel,
  playerDisplayName,
} from "@/features/casino/lib/chess/social";
import { LiveChatFeed } from "@/features/casino/components/live-chat-feed";
import { identifyOpening } from "@/features/casino/lib/chess/openings";
import { formatEngineScore, uciToSan } from "@/features/casino/lib/chess/engine-analysis";
import { CHESS_CARD_BG, CHESS_CARD_SHADOW, CHESS_SURFACE_BG } from "@/features/casino/lib/chess/ui";
import {
  armAudioUnlock,
  moveSoundFromSan,
  playGameEndSound,
  playMoveSound,
} from "@/features/casino/lib/chess/sound";
import { FinalCountdown } from "@/features/casino/components/chess/final-countdown";
import { CasinoEmpty, CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  capturedFromBoard,
  fromUci,
  isInCheck,
  kingPos,
  legalMovesForSquare,
  parseFen,
  toUci,
  type Square,
} from "@/features/casino/lib/chess/engine";
import { friendlyError, isConflictError } from "@/lib/errors";
import { track } from "@/lib/analytics/mixpanel";
import { computerGamePayout, gamePayout } from "@/lib/analytics/game-result";
import { hasPositiveUsdc } from "@/features/casino/lib/api/cashier";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import type {
  ChessChatRoom,
  ChessColor,
  ChessMatch,
  ChessMatchComment,
  ChessCoachMoveReview,
  ChessComputerCoachSummary,
} from "@/features/casino/lib/api/types";
import type { ChessMoveWire } from "@/features/casino/lib/api/chess-wire";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function formatRoundClock(mode: ChessMatch["clockMode"], totalSeconds: number): string {
  return mode === "unlimited" ? "∞" : formatClock(totalSeconds);
}

function initialClockSecondsFromTimeControl(tc: string): number {
  const [initialPart] = tc.split("+");
  const initialMinutes = Number.parseInt(initialPart, 10);
  return Number.isFinite(initialMinutes) && initialMinutes > 0 ? initialMinutes * 60 : 300;
}

// A running clock reads as urgent under 20s and critical under 10s, the way the
// board turns a side's clock red as its flag approaches. Only a live game warns:
// a finished game's frozen clock is never "about to end".
const LOW_CLOCK_SECONDS = 20;
const CRITICAL_CLOCK_SECONDS = 10;

// Tailwind classes that tint a clock chip by how little time is left; empty when
// the clock is comfortable, so the caller keeps its normal styling.
function lowClockClass(seconds: number, live: boolean): string {
  if (!live || seconds <= 0 || seconds > LOW_CLOCK_SECONDS) return "";
  return seconds <= CRITICAL_CLOCK_SECONDS
    ? "border-down/70 text-down animate-pulse border"
    : "text-down/70";
}

// A small clock glyph next to the time, the way chess.com and lila mark the
// side's clock.
function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[0.62em] w-[0.62em] shrink-0 opacity-55" aria-hidden>
      <path
        fill="currentColor"
        d="M10 0a10 10 0 100 20A10 10 0 0010 0zm0 2.4a7.6 7.6 0 110 15.2 7.6 7.6 0 010-15.2zM8.9 4.8v5.7l4.6 2.7.9-1.6-3.7-2.2V4.8z"
      />
    </svg>
  );
}

function PaidMatchActions({
  canHint,
  hintCredits,
  hintsUsed,
  requestingHint,
  onBuyHint,
  onHint,
  showExtension,
  canExtend,
  extensionUnavailableReason,
  extensionCredits,
  extensionsUsed,
  maxExtensions,
  extending,
  onBuyExtension,
  onExtend,
}: {
  canHint: boolean;
  hintCredits: number;
  hintsUsed: number;
  requestingHint: boolean;
  onBuyHint: () => void;
  onHint: () => void;
  showExtension: boolean;
  canExtend: boolean;
  extensionUnavailableReason: string | null;
  extensionCredits: number;
  extensionsUsed: number;
  maxExtensions: number;
  extending: boolean;
  onBuyExtension: () => void;
  onExtend: (seconds: 60 | 300 | 600) => void;
}) {
  if (!canHint && !showExtension) return null;
  return (
    <div className="mt-2 border-t border-white/8 pt-2">
      {canHint ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {hintCredits > 0 ? (
            <button
              type="button"
              onClick={onHint}
              disabled={requestingHint || hintsUsed >= 3}
              className={railActionButton}
            >
              {requestingHint ? "Finding move…" : `Hint (${hintCredits})`}
            </button>
          ) : (
            <button type="button" onClick={onBuyHint} className={railActionButton}>
              Buy hint · 3 USDC
            </button>
          )}
          <span className="text-[10px] text-white/34">{hintsUsed}/3 used</span>
        </div>
      ) : null}
      {showExtension ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {canExtend && extensionCredits > 0 ? (
            ([60, 300, 600] as const).map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => onExtend(seconds)}
                disabled={extending || extensionsUsed >= maxExtensions}
                className={railActionButton}
              >
                +{seconds / 60}m
              </button>
            ))
          ) : canExtend ? (
            <button type="button" onClick={onBuyExtension} className={railActionButton}>
              Buy clock extension · 3 USDC
            </button>
          ) : (
            <button type="button" disabled className={railActionButton}>
              Clock extension unavailable
            </button>
          )}
          <span className="text-[10px] text-white/34">
            {canExtend
              ? `${extensionsUsed}/${maxExtensions} used · adds time to both clocks`
              : extensionUnavailableReason}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function FlameBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 opacity-70" aria-hidden>
      <path
        fill="currentColor"
        d="M13.7 2.3c.4 2.1-.4 3.4-1.3 4.8-.9 1.4-1.9 2.9-1.8 5 0 1.1.3 2 .9 2.8-.1-1.4.5-2.3 1.2-3.1.9-1.1 2-2.2 2.2-4.5 2.7 1.8 5.1 4.9 5.1 8.6 0 3.8-2.9 6.9-7 6.9-4 0-7-2.8-7-6.8 0-4.7 3.3-7.5 5.1-10.1.9-1.3 1.6-2.5 1.7-4.1.3.1.6.2.9.5Z"
      />
    </svg>
  );
}

function formatMatchAge(createdAt: string, nowMs: number | null): string | null {
  if (nowMs === null) return null;
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return null;
  const diffSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  if (diffSeconds < 60)
    return `${Math.max(1, diffSeconds)} second${diffSeconds === 1 ? "" : "s"} ago`;
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diffSeconds / 86400);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function timeControlCategory(tc: string): "Bullet" | "Blitz" | "Rapid" {
  if (tc.endsWith("s")) return "Bullet";
  const [initialPart, incrementPart = "0"] = tc.split("+");
  const initialMinutes = Number.parseInt(initialPart, 10);
  const incrementSeconds = Number.parseInt(incrementPart, 10);
  const estimatedSeconds = initialMinutes * 60 + incrementSeconds * 40;
  if (estimatedSeconds <= 120) return "Bullet";
  if (estimatedSeconds <= 480) return "Blitz";
  return "Rapid";
}

function withSeatRating(
  label: string,
  player: { rating: number | null; provisional?: boolean | null } | null
): string {
  if (!player || player.rating === null) return label;
  return `${label} (${player.rating}${player.provisional ? "?" : ""})`;
}

type Translator = ReturnType<typeof useTranslations>;

const DRAW_REASON_KEYS = {
  stalemate: "reasonStalemate",
  agreement: "reasonAgreement",
  repetition: "reasonRepetition",
  insufficient: "reasonInsufficient",
} as const;

function resultLine(t: Translator, match: ChessMatch, you: ChessColor | null): string {
  const r = match.result;
  if (!r) return match.state === "cancelled" ? t("resultAborted") : "";
  if (r.kind === "draw") return t("resultDraw", { reason: t(DRAW_REASON_KEYS[r.reason]) });
  const how =
    r.kind === "checkmate"
      ? t("howCheckmate")
      : r.kind === "resignation"
        ? t("howResignation")
        : t("howTimeout");
  if (you === null) {
    return r.winner === "w" ? t("resultWhiteWon", { how }) : t("resultBlackWon", { how });
  }
  return r.winner === you ? t("resultYouWon", { how }) : t("resultYouLost", { how });
}

const actionButton =
  "cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50";

const railActionButton =
  "cursor-pointer rounded-[2px] border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/68 transition-colors hover:border-white/24 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

const railDangerActionButton =
  "cursor-pointer rounded-[2px] border border-[#654646] bg-transparent px-2.5 py-1 text-[11px] font-medium text-[#d8a2a2] transition-colors hover:border-[#8f6161] hover:text-[#f1bcbc] disabled:cursor-not-allowed disabled:opacity-40";

const EMPTY_TAKEBACK = { white: false, black: false, takebackable: false } as const;
const EMPTY_REMATCH = { offeredBy: null, nextMatchId: null } as const;

type PromotionOption = "q" | "r" | "b" | "n";
type MobileRoundPanel = "moves" | "chat" | "info" | null;

const ROUND_DESKTOP_BREAKPOINT = 900;

function isDesktopRoundViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= ROUND_DESKTOP_BREAKPOINT;
}

const PROMOTION_LABEL: Record<PromotionOption, string> = {
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
};

const PROMOTION_TEXT_KEY: Record<
  PromotionOption,
  "promotionQ" | "promotionR" | "promotionB" | "promotionN"
> = {
  q: "promotionQ",
  r: "promotionR",
  b: "promotionB",
  n: "promotionN",
};

function NoteEditor({
  initialValue,
  placeholder,
  saving,
  saveLabel,
  savingLabel,
  onSave,
}: {
  initialValue: string;
  placeholder: string;
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="min-h-[110px] w-full rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[13px] text-white outline-none placeholder:text-white/28"
      />
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => void onSave(value)}
          disabled={saving}
          className="cursor-pointer rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </>
  );
}

function CommentEditor({
  initialValue,
  placeholder,
  saving,
  saveLabel,
  savingLabel,
  onSave,
}: {
  initialValue: string;
  placeholder: string;
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="mt-4 space-y-2">
      <textarea
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="min-h-[84px] w-full rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[13px] text-white outline-none placeholder:text-white/28"
      />
      <div className="flex justify-end">
        <button
          onClick={() => void onSave(value)}
          disabled={saving || value.trim().length === 0}
          className="cursor-pointer rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}

function replayNavButtonClass(disabled: boolean): string {
  return `flex h-10 w-10 items-center justify-center rounded-[2px] border border-white/8 bg-white/[0.03] text-[18px] leading-none transition-colors ${
    disabled
      ? "cursor-not-allowed text-white/15"
      : "cursor-pointer text-white/55 hover:bg-white/[0.08] hover:text-white"
  }`;
}

function moveChipClass(active: boolean): string {
  return active
    ? "bg-[#3f4d62] text-white font-semibold"
    : "text-white/72 hover:bg-white/[0.05] hover:text-white";
}

function MobilePanelButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        active
          ? "border-white/30 bg-white/10 text-white"
          : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/22 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function LiveCoachPanel({
  review,
  message,
  busy,
  hinting,
  onHint,
  onUndo,
  onContinue,
}: {
  review: ChessCoachMoveReview | null;
  message: string;
  busy: boolean;
  hinting: boolean;
  onHint: () => void;
  onUndo: () => void;
  onContinue: () => void;
}) {
  const tone = review?.classification ?? "good";
  const accent =
    tone === "blunder" || tone === "mistake"
      ? "border-[#c96b5b]/35 bg-[#2a1b19] text-[#e3a49a]"
      : tone === "inaccuracy"
        ? "border-[#d6a84b]/30 bg-[#292316] text-[#e4c17a]"
        : "border-[#629924]/35 bg-[#1d2817] text-[#9ac66d]";
  return (
    <div className={`mt-3 rounded-[10px] border px-3.5 py-3 ${accent}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase">Coach</span>
        {busy ? <span className="text-[10px] text-white/38">Thinking…</span> : null}
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-white/70">{message}</p>
      {review?.bestSan && review.bestUci !== review.attemptedUci ? (
        <p className="mt-1.5 text-[11px] text-white/48">
          Compare it with <span className="font-semibold text-white/78">{review.bestSan}</span>.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!review ? (
          <button
            type="button"
            onClick={onHint}
            disabled={hinting || busy}
            className={railActionButton}
          >
            {hinting ? "Preparing hint…" : "Hint"}
          </button>
        ) : null}
        {review?.canUndo ? (
          <button type="button" onClick={onUndo} disabled={busy} className={railActionButton}>
            Undo move
          </button>
        ) : null}
        {review?.canContinue ? (
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="cursor-pointer rounded-[3px] border border-white/10 px-3 py-1.5 text-[11px] text-white/66 hover:text-white"
          >
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CoachGameSummaryPanel({ summary }: { summary: ChessComputerCoachSummary }) {
  const outcomeLabel =
    summary.outcome === "win"
      ? "You won"
      : summary.outcome === "draw"
        ? "Draw"
        : summary.outcome === "loss"
          ? "You lost"
          : "Game complete";
  const quality = [
    ["Best", summary.moveQuality.best],
    ["Good", summary.moveQuality.good],
    ["Inaccuracies", summary.moveQuality.inaccuracies],
    ["Mistakes", summary.moveQuality.mistakes],
    ["Blunders", summary.moveQuality.blunders],
  ] as const;

  return (
    <div className="mt-3 overflow-hidden rounded-[3px] border border-white/10 bg-[#262421]">
      <div className="border-b border-white/8 px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold tracking-[0.12em] text-white/42 uppercase">
            Coach review
          </span>
          <span className="text-[12px] font-semibold text-white/88">{outcomeLabel}</span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-[1.55] text-white/58">{summary.message}</p>
      </div>
      <div className="grid grid-cols-5 divide-x divide-white/8 border-b border-white/8">
        {quality.map(([label, value]) => (
          <div key={label} className="px-1 py-2 text-center">
            <div className="tnum text-[13px] font-semibold text-white/82">{value}</div>
            <div className="mt-0.5 truncate text-[8px] tracking-[0.04em] text-white/34 uppercase">
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 text-[10.5px] text-white/42">
        <span>
          {summary.reviewedMoves} reviewed / {summary.playerMoves} played
        </span>
        <span>
          {summary.help.hints} hints · {summary.help.undos} undos
        </span>
      </div>
    </div>
  );
}

function PostGameActions({
  result,
  ratingDiff,
  computerGame,
  canRematch,
  rematchReadyId,
  opponentRematchOffer,
  yourRematchOffer,
  requestingRematch,
  decliningRematch,
  onOpenRematch,
  onAcceptRematch,
  onOfferRematch,
  onDeclineRematch,
  onNewComputer,
  onReview,
  onLobby,
  t,
}: {
  result: string;
  ratingDiff: number | null;
  computerGame: boolean;
  canRematch: boolean;
  rematchReadyId: string | null;
  opponentRematchOffer: boolean;
  yourRematchOffer: boolean;
  requestingRematch: boolean;
  decliningRematch: boolean;
  onOpenRematch: () => void;
  onAcceptRematch: () => void;
  onOfferRematch: () => void;
  onDeclineRematch: () => void;
  onNewComputer: () => void;
  onReview: () => void;
  onLobby: () => void;
  t: Translator;
}) {
  const ratingText =
    ratingDiff === null ? null : ratingDiff > 0 ? `Rating +${ratingDiff}` : `Rating ${ratingDiff}`;

  return (
    <div className="border-t px-4 py-3" style={{ borderColor: "#3b3936", background: "#262421" }}>
      <div className="text-[0.98rem] font-semibold text-white/90">{result}</div>
      {ratingText ? (
        <div
          className={`tnum mt-1 text-[0.82rem] ${ratingDiff !== null && ratingDiff > 0 ? "text-up" : "text-down"}`}
        >
          {ratingText}
        </div>
      ) : null}

      {computerGame ? (
        <button type="button" onClick={onNewComputer} className={`${railActionButton} mt-3`}>
          {t("newComputerGame")}
        </button>
      ) : canRematch ? (
        rematchReadyId ? (
          <button type="button" onClick={onOpenRematch} className={`${railActionButton} mt-3`}>
            {t("openRematch")}
          </button>
        ) : opponentRematchOffer ? (
          <div className="mt-3">
            <div className="mb-2 text-[0.82rem] text-white/56">{t("opponentWantsRematch")}</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onAcceptRematch}
                disabled={requestingRematch}
                className={railActionButton}
              >
                {requestingRematch ? "…" : t("acceptRematch")}
              </button>
              <button
                type="button"
                onClick={onDeclineRematch}
                disabled={decliningRematch}
                className={railActionButton}
              >
                {decliningRematch ? "…" : t("declineRematch")}
              </button>
            </div>
          </div>
        ) : yourRematchOffer ? (
          <div className="mt-3">
            <div className="mb-2 text-[0.82rem] text-white/56">{t("rematchPending")}</div>
            <button
              type="button"
              onClick={onDeclineRematch}
              disabled={decliningRematch}
              className={railActionButton}
            >
              {decliningRematch ? "…" : t("cancelRematch")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOfferRematch}
            disabled={requestingRematch}
            className={`${railActionButton} mt-3`}
          >
            {requestingRematch ? "…" : t("rematch")}
          </button>
        )
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={onReview} className={railActionButton}>
          {t("reviewGame")}
        </button>
        <button type="button" onClick={onLobby} className={railActionButton}>
          {t("backToLobby")}
        </button>
      </div>
    </div>
  );
}
// The platform takes 5% of winnings on the games.
const CHESS_FEE_BPS = 500;

export function PlaySection({
  matchId,
  seatName = null,
}: {
  matchId: string | null;
  seatName?: string | null;
}) {
  const t = useTranslations("casino.chess.play");
  const tStake = useTranslations("casino.chess.stake");
  // The create screen owns the invite-link copy; the waiting board reuses it.
  const tCreate = useTranslations("casino.chess.create");
  const router = useRouter();
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  const products = useChessProducts();
  // Only the fee percentage is read here, for the settled-wager line.
  const { feePct } = useChessCashierStatus();
  const {
    match,
    clocks,
    you,
    isLoading,
    error,
    submitMove,
    moving,
    coachState,
    submitCoachedMove,
    coachingMove,
    continueCoachReview,
    continuingCoachReview,
    undoCoachReview,
    undoingCoachReview,
    requestCoachHint,
    requestingCoachHint,
    resign,
    resigning,
    offerDraw,
    claimDraw,
    claimingDraw,
    offeringDraw,
    respondToDraw,
    respondingToDraw,
    abort,
    aborting,
    rematch,
    requestingRematch,
    declineRematch,
    decliningRematch,
    takeback,
    requestingTakeback,
    declineTakeback,
    decliningTakeback,
    requestHint,
    requestingHint,
    extendTime,
    extendingTime,
    claimingTimeout,
  } = useChessMatch(matchId, seatName);
  const [selected, setSelected] = useState<Square | null>(null);
  const [hintGuidance, setHintGuidance] = useState<{
    fen: string;
    move: NonNullable<ReturnType<typeof fromUci>>;
  } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    fen: string;
    from: Square;
    to: Square;
    options: PromotionOption[];
  } | null>(null);
  const [coachMessage, setCoachMessage] = useState(
    "Make your move. I will explain the important moments and help when you ask."
  );
  const awaitingRematchRoute = useRef(false);
  const theme = useBoardTheme();
  const [mobilePanel, setMobilePanel] = useState<MobileRoundPanel>(null);
  const [desktopRoundLayout, setDesktopRoundLayout] = useState(isDesktopRoundViewport);
  const [relativeNowMs, setRelativeNowMs] = useState<number>(() => Date.now());
  const [chatDraft, setChatDraft] = useState("");
  const [showInviteQr, setShowInviteQr] = useState(false);
  const hintMove =
    match && hintGuidance && match.fen === hintGuidance.fen ? hintGuidance.move : null;
  const setHintMove = (
    move: ReturnType<typeof fromUci>,
    positionFen: string | null = match?.fen ?? null
  ) => {
    setHintGuidance(move && positionFen ? { fen: positionFen, move } : null);
  };
  const rematchReadyId = match?.rematch?.nextMatchId ?? null;
  const currentPly = match ? match.moves.length : null;
  const [replayPly, setReplayPly] = useState<number | null>(null);
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);
  const canUsePlayerChat = you !== null && match?.computer == null;
  const preferredChatRoom: ChessChatRoom = canUsePlayerChat ? "player" : "spectator";
  const {
    chatMessages,
    chatLoading,
    activeChatRoom,
    postChat,
    postingChat,
    note,
    saveNote,
    savingNote,
    comments,
    commentsLoading,
    upsertComment,
    savingComment,
    deleteComment,
    deletingComment,
  } = useChessMatchSocial(
    matchId,
    preferredChatRoom,
    canUsePlayerChat,
    currentPly,
    seatName,
    !!match && match.computer == null
  );
  const movesQuery = useQuery({
    queryKey: ["casino", "chess", "play-moves", matchId ?? "none", currentPly ?? 0],
    queryFn: () => fetchMatchMoves(matchId as string),
    enabled: !!matchId && (currentPly ?? 0) > 0,
  });

  // Unlock the audio context on the first gesture so the opponent's very first
  // move is audible even before this player has moved.
  useEffect(() => {
    armAudioUnlock();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setDesktopRoundLayout(isDesktopRoundViewport());
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // A soft "thock" whenever the move count grows — the player's own move and the
  // opponent's alike. The first render only records the starting count, so
  // opening a mid-game board is silent.
  const prevMoveCount = useRef<number | null>(null);
  const moveCount = match?.moves.length ?? null;
  const lastSan = moveCount ? (match?.moves[moveCount - 1] ?? "") : "";
  useEffect(() => {
    if (moveCount === null) return;
    if (prevMoveCount.current !== null && moveCount > prevMoveCount.current) {
      // The SAN carries the move's character — capture, check, castle, promote.
      playMoveSound(moveSoundFromSan(lastSan));
    }
    prevMoveCount.current = moveCount;
  }, [moveCount, lastSan]);

  // Resolve a game once even though state, gameOver and the reconcile poll can
  // all report the same finish. This is the round-controller handoff: stop local
  // interaction, return to the final position, sound the result, and refresh
  // the durable views that change after settlement.
  const sawInProgress = useRef(false);
  const handledTerminalMatch = useRef<string | null>(null);
  const inProgress = match?.state === "in_progress";
  const terminal = match?.state === "settled" || match?.state === "cancelled";
  const result = match?.result ?? null;
  useEffect(() => {
    if (inProgress) {
      sawInProgress.current = true;
      handledTerminalMatch.current = null;
      return;
    }
    if (
      !match ||
      !terminal ||
      (match.state === "settled" && !result) ||
      handledTerminalMatch.current === match.id
    ) {
      return;
    }
    handledTerminalMatch.current = match.id;

    setSelected(null);
    setPendingPromotion(null);
    setReplayPly(null);
    setMobilePanel(null);

    void queryClient.invalidateQueries({
      queryKey: ["casino", "chess", "play-moves", match.id],
    });
    void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.analysis(match.id) });
    if (wallet.address) {
      void queryClient.invalidateQueries({ queryKey: CHESS_KEYS.history(wallet.address) });
      void queryClient.invalidateQueries({ queryKey: CASHIER_KEYS.balance(wallet.address) });
    }

    if (!sawInProgress.current || !result) return;
    const outcome = result.kind === "draw" ? "draw" : result.winner === you ? "win" : "loss";
    playGameEndSound(outcome);
    // Same guards the sound uses: reported once, and only for someone who
    // watched the game finish rather than opening a settled one.
    if (you) {
      track("game_result", {
        game: "chess",
        result: outcome,
        reason:
          result.kind === "draw"
            ? "draw"
            : result.kind === "resignation"
              ? "resign"
              : result.kind === "timeout"
                ? "timeout"
                : "checkmate",
        ...(match?.computer?.wager
          ? computerGamePayout(match.computer.wager, outcome)
          : gamePayout(match?.stakeUsdc, outcome, CHESS_FEE_BPS)),
      });
    }
  }, [inProgress, match, queryClient, result, terminal, wallet.address, you]);

  useEffect(() => {
    if (!awaitingRematchRoute.current || !rematchReadyId) return;
    awaitingRematchRoute.current = false;
    router.push(`/casino/chess/play?match=${rematchReadyId}`);
  }, [rematchReadyId, router]);

  // The board is whatever the server says. A malformed FEN yields null rather
  // than a silently half-rendered position.
  const livePosition = useMemo(() => {
    if (!match) return null;
    try {
      return parseFen(match.fen);
    } catch {
      return null;
    }
  }, [match]);
  const detailedMoves = useMemo(() => movesQuery.data ?? [], [movesQuery.data]);
  const hasExactReplay = detailedMoves.length === (currentPly ?? 0);
  const replaySteps = useMemo<Array<Pick<ChessMoveWire, "ply" | "san" | "uci" | "fenAfter">>>(
    () =>
      hasExactReplay
        ? detailedMoves
        : (match?.moves ?? []).map((san, index) => ({
            ply: index + 1,
            san,
            uci: "",
            fenAfter: "",
          })),
    [detailedMoves, hasExactReplay, match?.moves]
  );
  const currentReplayPly = currentPly ?? 0;
  const viewingPly =
    replayPly === null ? currentReplayPly : Math.min(Math.max(replayPly, 0), currentReplayPly);
  const displayFen =
    replayPly !== null && replayPly !== currentReplayPly && hasExactReplay
      ? (replaySteps[viewingPly - 1]?.fenAfter ?? START_FEN)
      : (match?.fen ?? START_FEN);
  const displayPosition = useMemo(() => {
    try {
      return parseFen(displayFen);
    } catch {
      return null;
    }
  }, [displayFen]);
  const engine = useChessEngine(displayFen);
  const coachEnabled = match?.computer?.coachEnabled === true && !match.stakeUsdc;
  const coachReview = coachState?.pendingReview ?? null;
  const coachSummary = coachState?.summary ?? null;
  const coachGuidance = coachReview?.bestUci ? fromUci(coachReview.bestUci) : null;

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [viewingPly]);

  // Highlights are computed locally only so the board feels responsive. The
  // server revalidates every move, so a wrong hint can never become a wrong
  // result.
  const legalTargets = useMemo(() => {
    const yourTurn = !!match && match.state === "in_progress" && you !== null && match.turn === you;
    const ownClock = yourTurn && you !== null ? (clocks?.[you] ?? 0) : 1;
    if (!livePosition || !selected || !yourTurn || ownClock <= 0 || replayPly !== null) return [];
    return legalMovesForSquare(livePosition, selected.r, selected.c);
  }, [clocks, livePosition, match, replayPly, selected, you]);

  const targetSquares = useMemo(() => {
    const seen = new Set<string>();
    const squares: Square[] = [];
    for (const move of legalTargets) {
      const key = `${move.to.r}:${move.to.c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      squares.push(move.to);
    }
    return squares;
  }, [legalTargets]);
  const boardGuidance = coachGuidance ?? hintMove;
  const boardSelected = boardGuidance?.from ?? selected;
  const boardTargets = boardGuidance ? [boardGuidance.to] : targetSquares;
  const activePendingPromotion =
    pendingPromotion && match && pendingPromotion.fen === match.fen ? pendingPromotion : null;

  if (!matchId) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoEmpty>{t("noMatch")}</CasinoEmpty>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject={t("subject")} />
      </div>
    );
  }
  if (isLoading || !match || !livePosition || !displayPosition) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoLoading label={t("loading")} rows={5} />
      </div>
    );
  }

  const displayTurn = match.turn;
  const clockMode = match.clockMode ?? "real_time";
  const isComputerGame = match.computer != null;
  const takebackState = match.takeback ?? EMPTY_TAKEBACK;
  const rematchState = match.rematch ?? EMPTY_REMATCH;
  const yourTurn = match.state === "in_progress" && you !== null && displayTurn === you;
  const yourClockExpired =
    clockMode === "real_time" && yourTurn && you !== null && (clocks?.[you] ?? 0) <= 0;
  const position = livePosition;
  const replayPosition = displayPosition;
  const board = replayPosition.board;
  // Captured pieces and material lead, read straight off the board each render.
  const captured = capturedFromBoard(board);
  const capturedByColor = (colour: ChessColor) => (colour === "w" ? captured.b : captured.w);
  const leadFor = (colour: ChessColor) => {
    const advantage = colour === "w" ? captured.advantage : -captured.advantage;
    return advantage > 0 ? advantage : 0;
  };
  const over = match.state === "settled" || match.state === "cancelled";
  const yourRatingDiff =
    you === "w"
      ? (match.rating?.white.diff ?? null)
      : you === "b"
        ? (match.rating?.black.diff ?? null)
        : null;
  const waiting = match.state === "awaiting_opponent";
  // An offer from the other side is the one this player can answer.
  const offerToAnswer = you !== null && match.drawOffered !== null && match.drawOffered !== you;
  const offerPending = you !== null && match.drawOffered === you;
  const yourWallet =
    you === "w"
      ? (match.white?.walletAddress ?? null)
      : you === "b"
        ? (match.black?.walletAddress ?? null)
        : null;
  const rematchOfferBy = rematchState.offeredBy?.toLowerCase() ?? null;
  const yourRematchOffer =
    !!yourWallet && rematchOfferBy !== null && rematchOfferBy === yourWallet.toLowerCase();
  const opponentRematchOffer =
    !!yourWallet && rematchOfferBy !== null && rematchOfferBy !== yourWallet.toLowerCase();
  const takebackOfferedByYou =
    you === "w" ? takebackState.white : you === "b" ? takebackState.black : false;
  const takebackOfferToAnswer =
    you === "w" ? takebackState.black : you === "b" ? takebackState.white : false;
  const takebackPending = takebackOfferedByYou && !takebackOfferToAnswer;

  const coachBusy = coachingMove || continuingCoachReview || undoingCoachReview;

  const proposeMove = async (uci: string) => {
    try {
      if (coachEnabled) {
        setCoachMessage("I am checking what changed in the position…");
        const review = await submitCoachedMove(uci);
        setCoachMessage(review.message);
      } else {
        await submitMove(uci);
      }
    } catch (error) {
      setCoachMessage("I could not review that move. The board has not been changed twice.");
      toast.error(friendlyError(error, t("toastMoveFailed")));
    }
  };

  const onCoachUndo = async () => {
    if (!coachReview) return;
    try {
      await undoCoachReview(coachReview.attemptId);
      setHintMove(null);
      setSelected(null);
      setCoachMessage("The move is back. Take another look before choosing.");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't undo the coached move."));
    }
  };

  const onCoachContinue = async () => {
    if (!coachReview) return;
    try {
      await continueCoachReview(coachReview.attemptId);
      setHintMove(null);
      setCoachMessage("Good. Now watch how the position answers your move.");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't continue the coached game."));
    }
  };

  const onCoachHint = async () => {
    try {
      const hint = await requestCoachHint();
      setCoachMessage(hint.message);
      setHintMove(hint.suggestedUci ? fromUci(hint.suggestedUci) : null);
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't prepare a coach hint."));
    }
  };

  const onSquareClick = async (r: number, c: number) => {
    if (!yourTurn || yourClockExpired || moving || coachBusy || coachReview) return;
    if (selected && targetSquares.some((t) => t.r === r && t.c === c)) {
      const matching = legalTargets.filter((move) => move.to.r === r && move.to.c === c);
      const promotions = Array.from(
        new Set(
          matching
            .map((move) => move.promotion)
            .filter(
              (value): value is PromotionOption =>
                value === "q" || value === "r" || value === "b" || value === "n"
            )
        )
      );
      if (promotions.length > 0) {
        setPendingPromotion({ fen: match.fen, from: selected, to: { r, c }, options: promotions });
        return;
      }
      const uci = toUci(position, selected, { r, c });
      setPendingPromotion(null);
      setSelected(null);
      await proposeMove(uci);
      return;
    }
    const piece = board[r][c];
    setHintMove(null);
    setPendingPromotion(null);
    setSelected(piece && piece.color === you ? { r, c } : null);
  };

  const onPromotionChoice = async (promotion: PromotionOption) => {
    if (!activePendingPromotion || yourClockExpired || coachBusy || coachReview) return;
    const uci = toUci(position, activePendingPromotion.from, activePendingPromotion.to, promotion);
    setPendingPromotion(null);
    setSelected(null);
    await proposeMove(uci);
  };

  const onOfferDraw = async () => {
    try {
      await offerDraw();
      toast.success(t("toastDrawOffered"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastDrawOfferFailed")));
    }
  };

  const onAnswerDraw = async (accept: boolean) => {
    try {
      await respondToDraw(accept);
      toast.success(accept ? t("toastDrawAgreed") : t("toastDrawDeclined"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastDrawAnswerFailed")));
    }
  };

  // Threefold repetition / fifty-move draws are claimed, not automatic. The
  // server arbitrates; an unfounded claim comes back as a clear rejection.
  const onClaimDraw = async () => {
    try {
      await claimDraw();
      toast.success(t("toastDrawClaimed"));
    } catch {
      toast.error(t("toastNoClaimableDraw"));
    }
  };

  const onResign = async () => {
    const id = toast.loading(t("toastResigning"));
    try {
      await resign();
      toast.success(t("toastResigned"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastResignFailed")), { id });
    }
  };

  const onAbort = async () => {
    const id = toast.loading(t("toastAborting"));
    try {
      await abort();
      toast.success(t("toastAborted"), { id });
      router.push("/casino/chess");
    } catch (e) {
      toast.error(friendlyError(e, t("toastAbortFailed")), { id });
    }
  };

  const onRematch = async () => {
    const id = toast.loading(t("toastRematchOpening"));
    try {
      const next = await rematch();
      if (next.rematch.nextMatchId) {
        toast.success(t("toastRematchOn"), { id });
        router.push(`/casino/chess/play?match=${next.rematch.nextMatchId}`);
      } else {
        awaitingRematchRoute.current = true;
        toast.success(t("toastRematchOpened"), { id });
      }
    } catch (e) {
      toast.error(friendlyError(e, t("toastRematchFailed")), { id });
    }
  };

  const onAcceptRematch = async () => {
    const id = toast.loading(t("toastRematchJoining"));
    try {
      const next = await rematch();
      if (!next.rematch.nextMatchId) {
        throw new Error(t("toastRematchJoinFailed"));
      }
      toast.success(t("toastRematchOn"), { id });
      router.push(`/casino/chess/play?match=${next.rematch.nextMatchId}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastRematchJoinFailed")), { id });
    }
  };

  const onDeclineRematch = async () => {
    const id = toast.loading(t("toastRematchDeclining"));
    try {
      awaitingRematchRoute.current = false;
      await declineRematch();
      toast.success(t("toastRematchDeclined"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastRematchDeclineFailed")), { id });
    }
  };

  const onTakeback = async () => {
    const accepting = takebackOfferToAnswer;
    const id = toast.loading(accepting ? t("toastTakebackAccepting") : t("toastTakebackOffering"));
    try {
      await takeback();
      toast.success(accepting ? t("toastTakebackAccepted") : t("toastTakebackOffered"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastTakebackFailed")), { id });
    }
  };

  const onDeclineTakeback = async () => {
    const id = toast.loading(t("toastTakebackDeclining"));
    try {
      await declineTakeback();
      toast.success(t("toastTakebackDeclined"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastTakebackDeclineFailed")), { id });
    }
  };

  const onRequestHint = async () => {
    try {
      const hint = await requestHint();
      const move = fromUci(hint.suggestedUci);
      setHintMove(move);
      toast.success(move ? `Suggested move: ${hint.suggestedUci}` : "Hint ready.");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't get a hint right now."));
    }
  };

  const onExtendTime = async (seconds: 60 | 300 | 600) => {
    try {
      await extendTime(seconds);
      toast.success(`Added ${seconds / 60} minute${seconds === 60 ? "" : "s"} to both clocks.`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't extend this game."));
    }
  };

  const onBuyCredit = async (product: "hint_credit" | "time_extension_credit") => {
    try {
      await products.purchase(product);
      toast.success(product === "hint_credit" ? "Hint credit ready." : "Clock credit ready.");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't buy that credit."));
    }
  };

  const onPostChat = async () => {
    const text = chatDraft.trim();
    if (!text) return;
    try {
      await postChat({ room: activeChatRoom, text });
      setChatDraft("");
    } catch (e) {
      toast.error(
        isConflictError(e) ? t("toastChatConflict") : friendlyError(e, t("toastChatFailed"))
      );
    }
  };

  const onSaveNote = async (text: string) => {
    try {
      await saveNote(text);
      toast.success(t("toastNoteSaved"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastNoteFailed")));
    }
  };

  const onSaveComment = async (text: string) => {
    if (currentPly === null) return;
    try {
      await upsertComment({ ply: currentPly, text });
      toast.success(t("toastCommentSaved"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastCommentFailed")));
    }
  };

  const onDeleteComment = async (comment: ChessMatchComment) => {
    try {
      await deleteComment({ commentId: comment.id, ply: comment.ply });
      toast.success(t("toastCommentDeleted"));
    } catch (e) {
      toast.error(friendlyError(e, t("toastCommentDeleteFailed")));
    }
  };

  const opponent = you === "w" ? match.black : match.white;
  const self = you === "w" ? match.white : match.black;
  const opponentColor: ChessColor = you === "w" ? "b" : "w";
  const selfColor: ChessColor = you ?? "w";
  const opponentDisplayName = withSeatRating(
    playerDisplayName(opponent, wallet.name, wallet.address ?? null, t("waitingForOpponent")),
    opponent
  );
  const selfDisplayName = withSeatRating(
    playerDisplayName(self, wallet.name, wallet.address ?? null, t("you")),
    self
  );
  const whiteDisplayName = withSeatRating(
    playerDisplayName(match.white, wallet.name, wallet.address ?? null, t("waitingForOpponent")),
    match.white
  );
  const blackDisplayName = withSeatRating(
    playerDisplayName(match.black, wallet.name, wallet.address ?? null, t("waitingForOpponent")),
    match.black
  );
  const viewerWallet = wallet.address?.toLowerCase() ?? null;
  const yourCurrentComment = viewerWallet
    ? (comments.find((comment) => comment.author.toLowerCase() === viewerWallet) ?? null)
    : null;
  const sortedComments = [...comments].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );

  const opening = identifyOpening(replaySteps.slice(0, viewingPly).map((move) => move.san));
  // The king in check, if any — the side to move is the one that can be in
  // check. Glowed on the board; also lit on a checkmate, where that side is
  // still in check with no move.
  const checkSquare = isInCheck(board, replayPosition.turn)
    ? kingPos(board, replayPosition.turn)
    : null;
  const displayedMove = viewingPly > 0 ? (replaySteps[viewingPly - 1] ?? null) : null;
  const lastMove = displayedMove?.uci ? fromUci(displayedMove.uci) : null;
  const movePairs = replaySteps.reduce<
    Array<{
      turn: number;
      white: { ply: number; san: string } | null;
      black: { ply: number; san: string } | null;
    }>
  >((acc, move, index) => {
    if (index % 2 === 0) {
      acc.push({
        turn: Math.floor(index / 2) + 1,
        white: { ply: move.ply, san: move.san },
        black: null,
      });
    } else {
      acc[acc.length - 1]!.black = { ply: move.ply, san: move.san };
    }
    return acc;
  }, []);
  const engineBestMoveSan = match
    ? (uciToSan(displayFen, engine.bestMove) ?? engine.bestMove)
    : engine.bestMove;
  const replayMode = replayPly !== null && replayPly !== currentReplayPly;
  const canInteractWithBoard = you !== null && !over && !yourClockExpired && !replayMode;
  const jumpToPly = (target: number) => {
    const clamped = Math.min(Math.max(target, 0), currentReplayPly);
    if (clamped !== currentReplayPly && !hasExactReplay) return;
    const nextReplayPly = clamped === currentReplayPly ? null : clamped;
    if (nextReplayPly !== null) {
      setSelected(null);
      setPendingPromotion(null);
    }
    setReplayPly(nextReplayPly);
  };

  // One quiet line for staked matches. Computer rewards are server quotes and
  // must not pass through the equal-pot PvP wording or calculation.
  const wagerRefunded =
    match.state === "cancelled" ||
    match.result?.kind === "draw" ||
    (match.wagerStatus ?? "").toLowerCase().includes("refund");
  const computerWager = match.computer?.wager ?? null;
  const wonComputerWager =
    result !== null && result.kind !== "draw" && you !== null && result.winner === you;
  const computerPayout =
    computerWager && hasPositiveUsdc(computerWager.payoutUsdc)
      ? computerWager.payoutUsdc
      : computerWager?.potentialPayoutUsdc;
  const wagerLine = computerWager
    ? !over
      ? `Staked ${computerWager.stakeUsdc} USDC · win pays ${computerWager.potentialPayoutUsdc} USDC`
      : wagerRefunded
        ? "Your stake was refunded."
        : wonComputerWager && computerPayout
          ? `You received ${computerPayout} USDC.`
          : "Computer wager settled."
    : !match.stakeUsdc
      ? null
      : !over
        ? tStake("wagerEach", { amount: match.stakeUsdc })
        : wagerRefunded
          ? tStake("wagerRefunded")
          : feePct !== null
            ? tStake("wagerSettled", { pct: feePct })
            : tStake("wagerEach", { amount: match.stakeUsdc });

  const turnLabel = over
    ? resultLine(t, match, you)
    : claimingTimeout
      ? t("statusClaiming")
      : waiting
        ? t("statusWaiting")
        : yourClockExpired
          ? t("statusFlagged")
          : moving
            ? t("statusSending")
            : yourTurn
              ? t("statusYourMove")
              : you === null
                ? t("statusSpectating")
                : offerToAnswer
                  ? t("statusDrawToYou")
                  : offerPending
                    ? t("statusDrawSent")
                    : match.computer
                      ? t("statusComputerThinking", { level: match.computer.level })
                      : t("statusOpponentThinking");
  const inviteUrl =
    waiting && matchId
      ? typeof window === "undefined"
        ? `/casino/chess/invite?code=${matchId}`
        : `${window.location.origin}/casino/chess/invite?code=${matchId}`
      : null;
  const canWriteChat = !!wallet.address && !isComputerGame;
  const canEditComments = you !== null && currentPly !== null;
  const currentPositionLabel =
    currentPly === 0
      ? t("commentPositionStart")
      : t("commentPositionMove", { ply: currentPly ?? 0 });
  const showLiveRailWorkspace = !waiting && !isComputerGame;
  const canHint =
    isComputerGame &&
    !coachEnabled &&
    !match.stakeUsdc &&
    !over &&
    yourTurn &&
    (match.computer?.hintsUsed ?? 0) < 3;
  const canExtend =
    !waiting &&
    match.timeExtensions.allowed &&
    !over &&
    you !== null &&
    !isComputerGame &&
    !match.stakeUsdc &&
    match.clockMode === "real_time" &&
    match.timeExtensions.used < match.timeExtensions.maxUses &&
    match.timeExtensions.totalSeconds < match.timeExtensions.maxTotalSeconds;
  const showExtension = !waiting && !over && you !== null;
  const extensionUnavailableReason = canExtend
    ? null
    : isComputerGame
      ? "Clock extensions are not available against Stockfish."
      : match.stakeUsdc
        ? "Staked games keep their original clock."
        : match.clockMode !== "real_time"
          ? "Untimed games cannot be extended."
          : match.timeExtensions.used >= match.timeExtensions.maxUses ||
              match.timeExtensions.totalSeconds >= match.timeExtensions.maxTotalSeconds
            ? "This game has reached its extension limit."
            : "This game was created with a fixed clock.";
  const paidActions = (
    <PaidMatchActions
      canHint={canHint}
      hintCredits={products.access?.hintCredits ?? 0}
      hintsUsed={match.computer?.hintsUsed ?? 0}
      requestingHint={requestingHint}
      onBuyHint={() => void onBuyCredit("hint_credit")}
      onHint={() => void onRequestHint()}
      showExtension={showExtension}
      canExtend={canExtend}
      extensionUnavailableReason={extensionUnavailableReason}
      extensionCredits={products.access?.timeExtensionCredits ?? 0}
      extensionsUsed={match.timeExtensions.used}
      maxExtensions={match.timeExtensions.maxUses}
      extending={extendingTime}
      onBuyExtension={() => void onBuyCredit("time_extension_credit")}
      onExtend={(seconds) => void onExtendTime(seconds)}
    />
  );
  const coachPanel =
    coachEnabled && !waiting && over && coachSummary ? (
      <CoachGameSummaryPanel summary={coachSummary} />
    ) : coachEnabled && !waiting && !over ? (
      <LiveCoachPanel
        review={coachReview}
        message={coachReview?.message ?? coachMessage}
        busy={coachBusy}
        hinting={requestingCoachHint}
        onHint={() => void onCoachHint()}
        onUndo={() => void onCoachUndo()}
        onContinue={() => void onCoachContinue()}
      />
    ) : null;
  const topSeatLabel = opponentColor === "w" ? t("infoWhite") : t("infoBlack");
  const bottomSeatLabel = selfColor === "w" ? t("infoWhite") : t("infoBlack");
  const matchAgeLabel = formatMatchAge(match.createdAt, relativeNowMs);
  const speedLabel = clockMode === "unlimited" ? null : timeControlCategory(match.timeControl);
  const boardMaxWidth = "100%";
  const initialClockSeconds = initialClockSecondsFromTimeControl(match.timeControl);
  const clockBarScale = (colour: ChessColor) =>
    clockMode === "unlimited"
      ? 1
      : Math.max(0.04, Math.min((clocks?.[colour] ?? 0) / initialClockSeconds, 1));
  const desktopClockPanelClass = (colour: ChessColor) =>
    match.state === "in_progress" && match.turn === colour
      ? "bg-[#33451d] text-[#f4f2eb]"
      : "bg-[#1f1e1b] text-white/88";

  return (
    <div className="ws-chess-round-root relative mx-auto w-full px-4 pb-8 sm:px-6 lg:px-8">
      <div className="ws-chess-round-shell grid gap-5">
        <aside className="ws-chess-round-desktop-left order-1 hidden max-h-[calc(100dvh-112px)] min-h-0 flex-col gap-4 overflow-hidden pr-1 text-[#c9c6c0]">
          <div
            className="rounded-[2px] border px-5 py-5"
            style={{ background: "#262421", borderColor: "#3b3936", boxShadow: "none" }}
          >
            <div className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.03] text-white/34">
                <FlameBadgeIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="ws-chess-lila-meta font-normal text-white/66">
                  {match.timeControl} • {match.rating?.rated ? "Rated" : "Casual"}
                  {speedLabel ? ` • ${speedLabel}` : ""}
                </div>
                {matchAgeLabel ? (
                  <div className="mt-1 text-[0.82rem] text-white/36">{matchAgeLabel}</div>
                ) : null}
                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-2.5 text-[1.04rem] text-white/82">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-white/14 bg-white/70" />
                    <span className="truncate">{whiteDisplayName}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[1.04rem] text-white/70">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-white/14 bg-black" />
                    <span className="truncate">{blackDisplayName}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {waiting && you !== null ? (
            <div
              className="rounded-[16px] border border-white/6 px-4 py-4"
              style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
            >
              <div className="mb-3 text-[13px] font-semibold tracking-[0.04em] text-white/60 uppercase">
                {t("challengeLink")}
              </div>
              <div className="flex items-center gap-2">
                <div className="tnum min-w-0 flex-1 truncate rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[12px] text-white/76">
                  {inviteUrl}
                </div>
                <button
                  onClick={async () => {
                    if (!inviteUrl) return;
                    const copied = await copyText(inviteUrl);
                    if (copied) toast.success(tCreate("linkCopied"));
                    else toast.error("Couldn't copy. Long-press the link to copy it.");
                  }}
                  className="cursor-pointer rounded-[12px] border border-white/12 bg-white/6 px-4 py-3 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12"
                >
                  {tCreate("copy")}
                </button>
                <button
                  onClick={() => setShowInviteQr((open) => !open)}
                  className="cursor-pointer rounded-[12px] border border-white/12 bg-white/6 px-4 py-3 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12"
                >
                  {showInviteQr ? t("hideQr") : t("showQr")}
                </button>
              </div>
              {inviteUrl && showInviteQr ? (
                <div className="mt-4 flex flex-col items-center gap-3 rounded-[14px] border border-white/6 bg-black/10 px-4 py-4 text-center">
                  <QrCode value={inviteUrl} size={176} />
                  <div className="text-[12px] leading-5 text-white/55">{t("scanToJoin")}</div>
                </div>
              ) : null}
              <div className="mt-3 text-[11.5px] text-white/42">{t("shareManually")}</div>
            </div>
          ) : null}

          {showLiveRailWorkspace ? (
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2px] border"
              style={{ background: "#262421", borderColor: "#3b3936", boxShadow: "none" }}
            >
              <div
                className="border-b px-4 py-2"
                style={{ borderColor: "#3b3936", background: "#2b2926" }}
              >
                <div className="text-[0.98rem] text-white/76">Chat</div>
              </div>

              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 p-4">
                {chatLoading ? (
                  <div className="rounded-[2px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {t("chatLoading")}
                  </div>
                ) : (
                  <div className="min-h-0 overflow-hidden rounded-[2px] border border-white/6 bg-[#211f1c] px-3 py-2">
                    <LiveChatFeed
                      messages={chatMessages}
                      labelFor={(line) =>
                        matchActorLabel({
                          actor: line.author,
                          match,
                          walletAddress: wallet.address ?? null,
                          whiteDisplayName,
                          blackDisplayName,
                          youLabel: t("you"),
                        })
                      }
                      viewer={wallet.address ?? null}
                      emptyHint={
                        activeChatRoom === "player" ? t("chatPlayerEmpty") : t("chatEmpty")
                      }
                      className="h-full"
                    />
                  </div>
                )}

                {!canWriteChat ? (
                  <div className="rounded-[2px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {t("chatLogin")}
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2 rounded-[2px] border border-white/10 bg-[#211f1c] p-1.5 pl-3">
                    <input
                      type="text"
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.shiftKey) return;
                        event.preventDefault();
                        void onPostChat();
                      }}
                      placeholder={
                        activeChatRoom === "player"
                          ? t("chatPlaceholderPlayer")
                          : t("chatPlaceholderSpectator")
                      }
                      className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-[14px] text-white outline-none placeholder:text-white/30"
                    />
                    <button
                      onClick={() => void onPostChat()}
                      disabled={postingChat || chatDraft.trim().length === 0}
                      className="cursor-pointer rounded-[2px] border border-white/12 bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/78 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {postingChat ? t("chatSending") : t("chatSend")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </aside>

        <section
          className="ws-chess-round-board-section order-1 rounded-[8px] p-3 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: desktopRoundLayout ? "transparent" : CHESS_SURFACE_BG }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: boardMaxWidth }}>
            <div className="relative overflow-hidden rounded-[2px]">
              <ChessBoard
                board={board}
                selected={boardSelected}
                legalTargets={boardTargets}
                checkSquare={checkSquare}
                lastMove={lastMove}
                orientation={you ?? "w"}
                theme={theme}
                onSquareClick={
                  canInteractWithBoard ? (r, c) => void onSquareClick(r, c) : undefined
                }
              />
              {clockMode === "real_time" ? (
                <FinalCountdown
                  secondsLeft={clocks?.[displayTurn] ?? 0}
                  live={match.state === "in_progress"}
                />
              ) : null}
            </div>

            {activePendingPromotion ? (
              <div
                className="mt-3 rounded-[16px] border border-white/8 px-4 py-4"
                style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
              >
                <div className="mb-2 text-[11.5px] font-semibold tracking-[0.04em] text-white/65 uppercase">
                  {t("promotionTitle")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activePendingPromotion.options.map((piece) => (
                    <button
                      key={piece}
                      onClick={() => void onPromotionChoice(piece)}
                      disabled={moving}
                      className="cursor-pointer rounded-full border border-white/15 px-3 py-1.5 font-sans text-[12px] font-semibold text-white/75 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
                    >
                      {PROMOTION_LABEL[piece]} {t(PROMOTION_TEXT_KEY[piece])}
                    </button>
                  ))}
                  <button
                    onClick={() => setPendingPromotion(null)}
                    disabled={moving}
                    className="cursor-pointer rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12px] font-semibold text-white/50 transition-colors hover:border-white/25 hover:text-white/80 disabled:opacity-50"
                  >
                    {t("promotionCancel")}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[11.5px] text-white/48">
                {opening ? (
                  <>
                    <span className="tnum mr-1.5 text-white/36">{opening.eco}</span>
                    {opening.name}
                  </>
                ) : waiting ? (
                  "Starting position"
                ) : null}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-black/12 px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.06em] text-white/44 uppercase">
                  {match.timeControl}
                </span>
                <BoardThemePicker className="shrink-0" />
              </div>
            </div>

            <div className="ws-chess-round-mobile-stack mt-4 space-y-3">
              <div
                className="rounded-[16px] border border-white/6 px-4 py-4"
                style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
              >
                <div className="mb-2 text-[13px] font-medium text-white/56">
                  {match.timeControl} • {match.rating?.rated ? "Rated" : "Casual"}
                </div>
                <div className="space-y-2 text-[14px]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-white/84">{whiteDisplayName}</div>
                    <div
                      className={`tnum flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-white ${lowClockClass(
                        clocks?.w ?? 0,
                        !over
                      )}`}
                    >
                      <ClockIcon />
                      {formatRoundClock(clockMode, clocks?.w ?? 0)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-white/70">{blackDisplayName}</div>
                    <div
                      className={`tnum flex shrink-0 items-center gap-1.5 text-[13px] font-semibold ${
                        lowClockClass(clocks?.b ?? 0, !over) ||
                        (you === "b" && yourTurn ? "text-white" : "text-white/78")
                      }`}
                    >
                      <ClockIcon />
                      {formatRoundClock(clockMode, clocks?.b ?? 0)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[12px] text-white/46">{turnLabel}</div>
                {wagerLine ? (
                  <div className="mt-3 rounded-[10px] bg-black/10 px-3 py-2.5 text-[12px] text-white/58">
                    {wagerLine}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <MobilePanelButton
                  label={t("movesTitle")}
                  active={mobilePanel === "moves"}
                  onClick={() => setMobilePanel("moves")}
                />
                {!waiting && !isComputerGame ? (
                  <MobilePanelButton
                    label="Chat"
                    active={mobilePanel === "chat"}
                    onClick={() => setMobilePanel("chat")}
                  />
                ) : null}
                <MobilePanelButton
                  label="Info"
                  active={mobilePanel === "info"}
                  onClick={() => setMobilePanel("info")}
                />
              </div>

              {you !== null && !over ? (
                <div
                  className="rounded-[16px] border border-white/6 px-4 py-4"
                  style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                >
                  <div className="mb-3 text-[12px] text-white/48">
                    {waiting ? t("controlsWaiting") : t("controlsActions")}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {waiting ? (
                      <button
                        onClick={() => void onAbort()}
                        disabled={aborting}
                        className={actionButton}
                      >
                        {aborting ? "…" : t("abort")}
                      </button>
                    ) : (
                      <>
                        {!isComputerGame && offerToAnswer ? (
                          <>
                            <button
                              onClick={() => void onAnswerDraw(true)}
                              disabled={respondingToDraw}
                              className={actionButton}
                            >
                              {respondingToDraw ? "…" : t("acceptDraw")}
                            </button>
                            <button
                              onClick={() => void onAnswerDraw(false)}
                              disabled={respondingToDraw}
                              className={actionButton}
                            >
                              {t("declineDraw")}
                            </button>
                          </>
                        ) : !isComputerGame ? (
                          <button
                            onClick={() => void onOfferDraw()}
                            disabled={offeringDraw || offerPending}
                            className={actionButton}
                          >
                            {offeringDraw ? "…" : offerPending ? t("drawOffered") : t("offerDraw")}
                          </button>
                        ) : null}
                        {!isComputerGame && takebackOfferToAnswer ? (
                          <>
                            <button
                              onClick={() => void onTakeback()}
                              disabled={requestingTakeback}
                              className={actionButton}
                            >
                              {requestingTakeback ? "…" : t("acceptTakeback")}
                            </button>
                            <button
                              onClick={() => void onDeclineTakeback()}
                              disabled={decliningTakeback}
                              className={actionButton}
                            >
                              {decliningTakeback ? "…" : t("declineTakeback")}
                            </button>
                          </>
                        ) : !isComputerGame && takebackState.takebackable ? (
                          <>
                            <button
                              onClick={() => void onTakeback()}
                              disabled={requestingTakeback || takebackPending}
                              className={actionButton}
                            >
                              {requestingTakeback
                                ? "…"
                                : takebackPending
                                  ? t("takebackOffered")
                                  : t("offerTakeback")}
                            </button>
                            {takebackPending ? (
                              <button
                                onClick={() => void onDeclineTakeback()}
                                disabled={decliningTakeback}
                                className={actionButton}
                              >
                                {decliningTakeback ? "…" : t("cancelTakeback")}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        <button
                          onClick={() => void onClaimDraw()}
                          disabled={claimingDraw}
                          className={actionButton}
                        >
                          {claimingDraw ? "…" : t("claimDraw")}
                        </button>
                        <button
                          onClick={() => void onResign()}
                          disabled={resigning}
                          className="border-down/40 text-down cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-50"
                        >
                          {resigning ? "…" : t("resign")}
                        </button>
                      </>
                    )}
                  </div>
                  {coachPanel}
                  {paidActions}
                  <button
                    onClick={() => router.push("/casino/chess")}
                    className="mt-3 cursor-pointer text-[12px] text-white/52 transition-colors hover:text-white/82"
                  >
                    {t("backToLobby")}
                  </button>
                </div>
              ) : null}
              {over ? (
                <PostGameActions
                  result={resultLine(t, match, you)}
                  ratingDiff={yourRatingDiff}
                  computerGame={isComputerGame}
                  canRematch={you !== null && !isComputerGame}
                  rematchReadyId={rematchReadyId}
                  opponentRematchOffer={opponentRematchOffer}
                  yourRematchOffer={yourRematchOffer}
                  requestingRematch={requestingRematch}
                  decliningRematch={decliningRematch}
                  onOpenRematch={() => {
                    if (rematchReadyId) {
                      router.push(`/casino/chess/play?match=${rematchReadyId}`);
                    }
                  }}
                  onAcceptRematch={() => void onAcceptRematch()}
                  onOfferRematch={() => void onRematch()}
                  onDeclineRematch={() => void onDeclineRematch()}
                  onNewComputer={() => router.push("/casino/chess?computer=1")}
                  onReview={() => router.push(`/casino/chess/review?match=${match.id}`)}
                  onLobby={() => router.push("/casino/chess")}
                  t={t}
                />
              ) : null}
            </div>
          </div>
        </section>

        <aside
          className="ws-chess-round-desktop-right order-3 hidden max-h-[calc(100dvh-112px)] min-h-0 flex-col overflow-hidden rounded-[2px] border text-[#c9c6c0]"
          style={{ background: "#262421", borderColor: "#3b3936" }}
        >
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2px]"
            style={{ background: "#262421", boxShadow: "none" }}
          >
            <div className="shrink-0 border-b" style={{ borderColor: "#3b3936" }}>
              <div className="px-4 pt-2 pb-1">
                <CapturedRow
                  pieces={capturedByColor(opponentColor)}
                  lead={leadFor(opponentColor)}
                  color={selfColor}
                />
              </div>
              <div className={`px-4 pt-3 pb-2 ${desktopClockPanelClass(opponentColor)}`}>
                <div
                  className={`ws-chess-lila-clock tnum text-[4.2rem] ${lowClockClass(
                    clocks?.[opponentColor] ?? 0,
                    !over
                  )}`}
                >
                  {formatRoundClock(clockMode, clocks?.[opponentColor] ?? 0)}
                </div>
              </div>
              <div className="h-[4px] bg-[#3b3936]">
                <div
                  className="h-full bg-[#6f9827]"
                  style={{
                    transform: `scaleX(${clockBarScale(opponentColor)})`,
                    transformOrigin: "left",
                  }}
                />
              </div>
              <div className="flex items-center gap-2 px-4 py-2 text-[0.98rem] text-white/82">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#6f9827]" />
                <div className="ws-chess-lila-player truncate">{opponentDisplayName}</div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto]">
              <div
                className="border-b px-3 py-2.5"
                style={{ borderColor: "#3b3936", background: "#2b2926" }}
              >
                <div className="grid grid-cols-[repeat(4,2rem)_1fr_auto] items-center gap-2">
                  <button
                    type="button"
                    onClick={() => jumpToPly(0)}
                    disabled={viewingPly === 0 || (!hasExactReplay && currentReplayPly !== 0)}
                    className={replayNavButtonClass(
                      viewingPly === 0 || (!hasExactReplay && currentReplayPly !== 0)
                    )}
                    aria-label="Start"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToPly(viewingPly - 1)}
                    disabled={
                      viewingPly === 0 || (!hasExactReplay && viewingPly - 1 !== currentReplayPly)
                    }
                    className={replayNavButtonClass(
                      viewingPly === 0 || (!hasExactReplay && viewingPly - 1 !== currentReplayPly)
                    )}
                    aria-label="Previous move"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToPly(viewingPly + 1)}
                    disabled={
                      viewingPly === currentReplayPly ||
                      (!hasExactReplay && viewingPly + 1 !== currentReplayPly)
                    }
                    className={replayNavButtonClass(
                      viewingPly === currentReplayPly ||
                        (!hasExactReplay && viewingPly + 1 !== currentReplayPly)
                    )}
                    aria-label="Next move"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToPly(currentReplayPly)}
                    disabled={viewingPly === currentReplayPly}
                    className={replayNavButtonClass(viewingPly === currentReplayPly)}
                    aria-label="Live position"
                  >
                    »
                  </button>
                  <div className="text-[0.96rem] font-normal text-white/52">{t("movesTitle")}</div>
                  <div className="tnum text-right text-[0.96rem] text-white/46">
                    {viewingPly} / {currentReplayPly}
                  </div>
                </div>
              </div>

              {movePairs.length === 0 ? (
                <div className="px-4 py-4 text-[14px] text-white/58">Starting position</div>
              ) : (
                <div className="ws-chess-lila-moves min-h-0 overflow-y-auto">
                  {movePairs.map((row) => (
                    <div
                      key={`${row.turn}-${row.white?.san ?? ""}-${row.black?.san ?? ""}`}
                      className="grid grid-cols-[16.666%_41.666%_41.666%] items-stretch"
                    >
                      <div className="tnum flex items-end justify-center bg-black/10 px-1 py-1.5 text-white/32">
                        {row.turn}
                      </div>
                      {row.white ? (
                        <button
                          ref={viewingPly === row.white.ply ? activeMoveRef : null}
                          type="button"
                          onClick={() => jumpToPly(row.white!.ply)}
                          disabled={!hasExactReplay && row.white.ply !== currentReplayPly}
                          className={`tnum px-3 py-1.5 text-left transition-colors ${moveChipClass(
                            viewingPly === row.white.ply
                          )} ${
                            !hasExactReplay && row.white.ply !== currentReplayPly
                              ? "cursor-not-allowed opacity-45"
                              : "cursor-pointer"
                          }`}
                        >
                          {row.white.san}
                        </button>
                      ) : (
                        <span />
                      )}
                      {row.black ? (
                        <button
                          ref={viewingPly === row.black.ply ? activeMoveRef : null}
                          type="button"
                          onClick={() => jumpToPly(row.black!.ply)}
                          disabled={!hasExactReplay && row.black.ply !== currentReplayPly}
                          className={`tnum px-3 py-1.5 text-left transition-colors ${moveChipClass(
                            viewingPly === row.black.ply
                          )} ${
                            !hasExactReplay && row.black.ply !== currentReplayPly
                              ? "cursor-not-allowed opacity-45"
                              : "cursor-pointer"
                          }`}
                        >
                          {row.black.san}
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t px-4 py-2" style={{ borderColor: "#3b3936" }}>
                <div className="flex items-center justify-between gap-3 text-[0.82rem] text-white/48">
                  <span>{replayMode ? `Move ${viewingPly}` : turnLabel}</span>
                  <span>
                    {engine.depth !== null
                      ? t("engineDepth", { depth: engine.depth })
                      : engine.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t" style={{ borderColor: "#3b3936" }}>
              <div className="flex items-center gap-2 px-4 py-2 text-[0.98rem] text-white/82">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#6f9827]" />
                <div className="ws-chess-lila-player truncate">{selfDisplayName}</div>
              </div>
              <div className="h-[4px] bg-[#3b3936]">
                <div
                  className="h-full bg-[#6f9827]"
                  style={{
                    transform: `scaleX(${clockBarScale(selfColor)})`,
                    transformOrigin: "left",
                  }}
                />
              </div>
              <div className={`px-4 pt-3 pb-2 ${desktopClockPanelClass(selfColor)}`}>
                <div
                  className={`ws-chess-lila-clock tnum text-[4.2rem] ${
                    lowClockClass(clocks?.[selfColor] ?? 0, !over) || "text-white"
                  }`}
                >
                  {formatRoundClock(clockMode, clocks?.[selfColor] ?? 0)}
                </div>
              </div>
              <div className="px-4 pt-1 pb-2">
                <CapturedRow
                  pieces={capturedByColor(selfColor)}
                  lead={leadFor(selfColor)}
                  color={opponentColor}
                />
              </div>
            </div>

            {you !== null && !over ? (
              <div
                className="shrink-0 border-t px-4 pt-3 pb-3"
                style={{ borderColor: "#3b3936", background: "#262421" }}
              >
                <div className="mb-2 text-[0.82rem] text-white/44">
                  {waiting ? t("controlsWaiting") : t("controlsActions")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {waiting ? (
                    <button
                      onClick={() => void onAbort()}
                      disabled={aborting}
                      className={railActionButton}
                    >
                      {aborting ? "…" : t("abort")}
                    </button>
                  ) : (
                    <>
                      {!isComputerGame && offerToAnswer ? (
                        <>
                          <button
                            onClick={() => void onAnswerDraw(true)}
                            disabled={respondingToDraw}
                            className={railActionButton}
                          >
                            {respondingToDraw ? "…" : t("acceptDraw")}
                          </button>
                          <button
                            onClick={() => void onAnswerDraw(false)}
                            disabled={respondingToDraw}
                            className={railActionButton}
                          >
                            {t("declineDraw")}
                          </button>
                        </>
                      ) : !isComputerGame ? (
                        <button
                          onClick={() => void onOfferDraw()}
                          disabled={offeringDraw || offerPending}
                          className={railActionButton}
                        >
                          {offeringDraw ? "…" : offerPending ? t("drawOffered") : t("offerDraw")}
                        </button>
                      ) : null}

                      {!isComputerGame && takebackOfferToAnswer ? (
                        <>
                          <button
                            onClick={() => void onTakeback()}
                            disabled={requestingTakeback}
                            className={railActionButton}
                          >
                            {requestingTakeback ? "…" : t("acceptTakeback")}
                          </button>
                          <button
                            onClick={() => void onDeclineTakeback()}
                            disabled={decliningTakeback}
                            className={railActionButton}
                          >
                            {decliningTakeback ? "…" : t("declineTakeback")}
                          </button>
                        </>
                      ) : !isComputerGame && takebackState.takebackable ? (
                        <>
                          <button
                            onClick={() => void onTakeback()}
                            disabled={requestingTakeback || takebackPending}
                            className={railActionButton}
                          >
                            {requestingTakeback
                              ? "…"
                              : takebackPending
                                ? t("takebackOffered")
                                : t("offerTakeback")}
                          </button>
                          {takebackPending ? (
                            <button
                              onClick={() => void onDeclineTakeback()}
                              disabled={decliningTakeback}
                              className={railActionButton}
                            >
                              {decliningTakeback ? "…" : t("cancelTakeback")}
                            </button>
                          ) : null}
                        </>
                      ) : null}

                      <button
                        onClick={() => void onClaimDraw()}
                        disabled={claimingDraw}
                        className={railActionButton}
                      >
                        {claimingDraw ? "…" : t("claimDraw")}
                      </button>
                      <button
                        onClick={() => void onResign()}
                        disabled={resigning}
                        className={railDangerActionButton}
                      >
                        {resigning ? "…" : t("resign")}
                      </button>
                    </>
                  )}
                </div>
                {coachPanel}
                {paidActions}
                <button
                  onClick={() => router.push("/casino/chess")}
                  className="mt-3 cursor-pointer text-[0.82rem] text-white/52 transition-colors hover:text-white/82"
                >
                  {t("backToLobby")}
                </button>
              </div>
            ) : null}
            {over ? (
              <PostGameActions
                result={resultLine(t, match, you)}
                ratingDiff={yourRatingDiff}
                computerGame={isComputerGame}
                canRematch={you !== null && !isComputerGame}
                rematchReadyId={rematchReadyId}
                opponentRematchOffer={opponentRematchOffer}
                yourRematchOffer={yourRematchOffer}
                requestingRematch={requestingRematch}
                decliningRematch={decliningRematch}
                onOpenRematch={() => {
                  if (rematchReadyId) {
                    router.push(`/casino/chess/play?match=${rematchReadyId}`);
                  }
                }}
                onAcceptRematch={() => void onAcceptRematch()}
                onOfferRematch={() => void onRematch()}
                onDeclineRematch={() => void onDeclineRematch()}
                onNewComputer={() => router.push("/casino/chess?computer=1")}
                onReview={() => router.push(`/casino/chess/review?match=${match.id}`)}
                onLobby={() => router.push("/casino/chess")}
                t={t}
              />
            ) : null}
          </div>
        </aside>
      </div>

      <ModalShell
        open={!desktopRoundLayout && mobilePanel !== null}
        onClose={() => setMobilePanel(null)}
        contentKey={mobilePanel ?? "round"}
        panelClassName="max-h-[92vh] md:w-[min(720px,calc(100vw-40px))]"
      >
        {mobilePanel === "moves" ? (
          <div className="space-y-4">
            <div className="text-[20px] font-semibold text-white">{t("movesTitle")}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[14px] border border-white/8 bg-black/12 px-4 py-4">
                <div className="mb-2 text-[11px] tracking-[0.06em] text-white/34 uppercase">
                  {topSeatLabel}
                </div>
                <div className="truncate text-[17px] font-semibold text-white">
                  {opponentDisplayName}
                </div>
                <div
                  className={`tnum mt-3 flex items-center gap-2 text-[38px] leading-none font-light text-white ${lowClockClass(
                    clocks?.[opponentColor] ?? 0,
                    !over
                  )}`}
                >
                  <ClockIcon />
                  {formatRoundClock(clockMode, clocks?.[opponentColor] ?? 0)}
                </div>
              </div>
              <div className="rounded-[14px] border border-white/8 bg-black/12 px-4 py-4">
                <div className="mb-2 text-[11px] tracking-[0.06em] text-white/34 uppercase">
                  {bottomSeatLabel}
                </div>
                <div className="truncate text-[17px] font-semibold text-white">
                  {selfDisplayName}
                </div>
                <div
                  className={`tnum mt-3 flex items-center gap-2 text-[38px] leading-none font-light ${
                    lowClockClass(clocks?.[selfColor] ?? 0, !over) ||
                    (yourTurn ? "border-white/35 text-white" : "text-white")
                  }`}
                >
                  <ClockIcon />
                  {formatRoundClock(clockMode, clocks?.[selfColor] ?? 0)}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-white/8 bg-black/12">
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <div className="text-[14px] font-semibold text-white">{currentReplayPly} ply</div>
                <div className="text-[12px] text-white/46">{turnLabel}</div>
              </div>
              {movePairs.length === 0 ? (
                <div className="px-4 py-4 text-[13px] text-white/58">Starting position</div>
              ) : (
                <>
                  <div className="max-h-[360px] overflow-y-auto">
                    {movePairs.map((row) => (
                      <div
                        key={`${row.turn}-${row.white?.san ?? ""}-${row.black?.san ?? ""}`}
                        className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1 border-b border-white/8 px-3 py-1.5 text-[13px] last:border-b-0"
                      >
                        <div className="tnum text-white/36">{row.turn}</div>
                        {row.white ? (
                          <button
                            type="button"
                            onClick={() => jumpToPly(row.white!.ply)}
                            disabled={!hasExactReplay && row.white.ply !== currentReplayPly}
                            className={`tnum min-w-0 rounded-[8px] px-2 py-1 text-left font-medium transition-colors ${moveChipClass(
                              viewingPly === row.white.ply
                            )} ${
                              !hasExactReplay && row.white.ply !== currentReplayPly
                                ? "cursor-not-allowed opacity-45"
                                : "cursor-pointer"
                            }`}
                          >
                            <span className="block truncate">{row.white.san}</span>
                          </button>
                        ) : (
                          <span />
                        )}
                        {row.black ? (
                          <button
                            type="button"
                            onClick={() => jumpToPly(row.black!.ply)}
                            disabled={!hasExactReplay && row.black.ply !== currentReplayPly}
                            className={`tnum min-w-0 rounded-[8px] px-2 py-1 text-left font-medium transition-colors ${moveChipClass(
                              viewingPly === row.black.ply
                            )} ${
                              !hasExactReplay && row.black.ply !== currentReplayPly
                                ? "cursor-not-allowed opacity-45"
                                : "cursor-pointer"
                            }`}
                          >
                            <span className="block truncate">{row.black.san}</span>
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-[14px] border border-white/8 bg-black/12 px-4 py-3 text-[12.5px] text-white/62">
              <span className="tnum text-white">
                {formatEngineScore(engine.scoreCp, engine.scoreMate)}
              </span>
              <span className="mx-2 text-white/24">•</span>
              <span>{t("engineBestMove")}</span>
              <span className="tnum ml-1.5 text-white">{engineBestMoveSan ?? "…"}</span>
              <span className="mx-2 text-white/24">•</span>
              <span>
                {engine.depth !== null ? t("engineDepth", { depth: engine.depth }) : engine.label}
              </span>
            </div>
          </div>
        ) : mobilePanel === "chat" ? (
          <div className="space-y-4">
            <div>
              <div className="text-[20px] font-semibold text-white">Chat</div>
            </div>
            {chatLoading ? (
              <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                {t("chatLoading")}
              </div>
            ) : (
              <LiveChatFeed
                messages={chatMessages}
                labelFor={(line) =>
                  matchActorLabel({
                    actor: line.author,
                    match,
                    walletAddress: wallet.address ?? null,
                    whiteDisplayName,
                    blackDisplayName,
                    youLabel: t("you"),
                  })
                }
                viewer={wallet.address ?? null}
                emptyHint={activeChatRoom === "player" ? t("chatPlayerEmpty") : t("chatEmpty")}
                className="h-[340px]"
              />
            )}
            {!canWriteChat ? (
              <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                {t("chatLogin")}
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) return;
                    event.preventDefault();
                    void onPostChat();
                  }}
                  placeholder={
                    activeChatRoom === "player"
                      ? t("chatPlaceholderPlayer")
                      : t("chatPlaceholderSpectator")
                  }
                  className="min-h-[84px] w-full rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[13px] text-white outline-none placeholder:text-white/28"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => void onPostChat()}
                    disabled={postingChat || chatDraft.trim().length === 0}
                    className="cursor-pointer rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {postingChat ? t("chatSending") : t("chatSend")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-[20px] font-semibold text-white">Info</div>
            <div className="grid gap-2.5">
              <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                <span className="text-white/55">{t("infoStatus")}</span>
                <span className="text-right text-white">{turnLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                <span className="text-white/55">{t("infoTimeControl")}</span>
                <span className="text-white">{match.timeControl}</span>
              </div>
              {opening ? (
                <div className="rounded-[10px] bg-black/10 px-3 py-2.5 text-[12px] text-white/62">
                  <span className="tnum mr-1.5 text-white/36">{opening.eco}</span>
                  {opening.name}
                </div>
              ) : null}
              {wagerLine ? (
                <div className="rounded-[10px] bg-black/10 px-3 py-2.5 text-[12px] text-white/62">
                  {wagerLine}
                </div>
              ) : null}
            </div>

            {waiting && you !== null ? (
              <div className="rounded-[12px] border border-white/6 bg-black/8 px-3 py-3">
                <div className="mb-2 text-[15px] font-semibold text-white">
                  {t("challengeLink")}
                </div>
                <div className="mb-3 flex items-center gap-2">
                  <div className="tnum min-w-0 flex-1 truncate rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[12px] text-white/76">
                    {inviteUrl}
                  </div>
                  <button
                    onClick={async () => {
                      if (!inviteUrl) return;
                      const copied = await copyText(inviteUrl);
                      if (copied) toast.success(tCreate("linkCopied"));
                      else toast.error("Couldn't copy. Long-press the link to copy it.");
                    }}
                    className="cursor-pointer rounded-[12px] border border-white/12 bg-white/6 px-4 py-3 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12"
                  >
                    {tCreate("copy")}
                  </button>
                </div>
              </div>
            ) : null}

            <ChessCashierLauncher compact />

            <div className="rounded-[12px] border border-white/6 bg-black/8 px-3 py-3">
              <div className="mb-2 text-[15px] font-semibold text-white">{t("noteTitle")}</div>
              {!wallet.address ? (
                <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                  {t("noteLogin")}
                </div>
              ) : (
                <NoteEditor
                  key={`${matchId}:${note?.updatedAt ?? note?.createdAt ?? note?.text ?? ""}:mobile`}
                  initialValue={note?.text ?? ""}
                  placeholder={t("notePlaceholder")}
                  saving={savingNote}
                  saveLabel={t("noteSave")}
                  savingLabel={t("noteSaving")}
                  onSave={onSaveNote}
                />
              )}
            </div>

            <div className="rounded-[12px] border border-white/6 bg-black/8 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[15px] font-semibold text-white">{t("commentTitle")}</div>
                <div className="text-[11.5px] text-white/42">{currentPositionLabel}</div>
              </div>
              <div className="space-y-2">
                {commentsLoading ? (
                  <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {t("commentLoading")}
                  </div>
                ) : sortedComments.length === 0 ? (
                  <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {t("commentEmpty")}
                  </div>
                ) : (
                  sortedComments.map((comment) => {
                    const own =
                      viewerWallet !== null && comment.author.toLowerCase() === viewerWallet;
                    return (
                      <div
                        key={`${comment.id}-mobile`}
                        className="rounded-[10px] border border-white/6 bg-black/10 px-3 py-2.5"
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-white/42">
                          <span className="truncate">
                            {matchActorLabel({
                              actor: comment.author,
                              match,
                              walletAddress: wallet.address ?? null,
                              whiteDisplayName,
                              blackDisplayName,
                              youLabel: t("you"),
                            })}
                          </span>
                          <span className="shrink-0">{formatChatTime(comment.updatedAt)}</span>
                        </div>
                        <div className="text-[13px] leading-6 text-white/78">{comment.text}</div>
                        {own ? (
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => void onDeleteComment(comment)}
                              disabled={deletingComment}
                              className="cursor-pointer text-[11.5px] font-semibold text-white/48 transition-colors hover:text-white/82 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {t("commentDelete")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              {canEditComments ? (
                <CommentEditor
                  key={`${matchId}:${currentPly ?? 0}:${yourCurrentComment?.updatedAt ?? yourCurrentComment?.createdAt ?? yourCurrentComment?.text ?? ""}:mobile`}
                  initialValue={yourCurrentComment?.text ?? ""}
                  placeholder={t("commentPlaceholder")}
                  saving={savingComment}
                  saveLabel={yourCurrentComment ? t("commentUpdate") : t("commentSave")}
                  savingLabel={t("commentSaving")}
                  onSave={onSaveComment}
                />
              ) : (
                <div className="mt-4 rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                  {t("commentPlayerOnly")}
                </div>
              )}
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
