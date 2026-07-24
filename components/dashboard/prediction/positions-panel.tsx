"use client";

import { useState } from "react";
import type { PolymarketPosition } from "@/hooks/use-polymarket-positions";

interface PositionsPanelProps {
  positions: PolymarketPosition[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  onRefresh: () => void;
  onRedeem: (conditionId: string) => void;
  redeemingId: string | null;
  onWithdraw: (amount: number) => void;
  withdrawing: boolean;
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

const CASH_OUT = [10, 25, 50];

function num(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function PositionsPanel({
  positions,
  loading,
  loaded,
  error,
  onRefresh,
  onRedeem,
  redeemingId,
  onWithdraw,
  withdrawing,
}: PositionsPanelProps) {
  const [cashOut, setCashOut] = useState(10);

  return (
    <div className="ws-card mt-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-6">
        <span className="ws-serif text-[18px]">Your positions</span>
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
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3 sm:px-6"
            >
              <div className="min-w-0">
                <div className="truncate font-sans text-[13.5px] font-medium">
                  {p.title ?? "Market"}
                </div>
                <div className="text-xs font-normal text-white/50">
                  {p.outcome ?? "—"} · {num(p.size).toFixed(2)} shares
                </div>
              </div>
              {p.redeemable && p.conditionId ? (
                <button
                  onClick={() => onRedeem(p.conditionId as string)}
                  disabled={claiming}
                  className="border-accent/45 bg-accent/12 cursor-pointer rounded-lg border px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
                >
                  {claiming ? "Claiming…" : "Claim"}
                </button>
              ) : (
                <span className="tnum text-right font-sans text-sm font-medium">
                  ${num(p.currentValue).toFixed(2)}
                </span>
              )}
            </div>
          );
        })
      ) : null}

      {loaded && positions.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6">
          <span className="text-[12.5px] font-normal text-white/55">Cash out to USDC</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {CASH_OUT.map((a) => (
                <button
                  key={a}
                  onClick={() => setCashOut(a)}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    cashOut === a
                      ? "border-accent/45 bg-accent/12 text-white"
                      : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
                  }`}
                >
                  ${a}
                </button>
              ))}
            </div>
            <button
              onClick={() => onWithdraw(cashOut)}
              disabled={withdrawing}
              className="text-ink cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {withdrawing ? "Cashing out…" : `Cash out $${cashOut}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
