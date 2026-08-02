"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChessCashierLauncher } from "@/components/dashboard/casino/chess/chess-cashier-launcher";
import { useChessMatch } from "@/hooks/use-casino-chess";
import { useMatchMarket, usePlaceBet } from "@/hooks/use-casino-betting";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
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
import { toast } from "@/lib/toast";
import type { BetSelection, ChessColor } from "@/lib/casino/api/types";

// The selection ids double as keys in the common chess namespace, which
// carries the localized side names.
const SELECTIONS: readonly BetSelection[] = ["white", "draw", "black"];

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
}: {
  label: string;
  pieces: ReturnType<typeof capturedFromBoard>["w"];
  lead: number;
  color: ChessColor;
  clock: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className="flex min-w-0 items-center gap-3 rounded-[8px] px-3 py-2.5"
        style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-white/10 font-sans text-[0.96rem] font-bold text-white/30">
          P
        </span>
        <div className="min-w-0">
          <div className="truncate font-sans text-[0.96rem] font-bold text-white">{label}</div>
          <CapturedRow pieces={pieces} lead={lead} color={color} />
        </div>
      </div>
      <div
        className="tnum flex min-w-[108px] shrink-0 items-center justify-center rounded-[8px] px-3.5 py-2 text-[1rem] font-semibold text-white/88"
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
  const wallet = useCasinoWallet();
  const { match, clocks, isLoading, error } = useChessMatch(matchId);
  const theme = useBoardTheme();
  const { odds, myBets } = useMatchMarket(matchId, wallet.address ?? null);
  const cashier = useChessCashierStatus();
  const placeBet = usePlaceBet();

  const [selection, setSelection] = useState<BetSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");

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
  const blackLabel = match.black
    ? `${match.black.username} (${match.black.rating})`
    : tCommon("black");
  const whiteLabel = match.white
    ? `${match.white.username} (${match.white.rating})`
    : tCommon("white");

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

  return (
    <div className="mx-auto w-full max-w-[1560px] px-4 pb-8 sm:px-6 lg:px-8">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,944px)_430px]">
        <section
          className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:sticky xl:top-[88px] xl:self-start"
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
              />
            </div>

            <div className="overflow-hidden rounded-[2px]">
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
                clock={formatClock(clocks?.w ?? 0)}
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
              <div className="ws-display mb-1 text-[17px] text-white">{t("liveMarket")}</div>
              <div className="text-[0.92rem] leading-6 text-white/60">
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
                              ? "border-white/40 bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                              : won
                                ? "border-up/50 bg-up/10 text-white"
                                : "border-white/10 bg-white/4 text-white hover:border-white/25"
                          }`}
                        >
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
                          className={`${CHESS_PRIMARY_BUTTON_CLASS} rounded-lg px-4 font-sans text-[12px] font-bold`}
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
        </aside>
      </div>
    </div>
  );
}
