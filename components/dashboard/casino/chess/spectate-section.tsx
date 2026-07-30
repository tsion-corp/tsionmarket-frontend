"use client";

import { useState } from "react";
import { useChessMatch } from "@/hooks/use-casino-chess";
import { useMatchMarket, usePlaceBet } from "@/hooks/use-casino-betting";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { parseFen } from "@/lib/casino/chess/engine";
import { amountUsd, usdToWei } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BetSelection } from "@/lib/casino/api/types";

const SELECTIONS: Array<{ id: BetSelection; label: string }> = [
  { id: "white", label: "White" },
  { id: "draw", label: "Draw" },
  { id: "black", label: "Black" },
];

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function SpectateSection({ matchId }: { matchId: string | null }) {
  const wallet = useCasinoWallet();
  const { match, clocks, isLoading, error } = useChessMatch(matchId);
  const { odds, history, myBets } = useMatchMarket(matchId);
  const placeBet = usePlaceBet();

  const [selection, setSelection] = useState<BetSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");

  if (!matchId) {
    return (
      <div className="mx-auto w-full max-w-[1160px] px-4 pt-10 pb-20">
        <CasinoEmpty>No match selected. Pick a live game from the lobby to watch it.</CasinoEmpty>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1160px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject="this match" />
      </div>
    );
  }
  if (isLoading || !match) {
    return (
      <div className="mx-auto w-full max-w-[1160px] px-4 pt-10 pb-20">
        <CasinoLoading label="Loading the match" rows={6} />
      </div>
    );
  }

  let board = null;
  try {
    board = parseFen(match.fen).board;
  } catch {
    board = null;
  }

  const stakeUsd = Number(stakeInput) || 0;
  const stakeWei = usdToWei(stakeUsd, wallet.unitPriceUsd);
  const selectedOdds =
    odds && selection
      ? selection === "white"
        ? odds.white
        : selection === "draw"
          ? odds.draw
          : odds.black
      : 0;
  const affordable = stakeWei > 0n && wallet.canAfford(stakeWei);
  const canBet = !!selection && !!odds && affordable && !placeBet.isPending;

  // Spectator stakes come from the same platform balance as playing does, and
  // settle back into it. The odds shown are sent with the bet so the server
  // can reject a fill at a materially worse price rather than silently taking
  // it.
  const onPlaceBet = async () => {
    if (!selection || !odds || !matchId) return;
    if (!wallet.connected) {
      toast.error("Connect your wallet to bet.");
      return;
    }
    if (!affordable) {
      toast.error("Not enough balance for that stake. Add money and try again.");
      return;
    }
    const id = toast.loading("Placing your bet…");
    try {
      const slip = await placeBet.mutateAsync({
        matchId,
        selection,
        stakeWei: stakeWei.toString(),
        expectedOdds: selectedOdds,
      });
      toast.success(
        `Bet placed at ${slip.lockedOdds.toFixed(2)} — ${wallet.format(
          amountUsd(slip.potentialPayout, wallet.unitPriceUsd)
        )} to win.`,
        { id }
      );
      setStakeInput("");
      setSelection(null);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't place that bet."), { id });
    }
  };

  // Sparkline over the server's published odds history.
  const points = history.length > 1 ? history : [];
  const values = points.map((p) => p.white);
  const min = values.length ? Math.min(...values) : 0;
  const range = Math.max(0.01, (values.length ? Math.max(...values) : 1) - min);
  const sparkPoints = points
    .map(
      (p, i) =>
        `${((i / (points.length - 1)) * 240).toFixed(1)},${(52 - ((p.white - min) / range) * 42).toFixed(1)}`
    )
    .join(" ");

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 pt-6 pb-20 sm:px-6">
      <div className="tnum mb-4 flex flex-wrap gap-5 text-[13px]">
        <div>
          <span className="font-normal text-white/50">Pot </span>
          <span className="text-grey-100 font-semibold">
            {wallet.format(amountUsd(match.pot, wallet.unitPriceUsd))}
          </span>
        </div>
        <div>
          <span className="font-normal text-white/50">Watching </span>
          <span>{match.spectatorCount}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="min-w-[320px] flex-1">
          <div className="mb-2.5 flex max-w-[520px] items-center justify-between text-[13.5px]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-white/8" />
              <span className="truncate">
                {match.black ? `${match.black.username} (${match.black.rating})` : "Black"}
              </span>
            </div>
            <div className="tnum ws-inset rounded-lg px-3 py-1 text-[16px]">
              {formatClock(clocks?.b ?? 0)}
            </div>
          </div>

          <div className="max-w-[520px]">
            {board ? <ChessBoard board={board} /> : <CasinoLoading rows={1} />}
          </div>

          <div className="mt-2.5 flex max-w-[520px] items-center justify-between text-[13.5px]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-white/8" />
              <span className="truncate">
                {match.white ? `${match.white.username} (${match.white.rating})` : "White"}
              </span>
            </div>
            <div className="tnum ws-inset rounded-lg px-3 py-1 text-[16px]">
              {formatClock(clocks?.w ?? 0)}
            </div>
          </div>
        </div>

        {/* Live market */}
        <div className="ws-glass h-fit w-full shrink-0 rounded-2xl p-4.5 md:w-[320px]">
          <div className="ws-display mb-3 text-[15px]">Live market</div>

          {!odds ? (
            <CasinoLoading label="Loading odds" rows={2} />
          ) : (
            <>
              <div className="mb-3.5 grid grid-cols-3 gap-2">
                {SELECTIONS.map((s) => {
                  const price =
                    s.id === "white" ? odds.white : s.id === "draw" ? odds.draw : odds.black;
                  const active = selection === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelection(s.id)}
                      className={`cursor-pointer rounded-[10px] border py-3 text-center transition-colors ${
                        active
                          ? "text-ink border-white bg-white"
                          : "border-white/10 bg-white/4 text-white hover:border-white/25"
                      }`}
                    >
                      <span className="block text-[11px] opacity-70">{s.label}</span>
                      <span className="tnum block text-[19px]">{price.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-4">
                <div className="mb-1.5 flex justify-between text-[11px] font-normal text-white/50">
                  <span>White win probability</span>
                  <span className="tnum">{odds.whiteWinProbability}%</span>
                </div>
                <div className="flex h-[7px] overflow-hidden rounded-[4px] bg-white/10">
                  <div
                    className="h-full bg-white transition-[width] duration-500"
                    style={{ width: `${odds.whiteWinProbability}%` }}
                  />
                </div>
              </div>

              <div className="mb-3.5 border-t border-white/8 pt-3.5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-normal text-white/50">
                  <span>Place a bet</span>
                  <span className="tnum">Balance {wallet.format(wallet.balanceUsd)}</span>
                </div>
                <div className="mb-2.5 flex gap-2">
                  <input
                    value={stakeInput}
                    onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    placeholder="Stake"
                    className="ws-inset tnum focus:border-accent/50 min-w-0 flex-1 rounded-lg px-2.5 py-2 font-sans text-[13px] text-white outline-none"
                  />
                  <button
                    onClick={() => void onPlaceBet()}
                    disabled={!canBet}
                    className="text-ink cursor-pointer rounded-lg bg-white px-4 font-sans text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {placeBet.isPending ? "…" : "Place bet"}
                  </button>
                </div>
                {selection && stakeUsd > 0 ? (
                  <div className="text-[11.5px] font-normal text-white/50">
                    {affordable
                      ? `${wallet.format(stakeUsd)} on ${selection} at ${selectedOdds.toFixed(2)} returns ${wallet.format(stakeUsd * selectedOdds)}`
                      : "Not enough balance for that stake."}
                  </div>
                ) : null}
              </div>

              {myBets.length > 0 ? (
                <div className="mb-3.5 border-t border-white/8 pt-3.5">
                  <div className="mb-2 text-[11px] font-normal text-white/50">Your bets</div>
                  <div className="flex flex-col gap-1.5">
                    {myBets.map((b) => (
                      <div
                        key={b.id}
                        className="ws-inset flex items-center justify-between rounded-[10px] px-3 py-2 text-[12px]"
                      >
                        <span className="capitalize">
                          {b.selection} @ {b.lockedOdds.toFixed(2)}
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
                          {wallet.format(amountUsd(b.potentialPayout, wallet.unitPriceUsd))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {points.length > 1 ? (
                <div>
                  <div className="mb-1.5 text-[11px] font-normal text-white/50">Odds movement</div>
                  <svg viewBox="0 0 240 56" className="block h-[56px] w-full">
                    <polyline
                      points={sparkPoints}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-accent"
                    />
                  </svg>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
