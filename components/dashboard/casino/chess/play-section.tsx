"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useChessMatch, useChessMatchSocial } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useChessEngine } from "@/hooks/use-chess-engine";
import { useChessCashierStatus } from "@/hooks/use-chess-cashier";
import { ChessCashierLauncher } from "@/components/dashboard/casino/chess/chess-cashier-launcher";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { CapturedRow } from "@/components/dashboard/casino/chess/captured-row";
import { BoardThemePicker } from "@/components/dashboard/casino/chess/board-theme-picker";
import { useBoardTheme } from "@/lib/casino/chess/board-theme";
import { QrCode } from "@/components/dashboard/funds/qr-code";
import { formatChatTime, matchActorLabel, playerDisplayName } from "@/lib/casino/chess/social";
import { identifyOpening } from "@/lib/casino/chess/openings";
import { formatEngineScore, pvToSan, uciToSan } from "@/lib/casino/chess/engine-analysis";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PAGE_BOARD_MAX_WIDTH,
  CHESS_SHELL_BG,
  CHESS_SHELL_SHADOW,
  CHESS_SIDEBAR_BG,
  CHESS_SURFACE_BG,
} from "@/lib/casino/chess/ui";
import {
  armAudioUnlock,
  moveSoundFromSan,
  playGameEndSound,
  playMoveSound,
} from "@/lib/casino/chess/sound";
import { FinalCountdown } from "@/components/dashboard/casino/chess/final-countdown";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import {
  capturedFromBoard,
  isInCheck,
  kingPos,
  legalMovesForSquare,
  parseFen,
  toUci,
  type Square,
} from "@/lib/casino/chess/engine";
import { friendlyError, isConflictError } from "@/lib/errors";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import type {
  ChessChatRoom,
  ChessColor,
  ChessMatch,
  ChessMatchComment,
} from "@/lib/casino/api/types";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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

const EMPTY_TAKEBACK = { white: false, black: false, takebackable: false } as const;
const EMPTY_REMATCH = { offeredBy: null, nextMatchId: null } as const;

type PromotionOption = "q" | "r" | "b" | "n";

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
  const wallet = useCasinoWallet();
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
    claimingTimeout,
  } = useChessMatch(matchId, seatName);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    fen: string;
    from: Square;
    to: Square;
    options: PromotionOption[];
  } | null>(null);
  const awaitingRematchRoute = useRef(false);
  const theme = useBoardTheme();
  const [railTab, setRailTab] = useState<"moves" | "chat" | "info">("moves");
  const [chatRoom, setChatRoom] = useState<ChessChatRoom>("spectator");
  const [chatDraft, setChatDraft] = useState("");
  const [showInviteQr, setShowInviteQr] = useState(false);
  const engine = useChessEngine(match?.fen ?? null);
  const rematchReadyId = match?.rematch?.nextMatchId ?? null;
  const currentPly = match ? match.moves.length : null;
  const canUsePlayerChat = you !== null;
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
  } = useChessMatchSocial(matchId, chatRoom, canUsePlayerChat, currentPly, seatName);

  // Unlock the audio context on the first gesture so the opponent's very first
  // move is audible even before this player has moved.
  useEffect(() => {
    armAudioUnlock();
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

  // A chime the first time the game resolves, from this player's side: rising
  // for a win, falling for a loss or a draw. Only fires if we actually watched
  // the game in progress, so opening an already-finished board stays silent.
  const sawInProgress = useRef(false);
  const sawResult = useRef(false);
  const inProgress = match?.state === "in_progress";
  const result = match?.result ?? null;
  useEffect(() => {
    if (inProgress) sawInProgress.current = true;
  }, [inProgress]);
  useEffect(() => {
    if (!result) {
      sawResult.current = false;
      return;
    }
    if (sawResult.current || !sawInProgress.current) return;
    sawResult.current = true;
    const outcome = result.kind === "draw" ? "draw" : result.winner === you ? "win" : "loss";
    playGameEndSound(outcome);
  }, [result, you]);

  useEffect(() => {
    if (!awaitingRematchRoute.current || !rematchReadyId) return;
    awaitingRematchRoute.current = false;
    router.push(`/casino/chess/play?match=${rematchReadyId}`);
  }, [rematchReadyId, router]);

  // The board is whatever the server says. A malformed FEN yields null rather
  // than a silently half-rendered position.
  const position = useMemo(() => {
    if (!match) return null;
    try {
      return parseFen(match.fen);
    } catch {
      return null;
    }
  }, [match]);

  // Highlights are computed locally only so the board feels responsive. The
  // server revalidates every move, so a wrong hint can never become a wrong
  // result.
  const legalTargets = useMemo(() => {
    const yourTurn = !!match && match.state === "in_progress" && you !== null && match.turn === you;
    const ownClock = yourTurn && you !== null ? (clocks?.[you] ?? 0) : 1;
    if (!position || !selected || !yourTurn || ownClock <= 0) return [];
    return legalMovesForSquare(position, selected.r, selected.c);
  }, [clocks, match, position, selected, you]);

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
  if (isLoading || !match || !position) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-20">
        <CasinoLoading label={t("loading")} rows={5} />
      </div>
    );
  }

  const displayTurn = match.turn;
  const takebackState = match.takeback ?? EMPTY_TAKEBACK;
  const rematchState = match.rematch ?? EMPTY_REMATCH;
  const yourTurn = match.state === "in_progress" && you !== null && displayTurn === you;
  const yourClockExpired = yourTurn && you !== null && (clocks?.[you] ?? 0) <= 0;
  const board = position.board;
  // Captured pieces and material lead, read straight off the board each render.
  const captured = capturedFromBoard(board);
  const capturedByColor = (colour: ChessColor) => (colour === "w" ? captured.b : captured.w);
  const leadFor = (colour: ChessColor) => {
    const advantage = colour === "w" ? captured.advantage : -captured.advantage;
    return advantage > 0 ? advantage : 0;
  };
  const over = match.state === "settled" || match.state === "cancelled";
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

  const onSquareClick = async (r: number, c: number) => {
    if (!yourTurn || yourClockExpired || moving) return;
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
      try {
        await submitMove(uci);
      } catch (e) {
        toast.error(friendlyError(e, t("toastMoveFailed")));
      }
      return;
    }
    const piece = board[r][c];
    setPendingPromotion(null);
    setSelected(piece && piece.color === you ? { r, c } : null);
  };

  const onPromotionChoice = async (promotion: PromotionOption) => {
    if (!activePendingPromotion || yourClockExpired) return;
    const uci = toUci(position, activePendingPromotion.from, activePendingPromotion.to, promotion);
    setPendingPromotion(null);
    setSelected(null);
    try {
      await submitMove(uci);
    } catch (e) {
      toast.error(friendlyError(e, t("toastMoveFailed")));
    }
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
  const opponentDisplayName = playerDisplayName(
    opponent,
    wallet.name,
    wallet.address ?? null,
    t("waitingForOpponent")
  );
  const selfDisplayName = playerDisplayName(self, wallet.name, wallet.address ?? null, t("you"));
  const whiteDisplayName = playerDisplayName(
    match.white,
    wallet.name,
    wallet.address ?? null,
    t("waitingForOpponent")
  );
  const blackDisplayName = playerDisplayName(
    match.black,
    wallet.name,
    wallet.address ?? null,
    t("waitingForOpponent")
  );
  const viewerWallet = wallet.address?.toLowerCase() ?? null;
  const yourCurrentComment = viewerWallet
    ? (comments.find((comment) => comment.author.toLowerCase() === viewerWallet) ?? null)
    : null;
  const sortedComments = [...comments].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );

  const opening = identifyOpening(match.moves);
  // The king in check, if any — the side to move is the one that can be in
  // check. Glowed on the board; also lit on a checkmate, where that side is
  // still in check with no move.
  const checkSquare = isInCheck(board, displayTurn) ? kingPos(board, displayTurn) : null;
  const moveRows =
    match.moves.length === 0
      ? ["Starting Position"]
      : match.moves.reduce<string[]>((acc, san, i) => {
          if (i % 2 === 0) acc.push(`${i / 2 + 1}. ${san}`);
          else acc[acc.length - 1] += ` ${san}`;
          return acc;
        }, []);
  const enginePvSan = match ? pvToSan(match.fen, engine.pv) : [];
  const engineBestMoveSan = match
    ? (uciToSan(match.fen, engine.bestMove) ?? engine.bestMove)
    : engine.bestMove;

  // One quiet line for staked matches. During play both stakes sit locked; a
  // draw or abort refunds them, a decisive result settles the pot to the
  // winner. The service's wagerStatus is free text, so refunds are also read
  // from the result itself and the fee line only shows once the fee is known.
  const wagerRefunded =
    match.state === "cancelled" ||
    match.result?.kind === "draw" ||
    (match.wagerStatus ?? "").toLowerCase().includes("refund");
  const wagerLine = !match.stakeUsdc
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
                    : t("statusOpponentThinking");
  const inviteUrl =
    waiting && matchId
      ? typeof window === "undefined"
        ? `/casino/chess/invite?code=${matchId}`
        : `${window.location.origin}/casino/chess/invite?code=${matchId}`
      : null;
  const canWriteChat = !!wallet.address;
  const canEditComments = you !== null && currentPly !== null;
  const currentPositionLabel =
    currentPly === 0
      ? t("commentPositionStart")
      : t("commentPositionMove", { ply: currentPly ?? 0 });

  return (
    <div className="relative mx-auto w-full max-w-[1560px] px-4 pb-8 sm:px-6 lg:px-8 xl:pb-0">
      {/* On narrow screens the side rail stacks below the board, so the balance
          would sit down by the footer. Surface it as the first thing here, and
          hide it once the rail becomes a column that already shows it up top. */}
      <div className="mb-6 xl:hidden">
        <ChessCashierLauncher compact />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,944px)_430px]">
        <section
          className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: CHESS_PAGE_BOARD_MAX_WIDTH }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div
                className="flex min-w-0 items-center gap-3 rounded-[8px] px-3 py-2.5"
                style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-white/8 font-sans text-[13.5px] font-medium text-white/30">
                  P
                </span>
                <div className="min-w-0">
                  <div className="truncate font-sans text-[13.5px] font-medium text-white">
                    {opponentDisplayName}
                  </div>
                  <CapturedRow
                    pieces={capturedByColor(opponentColor)}
                    lead={leadFor(opponentColor)}
                    color={selfColor}
                  />
                </div>
              </div>
              <div
                className={`tnum flex min-w-[108px] shrink-0 items-center justify-center gap-2 rounded-[8px] px-3.5 py-2 text-[14px] font-semibold text-white/88 ${lowClockClass(
                  clocks?.[opponentColor] ?? 0,
                  !over
                )}`}
                style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
              >
                <ClockIcon />
                {formatClock(clocks?.[opponentColor] ?? 0)}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2px]">
              <ChessBoard
                board={board}
                selected={selected}
                legalTargets={targetSquares}
                checkSquare={checkSquare}
                orientation={you ?? "w"}
                theme={theme}
                onSquareClick={
                  you !== null && !over && !yourClockExpired
                    ? (r, c) => void onSquareClick(r, c)
                    : undefined
                }
              />
              <FinalCountdown
                secondsLeft={clocks?.[displayTurn] ?? 0}
                live={match.state === "in_progress"}
              />
            </div>

            {activePendingPromotion ? (
              <div
                className="mt-4 rounded-[16px] border border-white/8 px-4 py-4"
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
              <div
                className="flex min-w-0 items-center gap-3 rounded-[8px] px-3 py-2.5"
                style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-white/8 font-sans text-[13.5px] font-medium text-white/30">
                  P
                </span>
                <div className="min-w-0">
                  <div className="truncate font-sans text-[13.5px] font-medium text-white">
                    {selfDisplayName}
                  </div>
                  <CapturedRow
                    pieces={capturedByColor(selfColor)}
                    lead={leadFor(selfColor)}
                    color={opponentColor}
                  />
                </div>
              </div>
              <div
                className={`tnum flex min-w-[108px] shrink-0 items-center justify-center gap-2 rounded-[8px] px-3.5 py-2 text-[14px] font-semibold ${
                  lowClockClass(clocks?.[selfColor] ?? 0, !over) ||
                  (yourTurn ? "border border-white/35 text-white" : "text-white/88")
                }`}
                style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
              >
                <ClockIcon />
                {formatClock(clocks?.[selfColor] ?? 0)}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[12px] text-white/55">
                {opening ? (
                  <>
                    <span className="tnum mr-1.5 text-white/40">{opening.eco}</span>
                    {opening.name}
                  </>
                ) : waiting ? (
                  "Starting position"
                ) : null}
              </span>
              <BoardThemePicker className="shrink-0" />
            </div>
          </div>
        </section>

        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-white/6 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:h-[calc(100vh-104px)]"
          style={{ background: CHESS_SIDEBAR_BG }}
        >
          <div className="grid grid-cols-4 border-b border-white/6 bg-black/10">
            <div className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white">
              <span className="mb-2 block text-[16px] font-medium">P</span>
              <span className="font-sans text-[14px] font-semibold">{t("navPlay")}</span>
            </div>
            <Link
              href="/casino/chess/create"
              className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white/65 transition-colors hover:bg-white/4 hover:text-white"
            >
              <span className="mb-2 block text-[16px] font-medium">+</span>
              <span className="font-sans text-[14px] font-semibold">{t("navNewGame")}</span>
            </Link>
            <Link
              href="/casino/chess/history"
              className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white/65 transition-colors hover:bg-white/4 hover:text-white"
            >
              <span className="mb-2 block text-[16px] font-medium">#</span>
              <span className="font-sans text-[14px] font-semibold">{t("navGames")}</span>
            </Link>
            <Link
              href="/casino/chess"
              className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white/65 transition-colors hover:bg-white/4 hover:text-white"
            >
              <span className="mb-2 block text-[16px] font-medium">U</span>
              <span className="font-sans text-[14px] font-semibold">{t("navPlayers")}</span>
            </Link>
          </div>

          <div className="hidden shrink-0 border-b border-white/6 px-4 pt-4 pb-4 sm:px-5 xl:block">
            <ChessCashierLauncher compact />
          </div>

          <div className="grid grid-cols-3 border-b border-white/6 bg-black/8">
            {(["moves", "chat", "info"] as const).map((tab) => {
              const label =
                tab === "moves" ? t("railMoves") : tab === "chat" ? t("railChat") : t("railInfo");
              const active = railTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setRailTab(tab)}
                  className={`cursor-pointer px-4 py-4 text-center font-sans text-[14px] font-semibold transition-colors ${
                    active
                      ? "border-b-4 border-white text-white"
                      : "text-white/56 hover:text-white/82"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {railTab === "moves" ? (
                <div className="space-y-4">
                  {waiting && you !== null ? (
                    <div
                      className="rounded-[16px] border border-white/6 px-4 py-4"
                      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                    >
                      <div className="mb-1 text-[17px] font-semibold text-white">
                        {t("challengeLink")}
                      </div>
                      <div className="mb-3 text-[13px] leading-6 text-white/60">
                        {tCreate("inviteReady")}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="tnum min-w-0 flex-1 truncate rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[12px] text-white/76">
                          {inviteUrl}
                        </div>
                        <button
                          onClick={async () => {
                            if (!inviteUrl) return;
                            const copied = await copyText(inviteUrl);
                            // A dead-silent failure reads as a broken button;
                            // the URL is on screen, so point at it.
                            if (copied) toast.success(tCreate("linkCopied"));
                            else toast.error("Couldn't copy — long-press the link to copy it.");
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
                          <div className="text-[12px] leading-5 text-white/55">
                            {t("scanToJoin")}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 text-[11.5px] text-white/44">{t("shareManually")}</div>
                    </div>
                  ) : null}

                  <div
                    className="rounded-[16px] border border-white/6 px-4 py-4"
                    style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[17px] font-semibold text-white">
                        {waiting ? t("startGame") : t("movesTitle")}
                      </div>
                      <div className="text-[12px] text-white/46">{turnLabel}</div>
                    </div>
                    <div className="space-y-2 text-[14px] text-white/78">
                      {moveRows.map((row) => (
                        <div
                          key={row}
                          className="rounded-[10px] border border-white/6 bg-black/10 px-3 py-2"
                        >
                          {row}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className="rounded-[16px] border border-white/6 px-4 py-4"
                    style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="text-[17px] font-semibold text-white">{t("engineTitle")}</div>
                      <div className="text-[12px] text-white/46">
                        {engine.depth !== null
                          ? t("engineDepth", { depth: engine.depth })
                          : engine.label}
                      </div>
                    </div>
                    <div className="mb-3 text-[13px] leading-6 text-white/60">
                      {t("engineAbout")}
                    </div>

                    {engine.status === "unsupported" ? (
                      <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/62">
                        {t("engineUnsupported")}
                      </div>
                    ) : engine.status === "error" ? (
                      <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/62">
                        {engine.error ?? t("engineFailed")}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-3 gap-2.5">
                          <div className="rounded-[10px] bg-black/10 px-3 py-2">
                            <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">
                              {t("engineScore")}
                            </div>
                            <div className="tnum text-[14px] font-semibold text-white">
                              {formatEngineScore(engine.scoreCp, engine.scoreMate)}
                            </div>
                          </div>
                          <div className="rounded-[10px] bg-black/10 px-3 py-2">
                            <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">
                              {t("engineBestMove")}
                            </div>
                            <div className="tnum text-[14px] font-semibold text-white">
                              {engineBestMoveSan ?? "…"}
                            </div>
                          </div>
                          <div className="rounded-[10px] bg-black/10 px-3 py-2">
                            <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">
                              {t("engineStatus")}
                            </div>
                            <div className="text-[14px] font-semibold text-white">
                              {engine.status === "loading"
                                ? t("engineLoading")
                                : engine.status === "analyzing"
                                  ? t("engineAnalyzing")
                                  : t("engineReady")}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-[10px] bg-black/10 px-3 py-2">
                          <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">
                            {t("enginePv")}
                          </div>
                          <div className="tnum text-[13px] leading-6 break-words text-white/72">
                            {enginePvSan.length > 0 ? enginePvSan.join(" ") : t("enginePvWaiting")}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : railTab === "chat" ? (
                <div className="space-y-4">
                  <div
                    className="rounded-[16px] border border-white/6 px-4 py-4"
                    style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[17px] font-semibold text-white">{t("chatTitle")}</div>
                      {canUsePlayerChat ? (
                        <div className="flex gap-2">
                          {(["spectator", "player"] as const).map((room) => {
                            const active = activeChatRoom === room;
                            return (
                              <button
                                key={room}
                                onClick={() => setChatRoom(room)}
                                className={`cursor-pointer rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                                  active
                                    ? "border-white/40 bg-white/8 text-white"
                                    : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/82"
                                }`}
                              >
                                {room === "player" ? t("chatPlayers") : t("chatSpectators")}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className="mb-3 text-[13px] leading-6 text-white/60">
                      {waiting
                        ? t("chatWaiting")
                        : activeChatRoom === "player"
                          ? t("chatPlayersHint")
                          : t("chatSpectatorsHint")}
                    </div>
                    <div className="space-y-2">
                      {chatLoading ? (
                        <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                          {t("chatLoading")}
                        </div>
                      ) : chatMessages.length === 0 ? (
                        <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                          {activeChatRoom === "player" ? t("chatPlayerEmpty") : t("chatEmpty")}
                        </div>
                      ) : (
                        chatMessages.map((line) => (
                          <div
                            key={line.id}
                            className="rounded-[10px] border border-white/6 bg-black/10 px-3 py-2.5"
                          >
                            <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-white/42">
                              <span className="truncate">
                                {matchActorLabel({
                                  actor: line.author,
                                  match,
                                  walletAddress: wallet.address ?? null,
                                  whiteDisplayName,
                                  blackDisplayName,
                                  youLabel: t("you"),
                                })}
                              </span>
                              <span className="shrink-0">{formatChatTime(line.createdAt)}</span>
                            </div>
                            <div className="text-[13px] leading-6 text-white/78">{line.text}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      {!canWriteChat ? (
                        <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                          {t("chatLogin")}
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className="space-y-3 rounded-[16px] border border-white/6 px-4 py-4"
                    style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                  >
                    <div className="text-[17px] font-semibold text-white">{t("infoTitle")}</div>
                    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                      <span className="text-white/55">{t("infoStatus")}</span>
                      <span className="text-white">{turnLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                      <span className="text-white/55">{t("infoTimeControl")}</span>
                      <span className="text-white">{match.timeControl}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                      <span className="text-white/55">{t("infoWhite")}</span>
                      <span className="truncate text-white">{whiteDisplayName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                      <span className="text-white/55">{t("infoBlack")}</span>
                      <span className="truncate text-white">{blackDisplayName}</span>
                    </div>
                    {wagerLine ? (
                      <div className="rounded-[10px] bg-black/10 px-3 py-2.5 text-[12px] text-white/62">
                        {wagerLine}
                      </div>
                    ) : null}
                  </div>

                  <div
                    className="rounded-[16px] border border-white/6 px-4 py-4"
                    style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                  >
                    <div className="mb-2 text-[17px] font-semibold text-white">
                      {t("noteTitle")}
                    </div>
                    <div className="mb-3 text-[13px] leading-6 text-white/60">{t("noteHint")}</div>
                    {!wallet.address ? (
                      <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                        {t("noteLogin")}
                      </div>
                    ) : (
                      <NoteEditor
                        key={`${matchId}:${note?.updatedAt ?? note?.createdAt ?? note?.text ?? ""}`}
                        initialValue={note?.text ?? ""}
                        placeholder={t("notePlaceholder")}
                        saving={savingNote}
                        saveLabel={t("noteSave")}
                        savingLabel={t("noteSaving")}
                        onSave={onSaveNote}
                      />
                    )}
                  </div>

                  <div
                    className="rounded-[16px] border border-white/6 px-4 py-4"
                    style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-[17px] font-semibold text-white">
                        {t("commentTitle")}
                      </div>
                      <div className="text-[12px] text-white/46">{currentPositionLabel}</div>
                    </div>
                    <div className="mb-3 text-[13px] leading-6 text-white/60">
                      {t("commentHint")}
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
                              key={comment.id}
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
                                <span className="shrink-0">
                                  {formatChatTime(comment.updatedAt)}
                                </span>
                              </div>
                              <div className="text-[13px] leading-6 text-white/78">
                                {comment.text}
                              </div>
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
                        key={`${matchId}:${currentPly ?? 0}:${yourCurrentComment?.updatedAt ?? yourCurrentComment?.createdAt ?? yourCurrentComment?.text ?? ""}`}
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
            </div>

            {you !== null && !over ? (
              <div className="mt-4 shrink-0 border-t border-white/6 pt-4">
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
                      {offerToAnswer ? (
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
                      ) : (
                        <button
                          onClick={() => void onOfferDraw()}
                          disabled={offeringDraw || offerPending}
                          className={actionButton}
                        >
                          {offeringDraw ? "…" : offerPending ? t("drawOffered") : t("offerDraw")}
                        </button>
                      )}

                      {takebackOfferToAnswer ? (
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
                      ) : takebackState.takebackable ? (
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
                <button
                  onClick={() => router.push("/casino/chess")}
                  className="mt-3 cursor-pointer text-[12px] text-white/52 transition-colors hover:text-white/82"
                >
                  {t("backToLobby")}
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {over ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="ws-glass w-[320px] rounded-2xl px-8 py-9 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="text-[12px] font-semibold tracking-[0.06em] text-white/70 uppercase">
              {resultLine(t, match, you)}
            </div>
            {you !== null && rematchReadyId ? (
              <button
                onClick={() => router.push(`/casino/chess/play?match=${rematchReadyId}`)}
                className="text-ink mt-5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-medium"
              >
                {t("openRematch")}
              </button>
            ) : null}
            {you !== null && !rematchReadyId && opponentRematchOffer ? (
              <>
                <div className="mt-4 text-[12.5px] font-normal text-white/70">
                  {t("opponentWantsRematch")}
                </div>
                <button
                  onClick={() => void onAcceptRematch()}
                  disabled={requestingRematch}
                  className="text-ink mt-2.5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-medium disabled:opacity-50"
                >
                  {requestingRematch ? t("joining") : t("acceptRematch")}
                </button>
                <button
                  onClick={() => void onDeclineRematch()}
                  disabled={decliningRematch}
                  className="mt-2.5 w-full cursor-pointer rounded-full border border-white/15 p-3 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
                >
                  {decliningRematch ? t("declining") : t("declineRematch")}
                </button>
              </>
            ) : null}
            {you !== null && !rematchReadyId && yourRematchOffer ? (
              <>
                <div className="mt-4 text-[12.5px] font-normal text-white/70">
                  {t("rematchPending")}
                </div>
                <button
                  onClick={() => void onDeclineRematch()}
                  disabled={decliningRematch}
                  className="mt-2.5 w-full cursor-pointer rounded-full border border-white/15 p-3 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
                >
                  {decliningRematch ? t("declining") : t("cancelRematch")}
                </button>
              </>
            ) : null}
            {you !== null && !rematchReadyId && !yourRematchOffer && !opponentRematchOffer ? (
              <button
                onClick={() => void onRematch()}
                disabled={requestingRematch}
                className="text-ink mt-5 w-full cursor-pointer rounded-full bg-white p-3 font-sans text-[13px] font-medium disabled:opacity-50"
              >
                {requestingRematch ? t("opening") : t("rematch")}
              </button>
            ) : null}
            <button
              onClick={() => router.push("/casino/chess")}
              className="mt-2.5 w-full cursor-pointer rounded-full border border-white/15 p-3 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              {t("backToLobby")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
