"use client";

import { ChevronLeftIcon } from "@/components/ui/icons";
import { isClaimable } from "@/lib/prediction";
import type { PolymarketPosition } from "@/hooks/use-polymarket-positions";

interface PositionsPanelProps {
  positions: PolymarketPosition[];
  available: number | null;
  cashable: number | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenSlip: (position: PolymarketPosition) => void;
  onRedeem: (conditionId: string) => void;
  redeemingId: string | null;
  onCashOut: () => void;
  cashingOut: boolean;
}

// Position fields are read defensively so a schema tweak in the SDK never breaks
// rendering.
interface PositionInfo {
  title?: string;
  outcome?: string;
  size?: string | number;
  currentValue?: string | number;
  conditionId?: string;
  redeemable?: boolean;
}

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function PositionsPanel({
  positions,
  available,
  cashable,
  loading,
  loaded,
  error,
  onRefresh,
  onOpenSlip,
  onRedeem,
  redeemingId,
  onCashOut,
  cashingOut,
}: PositionsPanelProps) {
  return (
    <div className="ws-card mt-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-6">
        <div className="min-w-0">
          <span className="ws-display text-[18px]">Your positions</span>
          {available != null ? (
            <div className="tnum mt-0.5 text-[12px] font-normal text-white/50">
              ${available.toFixed(2)} available to bet
            </div>
          ) : null}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : loaded ? "Refresh" : "Load positions"}
        </button>
      </div>

      {error ? (
        <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
          {error}
        </div>
      ) : loaded && positions.length === 0 ? (
        <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
          No open positions yet.
        </div>
      ) : positions.length > 0 ? (
        positions.map((raw, i) => {
          const p = raw as PositionInfo;
          const claiming = p.conditionId != null && redeemingId === p.conditionId;
          return (
            <div
              key={i}
              onClick={() => onOpenSlip(positions[i])}
              className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3 transition-colors hover:bg-white/4 sm:px-6"
            >
              <div className="min-w-0">
                <div className="truncate font-sans text-[13.5px] font-medium">
                  {p.title ?? "Market"}
                </div>
                <div className="flex items-center gap-1 text-xs font-normal text-white/50">
                  <span className="truncate">
                    {p.outcome ?? "—"} · {num(p.size).toFixed(2)} shares
                  </span>
                  <span className="text-accent inline-flex shrink-0 items-center">
                    · View slip
                    <ChevronLeftIcon size={12} className="-scale-x-100" />
                  </span>
                </div>
              </div>
              {isClaimable(p.redeemable, num(p.currentValue)) && p.conditionId ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRedeem(p.conditionId as string);
                  }}
                  disabled={claiming}
                  className="border-accent/45 bg-accent/12 cursor-pointer rounded-lg border px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
                >
                  {claiming ? "Claiming…" : "Claim"}
                </button>
              ) : p.redeemable ? (
                // Resolved but worth nothing — the losing side. Say so plainly
                // instead of showing a bare $0.00.
                <span className="text-down text-right text-[12.5px] font-medium">
                  Resolved · no win
                </span>
              ) : (
                <span className="tnum text-right font-sans text-sm font-medium">
                  ${num(p.currentValue).toFixed(2)}
                </span>
              )}
            </div>
          );
        })
      ) : null}

      {loaded && cashable != null && cashable > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6">
          <span className="text-[12.5px] font-normal text-white/55">
            Cash out ${cashable.toFixed(2)} to USDC on Base
          </span>
          <button
            onClick={onCashOut}
            disabled={cashingOut}
            className="text-ink cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cashingOut ? "Cashing out…" : "Cash out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
