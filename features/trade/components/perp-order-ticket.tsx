"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ChevronDownSoftIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import {
  PerpLeverageCard,
  type PerpMarginMode,
} from "@/features/trade/components/perp-leverage-card";
import {
  acceptsAmountInput,
  formatDecimalString,
  spotAmountStatus,
} from "@/features/trade/components/spot-amount-card";
import {
  SpotOrderModeToggle,
  type SpotOrderMode,
} from "@/features/trade/components/spot-order-mode-toggle";
import {
  SpotTokenBadge,
  type SpotChangeDirection,
} from "@/features/trade/components/spot-pair-header";
import { tokenBg } from "@/lib/trade/assets";
import { fromBaseUnits } from "@/lib/trade/math";

// The 2.0 desktop perps ticket (Figma 173:42920 / 173:42963): the pair strip,
// price, quantity, the risk settings, optional take profit / stop loss, the
// position summary, and Buy / Sell. It replaces HyperliquidOrderForm's
// Cross/5x pills, percent slider and single Place Order button on this surface.
//
// Presentational only. Nothing here fetches, quotes, or prices anything: every
// figure arrives as a prop and every action leaves as a callback. The
// order-entry maths stays with whoever already owns it.
//
// Money rules this file follows, and why each one:
//
//   * The quantity is a decimal string ("0.123456"), never a number. Parsing
//     it to a float and printing it back loses digits well inside the range a
//     collateral balance reaches, and an 18-decimal asset loses them at the
//     first wei. The same holds for the price and for both trigger prices.
//   * The balance arrives as bigint base units, so the comparison that gates
//     Buy and Sell is two bigints, not two doubles.
//   * Order value, entry price, estimated liquidation and the opening fee
//     arrive display-ready. Liquidation in particular is a risk figure: it is
//     never worked out here, only shown, and when the caller has none it is
//     drawn as an explicit "unavailable" rather than as a zero or a dash that
//     a trader could read as a real level. There are two of them, one per
//     direction, because a long and a short break on opposite sides of entry
//     and this ticket does not choose a direction until the click. The caller
//     gets both from estimateLiquidationPrice in features/trade/lib/liquidation.
//     The older
//     liquidationPrice() in lib/trade/math is wrong (float maths, a hardcoded
//     100x maintenance rate, no venue denominator) and is dead code; nothing
//     on this surface may revive it.
//   * Formatting the balance line works on the digits of a string. No
//     arithmetic, so there is nothing to round.
//
// The quantity gate is spotAmountStatus from the spot ticket rather than a
// second implementation. It is the same problem (is this decimal string
// spendable out of this bigint balance at this many decimals) and it carries a
// mutation-tested guarantee; a parallel copy here would be a second answer to
// one question.
//
// What this ticket deliberately does NOT own:
//
//   * The chart. On perps it lives in the left column and owns its own expand
//     control, so the ticket carries no chart slot and no "View Chart"
//     disclosure. A second chart control inside the ticket would be a control
//     that fights the layout around it.
//   * Top up and Withdraw. They move USDC in and out of the perps account,
//     need the wallet id and the clearinghouse's withdrawable figure, and each
//     opens its own modal. None of that is order entry. The composer renders
//     them beside this ticket; nothing here is exposed for them.
//   * Whether a take profit sits on the right side of entry. That answer
//     depends on the direction, and this design picks the direction at the
//     moment of the click rather than up front, so only the composer can judge
//     it. It reports the verdict back through sideBlockedReasons.

export type PerpOrderSide = "buy" | "sell";

// Re-exported so a composer can type its margin-mode state from the ticket it
// is filling, without reaching past it into the leverage card.
export type { PerpMarginMode };

// The asset the quantity is denominated in and drawn from.
export interface PerpQuantityAsset {
  // Spendable balance in this asset's own base units.
  balance: bigint;
  decimals: number;
  symbol: string;
  logo?: string | null;
}

// The estimated liquidation level, per direction.
//
// One figure cannot serve this ticket. A long and a short break on OPPOSITE
// sides of the entry, and this design picks the direction at the click rather
// than up front, so a single unlabelled figure in that row would be right for
// one of the two buttons and wrong for the other, always in the unsafe
// direction. The estimator (estimateLiquidationPrice in
// features/trade/lib/liquidation) takes a side for exactly this reason.
//
// Each side stands alone, because each can be unavailable on its own: the
// estimator declines "unreachable" for a level that genuinely cannot be hit,
// and that can be true of a long while the short has a real level.
export interface PerpLiquidationView {
  // e.g. "$57,982.40" for the Buy button's direction, "$70,162.70" for Sell.
  // These are estimates for the order being composed, NOT the venue's own
  // liquidationPx for a position already open: that figure is authoritative,
  // this one is a projection, and an open position's real level belongs on the
  // position row rather than in an order ticket.
  //
  // null (or an empty string) when no estimate is available. That is a common
  // state, not an edge case: the estimator declines whenever the account
  // already holds a position in this asset, and whenever the level cannot be
  // reached. The row then says so in words. Never pass "0", "-" or "N/A": a
  // trader reads a figure in this row as the price their position dies at, and
  // a placeholder that looks like a number is worse than no number.
  buy: string | null;
  sell: string | null;
  // Why there is no estimate, in the user's language, when the caller can say
  // something better than the generic line. The estimator gives a reason for
  // every decline, and "you already hold a BTC position" is a far more useful
  // sentence than "no estimate available". One note covers both rows, because
  // the rows themselves already name which direction has no level. Ignored
  // when both directions carry a figure.
  unavailableNote?: string | null;
}

// The position summary card. Every field is already formatted, symbol and all.
export interface PerpOrderSummaryView {
  // e.g. "5,000 USDC"
  orderValue: string;
  // e.g. "$64,072.55"
  entryPrice: string;
  // Where the position breaks, one estimate per direction.
  liquidation: PerpLiquidationView;
  // e.g. "3.50 USDC"
  openingFee: string;
  // Set while a fresh quote is in flight. The rows hold their height and show
  // placeholders rather than a stale figure.
  loading?: boolean;
}

// One optional trigger price. The value is a decimal string, "" when unset,
// and it is handed back untouched, exactly as the quantity is.
export interface PerpTriggerField {
  value: string;
  // Called only with a value the field accepts, so a rejected keystroke leaves
  // the caller's state on the last good value.
  onChange: (next: string) => void;
}

// Take profit and stop loss. Supplied as one object because the disclosure,
// the two fields and the open state are a single feature: a half-supplied set
// would draw a control that cannot work. Omit it entirely and the ticket has
// no triggers at all, which is what a market that does not take them wants.
export interface PerpTriggersView {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  takeProfit: PerpTriggerField;
  stopLoss: PerpTriggerField;
}

// The venue's floor on order value. Hyperliquid rejects anything under $10
// outright, and no retry or auto top-up fixes it, so it has to stop the order
// here rather than after a signature.
//
// The composer decides whether the floor is met, because the notional is
// quantity times price times leverage and this ticket does no arithmetic. It
// reports the verdict and the floor's display text; the ticket turns that into
// the same disabled reason every other block uses.
export interface PerpMinNotional {
  // False only when there is a quantity and it is too small. A ticket with an
  // empty field is not "below the minimum", it is empty, and the reason line
  // says so instead.
  met: boolean;
  // Display-ready floor, e.g. "$10".
  label: string;
}

// A reason that stops one direction but not the other. Only a direction-
// dependent check belongs here: a crossed take profit, a stop loss on the
// wrong side of entry, a market that is long-only. Anything that stops both
// sides is blockedReason.
export interface PerpSideBlockedReasons {
  buy?: string | null;
  sell?: string | null;
}

export interface PerpOrderTicketProps {
  // --- pair strip -------------------------------------------------------
  // Display label for the market, e.g. "BTC/USDT". A label, not a control: the
  // market is picked from the list in the left column, so there is no
  // onSelectPair. See the strip below for why that prop is gone.
  pair: string;
  // The 24h change, already formatted, e.g. "-2.20%".
  change24h: string;
  changeDirection: SpotChangeDirection;
  // Limit or market. The venue takes both, and the price row below follows
  // this: supply onPriceChange on a limit order and the row becomes a field.
  mode: SpotOrderMode;
  onModeChange: (mode: SpotOrderMode) => void;

  // --- price ------------------------------------------------------------
  // The price, as a decimal string. Display-ready on a market order; the
  // entered limit price when onPriceChange is supplied.
  price: string;
  // Omit to render the price as a read-only figure, which is what a market
  // order needs. Supply it on a limit order and the row becomes a field, gated
  // the same way the quantity is.
  onPriceChange?: (next: string) => void;
  // The token the price is quoted in, e.g. "USDT".
  quoteSymbol: string;
  priceLoading?: boolean;

  // --- quantity ---------------------------------------------------------
  // The entered quantity as a decimal string, "" when the field is empty.
  quantity: string;
  // Called only with a value the field accepts, so a rejected keystroke leaves
  // the caller's state on the last good value.
  onQuantityChange: (next: string) => void;
  quantityAsset: PerpQuantityAsset;
  // Omit to render the token as a static pill instead of a picker.
  onSelectQuantityAsset?: () => void;
  // What an amount over the balance means on this desk.
  //
  // "block" is the default and the safe reading: the balance is all the money
  // there is, so an amount above it cannot execute and both actions stop.
  //
  // "warn" is for a desk whose submit path can find the rest of the money.
  // Hyperliquid's can: placeOrder sees a short HyperCore balance, bridges from
  // Arbitrum, polls, and retries, so a trader holding 100 USDC on HyperCore
  // and 400 on Arbitrum really can place a 300 USDC order. quantityAsset.balance
  // is the HyperCore figure alone, because that is the one the "Balance:" line
  // states and it must not be inflated into a lie. Under "warn" the ticket says
  // the amount is over that figure and what will happen, and leaves both
  // actions live. It changes nothing else: every other reason still blocks.
  overBalancePolicy?: "block" | "warn";

  // --- risk settings ----------------------------------------------------
  leverage: number;
  onLeverageChange: (next: number) => void;
  // The market's ceiling, from the venue's asset record.
  maxLeverage: number;
  minLeverage?: number;
  leveragePresets?: readonly number[];
  // Cross or isolated. Supply both to draw the control; omit both and the
  // ticket shows leverage alone. The composer pushes the pair of them to the
  // venue together, which is why they sit on one card.
  marginMode?: PerpMarginMode;
  onMarginModeChange?: (next: PerpMarginMode) => void;

  // --- triggers ---------------------------------------------------------
  // Take profit and stop loss, behind a disclosure. Omit for no triggers.
  triggers?: PerpTriggersView | null;

  // --- summary and actions ---------------------------------------------
  summary: PerpOrderSummaryView;
  // The venue's minimum order value, or null when the composer has nothing to
  // say about it yet.
  minNotional?: PerpMinNotional | null;
  // Both sides are handed the quantity string untouched, so what executes is
  // what was typed. Everything else the composer needs (price, leverage,
  // margin mode, both trigger prices) it already holds, because this ticket is
  // controlled on every one of them.
  onBuy: (quantity: string) => void;
  onSell: (quantity: string) => void;
  // The side currently executing, or null when nothing is in flight.
  pending?: PerpOrderSide | null;
  // The signing step now in progress, in the user's language, streamed by the
  // composer's onStatus callback ("Applying leverage", "Confirm in your
  // wallet"). Shown in place of the generic in-flight line, so the same place
  // that explains a dead button also explains a slow one. A finished outcome,
  // success or failure, is not this: it belongs in the composer's own toast,
  // because the ticket has nothing left to block by then.
  pendingStatus?: string | null;
  // Any other reason the composer knows about that must stop BOTH sides, in
  // the user's language. It outranks the field gates, because a market that
  // cannot take an order is the more useful thing to say.
  blockedReason?: string | null;
  // Reasons that stop one direction only.
  sideBlockedReasons?: PerpSideBlockedReasons | null;
  className?: string;
}

// How much of the fraction the balance line shows. Six digits covers USDC in
// full and keeps an 18-decimal asset from running off the header.
const BALANCE_FRACTION_DIGITS = 6;

// The most fraction digits a price field accepts. A quote can carry many more
// than a token's own decimals, so this is a sanity bound on the keystroke, not
// a venue rule. acceptsAmountInput also caps the length and the shape.
const PRICE_MAX_DECIMALS = 18;

// Gain and loss use the semantic price tokens, not the Buy/Sell action colours.
// The spot strip keeps the same map privately; three lines of it are repeated
// here rather than widening that component's exports for one consumer.
const CHANGE_TONE: Record<SpotChangeDirection, string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-grey-400",
};

// Whether a price string names a positive amount. Digits only, so no float
// ever holds a price on the way to this answer.
function isPositivePrice(value: string): boolean {
  const trimmed = value.trim();
  if (!acceptsAmountInput(trimmed, PRICE_MAX_DECIMALS)) return false;
  return /[1-9]/.test(trimmed);
}

// A display figure the caller may not have. Empty and whitespace count as
// missing, so a caller that formats "" from a null upstream gets the same
// honest treatment as one that passes null.
function presentOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : value;
}

export function PerpOrderTicket({
  pair,
  change24h,
  changeDirection,
  mode,
  onModeChange,
  price,
  onPriceChange,
  quoteSymbol,
  priceLoading = false,
  quantity,
  onQuantityChange,
  quantityAsset,
  onSelectQuantityAsset,
  overBalancePolicy = "block",
  leverage,
  onLeverageChange,
  maxLeverage,
  minLeverage = 1,
  leveragePresets,
  marginMode,
  onMarginModeChange,
  triggers,
  summary,
  minNotional = null,
  onBuy,
  onSell,
  pending = null,
  pendingStatus = null,
  blockedReason = null,
  sideBlockedReasons = null,
  className,
}: PerpOrderTicketProps) {
  const t = useTranslations("perps");
  const tSpot = useTranslations("spot");
  const buyReasonId = useId();
  const sellReasonId = useId();
  const advisoryId = useId();
  const triggerPanelId = useId();
  const inFlight = pending !== null;

  const status = spotAmountStatus(quantity, quantityAsset.balance, quantityAsset.decimals);
  // A notice, not a refusal: shown whatever else is going on, and it never
  // disables anything. Null under the blocking policy, where over-balance is
  // handled as a reason instead.
  const advisory =
    status === "above-balance" && overBalancePolicy === "warn" ? t("balanceMayBridge") : null;
  // The field is only painted as an error when the amount really is one. An
  // advisory over-balance will execute, so drawing the rose border on it would
  // mark a valid order invalid.
  const quantityInvalid =
    status === "invalid" ||
    status === "too-precise" ||
    (status === "above-balance" && advisory === null);

  // Why neither side can act, or null when the block is not a shared one.
  // Order matters: an order already in flight outranks everything, so the
  // quantity cannot move under a signature; what the composer knows outranks
  // the field, because a market that will not take an order is the more useful
  // thing to say; and the venue's minimum comes last of the amount checks,
  // because "too small" only means anything once the amount is well formed and
  // affordable.
  const sharedReason = (): string | null => {
    if (inFlight) return presentOrNull(pendingStatus) ?? t("placingOrder");
    if (blockedReason) return blockedReason;
    if (onPriceChange && !isPositivePrice(price)) return t("enterPrice");
    if (status === "empty") return t("enterQuantity");
    if (status === "too-precise") {
      return t("quantityTooPrecise", {
        symbol: quantityAsset.symbol,
        decimals: quantityAsset.decimals,
      });
    }
    if (status === "invalid") return t("quantityInvalid");
    if (status === "above-balance" && advisory === null) {
      return t("notEnoughBalance", { symbol: quantityAsset.symbol });
    }
    if (minNotional && !minNotional.met) {
      return t("belowMinNotional", { min: minNotional.label });
    }
    return null;
  };

  const shared = sharedReason();
  const buyReason = shared ?? presentOrNull(sideBlockedReasons?.buy);
  const sellReason = shared ?? presentOrNull(sideBlockedReasons?.sell);
  // The common case: one balance, one price, one reason. Then the line under
  // the buttons carries it once and both buttons point at it. Only a
  // direction-dependent block splits the two apart, and then each line names
  // the side it belongs to so neither reads as a blanket refusal.
  const oneReason = buyReason === sellReason;
  // The advisory is context on a live button, so it is named alongside whatever
  // reason line the button already points at rather than replacing it.
  const sellReasonTarget = oneReason ? buyReasonId : sellReasonId;
  const describedBy = (reasonId: string) => (advisory ? `${advisoryId} ${reasonId}` : reasonId);
  const buyLine =
    oneReason || buyReason === null ? buyReason : t("buyBlocked", { reason: buyReason });
  const sellLine =
    oneReason || sellReason === null ? sellReason : t("sellBlocked", { reason: sellReason });

  const balanceLine = t("balanceOf", {
    amount: formatDecimalString(
      fromBaseUnits(quantityAsset.balance, quantityAsset.decimals),
      BALANCE_FRACTION_DIGITS
    ),
    symbol: quantityAsset.symbol,
  });

  return (
    <div className={`flex w-full flex-col gap-2 ${className ?? ""}`}>
      <div className="flex flex-col gap-3">
        {/* The pair strip, composed from the spot desk's own exported pieces
            rather than from SpotPairHeader whole. The header bundles a "View
            Chart" disclosure, and on perps the chart is a permanent panel in
            the left column with its own expand control: a second chart control
            in here would be a control that argues with the layout. The two
            pieces that do belong are used unchanged, so the pill and the
            Limit/Market toggle still have one implementation. Their labels
            come from the `spot` namespace, which is where those components'
            keys live.

            The pill is SpotTokenBadge, not SpotPairSelector. It was the
            selector, and that was wrong twice over. Visually, the chevron
            offered a market picker while the actual picker sat in the left
            column a few hundred pixels away, which is the caret the user asked
            to lose. Structurally it was worse: the selector declares
            aria-haspopup="listbox" and aria-expanded, so it promised a screen
            reader a listbox, and the only handler this ticket was ever given
            for it scrolled to a ref that was never attached to anything. It
            opened nothing and it moved nothing. A badge states the market,
            which is all this pill ever did. */}
        {/* The narrowest row on the desk: at 390px the pill, the change and
            the Limit/Market toggle have to share about 320px. Sizing them down
            is most of the fix, but a row that can only ever fit is better than
            one that happens to: the toggle never shrinks, and the cluster
            beside it gives up its own width first. */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-[13.5px]">
            <SpotTokenBadge symbol={pair} />
            <span className="ws-discovery-title truncate text-[13px] sm:text-[15px]">
              <span className="sr-only">{tSpot("change24h")}</span>
              <span className={CHANGE_TONE[changeDirection]}>{change24h}</span>
            </span>
          </div>
          <SpotOrderModeToggle mode={mode} onModeChange={onModeChange} className="shrink-0" />
        </div>

        <PriceCard
          price={price}
          onPriceChange={onPriceChange}
          quoteSymbol={quoteSymbol}
          loading={priceLoading}
          disabled={inFlight}
          label={t("price")}
          fieldLabel={t("limitPrice")}
        />

        <QuantityCard
          quantity={quantity}
          onQuantityChange={onQuantityChange}
          asset={quantityAsset}
          onSelectAsset={onSelectQuantityAsset}
          invalid={quantityInvalid}
          disabled={inFlight}
          label={t("quantity")}
          fieldLabel={t("quantityLabel")}
          balanceLine={balanceLine}
          pillLabel={t("changeToken")}
        />

        <PerpLeverageCard
          leverage={leverage}
          onLeverageChange={onLeverageChange}
          max={maxLeverage}
          min={minLeverage}
          presets={leveragePresets}
          marginMode={marginMode}
          onMarginModeChange={onMarginModeChange}
          disabled={inFlight}
        />

        {triggers ? (
          <TriggersDisclosure
            triggers={triggers}
            quoteSymbol={quoteSymbol}
            disabled={inFlight}
            panelId={triggerPanelId}
          />
        ) : null}

        <SummaryCard summary={summary} />
      </div>

      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full items-start gap-2">
          <ActionButton
            label={t("buy")}
            side="buy"
            busy={pending === "buy"}
            disabled={buyReason !== null}
            describedBy={describedBy(buyReasonId)}
            onClick={() => onBuy(quantity)}
          />
          <ActionButton
            label={t("sell")}
            side="sell"
            busy={pending === "sell"}
            disabled={sellReason !== null}
            describedBy={describedBy(sellReasonTarget)}
            onClick={() => onSell(quantity)}
          />
        </div>
        {/* Both lines are always in the tree, so aria-describedby resolves even
            when there is nothing to say. One reason covering both sides is
            painted once and both buttons point at that one line, rather than
            the same sentence being printed twice. */}
        <ReasonLine id={advisoryId} text={advisory} tone="text-kash" />
        <ReasonLine id={buyReasonId} text={buyLine} />
        <ReasonLine id={sellReasonId} text={oneReason ? null : sellLine} />
      </div>
    </div>
  );
}

// One line under the buttons: a reason they will not fire, or a notice about
// an order that will. Rendered even when there is nothing to say, so the
// aria-describedby pointing at it always resolves.
//
// The default tone is the muted grey the summary labels carry. A notice takes
// the Kash yellow instead, because a warning about money that is not there yet
// has to stand apart from the plain "you have not typed an amount" line.
function ReasonLine({
  id,
  text,
  tone = "text-[rgba(148,163,184,0.6)]",
}: {
  id: string;
  text: string | null;
  tone?: string;
}) {
  if (text === null) return <p id={id} aria-live="polite" className="sr-only" />;
  return (
    <p
      id={id}
      aria-live="polite"
      className={`text-center text-[12px] font-medium sm:text-[13px] ${tone}`}
    >
      {text}
    </p>
  );
}

// The price row. A read-only figure on a market order, a field on a limit one.
// The comp draws it without a border and on a tighter radius than the cards
// below it, which is what separates a reference figure from something to fill
// in.
function PriceCard({
  price,
  onPriceChange,
  quoteSymbol,
  loading,
  disabled,
  label,
  fieldLabel,
}: {
  price: string;
  onPriceChange?: (next: string) => void;
  quoteSymbol: string;
  loading: boolean;
  disabled: boolean;
  label: string;
  fieldLabel: string;
}) {
  return (
    <div className="bg-surface flex w-full items-center justify-between gap-3 rounded-2xl p-[17px]">
      <div className="flex min-w-0 flex-1 flex-col gap-2 leading-none">
        <span className="ws-discovery-title text-[13px] text-[rgba(148,163,184,0.5)] sm:text-[15px]">
          {label}
        </span>
        {loading ? (
          <span className="ws-chewy text-[13px] text-white sm:text-[15px]">
            <SkeletonLine width="w-[5em]" />
          </span>
        ) : onPriceChange ? (
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={price}
            disabled={disabled}
            aria-label={fieldLabel}
            placeholder="0"
            onChange={(event) => {
              const next = event.target.value;
              if (next === price) return;
              if (!acceptsAmountInput(next, PRICE_MAX_DECIMALS)) return;
              onPriceChange(next);
            }}
            className="ws-chewy w-full min-w-0 bg-transparent text-[13px] text-white outline-none disabled:opacity-60 sm:text-[15px]"
          />
        ) : (
          <span className="ws-chewy truncate text-[13px] text-white sm:text-[15px]">{price}</span>
        )}
      </div>
      <span className="ws-discovery-title shrink-0 text-[13px] whitespace-nowrap text-white sm:text-[15px]">
        {quoteSymbol}
      </span>
    </div>
  );
}

// How much to trade, out of what balance, in which asset. The field only ever
// holds a value the ticket can execute: a keystroke that would over-run the
// asset's decimals is dropped rather than truncated, because truncating would
// let 1240.0000001 read as exactly a 1240 balance and pass the balance check.
function QuantityCard({
  quantity,
  onQuantityChange,
  asset,
  onSelectAsset,
  invalid,
  disabled,
  label,
  fieldLabel,
  balanceLine,
  pillLabel,
}: {
  quantity: string;
  onQuantityChange: (next: string) => void;
  asset: PerpQuantityAsset;
  onSelectAsset?: () => void;
  invalid: boolean;
  disabled: boolean;
  label: string;
  fieldLabel: string;
  balanceLine: string;
  pillLabel: string;
}) {
  return (
    <div
      className={`rounded-card bg-surface flex w-full flex-col gap-3.5 border-2 p-[18px] ${
        // The same rose the ws-invalid utility paints on field containers
        // elsewhere, so a bad amount reads the same across the app.
        invalid ? "border-down/55" : "border-hairline"
      }`}
    >
      <div className="ws-discovery-title flex items-center justify-between gap-3 whitespace-nowrap">
        <span className="text-[13px] text-[rgba(148,163,184,0.5)] sm:text-[15px]">{label}</span>
        <span className="text-[12px] text-[rgba(179,186,196,0.6)] sm:text-[14px]">
          {balanceLine}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={quantity}
          disabled={disabled}
          aria-label={fieldLabel}
          aria-invalid={invalid}
          placeholder="0"
          onChange={(event) => {
            const next = event.target.value;
            if (next === quantity) return;
            if (!acceptsAmountInput(next, asset.decimals)) return;
            onQuantityChange(next);
          }}
          className="ws-chewy min-w-0 flex-1 bg-transparent text-[26px] text-[#f8fafc] outline-none disabled:opacity-60 sm:text-[31px]"
        />
        <AssetPill
          symbol={asset.symbol}
          logo={asset.logo}
          label={pillLabel}
          onSelect={onSelectAsset}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function AssetPill({
  symbol,
  logo,
  label,
  onSelect,
  disabled,
}: {
  symbol: string;
  logo?: string | null;
  label: string;
  onSelect?: () => void;
  disabled: boolean;
}) {
  const body = (
    <>
      <AssetIcon sym={symbol} bg={tokenBg(symbol)} size={18} logo={logo} />
      <span className="ws-discovery-title text-[13px] text-[#f8fafc] sm:text-[15px]">{symbol}</span>
      {onSelect ? (
        <ChevronLeftIcon size={9} className="shrink-0 -rotate-90 text-[#f8fafc]" />
      ) : null}
    </>
  );
  const shell = "bg-grey-800 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5";

  if (!onSelect) return <span className={shell}>{body}</span>;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-label={label}
      className={`${shell} hover:bg-grey-700 cursor-pointer transition-colors disabled:opacity-60`}
    >
      {body}
    </button>
  );
}

// Take profit and stop loss, behind a disclosure. They are optional and
// advanced: most orders never set one, and the comp has no room for two more
// permanent fields, so they stay folded until asked for. The panel stays in
// the tree either way, so aria-controls always resolves.
//
// Both fields take the same keystroke gate the price row does, for the same
// reason: a trigger price is a price, and the moment one is parsed to a float
// it can come back a different price.
function TriggersDisclosure({
  triggers,
  quoteSymbol,
  disabled,
  panelId,
}: {
  triggers: PerpTriggersView;
  quoteSymbol: string;
  disabled: boolean;
  panelId: string;
}) {
  const t = useTranslations("perps");
  return (
    <div className="flex w-full flex-col gap-3">
      <button
        type="button"
        onClick={() => triggers.onOpenChange(!triggers.open)}
        aria-expanded={triggers.open}
        aria-controls={panelId}
        className="ws-discovery-title flex cursor-pointer items-center justify-between gap-3 rounded-md text-[13px] text-white transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none sm:text-[14px]"
      >
        {t("tpSlHeading")}
        <span
          aria-hidden
          className={`flex size-[17.988px] shrink-0 items-center justify-center transition-transform ${
            triggers.open ? "rotate-180" : "rotate-0"
          }`}
        >
          <ChevronDownSoftIcon size={11.2425} className="text-white/70" />
        </span>
      </button>

      <div id={panelId} hidden={!triggers.open}>
        {triggers.open ? (
          <div className="grid grid-cols-2 gap-2">
            <TriggerField
              label={t("takeProfit")}
              placeholder={t("none")}
              field={triggers.takeProfit}
              quoteSymbol={quoteSymbol}
              disabled={disabled}
            />
            <TriggerField
              label={t("stopLoss")}
              placeholder={t("none")}
              field={triggers.stopLoss}
              quoteSymbol={quoteSymbol}
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TriggerField({
  label,
  placeholder,
  field,
  quoteSymbol,
  disabled,
}: {
  label: string;
  placeholder: string;
  field: PerpTriggerField;
  quoteSymbol: string;
  disabled: boolean;
}) {
  return (
    <div className="border-hairline bg-surface flex min-w-0 flex-col gap-2 rounded-2xl border-2 p-3 leading-none">
      <span className="ws-discovery-title text-[12px] text-[rgba(148,163,184,0.5)] sm:text-[13px]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={field.value}
          disabled={disabled}
          aria-label={label}
          placeholder={placeholder}
          onChange={(event) => {
            const next = event.target.value;
            if (next === field.value) return;
            if (!acceptsAmountInput(next, PRICE_MAX_DECIMALS)) return;
            field.onChange(next);
          }}
          className="ws-chewy min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30 disabled:opacity-60 sm:text-[15px]"
        />
        <span className="ws-discovery-title shrink-0 text-[12px] whitespace-nowrap text-white/60 sm:text-[13px]">
          {quoteSymbol}
        </span>
      </div>
    </div>
  );
}

// What the position costs and where it breaks. Four figures, all of them
// arriving finished: this card does no arithmetic, so there is no place for a
// rounding error to enter it.
function SummaryCard({ summary }: { summary: PerpOrderSummaryView }) {
  const t = useTranslations("perps");
  const loading = summary.loading ?? false;
  const longLevel = presentOrNull(summary.liquidation.buy);
  const shortLevel = presentOrNull(summary.liquidation.sell);
  // Only worth saying when there is a settled answer. Mid-quote the rows are
  // placeholders, and "we have no estimate" would be a claim about a figure
  // that has not arrived yet.
  const explainMissingLiquidation = !loading && (longLevel === null || shortLevel === null);
  const missingNote =
    presentOrNull(summary.liquidation.unavailableNote) ?? t("liquidationUnavailableHint");

  return (
    // The leading is set on the card so every row inherits one line box, the
    // way the spot summary does. 18px is Quicksand's own line box at 15px,
    // which is what the comp draws; the Tailwind default of 1.5 adds 4.5px per
    // row and carries 18px of it into the panel below. Nothing caps a height,
    // so a longer label in another locale still grows the row it sits in.
    <div className="rounded-card border-hairline-amber bg-panel flex w-full flex-col gap-2.5 border-2 p-[18px] leading-[18px] whitespace-nowrap">
      <SummaryRow
        label={t("orderValue")}
        value={summary.orderValue}
        loading={loading}
        skeletonWidth="w-[5.5em]"
      />
      <SummaryRow
        label={t("entryPrice")}
        value={summary.entryPrice}
        loading={loading}
        skeletonWidth="w-[5em]"
      />
      {/* A deliberate, documented departure from the comp, which draws ONE
          "Est. liquidation" row. The comp also draws two action buttons, and a
          long and a short break on opposite sides of entry: a single figure
          would be wrong for whichever button the trader did not press, and
          wrong towards the unsafe side. Two rows in the order the buttons sit,
          Buy first.

          Labelled by composition rather than by a new "Est. liquidation
          (Long)" string, so each word is translated on its own and no locale
          inherits an English parenthetical. The separator is punctuation, not
          grammar. */}
      <LiquidationRow
        label={`${t("estLiquidation")} · ${t("long")}`}
        level={longLevel}
        unavailableLabel={t("liquidationUnavailable")}
        loading={loading}
      />
      <LiquidationRow
        label={`${t("estLiquidation")} · ${t("short")}`}
        level={shortLevel}
        unavailableLabel={t("liquidationUnavailable")}
        loading={loading}
      />
      <SummaryRow
        label={t("openingFee")}
        value={summary.openingFee}
        loading={loading}
        skeletonWidth="w-[4.5em]"
      />
      {explainMissingLiquidation ? (
        <p className="text-[12px] font-medium whitespace-normal text-[rgba(148,163,184,0.6)] sm:text-[13px]">
          {missingNote}
        </p>
      ) : null}
    </div>
  );
}

// One direction's liquidation level. With no estimate the cell holds a word,
// not a figure, in the muted tone the labels carry rather than the alarm
// orange: anything that reads as a number in this row reads as a price the
// position dies at.
function LiquidationRow({
  label,
  level,
  unavailableLabel,
  loading,
}: {
  label: string;
  level: string | null;
  unavailableLabel: string;
  loading: boolean;
}) {
  return (
    <SummaryRow
      label={label}
      value={level ?? unavailableLabel}
      loading={loading}
      skeletonWidth="w-[5em]"
      // The comp's own deep orange for the liquidation figure. It is neither
      // --color-down, which is the price-delta rose, nor --color-sell, which
      // is the action red, so it is written out until the palette names it.
      tone={level === null ? "text-[rgba(148,163,184,0.6)]" : "text-[#ed2b07]"}
    />
  );
}

function SummaryRow({
  label,
  value,
  loading,
  skeletonWidth,
  tone = "text-[#f8fafc]",
}: {
  label: string;
  value: string;
  loading: boolean;
  skeletonWidth: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 font-[family-name:var(--font-discovery)] text-[13px] font-semibold sm:text-[15px]">
      <span className="text-[rgba(148,163,184,0.6)]">{label}</span>
      <span className={tone}>{loading ? <SkeletonLine width={skeletonWidth} /> : value}</span>
    </div>
  );
}

// Buy and Sell are actions, so they carry the action tokens (bg-buy, bg-sell),
// never the price-delta colours. Neither is ever a silently dead control: when
// one is disabled the line beneath them says why, and each points at its own
// reason through aria-describedby so it reaches a screen reader too.
function ActionButton({
  label,
  side,
  busy,
  disabled,
  describedBy,
  onClick,
}: {
  label: string;
  side: PerpOrderSide;
  busy: boolean;
  disabled: boolean;
  describedBy: string;
  onClick: () => void;
}) {
  // The label is Inter, per the comp. Inter is already loaded and preloaded on
  // every route as --font-sportsbook, so naming it costs no extra bytes.
  //
  // The comp fills Buy at 80% over a solid edge of the same green and leaves
  // Sell flat. Sell still carries a border of the same weight, transparent, so
  // the two buttons stand exactly as tall as each other.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      aria-describedby={describedBy}
      className={`flex h-12 min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center rounded-3xl border-2 font-[family-name:var(--font-sportsbook)] text-[16px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45 ${
        side === "buy" ? "bg-buy/80 border-buy" : "bg-sell border-transparent"
      }`}
    >
      {busy ? <ButtonSpinner /> : null}
      {label}
    </button>
  );
}
