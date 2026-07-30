"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetChart } from "@/components/ui/asset-chart";
import { SearchIcon } from "@/components/ui/icons";
import { PerpPositions } from "@/components/dashboard/trade/perp-positions";
import { PerpPairIcon } from "@/components/dashboard/trade/perp-pair-icon";
import { usePerpMarket } from "@/hooks/use-perp-markets";
import { usePerpQuote } from "@/hooks/use-perp-quote";
import { usePerpActions } from "@/hooks/use-perp-actions";
import { usePerpPositions } from "@/hooks/use-perp-positions";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatAmount, formatUsd, liquidationPrice } from "@/lib/trade/math";
import { CATEGORY_ORDER, pairSymbol, validateOrder } from "@/lib/perp/logic";
import { coingeckoId } from "@/lib/coingecko";
import type { PerpCategory, PerpOrderType, PerpPair } from "@/lib/perp/types";

// The full-control interface: every market Avantis lists across crypto, forex,
// commodities and equities, with order types, TP/SL, slippage, and position
// management. Shares the entire data and action layer with the simple view;
// only the presentation differs.

interface ProPerpsProps {
  pairs: PerpPair[];
  priceOf: (symbol: string) => string | null;
  live: boolean;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// Translation keys per order type; resolved with t at render.
const ORDER_TYPE_KEY: Record<PerpOrderType, string> = {
  market: "orderMarket",
  market_zero_fee: "orderMarket",
  limit: "orderLimit",
  stop_limit: "orderStop",
};

const ORDER_TYPES: readonly PerpOrderType[] = ["market", "limit", "stop_limit"];

// Translation keys per market category; the ids come from lib/perp/logic.
const CATEGORY_KEY: Record<PerpCategory, string> = {
  crypto: "categoryCrypto",
  forex: "categoryForex",
  commodities: "categoryCommodities",
  equities: "categoryEquities",
  other: "categoryOther",
};

function num(value: string | null | undefined): number {
  const n = value != null ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function ProPerps({ pairs, priceOf, live }: ProPerpsProps) {
  const t = useTranslations("perps");
  const [category, setCategory] = useState<PerpCategory>("crypto");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("ETH/USD");
  const [side, setSide] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<PerpOrderType>("market");
  const [collateral, setCollateral] = useState("");
  const [leverage, setLeverage] = useState("10");
  const [limitPrice, setLimitPrice] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [slippage, setSlippage] = useState("1");

  const { positions, loading: positionsLoading } = usePerpPositions(live);
  const actions = usePerpActions();
  const portfolio = usePortfolio();
  const { market, closed } = usePerpMarket(live ? selected : null);

  const pair = pairs.find((p) => pairSymbol(p) === selected) ?? null;
  const baseSym = selected.split("/")[0];
  const markPrice = market?.price ?? priceOf(selected);
  const markNum = num(markPrice);

  const usdcBalance =
    portfolio.tokens.find((t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pairs
      .filter((p) => p.category === category)
      .filter((p) => !q || pairSymbol(p).toLowerCase().includes(q))
      .sort((a, b) => pairSymbol(a).localeCompare(pairSymbol(b)));
  }, [pairs, category, search]);

  const { quote, loading: quoteLoading } = usePerpQuote({
    pair: live && pair ? selected : null,
    isLong: side === "long",
    collateralUsdc: collateral,
    leverage,
  });

  const validation = pair
    ? validateOrder(pair, collateral, leverage, usdcBalance.toFixed(6))
    : { ok: false as const, message: t("pickMarket") };
  const needsTrigger = orderType !== "market";
  const triggerOk = !needsTrigger || num(limitPrice) > 0;

  const leverageNum = num(leverage);
  const entryNum = needsTrigger ? num(limitPrice) : markNum;
  const liq = entryNum > 0 && leverageNum >= 1 ? liquidationPrice(entryNum, leverageNum, side) : 0;

  const guard = (set: (v: string) => void) => (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) set(next);
  };

  const submit = async () => {
    if (!pair || !validation.ok || !triggerOk) return;
    const openPrice = needsTrigger ? limitPrice : (markPrice ?? undefined);
    if (openPrice == null) return;
    const ok = await actions.openTrade({
      pair: selected,
      isLong: side === "long",
      collateralUsdc: collateral,
      leverage,
      orderType,
      openPrice,
      takeProfit: takeProfit || "0",
      stopLoss: stopLoss || "0",
      slippagePct: slippage || "1",
    });
    if (ok) setCollateral("");
  };

  const cta = !live
    ? t("liveTradingConnectsSoon")
    : actions.busy
      ? t("working")
      : !validation.ok && collateral !== ""
        ? validation.code
          ? t(`v_${validation.code}`, validation.params)
          : validation.message
        : !triggerOk
          ? t("enterTriggerPrice")
          : t(side === "long" ? "ctaLong" : "ctaShort", { sym: baseSym, lev: leverage || "?" });

  const pairByIndex = useMemo(() => new Map(pairs.map((p) => [p.pairIndex, p])), [pairs]);
  const oi = market?.openInterest;
  const oiTotal = oi ? oi.long + oi.short : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,380px)]">
        {/* Market browser. */}
        <div className="ws-card flex max-h-[640px] flex-col overflow-hidden">
          <div className="flex gap-1 px-3 pt-3">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${
                  category === c ? "bg-accent/16 text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                {t(CATEGORY_KEY[c])}
              </button>
            ))}
          </div>
          <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchMarkets")}
              className="w-full border-none bg-transparent text-[13px] font-normal text-white outline-none"
            />
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] font-normal text-white/45">
                {live ? t("noMarketsMatch") : t("marketsLoadWhenConnected")}
              </div>
            ) : (
              filtered.map((p) => {
                const s = pairSymbol(p);
                const on = s === selected;
                const price = priceOf(s);
                return (
                  <button
                    key={p.pairIndex}
                    onClick={() => setSelected(s)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                      on ? "bg-white/6" : "hover:bg-white/4"
                    }`}
                  >
                    <PerpPairIcon sym={p.from} category={p.category} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sans text-[13px] font-medium">{s}</span>
                      <span className="block text-[11px] font-normal text-white/40">
                        {t("upToMax", { max: p.maxLeverage })}
                      </span>
                    </span>
                    <span className="tnum text-[12.5px] font-normal text-white/70">
                      {price != null ? formatUsd(parseFloat(price)) : "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Selected market: stats + chart. */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="ws-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <PerpPairIcon sym={baseSym} category={pair?.category} size={34} />
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[16px] font-semibold">{selected}</div>
                <div className="text-xs font-normal text-white/50">
                  {pair
                    ? `${t(CATEGORY_KEY[pair.category])} · ${t("upToMax", { max: pair.maxLeverage })}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="ws-display tnum text-[22px]">
                  {markNum > 0 ? formatUsd(markNum) : "—"}
                </div>
                {closed ? (
                  <div className="text-down text-[11.5px] font-medium">{t("marketClosedHint")}</div>
                ) : null}
              </div>
            </div>

            {oi && oiTotal > 0 ? (
              <div className="mt-3.5">
                <div className="mb-1 flex justify-between text-[11.5px] font-normal text-white/45">
                  <span className="tnum">
                    {t("long")} {formatAmount(oi.long)} USDC
                  </span>
                  <span className="tnum">
                    {t("short")} {formatAmount(oi.short)} USDC
                  </span>
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="bg-up h-full"
                    style={{ width: `${(oi.long / oiTotal) * 100}%` }}
                  />
                  <div
                    className="bg-down h-full"
                    style={{ width: `${(oi.short / oiTotal) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { k: t("skew"), v: market?.skew != null ? formatAmount(market.skew) : "—" },
                {
                  k: t("spread"),
                  v: market?.spread != null ? `${(market.spread * 100).toFixed(3)}%` : "—",
                },
                {
                  k: t("depth"),
                  v: market?.depth ? formatAmount(market.depth.above + market.depth.below) : "—",
                },
              ].map((s) => (
                <div key={s.k} className="ws-inset px-2 py-2">
                  <div className="text-[10.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
                    {s.k}
                  </div>
                  <div className="tnum mt-0.5 text-[13px] font-medium text-white">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {coingeckoId(baseSym) ? (
            <div className="ws-card p-4 sm:p-5">
              <AssetChart coingeckoId={coingeckoId(baseSym)} allowCandles />
            </div>
          ) : null}
        </div>

        {/* Order panel. */}
        <div className="ws-card p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide("long")}
              className={`cursor-pointer rounded-xl p-2.5 font-sans text-sm font-semibold transition-colors ${
                side === "long"
                  ? "border-up/40 bg-up/16 text-up border"
                  : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
              }`}
            >
              {t("long")}
            </button>
            <button
              onClick={() => setSide("short")}
              className={`cursor-pointer rounded-xl p-2.5 font-sans text-sm font-semibold transition-colors ${
                side === "short"
                  ? "border-down/40 bg-down/14 text-down border"
                  : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
              }`}
            >
              {t("short")}
            </button>
          </div>

          <div className="ws-inset mt-2.5 grid grid-cols-3 gap-1 p-1">
            {ORDER_TYPES.map((id) => (
              <button
                key={id}
                onClick={() => setOrderType(id)}
                className={`cursor-pointer rounded-lg py-1.5 text-[12.5px] font-medium transition-colors ${
                  orderType === id ? "bg-accent/16 text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                {t(ORDER_TYPE_KEY[id])}
              </button>
            ))}
          </div>

          <div className="ws-inset mt-2.5 p-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-normal text-white/55">
              <span>{t("collateral")}</span>
              <span className="flex items-center gap-2">
                <span className="tnum">{formatAmount(usdcBalance)} USDC</span>
                {usdcBalance > 0 ? (
                  <button
                    onClick={() => setCollateral(usdcBalance.toFixed(2))}
                    className="text-accent cursor-pointer font-medium hover:opacity-80"
                  >
                    {t("max")}
                  </button>
                ) : null}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={collateral}
                onChange={(e) => guard(setCollateral)(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="ws-display tnum min-w-0 flex-1 bg-transparent text-[24px] text-white outline-none placeholder:text-white/30"
              />
              <span className="shrink-0 text-[13px] font-medium text-white/70">USDC</span>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <div className="ws-inset p-3">
              <div className="mb-1 text-[11px] font-normal text-white/50">
                {t("leverage")} {pair ? t("leverageMax", { max: pair.maxLeverage }) : ""}
              </div>
              <input
                value={leverage}
                onChange={(e) => guard(setLeverage)(e.target.value)}
                inputMode="decimal"
                placeholder="10"
                className="tnum w-full bg-transparent text-[16px] font-medium text-white outline-none placeholder:text-white/30"
              />
            </div>
            <div className="ws-inset p-3">
              <div className="mb-1 text-[11px] font-normal text-white/50">{t("slippagePct")}</div>
              <input
                value={slippage}
                onChange={(e) => guard(setSlippage)(e.target.value)}
                inputMode="decimal"
                placeholder="1"
                className="tnum w-full bg-transparent text-[16px] font-medium text-white outline-none placeholder:text-white/30"
              />
            </div>
          </div>

          {needsTrigger ? (
            <div className="ws-inset mt-2.5 p-3">
              <div className="mb-1 flex items-center justify-between text-[11px] font-normal text-white/50">
                <span>{orderType === "limit" ? t("limitPrice") : t("stopPrice")}</span>
                {markNum > 0 ? (
                  <button
                    onClick={() => setLimitPrice(String(markNum))}
                    className="text-accent cursor-pointer font-medium hover:opacity-80"
                  >
                    {t("useMarket")}
                  </button>
                ) : null}
              </div>
              <input
                value={limitPrice}
                onChange={(e) => guard(setLimitPrice)(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="tnum w-full bg-transparent text-[16px] font-medium text-white outline-none placeholder:text-white/30"
              />
            </div>
          ) : null}

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <div className="ws-inset p-3">
              <div className="mb-1 text-[11px] font-normal text-white/50">{t("takeProfit")}</div>
              <input
                value={takeProfit}
                onChange={(e) => guard(setTakeProfit)(e.target.value)}
                inputMode="decimal"
                placeholder={t("none")}
                className="tnum w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/30"
              />
            </div>
            <div className="ws-inset p-3">
              <div className="mb-1 text-[11px] font-normal text-white/50">{t("stopLoss")}</div>
              <input
                value={stopLoss}
                onChange={(e) => guard(setStopLoss)(e.target.value)}
                inputMode="decimal"
                placeholder={t("none")}
                className="tnum w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/30"
              />
            </div>
          </div>

          <div className="ws-inset mt-2.5 flex flex-col gap-1.5 p-3.5 text-[12px] font-normal">
            <div className="flex justify-between">
              <span className="text-white/55">{t("positionSize")}</span>
              <span className="tnum text-white">
                {formatAmount((parseFloat(collateral) || 0) * (leverageNum || 0))} USDC
              </span>
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
              <span className="tnum text-white">
                {quote ? `${quote.executionFeeEth} ETH` : "—"}
              </span>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={!live || actions.busy || !validation.ok || !triggerOk}
            className={`mt-3 w-full rounded-[14px] p-3.5 font-sans text-[14.5px] font-semibold transition-opacity ${
              side === "long" ? "bg-up text-up-ink" : "bg-down text-down-ink"
            } ${
              !live || actions.busy || !validation.ok || !triggerOk
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:opacity-90"
            }`}
          >
            {cta}
          </button>
        </div>
      </div>

      <PerpPositions
        positions={positions}
        loading={positionsLoading}
        pairByIndex={pairByIndex}
        priceOf={priceOf}
        onClose={(p, c) => void actions.closeTrade(p, c)}
        onUpdateTpSl={(p, tp, sl) => void actions.updateTpSl(p, tp, sl)}
        onUpdateMargin={(p, amt, dir) => void actions.updateMargin(p, amt, dir)}
        busy={actions.busy}
      />
    </div>
  );
}
