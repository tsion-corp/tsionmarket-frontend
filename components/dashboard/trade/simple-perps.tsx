"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { TradingViewChart } from "@/components/ui/tradingview-chart";
import { FlashPrice } from "@/components/dashboard/trade/flash-price";
import { PerpConfirmModal, type ConfirmRow } from "@/components/dashboard/trade/perp-confirm-modal";
import { PerpPositions } from "@/components/dashboard/trade/perp-positions";
import { usePerpQuote } from "@/hooks/use-perp-quote";
import { usePerpActions } from "@/hooks/use-perp-actions";
import { usePerpPositions } from "@/hooks/use-perp-positions";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatAmount, formatUsd, liquidationPrice } from "@/lib/trade/math";
import { orderFieldValidity, pairSymbol, validateOrder } from "@/lib/perp/logic";
import { tradingViewFallbackSymbol, tradingViewSymbol } from "@/lib/perp/tradingview";
import { findAsset } from "@/lib/trade/assets";
import type { OpenPosition, PerpPair } from "@/lib/perp/types";

// The guided interface: pick a major market, long or short, an amount and a
// leverage, one tap to trade. Market orders only; TP/SL, limit orders and the
// full market list live in the pro interface. Everything money-shaped that
// gates the trade goes through the exact validators in lib/perp/logic.

interface SimplePerpsProps {
  pairs: PerpPair[];
  priceOf: (symbol: string) => string | null;
  // False while the gateway is not deployed: the form renders with live-ish
  // preview prices but the trade action is disabled honestly.
  live: boolean;
}

// The curated market set for the simple view, in display order.
const SIMPLE_SYMBOLS = ["BTC/USD", "ETH/USD", "SOL/USD"];

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const LEVERAGE_MARKS = [2, 5, 10, 20];

export function SimplePerps({ pairs, priceOf, live }: SimplePerpsProps) {
  const t = useTranslations("perps");
  const simplePairs = useMemo(
    () =>
      SIMPLE_SYMBOLS.map((s) => pairs.find((p) => pairSymbol(p) === s)).filter(
        (p): p is PerpPair => p != null
      ),
    [pairs]
  );
  const [selected, setSelected] = useState<string>(SIMPLE_SYMBOLS[1]);
  const pair = simplePairs.find((p) => pairSymbol(p) === selected) ?? simplePairs[0] ?? null;
  const symbol = pair ? pairSymbol(pair) : selected;
  const baseSym = symbol.split("/")[0];

  const [side, setSide] = useState<"long" | "short">("long");
  // The confirm step before money moves; null = no dialog.
  const [confirm, setConfirm] = useState<
    | { kind: "open" }
    | { kind: "close"; position: OpenPosition; amount: string; full: boolean }
    | null
  >(null);
  const [collateral, setCollateral] = useState("");
  const [leverage, setLeverage] = useState(10);

  const { positions, loading: positionsLoading } = usePerpPositions(live);
  const actions = usePerpActions();
  const portfolio = usePortfolio();

  const usdcBalance =
    portfolio.tokens.find((t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const hasBaseEth = portfolio.tokens.some(
    (t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "ETH" && t.balance > 0.0005
  );

  const price = priceOf(symbol);
  const priceNum = price != null ? parseFloat(price) : 0;
  const maxLeverage = pair?.maxLeverage ?? 50;
  const clampedLeverage = Math.min(leverage, maxLeverage);

  const { quote, loading: quoteLoading } = usePerpQuote({
    pair: live && pair ? symbol : null,
    isLong: side === "long",
    collateralUsdc: collateral,
    leverage: String(clampedLeverage),
  });

  const validation = pair
    ? validateOrder(pair, collateral, String(clampedLeverage), usdcBalance.toFixed(6))
    : { ok: false as const, message: t("marketUnavailable") };

  // Red border judged live on every keystroke; an empty field stays neutral
  // (the CTA already says "enter an amount"). Leverage is a clamped slider
  // here, so only the collateral can ever be wrong.
  const collateralInvalid = pair
    ? orderFieldValidity(pair, collateral, String(clampedLeverage), usdcBalance.toFixed(6))
        .collateralInvalid
    : false;

  const collateralNum = parseFloat(collateral) || 0;
  const size = collateralNum * clampedLeverage;
  const liq = priceNum > 0 ? liquidationPrice(priceNum, clampedLeverage, side) : 0;

  const handleCollateral = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setCollateral(next);
  };

  const pairByIndex = useMemo(() => new Map(pairs.map((p) => [p.pairIndex, p])), [pairs]);

  const submit = () => {
    if (!pair || !validation.ok || price == null) return;
    setConfirm({ kind: "open" });
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    const staged = confirm;
    setConfirm(null);
    if (staged.kind === "open") {
      if (price == null) return;
      const ok = await actions.openTrade({
        pair: symbol,
        isLong: side === "long",
        collateralUsdc: collateral,
        leverage: String(clampedLeverage),
        orderType: "market",
        openPrice: price,
        slippagePct: "1",
      });
      if (ok) setCollateral("");
    } else {
      await actions.closeTrade(staged.position, staged.amount);
    }
  };

  const confirmRows: ConfirmRow[] =
    confirm?.kind === "open"
      ? [
          { label: t("confirmMarket"), value: symbol },
          {
            label: t("confirmSide"),
            value: `${t(side)} ${clampedLeverage}x`,
            tone: side === "long" ? ("up" as const) : ("down" as const),
          },
          { label: t("collateral"), value: `${collateral} USDC` },
          { label: t("positionSize"), value: `${formatAmount(size)} USDC` },
        ]
      : confirm?.kind === "close"
        ? [
            {
              label: t("confirmMarket"),
              value: pairByIndex.get(confirm.position.pairIndex)
                ? pairSymbol(pairByIndex.get(confirm.position.pairIndex) as PerpPair)
                : `#${confirm.position.pairIndex}`,
            },
            {
              label: t("confirmCloseAmount"),
              value: confirm.full ? t("confirmCloseFull") : `${confirm.amount} USDC`,
            },
          ]
        : [];

  const cta = !live
    ? t("liveTradingConnectsSoon")
    : actions.busy
      ? t("working")
      : collateral === ""
        ? t("enterAmount")
        : !validation.ok
          ? validation.code
            ? t(`v_${validation.code}`, validation.params)
            : validation.message
          : t(side === "long" ? "ctaLong" : "ctaShort", { sym: baseSym, lev: clampedLeverage });

  return (
    <div className="grid grid-cols-1 items-start gap-4 min-[980px]:grid-cols-[minmax(0,420px)_1fr]">
      <div className="ws-card p-4 sm:p-5">
        {/* Market chips. */}
        <div className="mb-3.5 flex gap-2">
          {SIMPLE_SYMBOLS.map((s) => {
            const sym = s.split("/")[0];
            const on = s === symbol;
            const p = priceOf(s);
            return (
              <button
                key={s}
                onClick={() => setSelected(s)}
                className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-2xl border p-3 text-left transition-colors ${
                  on
                    ? "border-accent/40 bg-accent/10"
                    : "border-white/10 bg-white/4 hover:bg-white/6"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <AssetIcon sym={sym} bg={findAsset(sym)?.bg ?? "#3c3c3c"} size={18} />
                  <span className="font-sans text-[13px] font-semibold">{sym}</span>
                </span>
                <span className="tnum text-xs font-normal text-white/55">
                  {p != null ? formatUsd(parseFloat(p)) : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Direction. */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("long")}
            className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
              side === "long"
                ? "border-up/40 bg-up/16 text-up border"
                : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
            }`}
          >
            {t("long")} ↑
          </button>
          <button
            onClick={() => setSide("short")}
            className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
              side === "short"
                ? "border-down/40 bg-down/14 text-down border"
                : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
            }`}
          >
            {t("short")} ↓
          </button>
        </div>

        {/* Collateral. */}
        <div className={`ws-inset mt-3 p-4 ${collateralInvalid ? "ws-invalid" : ""}`}>
          <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
            <span>{t("yourePaying")}</span>
            <span className="flex items-center gap-2">
              <span className="tnum">
                {t("balance")} {formatAmount(usdcBalance)} USDC
              </span>
              {usdcBalance > 0 ? (
                <button
                  // Floor, not round: toFixed rounds 25.999 to "26.00", which
                  // then trips the over-balance check and Max invalidates itself.
                  onClick={() => setCollateral((Math.floor(usdcBalance * 100) / 100).toFixed(2))}
                  className="text-accent cursor-pointer font-medium hover:opacity-80"
                >
                  {t("max")}
                </button>
              ) : null}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              value={collateral}
              onChange={(e) => handleCollateral(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="ws-display tnum min-w-0 flex-1 bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 font-sans text-sm font-medium text-white/70">USDC</span>
          </div>
        </div>

        {/* Leverage. */}
        <div className="ws-inset mt-3 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-normal text-white/55">{t("leverage")}</span>
            <span className="text-accent font-sans text-sm font-semibold">{clampedLeverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={Math.min(maxLeverage, 50)}
            step={1}
            value={clampedLeverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="accent-accent h-1.5 w-full cursor-pointer"
          />
          <div className="mt-2 flex justify-between">
            {LEVERAGE_MARKS.filter((m) => m <= maxLeverage).map((m) => (
              <button
                key={m}
                onClick={() => setLeverage(m)}
                className="tnum cursor-pointer text-xs font-normal text-white/40 hover:text-white/70"
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        {/* Trade summary. Backend figures where quoted, local estimates otherwise. */}
        <div className="ws-inset mt-3 flex flex-col gap-2 p-4 text-[12.5px] font-normal">
          <div className="flex justify-between">
            <span className="text-white/55">{t("positionSize")}</span>
            <span className="tnum text-white">{formatAmount(size)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">{t("entryPrice")}</span>
            <span className="tnum text-white">{priceNum > 0 ? formatUsd(priceNum) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">{t("estLiquidation")}</span>
            <span className="tnum text-down">{liq > 0 ? formatUsd(liq) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">{t("openingFee")}</span>
            <span className="tnum text-white">
              {quoteLoading
                ? "…"
                : quote
                  ? `${formatAmount(parseFloat(quote.openingFeeUsdc))} USDC`
                  : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55">{t("executionFee")}</span>
            <span className="tnum text-white">{quote ? `${quote.executionFeeEth} ETH` : "—"}</span>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={!live || actions.busy || !validation.ok}
          className={`mt-3 w-full rounded-[14px] p-[15px] font-sans text-[15px] font-semibold transition-opacity ${
            side === "long" ? "bg-up text-up-ink" : "bg-down text-down-ink"
          } ${!live || actions.busy || !validation.ok ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"}`}
        >
          {cta}
        </button>
        {live && !hasBaseEth ? (
          <p className="mt-2 text-center text-xs font-normal text-white/45">{t("ethFeeHint")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <div className="ws-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <AssetIcon sym={baseSym} bg={findAsset(baseSym)?.bg ?? "#3c3c3c"} size={30} />
            <div className="min-w-0 flex-1">
              <div className="font-sans text-[15px] font-semibold">{symbol}</div>
              <div className="text-xs font-normal text-white/50">
                {t("perpetualOf", { name: findAsset(baseSym)?.name ?? baseSym })}
              </div>
            </div>
            <FlashPrice value={priceNum} className="ws-display tnum block text-[19px]">
              {priceNum > 0 ? formatUsd(priceNum) : "—"}
            </FlashPrice>
          </div>
          <TradingViewChart
            symbol={pair ? tradingViewSymbol(pair) : tradingViewFallbackSymbol(baseSym)}
            height={320}
          />
        </div>

        <PerpPositions
          positions={positions}
          loading={positionsLoading}
          pairByIndex={pairByIndex}
          priceOf={priceOf}
          onClose={(p, c) =>
            setConfirm({
              kind: "close",
              position: p,
              amount: c,
              full: c === p.initialCollateralUsdc,
            })
          }
          busy={actions.busy}
        />
      </div>

      {confirm ? (
        <PerpConfirmModal
          title={confirm.kind === "open" ? t("confirmOpenTitle") : t("confirmCloseTitle")}
          rows={confirmRows}
          warning={confirm.kind === "open" ? t("confirmRiskOpen") : t("confirmRiskClose")}
          cancelLabel={t("confirmCancel")}
          continueLabel={t("confirmContinue")}
          onCancel={() => setConfirm(null)}
          onContinue={() => void runConfirmed()}
        />
      ) : null}
    </div>
  );
}
