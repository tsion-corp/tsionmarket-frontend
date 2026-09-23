// The dollar figure and token quantity a trade event reports.
//
// Every trading path used to report `amount_usd` as whatever the user typed.
// On a buy that is dollars; on a sell it is tokens, which is how a million
// memecoins worth $5 reached Mixpanel as a $1,000,000 trade. Pricing lives here
// so every desk reports a trade the same way: the USDC leg is the dollar figure,
// the other leg is the quantity, and both come from base units.
//
// This is the analytics display edge. Amounts are exact bigints until the last
// step, where Mixpanel's numeric property is the one place they become a
// `number`.

import { usdcAddressOf } from "@/lib/meme/chain";
import { fromBaseUnits } from "@/lib/trade/math";

/**
 * Where `amount_usd` came from. `fill` is what moved, from a receipt or the
 * exact input that was spent; `quote` is what the trade was expected to move.
 * Reports that need settled volume filter on `fill`.
 */
export type AmountSource = "fill" | "quote";

/** USDC's decimals on every chain the app trades on (Base and Solana). */
export const USDC_DECIMALS = 6;

export interface TradeAmounts {
  amount_usd: number;
  /** The traded token's quantity. Omitted when the leg is not known. */
  token_quantity?: number;
  /**
   * What one token cost in dollars: the dollar leg over the token leg. Derived
   * rather than asked of the caller, so it can never disagree with the two
   * amounts beside it, and omitted when there is no token leg to divide by.
   *
   * It is the filled price when `amount_source` is "fill" and the quoted one
   * when it is "quote", the same as the amounts themselves.
   */
  fill_price_usd?: number;
  amount_source: AmountSource;
}

// Prices are rounded to USDC's own precision, so a figure derived here cannot
// carry more accuracy than the money it came from.
function priced(amountUsd: number, quantity: number): { fill_price_usd?: number } {
  if (!(quantity > 0) || !Number.isFinite(amountUsd)) return {};
  return { fill_price_usd: Math.round((amountUsd / quantity) * 1e6) / 1e6 };
}

/** A base-unit amount as the number an analytics property carries. */
export function amountFromBaseUnits(raw: bigint, decimals: number): number {
  return Number(fromBaseUnits(raw, decimals));
}

export interface TradeLegs {
  /** The USDC leg, in base units: spent on a buy, received on a sell. */
  usdRaw: bigint;
  usdDecimals: number;
  /** The traded token's leg, in base units, or null when it is not known. */
  tokenRaw: bigint | null;
  tokenDecimals: number | null;
  source: AmountSource;
}

export function tradeAmounts(legs: TradeLegs): TradeAmounts {
  const amounts: TradeAmounts = {
    amount_usd: amountFromBaseUnits(legs.usdRaw, legs.usdDecimals),
    amount_source: legs.source,
  };
  if (legs.tokenRaw !== null && legs.tokenDecimals !== null) {
    amounts.token_quantity = amountFromBaseUnits(legs.tokenRaw, legs.tokenDecimals);
    Object.assign(amounts, priced(amounts.amount_usd, amounts.token_quantity));
  }
  return amounts;
}

// The parts of a swap-engine quote (a preview or a prepared swap) that price it.
export interface SwapQuoteLegs {
  chainId: number;
  side: "BUY" | "SELL";
  sellToken: { address: string; decimals?: number | null };
  buyToken: { address: string; decimals?: number | null };
  sellAmountAtomic: string;
  expectedBuyAmountAtomic: string;
}

/**
 * Prices a swap from its quote, and from the receipt when there is one.
 *
 * The input leg is exact, so it is always what was spent. The output leg is the
 * quote's expectation until `receivedRaw`, decoded from the swap's receipt,
 * says what actually arrived.
 *
 * Null when the counter-leg is not the chain's USDC, or a leg's decimals or
 * amounts are missing: reporting another token's amount as dollars is the
 * defect this module exists to prevent, so the caller falls back to a priced
 * estimate. It never throws, because it runs inside a trade that has already
 * moved money.
 */
export function swapTradeAmounts(
  quote: SwapQuoteLegs,
  receivedRaw: bigint | null
): TradeAmounts | null {
  const usdc = usdcAddressOf(quote.chainId)?.toLowerCase();
  const buying = quote.side === "BUY";
  const usdToken = buying ? quote.sellToken : quote.buyToken;
  const token = buying ? quote.buyToken : quote.sellToken;
  if (!usdc || usdToken.address.toLowerCase() !== usdc) return null;
  if (usdToken.decimals == null || token.decimals == null) return null;
  if (!isBaseUnits(quote.sellAmountAtomic) || !isBaseUnits(quote.expectedBuyAmountAtomic)) {
    return null;
  }

  const output = receivedRaw ?? BigInt(quote.expectedBuyAmountAtomic);
  const input = BigInt(quote.sellAmountAtomic);
  return tradeAmounts({
    usdRaw: buying ? input : output,
    usdDecimals: usdToken.decimals,
    tokenRaw: buying ? output : input,
    tokenDecimals: token.decimals,
    source: receivedRaw === null ? "quote" : "fill",
  });
}

function isBaseUnits(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

/**
 * Values a sale placed at a quoted price, for a venue that reports no proceeds
 * when the order is accepted. Rounded to six places, USDC's own precision.
 */
export function pricedTradeAmounts(
  tokenRaw: bigint,
  tokenDecimals: number,
  priceUsd: number
): TradeAmounts {
  const quantity = amountFromBaseUnits(tokenRaw, tokenDecimals);
  const amountUsd = Math.round(quantity * priceUsd * 1e6) / 1e6;
  return {
    amount_usd: amountUsd,
    token_quantity: quantity,
    ...priced(amountUsd, quantity),
    amount_source: "quote",
  };
}
