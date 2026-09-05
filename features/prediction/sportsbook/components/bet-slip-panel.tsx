"use client";

import { useEffect, useId, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePrices } from "@/hooks/use-prices";
import type { SportsbookCapabilities } from "../api";
import { usePlaceSportsbookOrder } from "../hooks/use-place-order";
import { useBetCalculation, useSportsbookMarkets } from "../hooks/use-sportsbook";
import {
  atomicToDecimal,
  combinedOdds,
  compareDecimals,
  decimalToAtomic,
  estimatedPayout,
  formatUsdcAmount,
  settlementTokenPriceUsd,
  tokenToUsdcAmount,
  usdcToTokenAmount,
} from "../money";
import { updateSportsbookSlip, useSportsbookSlip } from "../slip-store";
import { reconcileSlipSelections } from "../slip-reconciliation";
import { TicketsPanel } from "./tickets-panel";

const QUICK_STAKES = ["2", "5", "10"];

interface BetSlipPanelProps {
  capabilities: SportsbookCapabilities | undefined;
  initialTab?: "slip" | "tickets";
  onTicket: (ticketId: string) => void;
  onClose?: () => void;
  embedded?: boolean;
}

function BetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8.5 10 3.5-2 3.5 2-1.3 4H9.8L8.5 10Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function BetSlipPanel({
  capabilities,
  initialTab = "slip",
  onTicket,
  onClose,
  embedded = false,
}: BetSlipPanelProps) {
  const [tab, setTab] = useState<"slip" | "tickets">(initialTab);
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null);
  const inputId = useId();
  const { authenticated, login } = usePrivy();
  const ethPriceUsd = usePrices(["ETH"]).ETH ?? 0;
  const slip = useSportsbookSlip();
  const placement = usePlaceSportsbookOrder();
  const currentMarkets = useSportsbookMarkets(slip.selections.map(({ eventId }) => eventId));
  const reconciliation = currentMarkets.data
    ? reconcileSlipSelections(slip.selections, currentMarkets.data)
    : null;
  const unavailableSelections = new Set(reconciliation?.unavailableSelectionIds ?? []);
  const calculation = useBetCalculation(
    slip.selections.map(({ conditionId, outcomeId }) => ({ conditionId, outcomeId }))
  );
  const decimals = calculation.data?.token.decimals ?? capabilities?.token.decimals ?? 18;
  const token = calculation.data?.token.symbol ?? capabilities?.token.symbol ?? "WETH";
  const tokenPriceUsd = settlementTokenPriceUsd(token, ethPriceUsd);
  const settlementStake =
    tokenPriceUsd === null ? null : usdcToTokenAmount(slip.stake, tokenPriceUsd, decimals);
  const settlementStakeAtomic = settlementStake ? decimalToAtomic(settlementStake, decimals) : null;
  const settlementPreview = settlementStakeAtomic
    ? atomicToDecimal(settlementStakeAtomic, decimals, 6)
    : null;
  const odds = combinedOdds(slip.selections.map(({ odds: value }) => value));
  const estimate = estimatedPayout(slip.stake, odds, 6);
  const stakeAtomic = decimalToAtomic(slip.stake, 6);
  const belowMinimum =
    calculation.data && settlementStake
      ? compareDecimals(settlementStake, calculation.data.minimumStake, decimals) === -1
      : false;
  const aboveMaximum =
    calculation.data && settlementStake
      ? compareDecimals(settlementStake, calculation.data.maximumStake, decimals) === 1
      : false;
  const minimumUsdc =
    calculation.data && tokenPriceUsd
      ? tokenToUsdcAmount(calculation.data.minimumStake, tokenPriceUsd, decimals)
      : null;
  const invalidStake =
    stakeAtomic == null ||
    stakeAtomic <= 0n ||
    settlementStake === null ||
    belowMinimum ||
    aboveMaximum;
  const busy = placement.isPending;
  const slipFingerprint = `${slip.stake}:${slip.selections
    .map(({ id, odds: selectionOdds }) => `${id}@${selectionOdds}`)
    .join("|")}`;
  const comboNeedsReview = slip.selections.length > 1 && reviewedFingerprint !== slipFingerprint;
  useEffect(() => {
    if (!reconciliation?.changed) return;
    updateSportsbookSlip((current) => ({ ...current, selections: reconciliation.selections }));
    placement.reset();
  }, [placement, reconciliation]);
  const action = !authenticated
    ? "Sign in to place a bet"
    : placement.phase === "quoting"
      ? "Getting USDC rate..."
      : placement.phase === "preparing"
        ? "Checking odds..."
        : placement.phase === "funding"
          ? "Funding bet with USDC..."
          : placement.phase === "signing"
            ? "Confirm bet in wallet..."
            : placement.phase === "submitting"
              ? "Creating ticket..."
              : comboNeedsReview
                ? `Review ${slip.selections.length}-leg combo`
                : slip.selections.length > 1
                  ? `Confirm ${slip.selections.length}-leg combo`
                  : "Place bet";

  async function place() {
    if (!authenticated) {
      login();
      return;
    }
    if (invalidStake || !settlementStake || slip.selections.length === 0) return;
    if (comboNeedsReview) {
      setReviewedFingerprint(slipFingerprint);
      return;
    }
    const order = await placement.mutateAsync({
      selections: slip.selections,
      stakeUsdc: slip.stake,
      expectedWeth: settlementStake,
    });
    updateSportsbookSlip((current) => ({ ...current, selections: [] }));
    onTicket(order.ticketId);
  }

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden bg-[#111] ${
        embedded
          ? "h-full"
          : onClose
            ? "h-[min(86dvh,720px)] rounded-t-xl border border-[#333] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            : "rounded-xl border border-[#333]"
      }`}
    >
      <header className="flex min-h-14 items-center border-b border-[#242424] p-2">
        <div className="grid h-10 flex-1 grid-cols-2 rounded-xl bg-[#171717] p-1">
          <button
            type="button"
            onClick={() => setTab("slip")}
            className={`cursor-pointer rounded-lg text-[12px] font-medium ${tab === "slip" ? "bg-[#242424] text-[#ebebeb]" : "text-[#999]"}`}
          >
            Betslip ({slip.selections.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("tickets")}
            className={`cursor-pointer rounded-lg text-[12px] font-medium ${tab === "tickets" ? "bg-[#242424] text-[#ebebeb]" : "text-[#999]"}`}
          >
            My bets
          </button>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bet slip"
            className="ml-2 grid size-9 cursor-pointer place-items-center rounded-full bg-[#242424] text-[#999]"
          >
            ×
          </button>
        ) : null}
      </header>

      {tab === "tickets" ? (
        <TicketsPanel onOpen={onTicket} />
      ) : slip.selections.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-[#333] bg-[#242424] text-[#7e7e7e]">
            ＋
          </div>
          <p className="mt-4 text-[13px] font-semibold text-[#ebebeb]">Betslip is empty</p>
          <p className="mx-auto mt-1.5 max-w-[230px] text-[10px] leading-4 text-[#7e7e7e]">
            Pick any odds on the board to add a selection.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="max-h-[390px] min-h-0 [scrollbar-width:thin] overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-3 text-[10px] text-[#999]">
              <span className="rounded-md bg-[#3b3b3b] px-2 py-1">
                {slip.selections.length > 1 ? `${slip.selections.length}-leg combo` : "Single bet"}
              </span>
              <button
                type="button"
                onClick={() => updateSportsbookSlip((current) => ({ ...current, selections: [] }))}
                className="cursor-pointer font-medium text-[#999] hover:text-[#ebebeb]"
              >
                Clear all
              </button>
              {calculation.isLoading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-[#555] border-t-[#b9fcff]" />
              ) : null}
            </div>
            {slip.selections.map((selection) => (
              <article
                key={selection.id}
                className={`m-3 rounded-lg bg-[#2e2e2e] px-3 py-3 ${
                  unavailableSelections.has(selection.id) ? "ring-1 ring-[#f42e52]" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <BetIcon />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] text-[#999]">{selection.eventTitle}</p>
                    <p className="mt-2 text-[10px] text-[#7e7e7e]">{selection.marketTitle}</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[#b9fcff]">
                      {selection.outcomeTitle}
                    </p>
                    {unavailableSelections.has(selection.id) ? (
                      <p className="mt-1 text-[10px] font-medium text-[#f42e52]">
                        Market is no longer available
                      </p>
                    ) : null}
                  </div>
                  <span className="text-[12px] font-semibold text-[#ebebeb] tabular-nums">
                    {selection.odds}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${selection.outcomeTitle}`}
                    onClick={() =>
                      updateSportsbookSlip((current) => ({
                        ...current,
                        selections: current.selections.filter(({ id }) => id !== selection.id),
                      }))
                    }
                    className="cursor-pointer text-[#999] hover:text-[#ebebeb]"
                  >
                    ×
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-auto p-3">
            <div className="space-y-3 rounded-2xl bg-[#242424] p-3">
              <div className="flex h-11 items-center rounded-xl border border-[#3b3b3b] bg-[#1f1f1f] px-3 focus-within:border-[#555]">
                <span className="grid size-5 place-items-center rounded-full bg-[#3f8b8e] text-[9px] font-bold text-white">
                  $
                </span>
                <input
                  id={inputId}
                  aria-label="Stake in USDC"
                  inputMode="decimal"
                  value={slip.stake}
                  onChange={(event) =>
                    updateSportsbookSlip((current) => ({ ...current, stake: event.target.value }))
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-[#ebebeb] outline-none"
                />
                <span className="text-[10px] font-semibold text-[#999]">USDC</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_STAKES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      updateSportsbookSlip((current) => ({ ...current, stake: value }))
                    }
                    className="h-8 cursor-pointer rounded-lg bg-[#2e2e2e] text-[10px] text-[#999] hover:text-[#ebebeb]"
                  >
                    ${value}
                  </button>
                ))}
              </div>

              {belowMinimum ? (
                <p className="text-[10px] font-medium text-[#efb72a]">
                  Minimum stake is {formatUsdcAmount(minimumUsdc)} USDC.
                </p>
              ) : null}
              {aboveMaximum ? (
                <p className="text-[10px] font-medium text-[#efb72a]">
                  This stake exceeds the available market limit.
                </p>
              ) : null}
              {calculation.isError ? (
                <p className="text-[10px] font-medium text-[#f42e52]">
                  These selections cannot be calculated right now.
                </p>
              ) : null}
              {unavailableSelections.size > 0 ? (
                <p className="text-[10px] font-medium text-[#f42e52]">
                  Remove unavailable selections before placing this bet.
                </p>
              ) : null}
              {tokenPriceUsd === null ? (
                <p className="text-[10px] font-medium text-[#efb72a]">
                  Live USDC conversion is unavailable. Try again shortly.
                </p>
              ) : null}
              {placement.error ? (
                <p className="text-[10px] leading-4 font-medium text-[#f42e52]">
                  {placement.error.message}
                </p>
              ) : null}
              {!comboNeedsReview && slip.selections.length > 1 && !busy ? (
                <p className="rounded-lg bg-[#b9fcff]/8 px-3 py-2 text-center text-[10px] font-medium text-[#b9fcff]">
                  Confirm all {slip.selections.length} selections shown above.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void place()}
                disabled={
                  busy ||
                  currentMarkets.isLoading ||
                  unavailableSelections.size > 0 ||
                  calculation.isLoading ||
                  (authenticated && invalidStake) ||
                  !capabilities?.features.orderPlacement
                }
                className="h-12 w-full cursor-pointer rounded-2xl bg-[#b9fcff] text-[13px] font-semibold text-[#171717] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {capabilities?.features.orderPlacement === false
                  ? "Betting is temporarily unavailable"
                  : action}{" "}
                →
              </button>
              <p className="text-center text-[10px] text-[#999]">
                Possible win:{" "}
                <span className="text-[#ebebeb]">{formatUsdcAmount(estimate)} USDC</span>
              </p>
              <p className="text-center text-[9px] leading-4 text-[#7e7e7e]">
                {settlementPreview
                  ? `Estimated settlement: ${settlementPreview} ${token}. Uniswap V3 converts the stake and redeemed winnings return as USDC.`
                  : "Loading the live USDC conversion rate..."}
              </p>
              <p className="text-center text-[9px] text-[#7e7e7e]">
                Combined odds {odds} · 1% slippage
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
