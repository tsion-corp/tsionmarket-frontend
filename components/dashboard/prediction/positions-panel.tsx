"use client";

import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import { ChevronLeftIcon, ChartBarsIcon } from "@/components/ui/icons";
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
  // Conditions redeemed in this session. The positions feed is indexed and
  // lags the transaction, so it is the only way to know a claim has landed.
  claimedConditionIds: string[];
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
  claimedConditionIds,
  onCashOut,
  cashingOut,
}: PositionsPanelProps) {
  const t = useTranslations("prediction");
  const money = useMoney();
  return (
    <div className="ws-card relative mt-7 overflow-hidden sm:mt-9">
      {/* Accent wash across the header so this section reads as a distinct
          "your money" area, not another market tile. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[92px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="bg-accent/16 text-accent grid h-12 w-12 shrink-0 place-items-center rounded-[14px]">
            <ChartBarsIcon size={24} />
          </span>
          <div className="min-w-0">
            <span className="ws-display text-[21px] tracking-[-0.01em]">{t("positionsTitle")}</span>
            <div className="tnum mt-0.5 text-[13px] font-normal text-white/60">
              {available != null
                ? t("availableToBet", { amount: money.format(available) })
                : t("positionsSubtitle")}
            </div>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className={
            loaded
              ? "shrink-0 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium text-white/80 hover:text-white disabled:opacity-50"
              : "text-ink shrink-0 cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
          }
        >
          {loading ? t("loading") : loaded ? t("refresh") : t("loadPositions")}
        </button>
      </div>

      {error ? (
        <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
          {error}
        </div>
      ) : loaded && positions.length === 0 ? (
        <div className="border-t border-white/6 px-6 py-6 text-center text-[13px] font-normal text-white/45">
          {t("noPositions")}
        </div>
      ) : positions.length > 0 ? (
        positions.map((raw, i) => {
          const p = raw as PositionInfo;
          const claiming = p.conditionId != null && redeemingId === p.conditionId;
          const claimedHere = p.conditionId != null && claimedConditionIds.includes(p.conditionId);
          return (
            <div
              key={i}
              onClick={() => onOpenSlip(positions[i])}
              className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3 transition-colors hover:bg-white/4 sm:px-6"
            >
              <div className="min-w-0">
                <div className="truncate font-sans text-[13.5px] font-medium">
                  {p.title ?? t("marketFallback")}
                </div>
                <div className="flex items-center gap-1 text-xs font-normal text-white/50">
                  <span className="truncate">
                    {p.outcome ?? "—"} · {t("sharesCount", { count: num(p.size).toFixed(2) })}
                  </span>
                  <span className="text-accent inline-flex shrink-0 items-center">
                    · {t("viewSlip")}
                    <ChevronLeftIcon size={12} className="-scale-x-100" />
                  </span>
                </div>
              </div>
              {claimedHere ? (
                // Already redeemed in this session. The positions API is
                // indexed and lags the confirmed transaction, so it keeps
                // reporting this position as redeemable with a live value —
                // which re-armed the button on winnings already paid out, and
                // a second tap redeemed the same condition twice.
                <span className="text-accent text-right text-[12.5px] font-medium">
                  {t("claimed")}
                </span>
              ) : isClaimable(p.redeemable, num(p.currentValue)) && p.conditionId ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRedeem(p.conditionId as string);
                  }}
                  disabled={claiming}
                  className="border-accent/45 bg-accent/12 cursor-pointer rounded-lg border px-3 py-1.5 text-[12.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {claiming ? t("claiming") : t("claim")}
                </button>
              ) : p.redeemable ? (
                // Resolved but worth nothing — the losing side. Say so plainly
                // instead of showing a bare $0.00.
                <span className="text-down text-right text-[12.5px] font-medium">
                  {t("resolvedNoWin")}
                </span>
              ) : (
                <span className="tnum text-right font-sans text-sm font-medium">
                  {money.format(num(p.currentValue))}
                </span>
              )}
            </div>
          );
        })
      ) : null}

      {loaded && cashable != null && cashable > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6">
          <span className="text-[12.5px] font-normal text-white/55">
            {t("cashOutTo", { amount: money.format(cashable) })}
          </span>
          <button
            onClick={onCashOut}
            disabled={cashingOut}
            className="text-ink cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cashingOut ? t("cashingOut") : t("cashOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
