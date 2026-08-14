"use client";

import { useState } from "react";
import {
  useDraughtsMatchMarket,
  usePlaceDraughtsBet,
} from "@/features/casino/hooks/use-draughts-betting";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { impliedProbability, pariMutuelBreakdown } from "@/features/casino/lib/betting-math";
import {
  exceedsUsdcBalance,
  normalizeUsdcAmount,
  parseUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BetSelection } from "@/features/casino/lib/api/types";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import type { DraughtsSide } from "@/features/casino/lib/draughts/engine";

const SELECTIONS: readonly BetSelection[] = ["white", "draw", "black"];

const LABELS: Record<BetSelection, string> = {
  white: "White",
  draw: "Draw",
  black: "Black",
};

function usd(amount: number): string {
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// The same disc the seat bars use, so an outcome reads as the piece it backs.
function Disc({ side }: { side: DraughtsSide }) {
  return (
    <span
      aria-hidden
      className="mx-auto mb-1 block h-6 w-6 rounded-full border border-black/40"
      style={{
        background:
          side === "white"
            ? "radial-gradient(circle at 32% 28%, #fff 0%, #e8e4d9 100%)"
            : "radial-gradient(circle at 32% 28%, #55555c 0%, #17171b 100%)",
      }}
    />
  );
}

// One row of the payout breakdown.
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 font-sans text-[11.5px] text-white/55">
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

interface SpectatorBettingProps {
  match: DraughtsMatch;
  wallet: string | null;
  className?: string;
}

/**
 * Pari-mutuel spectator betting on a live board: back White, Black, or a draw,
 * and share the losing pool if you are right.
 *
 * The draughts module owns a native market, so this never crosses into the
 * chess match tables even though both games share the same cashier balance.
 */
export function SpectatorBetting({ match, wallet, className = "" }: SpectatorBettingProps) {
  const { odds, myBets, error } = useDraughtsMatchMarket(match.id, wallet);
  const placeBet = usePlaceDraughtsBet();
  const cashier = useChessCashierStatus();

  const [selection, setSelection] = useState<BetSelection | null>(null);
  const [stakeInput, setStakeInput] = useState("");

  // A seat cannot bet on the game it is playing; the service enforces this too.
  const isPlayer =
    !!wallet &&
    [match.white?.walletAddress, match.black?.walletAddress].some(
      (seat) => !!seat && seat.toLowerCase() === wallet.toLowerCase()
    );

  const marketOpen = odds?.status === "open" && match.state === "in_progress";
  const stakeUsdc = normalizeUsdcAmount(stakeInput);
  const stakeValid = stakeUsdc !== null;
  const overBalance =
    parseUsdcAmount(stakeInput) !== null && exceedsUsdcBalance(stakeInput, cashier.available);

  const selectedOdds = odds && selection ? odds.outcomes[selection].odds : null;

  // The rake the service takes off the losing pool. It comes from the cashier
  // config so the panel never states a fee the backend does not charge.
  const rakeBps = odds?.rakeBps ?? cashier.config?.platformFeeBps ?? 500;
  const rakePct = rakeBps / 100;
  const breakdown =
    odds && selection && stakeValid
      ? pariMutuelBreakdown(Number(stakeUsdc), odds, selection, rakeBps)
      : { stake: 0, profit: 0, rake: 0, total: 0, refundOnly: false };

  const canBet =
    marketOpen &&
    !isPlayer &&
    !!wallet &&
    !!selection &&
    stakeValid &&
    !overBalance &&
    !placeBet.isPending;

  const onPlaceBet = async () => {
    if (!selection || !stakeUsdc || !wallet) return;
    try {
      await placeBet.mutateAsync({
        matchId: match.id,
        bettor: wallet,
        selection,
        stakeUsdc,
      });
      setStakeInput("");
      toast.success("Stake placed.");
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't place that stake."));
    }
  };

  const whiteProbability = odds ? impliedProbability(odds, "white") : 50;

  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.02] ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" />
        <span className="font-sans text-[13px] font-semibold text-white">Live market</span>
      </div>

      <div className="space-y-4 p-4">
        {error ? (
          <p className="rounded-[10px] bg-white/[0.04] px-3 py-2.5 font-sans text-[12px] text-white/55">
            No market for this game yet.
          </p>
        ) : null}

        <p className="font-sans text-[12px] leading-relaxed text-white/50">
          Watching is free. Stakes use your casino balance, and the winning side splits the losing
          pool.
        </p>

        <ChessCashierLauncher compact />

        {/* Outcomes. Prices show as em dashes until a real market exists. */}
        <div className="grid grid-cols-3 gap-2">
          {SELECTIONS.map((option) => {
            const outcome = odds?.outcomes[option] ?? null;
            const active = selection === option;
            return (
              <button
                key={option}
                onClick={() => setSelection(option)}
                disabled={!marketOpen || isPlayer}
                className={`cursor-pointer rounded-[10px] border py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                  active
                    ? "border-white/45 bg-white/10 text-white"
                    : "border-white/10 bg-white/[0.04] text-white hover:border-white/25"
                }`}
              >
                {option === "draw" ? (
                  <span aria-hidden className="mx-auto mb-1 block h-6 leading-6 text-white/40">
                    ½
                  </span>
                ) : (
                  <Disc side={option === "white" ? "white" : "black"} />
                )}
                <span className="block font-sans text-[11px] opacity-70">{LABELS[option]}</span>
                <span className="block font-mono text-[17px] tabular-nums">
                  {outcome?.odds != null ? outcome.odds.toFixed(2) : "—"}
                </span>
                <span className="block font-mono text-[10px] tabular-nums opacity-45">
                  {outcome ? usd(Number(outcome.pool)) : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <div className="mb-1.5 flex justify-between font-sans text-[11px] text-white/50">
            <span>White win probability</span>
            <span className="tabular-nums">{Math.round(whiteProbability)}%</span>
          </div>
          <div className="flex h-[7px] overflow-hidden rounded-[4px] bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-500"
              style={{ width: `${whiteProbability}%` }}
            />
          </div>
        </div>

        {isPlayer ? (
          <p className="rounded-[10px] bg-white/[0.04] px-3 py-2.5 font-sans text-[11.5px] text-white/50">
            You are playing this game, so you cannot stake on it.
          </p>
        ) : (
          <div className="border-t border-white/8 pt-3.5">
            <div className="mb-2 flex items-center justify-between font-sans text-[11px] text-white/50">
              <span>Place a stake</span>
              <span className="tabular-nums">Balance {usd(Number(cashier.available || "0"))}</span>
            </div>
            <div className="flex gap-2">
              <input
                value={stakeInput}
                onChange={(event) => setStakeInput(event.target.value.replace(/[^0-9.]/gu, ""))}
                inputMode="decimal"
                disabled={!marketOpen}
                placeholder="0.00"
                className="min-w-0 flex-1 rounded-[12px] border border-white/12 bg-transparent px-3 py-2 font-mono text-[14px] text-white tabular-nums placeholder:text-white/25 focus:border-white/30 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={() => void onPlaceBet()}
                disabled={!canBet}
                className="text-ink shrink-0 cursor-pointer rounded-[12px] bg-white px-4 py-2 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {placeBet.isPending ? "…" : "Stake"}
              </button>
            </div>
            {selection && stakeValid && odds ? (
              overBalance ? (
                <p className="mt-2 font-sans text-[11.5px] text-white/50">Not enough USDC.</p>
              ) : (
                <div className="mt-2.5 rounded-[10px] bg-white/[0.03] px-3 py-2.5">
                  <div className="mb-1.5 font-sans text-[11px] text-white/40">
                    If {LABELS[selection]} wins
                  </div>
                  <Line label="Your stake back" value={usd(breakdown.stake)} />
                  <Line
                    label={
                      breakdown.refundOnly
                        ? "Share of the other side"
                        : `Share of the losing pool, after ${rakePct}% fee`
                    }
                    value={breakdown.refundOnly ? "—" : `+${usd(breakdown.profit)}`}
                  />
                  <div className="mt-1.5 flex justify-between border-t border-white/8 pt-1.5 font-sans text-[12.5px] font-semibold text-white">
                    <span>You collect</span>
                    <span className="tabular-nums">{usd(breakdown.total)}</span>
                  </div>
                  <p className="mt-1.5 font-sans text-[11px] leading-relaxed text-white/35">
                    {breakdown.refundOnly
                      ? "Nobody has staked against this yet. If it stays one-sided the game voids and every stake is refunded in full, with no fee."
                      : `Winners split the losing pool in proportion to what they staked, so this moves as more money comes in. A draw pays whoever picked draw. Settled at ${(selectedOdds ?? 0).toFixed(2)} now.`}
                  </p>
                </div>
              )
            ) : null}
          </div>
        )}

        {myBets.length > 0 ? (
          <div className="border-t border-white/8 pt-3.5">
            <div className="mb-2 font-sans text-[11px] text-white/50">Your stakes</div>
            <ul className="flex flex-col gap-1.5">
              {myBets.map((bet) => (
                <li
                  key={bet.id}
                  className="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2 font-sans text-[12px]"
                >
                  <span className="text-white/70">
                    {LABELS[bet.selection]} · {usd(Number(bet.stakeUsdc))}
                  </span>
                  <span className="text-white/45 tabular-nums">
                    {bet.payoutUsdc ? usd(Number(bet.payoutUsdc)) : bet.state}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
