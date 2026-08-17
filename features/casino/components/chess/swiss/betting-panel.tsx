"use client";

import { useRef, useState } from "react";
import { CasinoLoading } from "@/features/casino/components/casino-state";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { useSwissMarket } from "@/features/casino/hooks/use-swiss-betting";
import {
  exceedsUsdcBalance,
  normalizeUsdcAmount,
  parseUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import { newChessIdempotencyKey } from "@/features/casino/lib/api/chess-idempotency";
import type { SwissDetail } from "@/features/casino/lib/api/swiss";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PRIMARY_BUTTON_CLASS,
} from "@/features/casino/lib/chess/ui";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

function estimateReturn(
  stakeUsdc: string,
  selectedPoolUsdc: string,
  totalPoolUsdc: string,
  rakeBps: number
): number {
  const stake = Number(stakeUsdc);
  const selected = Number(selectedPoolUsdc);
  const total = Number(totalPoolUsdc);
  if (!(stake > 0) || !Number.isFinite(selected) || !Number.isFinite(total)) return 0;
  const losingPool = Math.max(0, total - selected);
  return stake + (stake / (selected + stake)) * losingPool * (1 - rakeBps / 10_000);
}

const STATUS_LABEL = {
  pending: "Opens after round 1 starts",
  open: "Open",
  closed: "Closed",
  settled: "Settled",
  voided: "Refunded",
} as const;

export function SwissBettingPanel({
  detail,
  yourName,
}: {
  detail: SwissDetail;
  yourName: string | null;
}) {
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const market = useSwissMarket(detail.id);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [stakeInput, setStakeInput] = useState("");
  const retryKey = useRef<string | null>(null);

  const selected = market.odds?.outcomes.find((outcome) => outcome.playerId === selectedPlayerId);
  const stakeUsdc = normalizeUsdcAmount(stakeInput);
  const overBalance =
    parseUsdcAmount(stakeInput) !== null && exceedsUsdcBalance(stakeInput, cashier.available);
  const isParticipant = yourName !== null;
  const marketOpen = detail.state === "running" && market.odds?.status === "open";
  const canBet =
    marketOpen &&
    !isParticipant &&
    !!wallet.address &&
    !!selected &&
    !!stakeUsdc &&
    !overBalance &&
    !market.placingBet;
  const estimated =
    selected && stakeUsdc && market.odds
      ? estimateReturn(stakeUsdc, selected.poolUsdc, market.odds.totalPoolUsdc, market.odds.rakeBps)
      : 0;
  const nameFor = (playerId: string) =>
    market.odds?.outcomes.find((outcome) => outcome.playerId === playerId)?.playerName ?? "Player";

  const resetRetryKey = () => {
    retryKey.current = null;
  };

  const onPlaceBet = async () => {
    if (!selected || !stakeUsdc) return;
    if (!wallet.address) {
      toast.error("Connect your wallet to place a bet.");
      return;
    }
    if (overBalance) {
      toast.error(
        `Your ${detail.game === "draughts" ? "checkers" : "chess"} balance is too low for that stake.`
      );
      return;
    }
    retryKey.current ??= newChessIdempotencyKey();
    const id = toast.loading("Placing tournament bet...");
    try {
      await market.placeBet({
        predictedPlayerId: selected.playerId,
        stakeUsdc,
        idempotencyKey: retryKey.current,
      });
      retryKey.current = null;
      setStakeInput("");
      toast.success(`Bet placed on ${selected.playerName}.`, { id });
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't place that tournament bet."), { id });
    }
  };

  return (
    <div
      className="rounded-[16px] border border-white/6 px-4 py-4"
      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-white">Winner market</div>
          <div className="mt-1 text-[11.5px] text-white/46">
            Pick the tournament winner. Current odds move as stakes enter the pool.
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white/60">
          {market.odds ? STATUS_LABEL[market.odds.status] : "Loading"}
        </span>
      </div>

      {market.isLoading ? (
        <div className="mt-4">
          <CasinoLoading label="Loading winner market" rows={2} />
        </div>
      ) : market.error || !market.odds ? (
        <div className="mt-4 rounded-[10px] bg-black/12 px-3 py-2.5 text-[11.5px] text-white/48">
          The winner market is unavailable right now. It will keep checking automatically.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] bg-black/12 px-3 py-2.5">
              <div className="text-[10px] tracking-[0.04em] text-white/34 uppercase">Pool</div>
              <div className="tnum mt-1 text-[13px] text-white/76">
                {market.odds.totalPoolUsdc} USDC
              </div>
            </div>
            <div className="rounded-[10px] bg-black/12 px-3 py-2.5">
              <div className="text-[10px] tracking-[0.04em] text-white/34 uppercase">Rake</div>
              <div className="tnum mt-1 text-[13px] text-white/76">
                {(market.odds.rakeBps / 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {market.odds.status === "settled" && market.odds.winningPlayerId ? (
            <div className="mt-3 rounded-[10px] border border-[#629924]/35 bg-[#315f1f]/25 px-3 py-2.5 text-[12px] text-[#9bce68]">
              Winner: {nameFor(market.odds.winningPlayerId)}
            </div>
          ) : market.odds.status === "voided" ? (
            <div className="mt-3 rounded-[10px] bg-black/12 px-3 py-2.5 text-[11.5px] text-white/52">
              This market was voided and all active stakes were refunded.
            </div>
          ) : null}

          {isParticipant ? (
            <div className="mt-3 rounded-[10px] bg-black/12 px-3 py-2.5 text-[11.5px] text-white/52">
              Tournament players cannot bet on their own event.
            </div>
          ) : marketOpen ? (
            <div className="mt-3 space-y-2.5 border-t border-white/7 pt-3">
              <select
                value={selectedPlayerId}
                onChange={(event) => {
                  setSelectedPlayerId(event.target.value);
                  resetRetryKey();
                }}
                className="w-full rounded-[10px] border border-white/8 bg-[#242220] px-3 py-2.5 text-[12px] text-white outline-none"
              >
                <option value="">Choose a player</option>
                {market.odds.outcomes.map((outcome) => (
                  <option key={outcome.playerId} value={outcome.playerId}>
                    {outcome.playerName} - {outcome.decimalOdds ?? "--"}x - {outcome.poolUsdc} USDC
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  value={stakeInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^\d*\.?\d{0,6}$/.test(value)) {
                      setStakeInput(value);
                      resetRetryKey();
                    }
                  }}
                  placeholder="Stake in USDC"
                  className="tnum min-w-0 flex-1 rounded-[10px] border border-white/8 bg-black/12 px-3 py-2.5 text-[12px] text-white outline-none placeholder:text-white/28"
                />
                <button
                  type="button"
                  onClick={() => void onPlaceBet()}
                  disabled={!canBet}
                  className={`${CHESS_PRIMARY_BUTTON_CLASS} shrink-0 px-4 text-[12px] font-semibold`}
                >
                  {market.placingBet ? "Placing..." : "Place bet"}
                </button>
              </div>
              <div className={`text-[10.5px] ${overBalance ? "text-down" : "text-white/40"}`}>
                Balance {cashier.available} USDC
                {selected && stakeUsdc && !overBalance
                  ? ` · Estimated return ${estimated.toFixed(2)} USDC at the current pool`
                  : ""}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-[10px] bg-black/12 px-3 py-2.5 text-[11.5px] text-white/48">
              {STATUS_LABEL[market.odds.status]}.
            </div>
          )}

          {market.bets.length > 0 ? (
            <div className="mt-4 border-t border-white/7 pt-3">
              <div className="mb-2 text-[10px] tracking-[0.04em] text-white/34 uppercase">
                Your bets
              </div>
              <div className="space-y-1.5">
                {market.bets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex items-center justify-between gap-3 rounded-[9px] bg-black/12 px-3 py-2 text-[11.5px]"
                  >
                    <span className="min-w-0 truncate text-white/62">
                      {nameFor(bet.predictedPlayerId)} · {bet.stakeUsdc} USDC
                    </span>
                    <span
                      className={`tnum shrink-0 font-semibold ${
                        bet.status === "won"
                          ? "text-up"
                          : bet.status === "lost"
                            ? "text-white/34"
                            : "text-white/58"
                      }`}
                    >
                      {bet.status === "active" ? "Active" : `${bet.status} · ${bet.payoutUsdc}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!cashier.configured && marketOpen ? (
            <div className="mt-3">
              <ChessCashierLauncher compact />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
