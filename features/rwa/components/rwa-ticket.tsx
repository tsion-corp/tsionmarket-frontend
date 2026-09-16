"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ChangeDirection } from "@/components/ui/asset-table-row";
import { Disclosure } from "@/components/ui/disclosure";
import { TradeActions } from "@/components/ui/trade-actions";
import { BALANCE_FRACTION_DIGITS, TradeAmountCard } from "@/components/ui/trade-amount-card";
import { TradeOrderSummary } from "@/components/ui/trade-order-summary";
import { ChartDisclosure, PairHeader, PairSelector } from "@/components/ui/trade-pair-header";
import { TradeQuickAmounts } from "@/components/ui/trade-quick-amounts";
import { TradeSellShortcuts } from "@/components/ui/trade-sell-shortcuts";
import { TradeSideSwitch } from "@/components/ui/trade-side-switch";
import { RwaIssuerCard } from "@/features/rwa/components/rwa-issuer-card";
import { useRwaPriceHistory } from "@/features/rwa/hooks/use-rwa-price-history";
import {
  useRwaTicket,
  type RwaSettlementRequest,
  type RwaTradeSide,
} from "@/features/rwa/hooks/use-rwa-ticket";
import { USDC_BY_CHAIN } from "@/features/rwa/lib/api";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";
import { toRwaRowView } from "@/features/rwa/lib/row-view";
import { formatDecimalString } from "@/lib/trade/amount";
import { formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

// Dynamic: the chart pulls lightweight-charts, which stays out of the page's
// first bundle and arrives with the ticket instead. The spot desk loads its own
// chart the same way.
const PriceChart = dynamic(() => import("@/components/ui/price-chart").then((m) => m.PriceChart), {
  ssr: false,
});

// Every real-asset buy spends USDC, on the chain the asset itself settles on.
const PAY_SYMBOL = "USDC";

// The dollar presets this desk offers, as the decimal strings the chips emit.
// Three rather than spot's five: these are the figures the RWA panel has always
// offered, and a first real-asset buy is a larger ticket than a memecoin one.
const BUY_PRESETS = ["10", "50", "100"] as const;

const CHART_PANEL_ID = "rwa-ticket-chart";

// Gain and loss use the semantic price tokens, not the Buy/Sell action colours.
// The same three tones the promoted pair header paints, declared here because
// the phone variant draws its own header row around a picker pill.
const CHANGE_TONE: Record<ChangeDirection, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-white/55",
};

// A USDC figure from its own base units, grouped in threes and always carrying
// both cents. The digits come from the string form, so no float ever holds an
// amount of money on the way to the screen.
function usdcLabel(units: bigint, decimals: number): string {
  const [whole = "0", frac = ""] = fromBaseUnits(units, decimals).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(frac + "00").slice(0, 2)}`;
}

// A price-feed or quote estimate with the dollar sign dropped, because the
// summary names USDC beside the number. An unknown figure reads as a dash
// rather than as a zero, which would be a number someone could act on.
function estimateLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatUsd(value > 0 ? value : 0).slice(1);
}

// The spendable dollars as base units of the pay token.
//
// The hook reports this one figure as a float because the portfolio aggregates
// two chains' USDC before it gets here, so the conversion happens once, at the
// edge where the field and the actions need integers, and nothing below re-reads
// the float. Truncated rather than rounded: a rounded-up balance would invite an
// amount the wallet cannot actually spend.
function spendableUnits(usd: number, decimals: number): bigint {
  if (!(usd > 0) || !Number.isFinite(usd)) return 0n;
  const [whole = "0", frac = ""] = usd.toFixed(8).split(".");
  return toBaseUnits(`${whole}.${frac.slice(0, 6)}`, decimals);
}

export interface RwaTicketProps {
  // The asset the ticket is pointed at. The list beside it, or above it on a
  // phone, is what chose it.
  asset: RwaAssetView;
  // Raised rather than handled: adding funds opens the route's own modal host,
  // which the ticket has no access to.
  onAddFunds?: () => void;
  // The caret on the asset pill. The list is this surface's only picker, so
  // changing asset means going back to it. Omitted on the desk, where the list
  // is already on screen beside the ticket and the pill is a label.
  onChangeAsset?: () => void;
  // A spoken order's leg and figure, staged into the form for the reader to
  // confirm. "Buy $10 of Ondo" opens the ticket on the buy leg with 10 already
  // entered; nothing is sent until the reader presses the button. They seed the
  // form once, so typing over them is never undone by a re-render.
  initialSide?: RwaTradeSide;
  initialAmount?: string;
}

// The real assets order ticket: one asset, both legs, priced in place, in the
// spot ticket's structure and built from the same promoted primitives.
//
// This file is markup and wiring only. Every flow behind it, including the two
// Solana settlement legs that keep a closed ticket from stranding money, lives
// in useRwaTicket. There is no second quote, build or execute path here: the
// ticket renders what the hook decided and reports what the reader did.
export function RwaTicket({
  asset,
  onAddFunds,
  onChangeAsset,
  initialSide,
  initialAmount,
}: RwaTicketProps) {
  const t = useTranslations("rwa");
  const ticket = useRwaTicket({ asset, initialSide, initialAmount });
  // Open on arrival: the price is the first thing someone checks before a
  // trade, so the ticket shows it rather than hiding it behind "View Chart".
  const [chartExpanded, setChartExpanded] = useState(true);
  // Which settlement request the reader has waved off. The transfer itself is
  // owned by the page-scope tracker, so "Continue in background" is a request
  // to stop reporting it here, not a cancellation.
  const [backgrounded, setBackgrounded] = useState<string | null>(null);

  // A permissioned asset does not trade on a DEX, so it gets the issuer's terms
  // and a link out rather than a form that the build endpoint would reject.
  if (ticket.issuerAccess) return <RwaIssuerCard asset={asset} />;

  const {
    side,
    setSide,
    isBuy,
    amount,
    setAmount,
    phase,
    quote,
    notice,
    signStep,
    confirm,
    reset,
    logo,
    holding,
    spendableUsd,
    portfolioLoading,
    belowMin,
    minBuyUsd,
    walletEmpty,
    sellable,
    busy,
    canFundSolana,
    needsBaseToSolanaFunding,
    solanaFundingAmount,
    receiveEst,
    feeUsd,
    settlementRequest,
    settlementProgress,
    settlementBusy,
  } = ticket;

  const selling = !isBuy;
  const payToken = USDC_BY_CHAIN[asset.chain];
  const payUnits = spendableUnits(spendableUsd, payToken.decimals);
  const heldUnits = holding ? BigInt(holding.rawBalance) : null;

  // What the amount field is denominated in. A buy spends USDC on the asset's
  // own chain; a sell draws down the holding, which is the only place the
  // asset's on-chain decimals are known.
  const fieldSymbol = selling ? asset.symbol : PAY_SYMBOL;
  const fieldDecimals = selling ? (holding?.decimals ?? payToken.decimals) : payToken.decimals;
  const fieldBalance = selling ? (heldUnits ?? 0n) : payUnits;

  // The 24h reading, taken from the same mapping the desk's table row reads, so
  // the pill and the row can never disagree about the figure or its tone.
  const row = toRwaRowView(asset, logo);

  // What the ticket is doing while the button is held shut. Only ever shown
  // while something really is in flight, and it deliberately does not repeat
  // the sign-step line above it: that line reports which signature the wallet
  // is asking for, this one reports what the order itself is doing.
  const stageWaiting = settlementBusy
    ? settlementRequest?.direction === "solana-to-base"
      ? t("proceedsBaseWorking")
      : t("fundSolanaWorking")
    : isBuy
      ? t("buyingSymbol", { symbol: asset.symbol })
      : t("sellingSymbol", { symbol: asset.symbol });

  // Why the entered amount cannot be sent, for the gates the actions cannot see
  // for themselves: the purchase floor and the quote. Handing the actions an
  // empty amount alongside this reason is how the primitive is told to hold the
  // button shut, since its own gate is the balance and these two are not.
  const holdReason =
    busy || amount === ""
      ? null
      : belowMin
        ? t("minimumBuy", { amount: minBuyUsd })
        : phase === "quoting"
          ? t("fetchingBestPrice")
          : quote == null
            ? t("cantTradeNow", { symbol: asset.symbol })
            : null;

  return (
    // The two data attributes travel with the ticket: it prints a position, so
    // the privacy blur reaches it, and it must not be interrupted by a broadcast
    // while an order is being signed.
    <div
      data-sensitive="position"
      data-broadcast-suspend
      className="flex w-full grow flex-col gap-[27px]"
    >
      <TicketHeader
        symbol={asset.symbol}
        change24h={row.change24h}
        changeDirection={row.changeDirection}
        chartExpanded={chartExpanded}
        onToggleChart={() => setChartExpanded((open) => !open)}
        onChangeAsset={onChangeAsset}
        labels={{
          change24h: t("change24hLabel"),
          viewChart: t("viewChart"),
          changeAsset: t("changeAsset"),
        }}
      />

      {/* The panel unfolds rather than snapping, so the body is gated on
          `rendered` rather than on `chartExpanded`: children dropped in the same
          commit as the close would leave a box already zero tall with nothing to
          interpolate. While it is shut the chart is handed no asset at all,
          which is what keeps its query disabled. */}
      <Disclosure open={chartExpanded} id={CHART_PANEL_ID}>
        {(rendered) => (
          <TicketChart
            chain={rendered ? asset.chain : null}
            address={rendered ? asset.address : null}
            up={(asset.market?.change24h ?? 0) >= 0}
            loadingLabel={t("loadingChart")}
            emptyLabel={t("noChart")}
          />
        )}
      </Disclosure>

      <div className="flex flex-col gap-[13.5px]">
        <TradeSideSwitch
          side={side}
          onChange={setSide}
          disabled={busy}
          labels={{ group: t("sideLabel"), buy: t("buy"), sell: t("sell") }}
        />
        <TradeAmountCard
          amount={amount}
          onAmountChange={setAmount}
          balance={fieldBalance}
          payDecimals={fieldDecimals}
          paySymbol={fieldSymbol}
          payLogo={selling ? logo : undefined}
          side={side}
          // The share shortcuts belong inside the field's own border, under the
          // input, the way the meme desk draws them. They hand back a finished
          // decimal string, taken from the same raw holding in the same integer
          // arithmetic the hook's own fillSellPct uses, so it goes straight to
          // the hook's guarded setter and there is one amount path, not two.
          footer={
            selling ? (
              <TradeSellShortcuts
                held={heldUnits}
                decimals={fieldDecimals}
                onSelect={setAmount}
                disabled={busy}
                labels={{ group: t("sellShortcutsLabel"), max: t("max") }}
              />
            ) : null
          }
          // Nothing to sell means nothing to type. The action below says so in
          // words; a live field over a zero balance would only invite an amount
          // that can never execute.
          disabled={busy || (selling && !holding)}
          labels={{
            paying: t("youPay"),
            selling: t("youAreSelling"),
            balance: t("balanceOf", {
              amount: formatDecimalString(
                fromBaseUnits(fieldBalance, fieldDecimals),
                BALANCE_FRACTION_DIGITS
              ),
              symbol: fieldSymbol,
            }),
            amountLabel: t("amountLabel"),
            amountLabelSell: t("amountLabelSell"),
            changeToken: t("changeToken"),
          }}
        />
        {/* The presets are dollar figures. On the sell leg the field counts the
            asset, so the same chips would be offering to sell 10 or 100 of it:
            the very mix-up the side switch was added to remove. */}
        {selling ? null : (
          <TradeQuickAmounts
            values={BUY_PRESETS}
            onSelect={setAmount}
            selected={amount}
            disabled={busy}
            amountLabel={(value) => t("quickAmountLabel", { amount: value })}
          />
        )}
      </div>

      <div className="mt-auto flex flex-col gap-4 pt-6">
        {/* Both legs carry a summary, so the panel keeps its shape when the
            switch moves. The buy leg prices the purchase from the exact base
            units the field produced; the sell leg shows what the quote, or the
            price feed behind it, says the sale pays out. */}
        <TradeOrderSummary
          side={side}
          purchaseValue={
            isBuy
              ? usdcLabel(toBaseUnits(amount, payToken.decimals), payToken.decimals)
              : estimateLabel(receiveEst)
          }
          fee={estimateLabel(feeUsd)}
          symbol={PAY_SYMBOL}
          loading={phase === "quoting"}
          labels={{
            buy: { value: t("purchaseValue"), fee: t("fee") },
            sell: { value: t("youReceive"), fee: t("estFee") },
          }}
        />

        {signStep ? (
          <p className="text-center text-[12.5px] font-medium text-white/70">
            {t("signingStep", { current: signStep.index + 1, total: signStep.total })}
          </p>
        ) : null}

        {notice ? <NoticeBanner kind={notice.kind} message={notice.message} /> : null}

        {settlementRequest && settlementRequest.id !== backgrounded ? (
          <SettlementNotice
            direction={settlementRequest.direction}
            progressLabel={settlementProgress?.label ?? null}
            // The transfer is the page-scope tracker's, not this ticket's, so
            // waving it off only stops the reporting here.
            onContinueInBackground={() => setBackgrounded(settlementRequest.id)}
            labels={{
              working:
                settlementRequest.direction === "base-to-solana"
                  ? t("fundSolanaWorking")
                  : t("proceedsBaseWorking"),
              status:
                settlementRequest.direction === "base-to-solana"
                  ? t("fundSolanaStatus")
                  : t("proceedsBaseStatus"),
              continueInBackground: t("continueInBackground"),
            }}
          />
        ) : null}

        {needsBaseToSolanaFunding && !canFundSolana ? (
          <InfoCard
            title={t("fundSolanaShort")}
            body={t("fundSolanaShortBody", { amount: formatUsd(solanaFundingAmount) })}
          />
        ) : null}

        {phase === "done" ? (
          // The order is settled, so the ticket takes the button away rather
          // than leaving a live one over a filled quote, which would send the
          // same order twice. Reset puts the form back for the next one.
          <InfoCard
            title={t("orderFilled")}
            body={
              isBuy ? t("buySettled", { name: asset.name }) : t("sellSettled", { name: asset.name })
            }
            actionLabel={isBuy ? t("buyMore") : t("sellMore")}
            onAction={reset}
          />
        ) : walletEmpty ? (
          // An empty wallet is the most common reason a first buy stalls, so
          // the ticket offers the way forward instead of a dead Buy button.
          <InfoCard
            title={t("noFundsTitle")}
            body={t("noFundsBody")}
            actionLabel={onAddFunds ? t("addFunds") : undefined}
            onAction={onAddFunds}
          />
        ) : (
          <TradeActions
            side={side}
            amount={holdReason ? "" : amount}
            pay={{ balance: payUnits, decimals: payToken.decimals, symbol: PAY_SYMBOL }}
            // Buy spends USDC, Sell draws down this asset, so each leg is gated
            // against its own balance. With no holding there is no token record
            // and so no decimals to read, which is why that case carries the
            // symbol alone.
            sell={
              holding
                ? {
                    balance: BigInt(holding.rawBalance),
                    decimals: holding.decimals,
                    symbol: asset.symbol,
                  }
                : { balance: null, symbol: asset.symbol }
            }
            onBuy={() => void confirm()}
            onSell={() => void confirm()}
            // A buy the wallet can't cover is the one block a deposit clears, so
            // the actions grow an "Add funds" button beside a disabled Buy
            // rather than leaving the reason line as the only way out.
            onAddFunds={onAddFunds}
            pending={busy ? side : null}
            labels={{
              stageWaiting,
              ctaEnterAmount: holdReason ?? t("enterAmount"),
              addFunds: t("addFunds"),
              ctaNoBalanceOf: (symbol) => t("notEnoughOf", { symbol }),
              amountTooPrecise: (symbol, decimals) => t("amountTooPrecise", { symbol, decimals }),
              amountInvalid: t("amountInvalid"),
              ctaSelect: t("selectAsset"),
              // A sale can be blocked for three different reasons, and each
              // names its own: the chain, a balance still loading, or an empty
              // holding.
              noSellBalance: (symbol) =>
                !sellable
                  ? t("sellChains")
                  : portfolioLoading
                    ? t("checkingBalance")
                    : t("noHoldingsToSell", { symbol }),
              buy: t("buy"),
              sell: t("sell"),
            }}
          />
        )}
      </div>
    </div>
  );
}

// The strip that names the asset. On the desk the list beside the ticket is the
// picker, so the pill is a label and the promoted header is used as it stands.
// On a phone that list is off screen, so the pill becomes the picker and the
// header is drawn around it here.
function TicketHeader({
  symbol,
  change24h,
  changeDirection,
  chartExpanded,
  onToggleChart,
  onChangeAsset,
  labels,
}: {
  symbol: string;
  change24h: string;
  changeDirection: ChangeDirection;
  chartExpanded: boolean;
  onToggleChart: () => void;
  onChangeAsset?: () => void;
  labels: { change24h: string; viewChart: string; changeAsset: string };
}) {
  if (!onChangeAsset) {
    return (
      <PairHeader
        symbol={symbol}
        change24h={change24h}
        changeDirection={changeDirection}
        chartExpanded={chartExpanded}
        onToggleChart={onToggleChart}
        chartPanelId={CHART_PANEL_ID}
        labels={{ change24h: labels.change24h, viewChart: labels.viewChart }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-[13.5px]">
        <PairSelector pair={symbol} onSelectPair={onChangeAsset} label={labels.changeAsset} />
        <span className="ws-discovery-title text-[15px] whitespace-nowrap">
          <span className="sr-only">{labels.change24h}</span>
          <span className={CHANGE_TONE[changeDirection]}>{change24h}</span>
        </span>
      </div>
      <ChartDisclosure
        expanded={chartExpanded}
        onToggle={onToggleChart}
        panelId={CHART_PANEL_ID}
        label={labels.viewChart}
      />
    </div>
  );
}

// A cross-chain leg in flight. The money is already moving and the page-scope
// tracker owns it, so this reports progress and offers to stop reporting it.
// It never cancels anything: there is nothing here that could.
function SettlementNotice({
  direction,
  progressLabel,
  onContinueInBackground,
  labels,
}: {
  direction: RwaSettlementRequest["direction"];
  // The live status line when one has arrived, null while the first status
  // fetch is still in flight.
  progressLabel: string | null;
  onContinueInBackground: () => void;
  labels: { working: string; status: string; continueInBackground: string };
}) {
  return (
    <div
      data-testid="rwa-settlement-notice"
      data-direction={direction}
      className="rounded-[12px] border border-amber-400/30 bg-amber-400/10 p-3"
    >
      <div className="text-[12.5px] leading-[1.5] font-medium text-amber-200">
        {progressLabel ?? labels.working}
      </div>
      <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/60">{labels.status}</p>
      <button
        type="button"
        onClick={onContinueInBackground}
        className="mt-3 cursor-pointer rounded-[9px] border border-amber-200/25 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-100 hover:bg-amber-100/10"
      >
        {labels.continueInBackground}
      </button>
    </div>
  );
}

// The chart behind the disclosure. Real assets chart on {chain, address} rather
// than on a coingecko id, which RwaApiAsset does not carry. Both arrive null
// while the panel is shut, which leaves the query disabled, so a collapsed
// chart fetches nothing and subscribes to nothing.
function TicketChart({
  chain,
  address,
  up,
  loadingLabel,
  emptyLabel,
}: {
  chain: string | null;
  address: string | null;
  up: boolean;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const { points, loading } = useRwaPriceHistory(chain, address);

  if (!chain || !address) return null;
  if (loading) {
    return (
      <div
        role="status"
        className="ws-inset grid h-[200px] place-items-center text-[13px] font-normal text-white/45"
      >
        {loadingLabel}
      </div>
    );
  }
  // One point draws no line, so it reads as no history rather than as a chart
  // with nothing in it.
  if (points.length > 1) return <PriceChart points={points} height={200} up={up} />;
  return (
    <p className="px-1 py-6 text-center text-[13px] font-normal text-white/45">{emptyLabel}</p>
  );
}

// The hook's own advisory line. An error is red; a gas or progress note is the
// amber advisory, because neither is a failure the reader has to act on.
function NoticeBanner({ kind, message }: { kind: "error" | "gas" | "info"; message: string }) {
  const error = kind === "error";
  return (
    <div
      data-testid="rwa-ticket-notice"
      role={error ? "alert" : "status"}
      className={`rounded-[12px] border p-3 text-[12.5px] font-medium ${
        error
          ? "border-down/30 bg-down/10 text-down"
          : "border-amber-400/30 bg-amber-400/10 text-amber-200"
      }`}
    >
      {message}
    </div>
  );
}

// A titled note in the action slot, with an optional single control. The empty
// wallet, the Solana shortfall and the settled order all take this shape, so
// the foot of the ticket reads the same whichever one is standing there.
function InfoCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-white/12 bg-white/5 p-3">
      <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">{title}</div>
      <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="text-ink mt-2.5 w-full cursor-pointer rounded-[12px] bg-white p-2.5 font-sans text-[13.5px] font-semibold hover:opacity-90"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
