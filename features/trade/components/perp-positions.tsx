"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PerpPairIcon } from "@/features/trade/components/perp-pair-icon";
import { formatUsd } from "@/lib/trade/math";
import {
  USDC_DECIMALS,
  isPositiveWireDecimal,
  isUnsetLevel,
  isWireAmount,
  pairSymbol,
} from "@/lib/perp/logic";
import type { OpenPosition, PerpPair } from "@/lib/perp/types";

interface PerpPositionsProps {
  positions: OpenPosition[];
  loading: boolean;
  // A failed fetch must not render as "no open positions".
  errored?: boolean;
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

// The gateway computes unrealized PnL net of funding per position; that value
// wins whenever present, with the local mark-price estimate as the fallback
// for older gateway responses. Signed decimal strings parse fine here.
function pnlValue(p: OpenPosition, mark: string | null): number | null {
  const fromApi = p.unrealizedPnlUsdc != null ? parseFloat(p.unrealizedPnlUsdc) : NaN;
  if (Number.isFinite(fromApi)) return fromApi;
  return pnlEstimate(p, mark);
}

// PnL as a percent of collateral, only when the gateway provides the fraction.
function pnlPercent(p: OpenPosition): number | null {
  const fraction = p.unrealizedPnlPct != null ? parseFloat(p.unrealizedPnlPct) : NaN;
  return Number.isFinite(fraction) ? fraction * 100 : null;
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
  const [closeAmt, setCloseAmt] = useState("");

  const symbol = pair ? pairSymbol(pair) : `#${p.pairIndex}`;
  const baseSym = pair?.from ?? "?";
  const pnl = pnlValue(p, mark);
  const pnlPct = pnlPercent(p);
  const liq = p.liquidationPrice != null ? parseFloat(p.liquidationPrice) : NaN;
  const manageable = onUpdateTpSl != null || onUpdateMargin != null;

  // Display gate only: a partial close must stay below the full collateral.
  // Closing the whole position goes through the main close button, and the
  // backend re-validates the amount either way.
  const fullCollateral = parseFloat(p.initialCollateralUsdc);
  const partialCloseValid =
    isWireAmount(closeAmt, USDC_DECIMALS) && parseFloat(closeAmt) < fullCollateral;

  const guard = (value: string, set: (v: string) => void) => {
    const next = value.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) set(next);
  };

  // Red border once a typed value is the reason its action cannot run; empty
  // fields stay neutral.
  const tpInvalid = tp !== "" && !isPositiveWireDecimal(tp);
  const slInvalid = sl !== "" && !isPositiveWireDecimal(sl);
  const marginInvalid = marginAmt !== "" && !isWireAmount(marginAmt, USDC_DECIMALS);
  const closeInvalid = closeAmt !== "" && !partialCloseValid;
  const fieldClass = (invalid: boolean) =>
    `tnum w-full rounded-lg border bg-black/35 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/30 ${
      invalid ? "border-down/60" : "border-white/10"
    }`;

  return (
    <div className="border-t border-white/6 px-4 py-3 sm:px-5" data-sensitive="position">
      <div className="flex flex-wrap items-center gap-3">
        <PerpPairIcon sym={baseSym} category={pair?.category} size={30} />
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
            {Number.isFinite(liq) && liq > 0 ? ` · ${t("liqAt", { price: formatUsd(liq) })}` : ""}
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
            {pnlPct != null ? (
              <span className="block text-[11px] font-medium opacity-80">
                {pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(1)}%
              </span>
            ) : null}
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
                  className={fieldClass(tpInvalid)}
                />
                <input
                  value={sl}
                  onChange={(e) => guard(e.target.value, setSl)}
                  inputMode="decimal"
                  placeholder={t("slPrice")}
                  className={fieldClass(slInvalid)}
                />
                <button
                  onClick={() => onUpdateTpSl(p, tp || "0", sl || "0")}
                  disabled={busy || tpInvalid || slInvalid}
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
                  className={fieldClass(marginInvalid)}
                />
                <button
                  onClick={() => onUpdateMargin(p, marginAmt, "deposit")}
                  disabled={busy || !isWireAmount(marginAmt, USDC_DECIMALS)}
                  className="shrink-0 cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-white/12 disabled:opacity-50"
                >
                  {t("add")}
                </button>
                <button
                  onClick={() => onUpdateMargin(p, marginAmt, "withdraw")}
                  disabled={busy || !isWireAmount(marginAmt, USDC_DECIMALS)}
                  className="shrink-0 cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-white/12 disabled:opacity-50"
                >
                  {t("remove")}
                </button>
              </div>
            </div>
          ) : null}
          <div className="ws-inset p-3">
            <div className="mb-2 text-[11.5px] font-medium tracking-[0.03em] text-white/45 uppercase">
              {t("partialCloseHeading")}
            </div>
            <div className="flex gap-2">
              <input
                value={closeAmt}
                onChange={(e) => guard(e.target.value, setCloseAmt)}
                inputMode="decimal"
                placeholder={t("partialCloseAmount")}
                className={fieldClass(closeInvalid)}
              />
              <button
                onClick={() => onClose(p, closeAmt)}
                disabled={busy || !partialCloseValid}
                className="shrink-0 cursor-pointer rounded-lg border border-white/14 bg-white/8 px-3 py-2 text-[12.5px] font-medium text-white hover:bg-white/12 disabled:opacity-50"
              >
                {t("partialCloseAction")}
              </button>
            </div>
            <div className="mt-1.5 text-[11.5px] font-normal text-white/40">
              {t("partialCloseMax", { amount: formatUsd(fullCollateral) })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PerpPositions(props: PerpPositionsProps) {
  const t = useTranslations("perps");
  const { positions, loading, errored, pairByIndex, priceOf } = props;

  // Nothing to say, so say nothing: a heading over an empty card is a section
  // that never applies to a trader who has not opened anything. It stays while
  // loading, so a trader who does hold positions sees the placeholder rather
  // than the card appearing from nowhere, and it stays on an error, because
  // hiding a failed load would tell someone with open positions that they have
  // none.
  if (!loading && !errored && positions.length === 0) return null;

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
      ) : errored && positions.length === 0 ? (
        <div className="text-down/90 border-t border-white/6 px-5 py-6 text-center text-[13px] font-normal">
          {t("positionsUnavailable")}
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
