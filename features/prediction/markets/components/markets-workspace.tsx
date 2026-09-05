"use client";

import { useState } from "react";
import {
  formatReferenceOdds,
  sportsSlipSelection,
  summedReferenceOddsE6,
  toggleSlipSelection,
  type MarketSlipSelection,
} from "../bet-slip";
import { useSinglesBatchOrder } from "../hooks/use-singles-batch-order";
import { updateMarketSlip, usePersistedMarketSlip } from "../market-slip-storage";
import type { SinglesBetReceipt } from "../singles-receipt";
import { isNormalSportCategory, type MarketCategory, type SportsLeagueKey } from "../types";
import { BetSlipPanel, type BetSlipTab } from "./bet-slip-panel";
import { DiscoveryMarketBoard } from "./discovery-market-board";
import { SinglesBetReceiptModal } from "./singles-bet-receipt-modal";
import { SportsMarketBoard } from "./sports-market-board";

interface MarketsWorkspaceProps {
  activeCategory: MarketCategory;
  activeLeague: SportsLeagueKey;
}

function SelectionsTicketIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className="size-8">
      <path
        d="M8.75 9.409h10.79v1.708H8.75V9.41zM19.54 12.825H8.75v1.709h10.79v-1.709zM9.948 16.242h8.392v1.709H9.948v-1.709z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.25 4.995v18.01c0 1.146.981 2.078 2.187 2.078h3.646c.403 0 .73-.31.73-.692 0-1.146.98-2.079 2.187-2.079 1.206 0 2.188.932 2.188 2.078 0 .383.326.693.729.693h3.645c1.207 0 2.188-.932 2.188-2.078V4.995c0-1.146-.981-2.079-2.188-2.079h-3.645c-.403 0-.73.31-.73.693 0 1.146-.98 2.078-2.187 2.078-1.206 0-2.188-.932-2.188-2.078 0-.383-.326-.692-.729-.692H7.438c-1.207 0-2.188.932-2.188 2.078zm2.188-.693h2.99c.338 1.579 1.811 2.77 3.572 2.77 1.761 0 3.233-1.191 3.573-2.77h2.99c.402 0 .729.31.729.693v18.01c0 .382-.327.693-.73.693h-2.99c-.338-1.58-1.811-2.771-3.572-2.771-1.761 0-3.233 1.192-3.572 2.77h-2.99c-.403 0-.73-.31-.73-.692V4.995c0-.383.327-.693.73-.693z"
        fill="currentColor"
      />
    </svg>
  );
}

export function MarketsWorkspace({ activeCategory, activeLeague }: MarketsWorkspaceProps) {
  const { selections, stake } = usePersistedMarketSlip();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BetSlipTab>("singles");
  const [lookedUpReceipt, setLookedUpReceipt] = useState<SinglesBetReceipt | null>(null);
  const executionState = useSinglesBatchOrder();
  const selectedIds = new Set(selections.map(({ id }) => id));
  const floatingLabel =
    selections.length > 0
      ? formatReferenceOdds(summedReferenceOddsE6(selections))
      : activeTab === "cashout"
        ? "Positions"
        : null;
  const floatingLabelSize =
    (floatingLabel?.length ?? 0) > 9
      ? "text-[8px] tracking-[-0.04em]"
      : (floatingLabel?.length ?? 0) > 7
        ? "text-[9px] tracking-[-0.03em]"
        : (floatingLabel?.length ?? 0) > 5
          ? "text-[11px] tracking-[-0.02em]"
          : "text-[13px]";

  function toggleSelection(selection: MarketSlipSelection) {
    updateMarketSlip((current) => ({
      ...current,
      selections: toggleSlipSelection(current.selections, selection),
    }));
    setActiveTab("singles");
  }

  function removeSelection(selectionId: string) {
    updateMarketSlip((current) => ({
      ...current,
      selections: current.selections.filter(({ id }) => id !== selectionId),
    }));
    if (selections.length === 1) setMobileOpen(false);
  }

  function clearSelections() {
    updateMarketSlip((current) => ({ ...current, selections: [] }));
  }

  function changeStake(nextStake: string) {
    updateMarketSlip((current) => ({ ...current, stake: nextStake }));
  }

  function viewActiveBets() {
    setLookedUpReceipt(null);
    executionState.dismissReceipt();
    setActiveTab("cashout");
    setMobileOpen(true);
  }

  const slip = (
    <BetSlipPanel
      selections={selections}
      onRemove={removeSelection}
      onClear={clearSelections}
      stake={stake}
      onStakeChange={changeStake}
      executionState={executionState}
      onTicketLoaded={(receipt) => {
        setLookedUpReceipt(receipt);
        setMobileOpen(false);
      }}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onPlaced={(receipt) => {
        if (receipt.acceptedCount > 0) clearSelections();
        setMobileOpen(false);
      }}
    />
  );

  return (
    <>
      <div className="mx-auto grid w-full max-w-[1340px] gap-4 px-0 pt-2 pb-24 sm:px-5 sm:py-5 xl:grid-cols-[minmax(0,1000px)_320px] xl:px-0">
        <div className="min-w-0">
          {isNormalSportCategory(activeCategory) ? (
            <SportsMarketBoard
              key={`${activeCategory}:${activeLeague}`}
              sport={activeCategory}
              activeLeague={activeLeague}
              selectedIds={selectedIds}
              onSelect={(selection) => {
                const slipSelection = sportsSlipSelection(selection);
                if (slipSelection) toggleSelection(slipSelection);
              }}
              onRemoveSelection={removeSelection}
            />
          ) : (
            <DiscoveryMarketBoard
              key={activeCategory}
              category={activeCategory}
              selectedIds={selectedIds}
              onSelect={toggleSelection}
            />
          )}
        </div>

        <aside className="sticky top-[178px] hidden self-start xl:block">{slip}</aside>
      </div>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={`Open selections with ${selections.length} selected markets`}
        title={floatingLabel ?? "Open selections"}
        className="fixed right-4 bottom-[max(18px,env(safe-area-inset-bottom))] z-[55] grid size-16 cursor-pointer place-items-center rounded-full border border-white/28 bg-[linear-gradient(145deg,#a4a6aa_0%,#65686e_28%,#303238_65%,#777a80_100%)] p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.55),inset_1px_1px_1px_rgba(255,255,255,0.42),inset_-2px_-3px_5px_rgba(0,0,0,0.35)] transition-transform active:scale-95 xl:hidden"
      >
        {selections.length > 0 ? (
          <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-white text-[10px] font-black text-black shadow-[1px_2px_8px_rgba(0,0,0,0.3)]">
            {selections.length}
          </span>
        ) : null}
        {floatingLabel ? (
          <span
            className={`w-full text-center leading-none font-black whitespace-nowrap tabular-nums ${floatingLabelSize}`}
          >
            {floatingLabel}
          </span>
        ) : (
          <SelectionsTicketIcon />
        )}
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/80 xl:hidden">
          <button
            type="button"
            aria-label="Close selections"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="absolute right-0 bottom-0 left-0 max-h-[calc(100dvh-54px)] overflow-hidden">
            <BetSlipPanel
              selections={selections}
              onRemove={removeSelection}
              onClear={() => {
                clearSelections();
                setMobileOpen(false);
              }}
              stake={stake}
              onStakeChange={changeStake}
              executionState={executionState}
              onTicketLoaded={(receipt) => {
                setLookedUpReceipt(receipt);
                setMobileOpen(false);
              }}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onPlaced={(receipt) => {
                if (receipt.acceptedCount > 0) clearSelections();
                setMobileOpen(false);
              }}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <SinglesBetReceiptModal
        receipt={lookedUpReceipt ?? executionState.receipt}
        onClose={() => {
          if (lookedUpReceipt) {
            setLookedUpReceipt(null);
          } else {
            executionState.dismissReceipt();
          }
        }}
        onRetrySave={executionState.retryReceiptSave}
        onViewActiveBets={viewActiveBets}
      />
    </>
  );
}
