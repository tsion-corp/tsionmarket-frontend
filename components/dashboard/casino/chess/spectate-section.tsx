"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChessCashierLauncher } from "@/components/dashboard/casino/chess/chess-cashier-launcher";
import { useChessMatch, useChessMatchSocial } from "@/hooks/use-casino-chess";
import { useMatchMarket, usePlaceBet } from "@/hooks/use-casino-betting";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { FinalCountdown } from "@/components/dashboard/casino/chess/final-countdown";
import { useBoardTheme } from "@/lib/casino/chess/board-theme";
import { formatChatTime, matchActorLabel, playerDisplayName } from "@/lib/casino/chess/social";
import { CapturedRow } from "@/components/dashboard/casino/chess/captured-row";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PAGE_BOARD_MAX_WIDTH,
  CHESS_PRIMARY_BUTTON_CLASS,
  CHESS_SHELL_BG,
  CHESS_SHELL_SHADOW,
  CHESS_SIDEBAR_BG,
  CHESS_SURFACE_BG,
} from "@/lib/casino/chess/ui";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { capturedFromBoard, isInCheck, kingPos, parseFen } from "@/lib/casino/chess/engine";
import { useChessCashierStatus } from "@/hooks/use-chess-cashier";
import { exceedsUsdcBalance, normalizeUsdcAmount, parseUsdcAmount } from "@/lib/casino/api/cashier";
import { estimatePariMutuelReturn, impliedProbability } from "@/lib/casino/betting-math";
import { friendlyError, isConflictError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BetSelection, ChessColor } from "@/lib/casino/api/types";

// The selection ids double as keys in the common chess namespace, which
// carries the localized side names.
const SELECTIONS: readonly BetSelection[] = ["white", "draw", "black"];

// A running clock reads as urgent under 20s and critical under 10s, so a
// watcher sees both sides' flags approach zero in red, the same warning the
// players get. Empty string keeps the normal styling when there is time to
// spare or the game is not live.
const LOW_CLOCK_SECONDS = 20;
const CRITICAL_CLOCK_SECONDS = 10;
function lowClockClass(seconds: number, live: boolean): string {
  if (!live || seconds <= 0 || seconds > LOW_CLOCK_SECONDS) return "";
  return seconds <= CRITICAL_CLOCK_SECONDS
    ? "border-down/70 text-down animate-pulse border"
    : "text-down/70";
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

type SpectateRailTab = "market" | "chat";

function PlayerStrip({
  label,
  pieces,
  lead,
  color,
  clock,
  lowClock = "",
}: {
  label: string;
  pieces: ReturnType<typeof capturedFromBoard>["w"];
  lead: number;
  color: ChessColor;
  clock: string;
  lowClock?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className="flex min-w-0 items-center gap-3 rounded-[8px] px-3 py-2.5"
        style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-white/8 font-sans text-[13.5px] font-medium text-white/30">
          P
        </span>
        <div className="min-w-0">
          <div className="truncate font-sans text-[13.5px] font-medium text-white">{label}</div>
          <CapturedRow pieces={pieces} lead={lead} color={color} />
        </div>
      </div>
      <div
        className={`tnum flex min-w-[108px] shrink-0 items-center justify-center rounded-[8px] px-3.5 py-2 text-[14px] font-semibold text-white/88 ${lowClock}`}
        style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
      >
        {clock}
      </div>
    </div>
  );
}

function commentMonogram(label: string): string {
  const parts = label
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function SpectateTabButton({
  active,
  id,
  controls,
  label,
  count,
  onClick,
}: {
  active: boolean;
  id: string;
  controls: string;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      role="tab"
      type="button"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 font-sans text-[13px] font-medium transition-colors ${
        active
          ? "bg-accent/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
          : "text-white/55 hover:text-white/80"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span
          className={`tnum inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[10px] ${
            active ? "bg-white text-black" : "bg-white/8 text-white/62"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SpectatorCommentRow({
  label,
  createdAt,
  text,
  own,
}: {
  label: string;
  createdAt: string;
  text: string;
  own: boolean;
}) {
  return (
    <article className="flex items-start gap-3">
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${
          own
            ? "border-accent/30 bg-accent/10 text-white"
            : "border-white/10 bg-white/6 text-white/72"
        }`}
      >
        {commentMonogram(label)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-white/42">
          <span className="truncate font-semibold text-white/72">{label}</span>
          <span className="shrink-0">{formatChatTime(createdAt)}</span>
        </div>
        <div
          className={`mt-1 rounded-[14px] border px-3.5 py-3 text-[13px] leading-6 whitespace-pre-wrap ${
            own
              ? "border-accent/14 bg-accent/8 text-white"
              : "border-white/6 bg-black/12 text-white/80"
          }`}
        >
          {text}
        </div>
      </div>
    </article>
  );
}

export function SpectateSection({ matchId }: { matchId: string | null }) {
  const t = useTranslations("casino.chess.spectate");
  const tCommon = useTranslations("casino.chess.common");
  const tPlay = useTranslations("casino.chess.play");
  const wallet = useCasinoWallet();
  const { match, clocks, isLoading, error } = useChessMatch(matchId);
  const theme = useBoardTheme();
  const { odds, myBets } = useMatchMarket(matchId, wallet.address ?? null);
  const cashier = useChessCashierStatus();
  const placeBet = usePlaceBet();
  // A watcher is a spectator: only the public spectator room, never a seat.
  const social = useChessMatchSocial(matchId, "spectator", false, null, null);
  const chatFeedRef = useRef<HTMLDivElement>(null);
  const chatTrackRef = useRef<HTMLDivElement>(null);
  const chatFrameRef = useRef<number | null>(null);
  const chatOffsetRef = useRef(0);

  const [selection, setSelection] = useState<BetSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatPaused, setChatPaused] = useState(false);
  const [activeTab, setActiveTab] = useState<SpectateRailTab>("market");
  const commentCount = social.chatMessages.length;
  const shouldAutoScrollChat = social.chatMessages.length > 1;
  const visibleChatMessages = useMemo(() => social.chatMessages, [social.chatMessages]);

  useEffect(() => {
    const viewport = chatFeedRef.current;
    const track = chatTrackRef.current;
    if (!viewport || !track) return;
    const startOffset = shouldAutoScrollChat
      ? Math.max(viewport.clientHeight - track.offsetHeight, 0)
      : 0;
    chatOffsetRef.current = startOffset;
    track.style.transform = `translateY(${startOffset}px)`;
  }, [activeTab, shouldAutoScrollChat, social.chatMessages.length]);

  useEffect(() => {
    const viewport = chatFeedRef.current;
    const track = chatTrackRef.current;
    if (!viewport || !track) return;
    if (!shouldAutoScrollChat || chatPaused || activeTab !== "chat") return;

    let lastFrame = 0;
    const speedPxPerSecond = 30;

    const animate = (timestamp: number) => {
      const nextViewport = chatFeedRef.current;
      const nextTrack = chatTrackRef.current;
      if (!nextViewport || !nextTrack) return;
      if (lastFrame === 0) lastFrame = timestamp;
      const deltaMs = Math.min(timestamp - lastFrame, 64);
      lastFrame = timestamp;
      const nextOffset = chatOffsetRef.current - (deltaMs * speedPxPerSecond) / 1000;
      const resetOffset = -nextTrack.offsetHeight;
      chatOffsetRef.current = nextOffset <= resetOffset ? nextViewport.clientHeight : nextOffset;
      nextTrack.style.transform = `translateY(${chatOffsetRef.current}px)`;
      chatFrameRef.current = requestAnimationFrame(animate);
    };

    chatFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (chatFrameRef.current !== null) cancelAnimationFrame(chatFrameRef.current);
    };
  }, [activeTab, chatPaused, shouldAutoScrollChat, visibleChatMessages.length]);

  if (!matchId) {
    return (
      <div className="mx-auto w-full max-w-[1160px] px-4 pt-10 pb-20">
        <CasinoEmpty>{t("noMatch")}</CasinoEmpty>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1160px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject={t("subject")} />
      </div>
    );
  }
  if (isLoading || !match) {
    return (
      <div className="mx-auto w-full max-w-[1160px] px-4 pt-10 pb-20">
        <CasinoLoading label={t("loading")} rows={6} />
      </div>
    );
  }

  let board = null;
  try {
    board = parseFen(match.fen).board;
  } catch {
    board = null;
  }
  const checkSquare = board && isInCheck(board, match.turn) ? kingPos(board, match.turn) : null;

  // Captured pieces and material lead for each side, read off the board.
  const captured = board ? capturedFromBoard(board) : null;
  const capturedFor = (colour: ChessColor) =>
    captured ? (colour === "w" ? captured.b : captured.w) : [];
  const leadFor = (colour: ChessColor) => {
    if (!captured) return 0;
    const advantage = colour === "w" ? captured.advantage : -captured.advantage;
    return advantage > 0 ? advantage : 0;
  };
  // Ratings are hidden until the service actually exposes them: a real one gets
  // shown in parentheses, an unknown one just shows the name.
  const seatLabel = (player: { username: string; rating: number | null }) =>
    player.rating !== null ? `${player.username} (${player.rating})` : player.username;
  const blackLabel = match.black ? seatLabel(match.black) : tCommon("black");
  const whiteLabel = match.white ? seatLabel(match.white) : tCommon("white");
  const whiteChatLabel = playerDisplayName(
    match.white,
    wallet.name,
    wallet.address ?? null,
    tCommon("white")
  );
  const blackChatLabel = playerDisplayName(
    match.black,
    wallet.name,
    wallet.address ?? null,
    tCommon("black")
  );

  // Money here is USDC from the chess cashier, the same balance staked matches
  // use, in exact decimal strings. A USDC figure formatted for display only.
  const usd = (value: number) => `$${value.toFixed(2)}`;
  const available = cashier.available;
  const stakeUsdc = normalizeUsdcAmount(stakeInput); // canonical string, or null
  const stakeValid = stakeUsdc !== null;
  // A parseable amount that overdraws the balance, as opposed to an unparseable
  // one, which is just not valid yet.
  const overBalance =
    parseUsdcAmount(stakeInput) !== null && exceedsUsdcBalance(stakeInput, available);

  // Players cannot bet on their own match; the service rejects it, and the UI
  // shouldn't offer it.
  const addr = wallet.address?.toLowerCase() ?? null;
  const isPlayer =
    !!addr &&
    (match.white?.walletAddress.toLowerCase() === addr ||
      match.black?.walletAddress.toLowerCase() === addr);
  const marketOpen = match.state === "in_progress" && (odds?.status ?? "open") === "open";

  const rake = (cashier.config?.platformFeeBps ?? 500) / 10_000;
  const selectedOdds = odds && selection ? odds.outcomes[selection].odds : null;
  const estimatedReturn =
    odds && selection && stakeValid
      ? estimatePariMutuelReturn(Number(stakeUsdc), odds, selection, rake)
      : 0;

  const canBet =
    !!selection &&
    !!odds &&
    marketOpen &&
    !isPlayer &&
    stakeValid &&
    !overBalance &&
    !placeBet.isPending;

  const onPlaceBet = async () => {
    if (!selection || !matchId || !stakeUsdc) return;
    if (!wallet.address) {
      toast.error(t("toastConnect"));
      return;
    }
    if (overBalance) {
      toast.error(t("toastNoBalance"));
      return;
    }
    const id = toast.loading(t("toastPlacing"));
    try {
      await placeBet.mutateAsync({ matchId, bettor: wallet.address, selection, stakeUsdc });
      toast.success(
        t("toastPlaced", { odds: (selectedOdds ?? 0).toFixed(2), payout: usd(estimatedReturn) }),
        { id }
      );
      setStakeInput("");
      setSelection(null);
    } catch (e) {
      toast.error(friendlyError(e, t("toastPlaceFailed")), { id });
    }
  };

  const canWriteChat = !!wallet.address;
  const onPostChat = async () => {
    const text = chatDraft.trim();
    if (!text || social.postingChat) return;
    try {
      await social.postChat({ room: "spectator", text });
      setChatDraft("");
    } catch (e) {
      toast.error(
        isConflictError(e) ? tPlay("toastChatConflict") : friendlyError(e, tPlay("toastChatFailed"))
      );
    }
  };

  const live = match.state === "in_progress";
  const over = match.state === "settled" || match.state === "cancelled";
  // The result told from the board's side, reusing the play screen's phrasing so
  // the watcher reads the same "Checkmate · White won" the players do.
  const resultText = (() => {
    const r = match.result;
    if (!r) return over ? tPlay("resultAborted") : "";
    if (r.kind === "draw") {
      const reasonKey = {
        stalemate: "reasonStalemate",
        agreement: "reasonAgreement",
        repetition: "reasonRepetition",
        insufficient: "reasonInsufficient",
      }[r.reason];
      return tPlay("resultDraw", { reason: tPlay(reasonKey) });
    }
    const how =
      r.kind === "checkmate"
        ? tPlay("howCheckmate")
        : r.kind === "resignation"
          ? tPlay("howResignation")
          : tPlay("howTimeout");
    return r.winner === "w" ? tPlay("resultWhiteWon", { how }) : tPlay("resultBlackWon", { how });
  })();

  return (
    <div className="relative mx-auto w-full max-w-[1560px] px-4 pb-8 sm:px-6 lg:px-8 xl:pb-0">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,944px)_430px]">
        <section
          className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: CHESS_PAGE_BOARD_MAX_WIDTH }}>
            <div className="mb-3">
              <PlayerStrip
                label={blackLabel}
                pieces={capturedFor("b")}
                lead={leadFor("b")}
                color="w"
                clock={formatClock(clocks?.b ?? 0)}
                lowClock={lowClockClass(clocks?.b ?? 0, live)}
              />
            </div>

            <div className="relative overflow-hidden rounded-[2px]">
              {board ? (
                <ChessBoard board={board} theme={theme} checkSquare={checkSquare} />
              ) : (
                <CasinoLoading rows={1} />
              )}
              <FinalCountdown secondsLeft={clocks?.[match.turn] ?? 0} live={live} />
            </div>

            <div className="mt-3">
              <PlayerStrip
                label={whiteLabel}
                pieces={capturedFor("w")}
                lead={leadFor("w")}
                color="b"
                clock={formatClock(clocks?.w ?? 0)}
                lowClock={lowClockClass(clocks?.w ?? 0, live)}
              />
            </div>
          </div>
        </section>

        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-white/6 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:h-[calc(100dvh-140px)]"
          style={{ background: CHESS_SIDEBAR_BG }}
        >
          <div className="border-b border-white/6 px-4 pt-4 pb-4 sm:px-5">
            <div
              role="tablist"
              aria-label={`${t("liveMarket")} / ${tPlay("chatTitle")}`}
              className="ws-inset grid grid-cols-2 gap-1 p-1"
            >
              <SpectateTabButton
                active={activeTab === "market"}
                id="spectate-tab-market"
                controls="spectate-panel-market"
                label={t("liveMarket")}
                onClick={() => setActiveTab("market")}
              />
              <SpectateTabButton
                active={activeTab === "chat"}
                id="spectate-tab-chat"
                controls="spectate-panel-chat"
                label={tPlay("chatTitle")}
                count={commentCount}
                onClick={() => setActiveTab("chat")}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            {activeTab === "market" ? (
              <div
                id="spectate-panel-market"
                role="tabpanel"
                aria-labelledby="spectate-tab-market"
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
              >
                <div
                  className="rounded-[16px] border border-white/6 px-4 py-4"
                  style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                >
                  <div className="text-[13px] leading-6 text-white/60">
                    Watching is free. Betting here uses your chess balance, not the Base wallet
                    directly.
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-black/10 px-3 py-2.5">
                    <span className="text-white/55">{t("timeControl")}</span>
                    <span className="tnum text-white">{match.timeControl}</span>
                  </div>
                </div>

                <ChessCashierLauncher compact />

                <div
                  className="rounded-[16px] border border-white/6 px-4 py-4"
                  style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                >
                  {!odds ? (
                    <CasinoLoading label={t("loadingOdds")} rows={2} />
                  ) : (
                    <>
                      {odds.status === "settled" && odds.winningOutcome ? (
                        <div className="ws-inset mb-3.5 rounded-[10px] px-3 py-2 text-[12px] text-white/65">
                          {t("marketSettled", { outcome: tCommon(odds.winningOutcome) })}
                        </div>
                      ) : odds.status === "voided" ? (
                        <div className="ws-inset mb-3.5 rounded-[10px] px-3 py-2 text-[12px] text-white/65">
                          {t("marketVoided")}
                        </div>
                      ) : null}

                      <div className="mb-3.5 grid grid-cols-3 gap-2">
                        {SELECTIONS.map((s) => {
                          const outcome = odds.outcomes[s];
                          const active = selection === s;
                          const won = odds.winningOutcome === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setSelection(s)}
                              disabled={!marketOpen || isPlayer}
                              className={`cursor-pointer rounded-[10px] border py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                                active
                                  ? "border-accent/45 bg-accent/12 text-white"
                                  : won
                                    ? "border-up/50 bg-up/10 text-white"
                                    : "border-white/10 bg-white/4 text-white hover:border-white/25"
                              }`}
                            >
                              {s === "draw" ? (
                                <span className="mx-auto mb-0.5 block h-6" aria-hidden />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={s === "white" ? "/piece/neo/wk.png" : "/piece/neo/bk.png"}
                                  alt=""
                                  className="mx-auto mb-0.5 h-6 w-6"
                                />
                              )}
                              <span className="block text-[11px] opacity-70">{tCommon(s)}</span>
                              <span className="tnum block text-[18px]">
                                {outcome.odds !== null ? outcome.odds.toFixed(2) : "—"}
                              </span>
                              <span className="tnum block text-[10px] opacity-45">
                                {usd(Number(outcome.pool))}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mb-4">
                        <div className="mb-1.5 flex justify-between text-[11px] font-normal text-white/50">
                          <span>{t("whiteWinProbability")}</span>
                          <span className="tnum">
                            {Math.round(impliedProbability(odds, "white"))}%
                          </span>
                        </div>
                        <div className="flex h-[7px] overflow-hidden rounded-[4px] bg-white/10">
                          <div
                            className="h-full bg-white/70 transition-[width] duration-500"
                            style={{ width: `${impliedProbability(odds, "white")}%` }}
                          />
                        </div>
                      </div>

                      {isPlayer ? (
                        <div className="ws-inset rounded-[10px] px-3 py-2.5 text-[11.5px] text-white/50">
                          {t("noSelfBet")}
                        </div>
                      ) : (
                        <div className="mb-3.5 border-t border-white/8 pt-3.5">
                          <div className="mb-2 flex items-center justify-between text-[11px] font-normal text-white/50">
                            <span>{t("placeABet")}</span>
                            <span className="tnum">
                              {t("balance", { amount: usd(Number(available)) })}
                            </span>
                          </div>
                          <div className="mb-2.5 flex gap-2">
                            <input
                              value={stakeInput}
                              onChange={(e) =>
                                setStakeInput(e.target.value.replace(/[^0-9.]/g, ""))
                              }
                              inputMode="decimal"
                              placeholder={t("stakePlaceholder")}
                              className="ws-inset tnum focus:border-accent/50 min-w-0 flex-1 rounded-lg px-2.5 py-2 font-sans text-[13px] text-white outline-none"
                            />
                            <button
                              onClick={() => void onPlaceBet()}
                              disabled={!canBet}
                              className={`${CHESS_PRIMARY_BUTTON_CLASS} rounded-lg px-4 font-sans text-[12px] font-medium`}
                            >
                              {placeBet.isPending ? "…" : t("placeBet")}
                            </button>
                          </div>
                          {selection && stakeValid ? (
                            <div className="text-[11.5px] font-normal text-white/50">
                              {overBalance
                                ? t("notEnough")
                                : t("returns", {
                                    stake: usd(Number(stakeUsdc)),
                                    selection: tCommon(selection),
                                    odds: (selectedOdds ?? 0).toFixed(2),
                                    payout: usd(estimatedReturn),
                                  })}
                            </div>
                          ) : null}
                        </div>
                      )}

                      {myBets.length > 0 ? (
                        <div className="mt-3.5 border-t border-white/8 pt-3.5">
                          <div className="mb-2 text-[11px] font-normal text-white/50">
                            {t("yourBets")}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {myBets.map((b) => (
                              <div
                                key={b.id}
                                className="ws-inset flex items-center justify-between rounded-[10px] px-3 py-2 text-[12px]"
                              >
                                <span>
                                  {tCommon(b.selection)}
                                  <span className="tnum ml-1.5 text-white/45">
                                    {usd(Number(b.stakeUsdc))}
                                  </span>
                                </span>
                                <span
                                  className={`tnum font-semibold ${
                                    b.state === "won"
                                      ? "text-up"
                                      : b.state === "lost"
                                        ? "text-white/40"
                                        : "text-grey-100"
                                  }`}
                                >
                                  {b.state === "active" || b.payoutUsdc === null
                                    ? "—"
                                    : usd(Number(b.payoutUsdc))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div
                id="spectate-panel-chat"
                role="tabpanel"
                aria-labelledby="spectate-tab-chat"
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-white/6"
                style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
              >
                <div className="border-b border-white/6 px-4 py-3 text-[12.5px] leading-6 text-white/50">
                  {tPlay("chatSpectatorsHint")}
                </div>

                <div className="relative min-h-0 flex-1 px-4 py-4">
                  {social.chatLoading ? (
                    <div className="rounded-[14px] border border-white/6 bg-black/10 px-3 py-3 text-[13px] text-white/55">
                      {tPlay("chatLoading")}
                    </div>
                  ) : social.chatMessages.length === 0 ? (
                    <div className="rounded-[14px] border border-white/6 bg-black/10 px-3 py-3 text-[13px] text-white/55">
                      {tPlay("chatEmpty")}
                    </div>
                  ) : (
                    <>
                      <div
                        ref={chatFeedRef}
                        className="relative h-full overflow-hidden"
                        onMouseEnter={() => setChatPaused(true)}
                        onMouseLeave={() => setChatPaused(false)}
                      >
                        <div
                          ref={chatTrackRef}
                          className="absolute inset-x-0 top-0 space-y-4 will-change-transform"
                        >
                          {visibleChatMessages.map((line, index) => {
                            const label = matchActorLabel({
                              actor: line.author,
                              match,
                              walletAddress: wallet.address ?? null,
                              whiteDisplayName: whiteChatLabel,
                              blackDisplayName: blackChatLabel,
                              youLabel: tPlay("you"),
                            });
                            const own =
                              !!wallet.address &&
                              line.author.toLowerCase() === wallet.address.toLowerCase();

                            return (
                              <SpectatorCommentRow
                                key={`${line.id}-${index}`}
                                label={label}
                                createdAt={line.createdAt}
                                text={line.text}
                                own={own}
                              />
                            );
                          })}
                        </div>
                      </div>
                      {shouldAutoScrollChat ? (
                        <>
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-4 top-4 h-10"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(18,18,22,0.96) 0%, rgba(18,18,22,0) 100%)",
                            }}
                          />
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-4 bottom-4 h-10"
                            style={{
                              background:
                                "linear-gradient(0deg, rgba(18,18,22,0.96) 0%, rgba(18,18,22,0) 100%)",
                            }}
                          />
                        </>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="border-t border-white/6 px-4 py-4">
                  {!canWriteChat ? (
                    <div className="rounded-[14px] border border-dashed border-white/10 bg-black/10 px-3 py-3 text-[13px] text-white/55">
                      {tPlay("chatLogin")}
                    </div>
                  ) : (
                    <div className="ws-inset flex items-center gap-2 p-1.5 pl-3.5">
                      <input
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.target.value)}
                        onFocus={() => setChatPaused(true)}
                        onBlur={() => setChatPaused(false)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          void onPostChat();
                        }}
                        placeholder={tPlay("chatPlaceholderSpectator")}
                        className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-white outline-none placeholder:text-white/28"
                      />
                      <button
                        onClick={() => void onPostChat()}
                        disabled={social.postingChat || chatDraft.trim().length === 0}
                        className="text-ink shrink-0 cursor-pointer rounded-full bg-white px-4 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {social.postingChat ? tPlay("chatSending") : tPlay("chatSend")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {over ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-4 backdrop-blur-md">
          <div className="ws-glass w-[340px] rounded-2xl px-8 py-9 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <div className="text-[17px] font-semibold text-white">{resultText}</div>
            <Link
              href="/casino/chess"
              className="text-ink mt-6 inline-block w-full cursor-pointer rounded-full bg-white p-3 text-[13px] font-semibold"
            >
              {tPlay("backToLobby")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
