"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { AssetIcon } from "@/components/ui/asset-icon";
import { AsyncError } from "@/components/ui/async-state";
import { ChevronDownIcon } from "@/components/ui/icons";
import { SpotAmountCard, formatDecimalString } from "@/features/trade/components/spot-amount-card";
import { SpotOrderSummary } from "@/features/trade/components/spot-order-summary";
import {
  SpotChartDisclosure,
  type SpotChangeDirection,
} from "@/features/trade/components/spot-pair-header";
import { SpotTradeActions } from "@/features/trade/components/spot-trade-actions";
import { useSpotBuy } from "@/features/trade/hooks/use-spot-buy";
import type { SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import { usePortfolio } from "@/hooks/use-portfolio";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import type { SellPayload } from "@/lib/modal-types";

// Dynamic: the chart pulls lightweight-charts and the panel starts collapsed,
// so those bytes only arrive once someone opens "View Chart". The desktop desk
// loads it the same way.
const AssetChart = dynamic(() => import("@/components/ui/asset-chart").then((m) => m.AssetChart), {
  ssr: false,
});

// Dynamic for the same reason: the sell sheet carries the whole sell flow, and
// only mounts once Sell is pressed.
const SellSheet = dynamic(
  () => import("@/features/trade/components/sell-sheet").then((m) => m.SellSheet),
  { ssr: false }
);

// Every spot order is paid for in USDC on Base, the same rail the buy sheet and
// the desktop desk use. There is no other pay token, so the ticket names one.
const PAY_SYMBOL = "USDC";
const PAY_NETWORK = "base-mainnet";
const PAY_DECIMALS = 6;

// The flat rate quoted on a buy, matching the desktop desk. It is an estimate
// for the summary line, not the amount deducted: the router prices the real fee
// at fill.
const FEE_BPS = 10n;
const BPS = 10_000n;

// How much of the fraction a holding shows. Six digits covers USDC in full and
// keeps an 18-decimal token from running off the row.
const HOLDING_FRACTION_DIGITS = 6;

const CHART_PANEL_ID = "spot-ticket-chart";

// Gain and loss use the semantic price tokens, not the Buy/Sell action colours.
const CHANGE_TONE: Record<SpotChangeDirection, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-grey-400",
};

// Signed percentage, two decimals, the way the design writes it ("-2.20%").
function changeLabel(change24h: number): string {
  const value = Number.isFinite(change24h) ? change24h : 0;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

// An exact zero and an unknown move are both "flat": neither is a gain, and
// painting them green would say something the data does not.
function changeDirection(change24h: number): SpotChangeDirection {
  if (!Number.isFinite(change24h) || change24h === 0) return "flat";
  return change24h > 0 ? "up" : "down";
}

// A USDC figure from its own base units, grouped in threes and always carrying
// both cents. The digits come from the string form, so no float ever holds an
// amount of money on the way to the screen.
function usdcLabel(units: bigint): string {
  const [whole = "0", frac = ""] = fromBaseUnits(units, PAY_DECIMALS).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${(frac + "00").slice(0, 2)}`;
}

// The market price with the dollar sign dropped, because the field names the
// quote token beside the number instead. No arithmetic happens here: the digits
// are the ones formatUsd produced, so nothing is rounded a second time. Only
// called for a price above zero, which is the only case that has a sign to drop.
function priceLabel(priceUsd: number): string {
  return formatUsd(priceUsd).slice(1);
}

export interface SpotTicketProps {
  // The market this ticket is pointed at. The list above chose it.
  market: SpotMarket;
  // The caret on the pair pill. The market list is this screen's picker, so
  // changing market means going back to it rather than opening a second one.
  onChangeMarket: () => void;
}

// The phone spot order ticket (Figma 1:7825): which market, its 24h move, the
// chart behind a disclosure, the price, how much USDC to spend, what the order
// costs, Buy and Sell, and what is already held in this market.
//
// This is a composition layer, so it is the only place here that holds hooks.
// Every child below takes finished strings and reports events; none of them
// fetches, and none of them formats an amount.
//
// Two things the design draws are deliberately absent.
//
// The Limit/Market toggle is not here: spot orders on this rail fill at market,
// and there is no order-monitoring backend to rest a limit order in, so the
// control would offer a choice the desk does not have. The desktop desk dropped
// it for the same reason (see spot-pair-header.tsx).
//
// Nor is the "Est. liquidation" row of the design's summary card. A spot
// position is unleveraged and cannot be liquidated, so there is no such price
// to show and any figure printed there would be invented. The row above it,
// "Entry price", is the market price this ticket already shows in its own
// field, which leaves the two rows SpotOrderSummary draws.
export function SpotTicket({ market, onChangeMarket }: SpotTicketProps) {
  const t = useTranslations("spot");
  const portfolio = usePortfolio();

  const [amount, setAmount] = useState("");
  const [chartExpanded, setChartExpanded] = useState(false);
  const [sellPayload, setSellPayload] = useState<SellPayload | null>(null);

  // Clear the amount when the market changes, so a figure meant for one asset
  // never carries into another. The same guard the desktop desk runs.
  const [pricedMarket, setPricedMarket] = useState(market.symbol);
  if (market.symbol !== pricedMarket) {
    setPricedMarket(market.symbol);
    setAmount("");
  }

  // Spendable USDC as exact base units. The portfolio also carries a float
  // `balance` for display, but the amount card compares against what was typed,
  // and that comparison has to be integer arithmetic.
  const payBalance = useMemo(
    () =>
      portfolio.tokens
        .filter((token) => token.symbol === PAY_SYMBOL && token.network === PAY_NETWORK)
        .reduce((sum, token) => sum + BigInt(token.rawBalance), 0n),
    [portfolio.tokens]
  );

  // The largest holding of this asset, whichever chain it sits on. Null when
  // the wallet holds none, which is what makes Sell explain itself instead of
  // opening a sheet with nothing to sell.
  const held = useMemo(
    () =>
      portfolio.tokens
        .filter((token) => token.symbol === market.symbol && token.balance > 0)
        .sort((a, b) => b.balance - a.balance)[0] ?? null,
    [portfolio.tokens, market.symbol]
  );

  const buy = useSpotBuy({ symbol: market.symbol, name: market.name, amount });

  const amountUnits = toBaseUnits(amount, PAY_DECIMALS);
  const feeUnits = (amountUnits * FEE_BPS) / BPS;

  // Selling needs the origin network, the gas check and the exact held balance,
  // all of which the sell sheet already asks for. The route above mounts a
  // modal host of its own but hands this view no sell opener, so the ticket
  // carries the sheet itself.
  const requestSell = () => {
    if (!held) return;
    setSellPayload({
      symbol: held.symbol,
      name: held.name,
      network: held.network,
      address: held.address,
      decimals: held.decimals,
      balance: held.balance,
      rawBalance: held.rawBalance,
      priceUsd: held.priceUsd > 0 ? held.priceUsd : market.priceUsd,
      logo: held.logo ?? market.logo,
    });
  };

  const direction = changeDirection(market.change24h);

  return (
    <div className="flex flex-col gap-6 pt-4 pb-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* The pill at the design's phone size, and a real picker: its caret
              takes the reader back to the market list, which is this screen's
              one way of choosing a market. A second picker inside the ticket
              would be a different answer to the same question. */}
          <button
            type="button"
            onClick={onChangeMarket}
            aria-label={t("selectMarket")}
            className="ws-discovery-title border-hairline bg-surface text-grey-100 flex h-[36px] cursor-pointer items-center gap-[5px] rounded-[15px] border-[1.5px] px-[10px] text-[13px] whitespace-nowrap transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
          >
            {`${market.symbol}/${PAY_SYMBOL}`}
            <ChevronDownIcon size={10} className="text-white/70" />
          </button>
          <span className="ws-discovery-title text-[13.5px] tracking-[-0.405px] whitespace-nowrap">
            <span className="sr-only">{t("change24h")}</span>
            <span className={CHANGE_TONE[direction]}>{changeLabel(market.change24h)}</span>
          </span>
        </div>

        <SpotChartDisclosure
          expanded={chartExpanded}
          onToggle={() => setChartExpanded((open) => !open)}
          panelId={CHART_PANEL_ID}
        />

        {/* The panel stays in the tree so aria-controls always resolves. Only
            the chart itself, and the request behind it, wait for the open. */}
        <div id={CHART_PANEL_ID} hidden={!chartExpanded}>
          {chartExpanded ? (
            market.coingeckoId ? (
              <AssetChart
                coingeckoId={market.coingeckoId}
                up={market.change24h >= 0}
                height={200}
                allowCandles={false}
              />
            ) : (
              <p className="px-1 py-6 text-center text-[13px] font-normal text-white/45">
                {t("noChart", { symbol: market.symbol })}
              </p>
            )
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div
          data-testid="spot-price-row"
          className="bg-surface flex items-center justify-between gap-3 rounded-[15px] p-[15px]"
        >
          <span className="flex flex-col gap-2 leading-none">
            <span className="ws-display text-[12px] font-semibold tracking-[-0.36px] text-[rgba(148,163,184,0.5)]">
              {t("price")}
            </span>
            {/* A market with no price prints no number. A zero here would be a
                figure someone could act on, and it is not one. */}
            <span className="ws-display text-[13px] text-white">
              {market.priceUsd > 0 ? priceLabel(market.priceUsd) : t("priceUnavailable")}
            </span>
          </span>
          <span className="ws-display text-[13px] font-semibold tracking-[-0.39px] whitespace-nowrap text-white">
            {PAY_SYMBOL}
          </span>
        </div>

        {portfolio.error ? null : portfolio.loading ? (
          // No amount field until the balance is known. Rendering it against a
          // zero would mark every entry as over balance and tell the reader
          // they hold nothing.
          <div
            role="status"
            aria-live="polite"
            className="rounded-card border-hairline bg-surface h-[104px] animate-pulse border-2"
          >
            <span className="sr-only">{t("loadingBalance")}</span>
          </div>
        ) : (
          <SpotAmountCard
            amount={amount}
            onAmountChange={setAmount}
            balance={payBalance}
            payDecimals={PAY_DECIMALS}
            paySymbol={PAY_SYMBOL}
            disabled={buy.pending}
          />
        )}

        {/* Order value and the fee on it, both from the exact base units the
            amount field produced. */}
        <SpotOrderSummary
          purchaseValue={usdcLabel(amountUnits)}
          fee={usdcLabel(feeUnits)}
          symbol={PAY_SYMBOL}
          loading={portfolio.loading}
        />
      </div>

      {portfolio.error ? (
        <AsyncError
          error={portfolio.error}
          subject={t("balanceSubject")}
          onRetry={() => void portfolio.refetch()}
        />
      ) : portfolio.loading ? null : (
        <SpotTradeActions
          amount={amount}
          pay={{ balance: payBalance, decimals: PAY_DECIMALS, symbol: PAY_SYMBOL }}
          // Buy spends USDC, Sell draws down this market's asset, so each side
          // is gated against its own balance. With no holding there is no token
          // record and so no decimals to read, which is why that case carries
          // the symbol alone.
          sell={
            held
              ? {
                  balance: BigInt(held.rawBalance),
                  decimals: held.decimals,
                  symbol: held.symbol,
                }
              : { balance: null, symbol: market.symbol }
          }
          onBuy={() => void buy.submit()}
          onSell={requestSell}
          pending={buy.pending ? "buy" : null}
        />
      )}

      {/* What is already held in this market. The design puts an
          Orders / Positions / History strip here instead; there is no spot
          order-list or trade-history service to fill two of those three, and a
          tab strip is a promise of three views. This is the one of them that
          has real data behind it, so it is shown as itself. */}
      <div className="rounded-card border-hairline bg-surface flex flex-col gap-3 border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-sans text-[13px] font-semibold text-white/80">
            {t("holdingTitle", { symbol: market.symbol })}
          </span>
          <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/40">
            {t("holdingTag")}
          </span>
        </div>
        {portfolio.loading ? (
          // No second live region: the amount card above already announces the
          // one balance load both of these are waiting on.
          <div aria-hidden className="h-[26px] animate-pulse rounded bg-white/6" />
        ) : held ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <AssetIcon
                sym={held.symbol}
                bg={tokenBg(held.symbol)}
                logo={held.logo}
                size={26}
                fallback="gradient"
              />
              <span className="tnum text-[14px] font-medium">
                {formatDecimalString(
                  fromBaseUnits(BigInt(held.rawBalance), held.decimals),
                  HOLDING_FRACTION_DIGITS
                )}{" "}
                {held.symbol}
              </span>
            </span>
            {/* The dollar value is a price-feed figure, read and formatted but
                never used in arithmetic here. */}
            {held.valueUsd > 0 ? (
              <span className="tnum text-[14px] font-semibold">{formatUsd(held.valueUsd)}</span>
            ) : null}
          </div>
        ) : (
          <p className="py-2 text-[13px] font-normal text-white/40">
            {t("noHolding", { symbol: market.symbol })}
          </p>
        )}
      </div>

      {sellPayload ? (
        <SellSheet payload={sellPayload} onClose={() => setSellPayload(null)} />
      ) : null}
    </div>
  );
}
