"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { CashierSheet } from "@/features/casino/components/chess/cashier-sheet";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { useChessMatch, useChessMatchSocial } from "@/features/casino/hooks/use-casino-chess";
import { useMatchMarket, usePlaceBet } from "@/features/casino/hooks/use-casino-betting";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { useBoardTheme } from "@/features/casino/lib/chess/board-theme";
import {
  matchActorLabel,
  playerDisplayName,
  playerIdentityLabel,
} from "@/features/casino/lib/chess/social";
import { LiveChatFeed } from "@/features/casino/components/live-chat-feed";
import { CapturedRow } from "@/features/casino/components/chess/captured-row";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_MODAL_CLOSE_BUTTON_CLASS,
  CHESS_MODAL_PANEL_CLASS,
  CHESS_PAGE_BOARD_MAX_WIDTH,
  CHESS_PRIMARY_BUTTON_CLASS,
  CHESS_SHELL_BG,
  CHESS_SHELL_SHADOW,
  CHESS_SIDEBAR_BG,
  CHESS_SURFACE_BG,
} from "@/features/casino/lib/chess/ui";
import { CasinoEmpty, CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  capturedFromBoard,
  isInCheck,
  kingPos,
  parseFen,
} from "@/features/casino/lib/chess/engine";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import {
  exceedsUsdcBalance,
  hasPositiveUsdc,
  normalizeUsdcAmount,
  parseUsdcAmount,
  USDC_DECIMALS,
} from "@/features/casino/lib/api/cashier";
import { estimatePariMutuelReturn, impliedProbability } from "@/features/casino/lib/betting-math";
import { formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { friendlyError, isConflictError } from "@/lib/errors";
import { track } from "@/lib/analytics/mixpanel";
import { toast } from "@/lib/toast";
import type {
  BetSelection,
  BetSlip,
  ChessColor,
  ChessMatch,
} from "@/features/casino/lib/api/types";
import { formatChessClock, lowChessClockClass } from "@/features/casino/lib/chess/clock";

const LiveVideoPlayer = dynamic(
  () =>
    import("@/features/casino/components/chess/broadcast").then((module) => module.LiveVideoPlayer),
  { ssr: false }
);

// The selection ids double as keys in the common chess namespace, which
// carries the localized side names.
const SELECTIONS: readonly BetSelection[] = ["white", "draw", "black"];

function settledReturnUsdc(bets: readonly BetSlip[]): string {
  const returned = bets.reduce((total, bet) => {
    if (bet.state === "refunded") {
      return total + toBaseUnits(bet.stakeUsdc, USDC_DECIMALS);
    }
    if (bet.state === "won" && bet.payoutUsdc) {
      return total + toBaseUnits(bet.payoutUsdc, USDC_DECIMALS);
    }
    return total;
  }, 0n);
  return fromBaseUnits(returned, USDC_DECIMALS);
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

  // Opening a live board to watch. Keyed on the match so switching boards
  // reports each one, and a re-render of the same board does not.
  useEffect(() => {
    if (matchId) track("game_watched", { game: "chess", match_id: matchId });
  }, [matchId]);
  const theme = useBoardTheme();
  const { odds, myBets, error: oddsError } = useMatchMarket(matchId, wallet.address ?? null);
  const cashier = useChessCashierStatus();
  const placeBet = usePlaceBet();
  // A watcher is a spectator: only the public spectator room, never a seat.
  const social = useChessMatchSocial(matchId, "spectator", false, null, null);

  const [selection, setSelection] = useState<BetSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [withdrawReturnOpen, setWithdrawReturnOpen] = useState(false);

  // Parsed once per position, not once per 250ms clock tick: stable board,
  // check-square, and captured identities let the memoized ChessBoard and the
  // strips skip the tick re-renders, which is what kept the betting panel
  // smooth once busy games brought long chats with them.
  const position = useMemo(() => {
    if (!match) return { board: null, checkSquare: null, captured: null };
    let parsed = null;
    try {
      parsed = parseFen(match.fen).board;
    } catch {
      parsed = null;
    }
    return {
      board: parsed,
      checkSquare: parsed && isInCheck(parsed, match.turn) ? kingPos(parsed, match.turn) : null,
      captured: parsed ? capturedFromBoard(parsed) : null,
    };
  }, [match]);

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

  const { board, checkSquare, captured } = position;
  const capturedFor = (colour: ChessColor) =>
    captured ? (colour === "w" ? captured.b : captured.w) : [];
  const leadFor = (colour: ChessColor) => {
    if (!captured) return 0;
    const advantage = colour === "w" ? captured.advantage : -captured.advantage;
    return advantage > 0 ? advantage : 0;
  };
  const seatLabel = (player: NonNullable<ChessMatch["white"]>) =>
    playerIdentityLabel(player.username, player);
  const blackLabel = match.black ? seatLabel(match.black) : tCommon("black");
  const whiteLabel = match.white ? seatLabel(match.white) : tCommon("white");
  const videoParticipants = [
    match.white
      ? {
          identities: [match.white.id, match.white.walletAddress, match.white.username],
          label: whiteLabel,
        }
      : null,
    match.black
      ? {
          identities: [match.black.id, match.black.walletAddress, match.black.username],
          label: blackLabel,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
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
  const usd = formatUsd;
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
      // Announce the bet in the spectator chat so everyone watching sees who
      // staked what, aviator-style. The bet itself already succeeded, so a
      // failed announcement must not surface as a betting error.
      social
        .postChat({
          room: "spectator",
          // The canonical decimal string, not toFixed(2): a sub-cent stake
          // must announce as $0.001, never as $0.00.
          text: t("chatBetPlaced", {
            stake: `$${stakeUsdc}`,
            selection: tCommon(selection),
          }),
        })
        .catch((chatError) => {
          console.warn("[Spectate] Could not announce bet in chat:", chatError);
        });
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
  const returnUsdc = settledReturnUsdc(myBets);
  const hasSettledReturn = hasPositiveUsdc(returnUsdc);
  const betsSettling = myBets.some((bet) => bet.state === "active");
  const allBetsRefunded = myBets.length > 0 && myBets.every((bet) => bet.state === "refunded");
  const withdrawalFeePct =
    cashier.config?.withdrawalFeeBps === undefined ? null : cashier.config.withdrawalFeeBps / 100;
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
      <div className="grid gap-6 xl:grid-cols-[minmax(216px,280px)_minmax(0,944px)_430px]">
        {/* The spectator comments, TikTok-live style: no panel, no chrome —
            lines float up a transparent column to the left of the board and
            dissolve, with a minimal say-something bar at the foot. On phones
            the column stacks between the board and the market. */}
        <aside className="order-2 flex h-[340px] flex-col rounded-[8px] border border-white/6 bg-black/20 p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:order-none xl:h-[calc(100dvh-140px)] xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
          {match.videoEnabled && !over ? (
            <LiveVideoPlayer
              matchId={match.id}
              viewer="spectator"
              participants={videoParticipants}
              className="mb-3 shrink-0"
            />
          ) : null}
          <LiveChatFeed
            messages={social.chatMessages}
            labelFor={(line) =>
              matchActorLabel({
                actor: line.author,
                match,
                walletAddress: wallet.address ?? null,
                whiteDisplayName: whiteChatLabel,
                blackDisplayName: blackChatLabel,
                youLabel: tPlay("you"),
              })
            }
            viewer={wallet.address ?? null}
            emptyHint={social.chatLoading ? tPlay("chatLoading") : tPlay("chatEmpty")}
            className="min-h-0 flex-1"
          />
          <div className="mt-3 shrink-0">
            {!canWriteChat ? (
              <div className="rounded-full border border-dashed border-white/12 bg-black/30 px-4 py-2.5 text-[12.5px] text-white/50">
                {tPlay("chatLogin")}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-white/12 bg-black/40 py-1.5 pr-1.5 pl-4 backdrop-blur-[2px]">
                <input
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void onPostChat();
                  }}
                  placeholder={tPlay("chatPlaceholderSpectator")}
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
                />
                <button
                  onClick={() => void onPostChat()}
                  disabled={social.postingChat || chatDraft.trim().length === 0}
                  className="text-ink shrink-0 cursor-pointer rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {social.postingChat ? tPlay("chatSending") : tPlay("chatSend")}
                </button>
              </div>
            )}
          </div>
        </aside>
        <section
          className="order-1 rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:order-none"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: CHESS_PAGE_BOARD_MAX_WIDTH }}>
            <div className="mb-3">
              <PlayerStrip
                label={blackLabel}
                pieces={capturedFor("b")}
                lead={leadFor("b")}
                color="w"
                clock={formatChessClock(clocks?.b ?? 0)}
                lowClock={lowChessClockClass(clocks?.b ?? 0, live)}
              />
            </div>

            <div className="relative overflow-hidden rounded-[2px]">
              {board ? (
                <ChessBoard board={board} theme={theme} checkSquare={checkSquare} />
              ) : (
                <CasinoLoading rows={1} />
              )}
            </div>

            <div className="mt-3">
              <PlayerStrip
                label={whiteLabel}
                pieces={capturedFor("w")}
                lead={leadFor("w")}
                color="b"
                clock={formatChessClock(clocks?.w ?? 0)}
                lowClock={lowChessClockClass(clocks?.w ?? 0, live)}
              />
            </div>
          </div>
        </section>

        <aside
          className="order-3 flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-white/6 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:order-none xl:h-[calc(100dvh-140px)]"
          style={{ background: CHESS_SIDEBAR_BG }}
        >
          <div className="border-b border-white/6 px-4 pt-4 pb-4 sm:px-5">
            <div className="text-[15px] font-semibold text-white">{t("liveMarket")}</div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
              <div
                className="rounded-[16px] border border-white/6 px-4 py-4"
                style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
              >
                <div className="text-[13px] leading-6 text-white/60">
                  Watching is free. Staking here uses your chess balance, not the Base wallet
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
                  oddsError ? (
                    // The odds endpoint failed (e.g. the service has no
                    // market for this match). An endless skeleton reads as
                    // a hang; say what happened instead. Polling continues,
                    // so the card recovers by itself if the market appears.
                    <div className="ws-inset rounded-[10px] px-3 py-2 text-[12px] text-white/65">
                      {t("marketUnavailable")}
                    </div>
                  ) : (
                    <CasinoLoading label={t("loadingOdds")} rows={2} />
                  )
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
            </div>
          </div>
        </aside>
      </div>

      {over ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-4 backdrop-blur-md">
          <div className="ws-glass max-h-[calc(100dvh-2rem)] w-full max-w-[380px] overflow-y-auto rounded-2xl px-5 py-7 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)] sm:px-8 sm:py-9">
            <div className="text-[17px] font-semibold text-white">{resultText}</div>

            {myBets.length > 0 ? (
              <div className="mt-4 rounded-[12px] border border-[#817d75]/35 bg-[#34312d] px-3.5 py-3 text-left">
                <div className="text-[0.7rem] font-semibold tracking-[0.08em] text-white/48 uppercase">
                  {betsSettling
                    ? t("settlingBets")
                    : allBetsRefunded
                      ? t("refundCredited")
                      : hasSettledReturn
                        ? t("returnCredited")
                        : t("noReturn")}
                </div>

                {betsSettling ? (
                  <div className="mt-1 text-[0.78rem] leading-5 text-white/58">
                    {t("settlingBetsBody")}
                  </div>
                ) : hasSettledReturn ? (
                  <>
                    <div className="tnum mt-1 text-[1.22rem] font-semibold text-[#8fcf64]">
                      +{returnUsdc} USDC
                    </div>
                    <div className="mt-1 text-[0.78rem] leading-5 text-white/58">
                      {t("returnCreditedBody")}
                    </div>
                    <div className="tnum mt-2 text-[0.75rem] text-white/44">
                      {tPlay("chessBalanceNow", { amount: cashier.available })}
                    </div>
                    {withdrawalFeePct !== null ? (
                      <div className="mt-1 text-[0.72rem] text-white/38">
                        {tPlay("withdrawalFeeApplies", { pct: withdrawalFeePct })}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setWithdrawReturnOpen(true)}
                      className={`${CHESS_PRIMARY_BUTTON_CLASS} mt-3 w-full rounded-lg px-4 py-2.5 font-sans text-[12px] font-medium`}
                    >
                      {tPlay("withdrawToWallet")}
                    </button>
                  </>
                ) : (
                  <div className="mt-1 text-[0.78rem] leading-5 text-white/58">
                    {t("noReturnBody")}
                  </div>
                )}
              </div>
            ) : null}

            <Link
              href="/casino/chess"
              className="text-ink mt-6 inline-block w-full cursor-pointer rounded-full bg-white p-3 text-[13px] font-semibold"
            >
              {tPlay("backToLobby")}
            </Link>
          </div>
        </div>
      ) : null}

      <ModalShell
        open={withdrawReturnOpen}
        onClose={() => setWithdrawReturnOpen(false)}
        contentKey="chess-spectator-return-withdraw"
        panelClassName={CHESS_MODAL_PANEL_CLASS}
        closeButtonClassName={CHESS_MODAL_CLOSE_BUTTON_CLASS}
      >
        <CashierSheet onClose={() => setWithdrawReturnOpen(false)} initialMode="withdraw" />
      </ModalShell>
    </div>
  );
}
