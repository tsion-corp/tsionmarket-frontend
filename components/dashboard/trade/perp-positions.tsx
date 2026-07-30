"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { formatUsd } from "@/lib/trade/math";
import { isPositiveWireDecimal, isUnsetLevel, pairSymbol } from "@/lib/perp/logic";
import { findAsset } from "@/lib/trade/assets";
import type { OpenPosition, PerpPair } from "@/lib/perp/types";

interface PerpPositionsProps {
  positions: OpenPosition[];
  loading: boolean;
  pairByIndex: Map<number, PerpPair>;
  // Live mark price per pair symbol (decimal string), for the PnL estimate.
  priceOf: (symbol: string) => string | null;
  onClose: (position: OpenPosition, collateralUsdc: string) => void;
  // Pro-only management. When absent the row shows just the close action.
  onUpdateTpSl?: (position: OpenPosition, tp: string, sl: string) => void;
  onUpdateMargin?: (position: OpenPosition, amount: string, dir: "deposit" | "withdraw") => void;
  busy: boolean;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// Unrealized PnL estimate from the live mark, display only. The venue's own
// settlement is authoritative; this exists so a row reads as up or down.
function pnlEstimate(p: OpenPosition, mark: string | null): number | null {
  const open = parseFloat(p.openPrice);
  const cur = mark != null ? parseFloat(mark) : NaN;
  const collateral = parseFloat(p.initialCollateralUsdc);
  const leverage = parseFloat(p.leverage);
  if (![open, cur, collateral, leverage].every(Number.isFinite) || open <= 0) return null;
  const move = (cur - open) / open;
  return collateral * leverage * move * (p.isLong ? 1 : -1);
}

// One open position row. Expansion (pro) reveals TP/SL and margin editing.
function PositionRow({
  position: p,
  pair,
  mark,
  onClose,
  onUpdateTpSl,
  onUpdateMargin,
  busy,
}: {
  position: OpenPosition;
  pair: PerpPair | undefined;
  mark: string | null;
  onClose: PerpPositionsProps["onClose"];
  onUpdateTpSl?: PerpPositionsProps["onUpdateTpSl"];
  onUpdateMargin?: PerpPositionsProps["onUpdateMargin"];
  busy: boolean;
}) {
  const t = useTranslations("perps");
  const [expanded, setExpanded] = useState(false);
  const [tp, setTp] = useState(isUnsetLevel(p.takeProfit) ? "" : p.takeProfit);
  const [sl, setSl] = useState(isUnsetLevel(p.stopLoss) ? "" : p.stopLoss);
  const [marginAmt, setMarginAmt] = useState("");

  const symbol = pair ? pairSymbol(pair) : `#${p.pairIndex}`;
  const baseSym = pair?.from ?? "?";
  const pnl = pnlEstimate(p, mark);
  const manageable = onUpdateTpSl != null || onUpdateMargin != null;

  const guard = (value: string, set: (v: string) => void) => {
    const next = value.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) set(next);
  };

  return (
    <div className="border-t border-white/6 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <AssetIcon sym={baseSym} bg={findAsset(baseSym)?.bg ?? "#3c3c3c"} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-sans text-[14px] font-semibold">
            {symbol}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase ${
                p.isLong ? "border-up/35 bg-up/12 text-up" : "border-down/35 bg-down/12 text-down"
              }`}
            >
              {p.isLong ? t("long") : t("short")} {parseFloat(p.leverage)}x
            </span>
          </div>
          <div className="tnum mt-0.5 text-[12px] font-normal text-white/50">
            {t("marginEntry", {
              margin: formatUsd(parseFloat(p.initialCollateralUsdc)),
              entry: formatUsd(parseFloat(p.openPrice)),
            })}
            {!isUnsetLevel(p.takeProfit)
              ? ` · ${t("tpAt", { price: formatUsd(parseFloat(p.takeProfit)) })}`
              : ""}
            {!isUnsetLevel(p.stopLoss)
              ? ` · ${t("slAt", { price: formatUsd(parseFloat(p.stopLoss)) })}`
              : ""}
          </div>
        </div>
        {pnl != null ? (
          <span
            className={`tnum text-right font-sans text-[13.5px] font-semibold ${
              pnl >= 0 ? "text-up" : "text-down"
            }`}
          >
            {pnl >= 0 ? "+" : "-"}
            {formatUsd(Math.abs(pnl))}
          </span>
        ) : null}
        {manageable ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/75 hover:text-white"
          >
            {expanded ? t("hide") : t("manage")}
          </button>
        ) : null}
        <button
          onClick={() => onClose(p, p.initialCollateralUsdc)}
          disabled={busy}
          className="cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/12 disabled:opacity-50"
        >
          {t("close")}
        </button>
      </div>

      {expanded && manageable ? (
        <div className="mt-3 grid gap-2.5 min-[640px]:grid-cols-2">
          {onUpdateTpSl ? (
            <div className="ws-inset p-3">
              <div className="mb-2 text-[11.5px] font-medium tracking-[0.03em] text-white/45 uppercase">
                {t("tpSlHeading")}
              </div>
              <div className="flex gap-2">
                <input
                  value={tp}
                  onChange={(e) => guard(e.target.value, setTp)}
                  inputMode="decimal"
                  placeholder={t("tpPrice")}
                  className="tnum w-full rounded-lg border border-white/10 bg-black/35 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/30"
                />
                <input
                  value={sl}
                  onChange={(e) => guard(e.target.value, setSl)}
                  inputMode="decimal"
                  placeholder={t("slPrice")}
                  className="tnum w-full rounded-lg border border-white/10 bg-black/35 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/30"
                />
                <button
                  onClick={() => onUpdateTpSl(p, tp || "0", sl || "0")}
                  disabled={busy}
                  className="text-ink shrink-0 cursor-pointer rounded-lg bg-white px-3 py-2 text-[12.5px] font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {t("set")}
                </button>
              </div>
            </div>
          ) : null}
          {onUpdateMargin ? (
            <div className="ws-inset p-3">
              <div className="mb-2 text-[11.5px] font-medium tracking-[0.03em] text-white/45 uppercase">
                {t("marginUsdc")}
              </div>
              <div className="flex gap-2">
                <input
                  value={marginAmt}
                  onChange={(e) => guard(e.target.value, setMarginAmt)}
                  inputMode="decimal"
                  placeholder={t("amount")}
                  className="tnum w-full rounded-lg border border-white/10 bg-black/35 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/30"
                />
                <button
                  onClick={() => onUpdateMargin(p, marginAmt, "deposit")}
                  disabled={busy || !isPositiveWireDecimal(marginAmt)}
                  className="shrink-0 cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-white/12 disabled:opacity-50"
                >
                  {t("add")}
                </button>
                <button
                  onClick={() => onUpdateMargin(p, marginAmt, "withdraw")}
                  disabled={busy || !isPositiveWireDecimal(marginAmt)}
                  className="shrink-0 cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-white/12 disabled:opacity-50"
                >
                  {t("remove")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PerpPositions(props: PerpPositionsProps) {
  const t = useTranslations("perps");
  const { positions, loading, pairByIndex, priceOf } = props;

  return (
    <div className="ws-card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-5">
        <span className="ws-display text-[18px]">{t("yourPositions")}</span>
        <span className="text-[12px] font-normal text-white/45">
          {positions.length > 0 ? t("openCount", { n: positions.length }) : ""}
        </span>
      </div>
      {loading ? (
        <div className="border-t border-white/6 px-5 py-5">
          <div className="h-4 w-40 animate-pulse rounded bg-white/8" />
        </div>
      ) : positions.length === 0 ? (
        <div className="border-t border-white/6 px-5 py-6 text-center text-[13px] font-normal text-white/45">
          {t("noOpenPositions")}
        </div>
      ) : (
        positions.map((p) => {
          const pair = pairByIndex.get(p.pairIndex);
          return (
            <PositionRow
              key={`${p.pairIndex}:${p.index}`}
              position={p}
              pair={pair}
              mark={pair ? priceOf(pairSymbol(pair)) : null}
              onClose={props.onClose}
              onUpdateTpSl={props.onUpdateTpSl}
              onUpdateMargin={props.onUpdateMargin}
              busy={props.busy}
            />
          );
        })
      )}
    </div>
  );
}
