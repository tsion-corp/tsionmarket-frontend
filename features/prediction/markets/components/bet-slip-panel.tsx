"use client";

import { useId } from "react";
import { CloseIcon } from "@/components/ui/icons";
import {
  formatUsdE6,
  parseUsdE6,
  referenceReturnE6,
  totalStakeE6,
  type MarketSlipSelection,
} from "../bet-slip";
import type { SinglesBetReceipt } from "../singles-receipt";
import type { useSinglesBatchOrder } from "../hooks/use-singles-batch-order";
import { BookingCodeLookup } from "./booking-code-lookup";
import { CashoutBetsPanel } from "./cashout-bets-panel";

const QUICK_STAKES = ["1", "5", "10", "25"];

export type BetSlipTab = "singles" | "cashout";

interface BetSlipPanelProps {
  selections: MarketSlipSelection[];
  onRemove: (selectionId: string) => void;
  onClear: () => void;
  stake: string;
  onStakeChange: (stake: string) => void;
  executionState: ReturnType<typeof useSinglesBatchOrder>;
  onPlaced: (receipt: SinglesBetReceipt) => void;
  onTicketLoaded: (receipt: SinglesBetReceipt) => void;
  activeTab: BetSlipTab;
  onTabChange: (tab: BetSlipTab) => void;
  onClose?: () => void;
}

export function BetSlipPanel({
  selections,
  onRemove,
  onClear,
  stake,
  onStakeChange,
  executionState,
  onPlaced,
  onTicketLoaded,
  activeTab,
  onTabChange,
  onClose,
}: BetSlipPanelProps) {
  const stakeInputId = useId();
  const stakeE6 = parseUsdE6(stake);
  const returnE6 = stakeE6 ? referenceReturnE6(selections, stakeE6, "singles") : 0n;
  const totalE6 = stakeE6 ? totalStakeE6(selections, stakeE6, "singles") : 0n;
  const busy = executionState.phase !== "idle";
  const mobileSheet = onClose != null;

  const actionLabel = executionState.reconciliationRequired
    ? "Review active positions"
    : executionState.phase === "connecting" || executionState.sessionStatus === "connecting"
      ? "Connecting account..."
      : executionState.phase === "funding"
        ? "Moving Base USDC..."
        : executionState.phase === "settling"
          ? "Waiting for Polygon pUSD..."
          : executionState.phase === "approving"
            ? "Enabling this market..."
            : executionState.phase === "checking"
              ? "Checking market limits..."
              : executionState.sessionStatus === "deploying"
                ? "Setting up account..."
                : executionState.sessionStatus === "approving"
                  ? "Enabling trading..."
                  : executionState.phase === "signing"
                    ? `Preparing ${executionState.preparedCount}/${selections.length}...`
                    : executionState.phase === "placing"
                      ? "Submitting orders..."
                      : `Submit ${selections.length} ${selections.length === 1 ? "order" : "orders"}`;

  async function handleAction() {
    if (executionState.reconciliationRequired) {
      onTabChange("cashout");
      return;
    }
    if (!stakeE6 || selections.length === 0) return;
    const receipt = await executionState.placeBets(selections, stakeE6).catch(() => null);
    if (receipt) onPlaced(receipt);
  }

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden border border-white/10 bg-[#111114] shadow-[0_24px_80px_rgba(0,0,0,0.48)] ${
        mobileSheet
          ? "h-[calc(100dvh-54px)] max-h-[calc(100dvh-54px)] w-full rounded-t-[4px] border-x-0 border-b-0 transition-[height,max-height] duration-200"
          : "rounded-[12px]"
      }`}
    >
      <header
        className={`flex shrink-0 items-center border-b border-white/8 bg-[linear-gradient(180deg,#242429_0%,#1b1b1f_100%)] ${
          mobileSheet ? "min-h-[62px] px-4 pt-2" : "min-h-14 px-4"
        }`}
      >
        <div className="flex items-center gap-2">
          <h2
            className={`${mobileSheet ? "text-[18px]" : "text-[16px]"} font-extrabold text-white`}
          >
            Selections
          </h2>
          <span className="grid min-w-7 place-items-center rounded-full bg-white/12 px-2 py-1 text-[11px] font-black text-white/70">
            {selections.length}
          </span>
        </div>
        {activeTab === "singles" && selections.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto cursor-pointer text-[12px] font-bold text-white/42 transition-colors hover:text-white"
          >
            Remove all
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close selections"
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-[8px] bg-white/7 text-white/55 hover:bg-white/12 hover:text-white"
          >
            <CloseIcon size={15} />
          </button>
        ) : null}
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-white/8 bg-[#151518] px-1.5 pt-1 pb-0">
        <button
          type="button"
          onClick={() => onTabChange("singles")}
          className={`h-10 cursor-pointer rounded-t-[4px] text-[14px] font-extrabold transition-colors ${
            activeTab === "singles"
              ? "bg-[linear-gradient(180deg,#d9d9dc_0%,#aaaab0_100%)] text-black"
              : "text-white/45 hover:bg-white/5 hover:text-white/75"
          }`}
        >
          Singles
        </button>
        <button
          type="button"
          onClick={() => onTabChange("cashout")}
          className={`h-10 cursor-pointer rounded-t-[4px] text-[14px] font-extrabold transition-colors ${
            activeTab === "cashout"
              ? "bg-[linear-gradient(180deg,#d9d9dc_0%,#aaaab0_100%)] text-black"
              : "text-white/45 hover:bg-white/5 hover:text-white/75"
          }`}
        >
          Cashout
        </button>
      </div>

      {activeTab === "cashout" ? (
        <CashoutBetsPanel
          reconciliationRequired={executionState.reconciliationRequired}
          onReconciled={() => {
            executionState.acknowledgeSubmissionReview();
            onTabChange("singles");
          }}
        />
      ) : selections.length === 0 ? (
        <div className="min-h-0 overflow-y-auto bg-[#111114]">
          <div className="px-5 py-10 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-full border border-white/9 bg-white/[0.035] text-[18px] text-white/30">
              +
            </div>
            <p className="mt-4 text-[13px] font-bold text-white/66">Select an outcome to start</p>
            <p className="mx-auto mt-1.5 max-w-[220px] text-[11px] leading-4 text-white/35">
              Your selections, stake and potential return will appear here.
            </p>
          </div>
          <BookingCodeLookup onLoaded={onTicketLoaded} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={`min-h-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain ${
              mobileSheet ? "flex-1" : "max-h-[min(42dvh,430px)]"
            }`}
          >
            {selections.map((selection) => (
              <article key={selection.id} className="border-b border-white/7 px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] leading-4 font-semibold text-white/42">
                      {selection.eventTitle}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-[16px] leading-5 font-extrabold text-white/90">
                      {selection.marketLabel}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-5 font-semibold text-white/52">
                      {selection.outcome}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="pt-0.5 text-[16px] leading-5 font-black text-white tabular-nums">
                      {selection.decimalOdds.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(selection.id)}
                      aria-label={`Remove ${selection.marketLabel}`}
                      className="grid size-7 cursor-pointer place-items-center rounded-[7px] text-white/35 hover:bg-white/7 hover:text-white"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div
            className={`shrink-0 border-t border-white/7 bg-[#111114] ${
              mobileSheet ? "space-y-2 p-3" : "space-y-3 p-4"
            }`}
          >
            <div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor={stakeInputId}
                  className="min-w-0 flex-1 text-[13px] font-bold text-white/52"
                >
                  Stake per selection
                  <span className="ml-1.5 text-[10px] font-semibold text-white/28">pUSD</span>
                </label>
                <div className="flex h-10 w-[46%] items-center rounded-[8px] border border-white/10 bg-black/30 px-3 focus-within:border-white/28">
                  <span className="text-[12px] font-bold text-white/35">$</span>
                  <input
                    id={stakeInputId}
                    inputMode="decimal"
                    value={stake}
                    onChange={(event) => onStakeChange(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-2 text-right text-[17px] font-extrabold text-white tabular-nums outline-none"
                    aria-invalid={stakeE6 == null}
                  />
                </div>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {QUICK_STAKES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onStakeChange(value)}
                    className="h-8 cursor-pointer rounded-[6px] border border-white/8 bg-white/[0.035] text-[12px] font-bold text-white/58 hover:bg-white/8 hover:text-white"
                  >
                    ${value}
                  </button>
                ))}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 border-t border-white/7 pt-2 text-[12px]">
              <div className="min-w-0">
                <dt className="text-white/40">Total stake</dt>
                <dd className="mt-0.5 truncate font-bold text-white/78 tabular-nums">
                  {formatUsdE6(totalE6)}
                </dd>
              </div>
              <div className="min-w-0 text-right">
                <dt className="text-white/52">Estimated return</dt>
                <dd className="mt-0.5 truncate text-[15px] font-black text-white tabular-nums">
                  {formatUsdE6(returnE6)}
                </dd>
              </div>
            </dl>

            {!mobileSheet ? (
              <p className="text-[11px] leading-4 text-white/32">
                Up to 15 orders are submitted together but fill independently. FOK price protection
                prevents an order from filling above its displayed price range.
              </p>
            ) : null}
            {executionState.error ? (
              <p className="text-[10px] leading-4 font-semibold text-red-300/85">
                {executionState.error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void handleAction()}
              disabled={
                busy ||
                (!executionState.reconciliationRequired && (!stakeE6 || selections.length === 0))
              }
              className="h-12 w-full cursor-pointer rounded-[8px] bg-[linear-gradient(180deg,#dedee2_0%,#b4b4ba_100%)] text-[16px] font-black text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
