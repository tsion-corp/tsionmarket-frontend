"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChessCashierLauncher } from "@/components/dashboard/casino/chess/chess-cashier-launcher";
import { useChessMatch, useChessMatchSocial } from "@/hooks/use-casino-chess";
import { useMatchMarket, usePlaceBet } from "@/hooks/use-casino-betting";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { LiveChatOverlay } from "@/components/dashboard/casino/chess/live-chat-overlay";
import { FinalCountdown } from "@/components/dashboard/casino/chess/final-countdown";
import { useBoardTheme } from "@/lib/casino/chess/board-theme";
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
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
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

  const [selection, setSelection] = useState<BetSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [chatDraft, setChatDraft] = useState("");

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
      toast.error(friendlyError(e, tPlay("toastChatFailed")));
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
    <div className="relative mx-auto w-full max-w-[1560px] px-4 pb-8 sm:px-6 lg:px-8">
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
              <LiveChatOverlay messages={social.chatMessages} />
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
          className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-white/6 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: CHESS_SIDEBAR_BG }}
        >
          <div className="space-y-4 p-4 sm:p-5">
            <div
              className="rounded-[16px] border border-white/6 px-4 py-4"
              style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
            >
              <div className="mb-1 text-[17px] font-semibold text-white">{t("liveMarket")}</div>
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
                            // Draw stays label-only; the spacer keeps all three
                            // outcome buttons the same height as the king icons.
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
                      <span className="tnum">{Math.round(impliedProbability(odds, "white"))}%</span>
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
                          onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9.]/g, ""))}
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

            <div
              className="rounded-[16px] border border-white/6 px-4 py-4"
              style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
            >
              <div className="mb-1 text-[17px] font-semibold text-white">{tPlay("chatTitle")}</div>
              <div className="mb-3 text-[13px] leading-6 text-white/60">
                {tPlay("chatSpectatorsHint")}
              </div>
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {social.chatLoading ? (
                  <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {tPlay("chatLoading")}
                  </div>
                ) : social.chatMessages.length === 0 ? (
                  <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {tPlay("chatEmpty")}
                  </div>
                ) : (
                  social.chatMessages.map((line) => (
                    <div
                      key={line.id}
                      className="rounded-[10px] border border-white/6 bg-black/10 px-3 py-2.5"
                    >
                      <div className="mb-1 truncate text-[11px] text-white/42">
                        {truncateAddress(line.author)}
                      </div>
                      <div className="text-[13px] leading-6 text-white/78">{line.text}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 space-y-2">
                {!canWriteChat ? (
                  <div className="rounded-[10px] bg-black/10 px-3 py-2 text-[13px] text-white/55">
                    {tPlay("chatLogin")}
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
                      placeholder={tPlay("chatPlaceholderSpectator")}
                      className="min-h-[76px] w-full rounded-[12px] border border-white/10 bg-black/12 px-3 py-3 text-[13px] text-white outline-none placeholder:text-white/28"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => void onPostChat()}
                        disabled={social.postingChat || chatDraft.trim().length === 0}
                        className="cursor-pointer rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {social.postingChat ? tPlay("chatSending") : tPlay("chatSend")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
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
