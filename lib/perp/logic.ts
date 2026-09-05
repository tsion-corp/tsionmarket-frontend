// Pure perp trading logic. No framework imports, everything unit tested. All
// checks that gate a real trade use exact integer (bigint) math on the decimal
// strings the API speaks; floats appear only in display estimates.

import { toBaseUnits } from "@/lib/trade/math";
import type { PerpCategory, PerpPair } from "@/lib/perp/types";

// The wire format the perp API enforces for money, prices, and leverage.
const WIRE_DECIMAL = /^\d+(\.\d+)?$/;

export const USDC_DECIMALS = 6;

// Chain constants for the flow: Avantis on Base pulls collateral from native
// Circle USDC via the TradingStorage contract.
export const PERP_CHAIN_ID = 8453;
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const TRADING_STORAGE_ADDRESS = "0x8a311D7048c35985aa31C131B9A13e03a5f7422d";
// Canonical Base WETH — the only unwrap target the signing allowlist accepts
// (see lib/perp/steps.ts). The gas top-up buys native ETH directly via the
// platform's existing Dextopus buy flow (lib/buy-quote.ts); WETH only
// matters if a wallet already holds some (e.g. stranded from a partial
// top-up attempt), which the top-up unwraps rather than leaving stuck.
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
export const WETH_DECIMALS = 18;

// One large approval instead of one per trade: the allowance is consumed on
// every open, so approving the exact collateral would force an approve step
// before every trade. A billion USDC is far beyond any realistic exposure
// while staying a readable, non-infinite figure in the wallet.
export const LARGE_APPROVAL_USDC = "1000000000";

// A valid non-negative wire amount, e.g. "100", "100.5". Rejects "", ".5",
// "1.", "1.2.3", negatives, exponents, and anything not a plain decimal.
export function isWireDecimal(value: string): boolean {
  return WIRE_DECIMAL.test(value);
}

// A wire decimal that is strictly greater than zero. The positivity check is
// done on the string (any nonzero digit), so a tiny value can never collapse
// to zero through float parsing.
export function isPositiveWireDecimal(value: string): boolean {
  return WIRE_DECIMAL.test(value) && /[1-9]/.test(value);
}

// A positive wire decimal within a precision the venue can represent (USDC has
// 6 decimals, leverage is quoted in hundredths). Deeper precision would be
// silently truncated by our bigint math while the raw string went to the
// gateway at full length — two different amounts for one order.
export function isWireAmount(value: string, maxDecimals: number): boolean {
  if (!isPositiveWireDecimal(value)) return false;
  const dot = value.indexOf(".");
  return dot === -1 || value.length - dot - 1 <= maxDecimals;
}

// A float as a wire-safe decimal string (String() emits scientific notation
// for sub-micro values), or null.
export function toWirePrice(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const fixed = n.toFixed(8);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return isPositiveWireDecimal(trimmed) ? trimmed : null;
}

// Collateral in USDC base units (6 decimals), for the exact allowance compare.
export function collateralBaseUnits(collateralUsdc: string): bigint {
  return toBaseUnits(collateralUsdc, USDC_DECIMALS);
}

// Position size (collateral x leverage) in USDC base units, computed exactly.
// Leverage supports up to 2 decimal places ("10", "7.5"); deeper precision is
// rejected by validateOrder and orderFieldValidity via isWireAmount.
export function positionSizeBaseUnits(collateralUsdc: string, leverage: string): bigint {
  const collateral = toBaseUnits(collateralUsdc, USDC_DECIMALS);
  const leverageHundredths = toBaseUnits(leverage, 2);
  return (collateral * leverageHundredths) / 100n;
}

// Fallback minimum position sizes per category, in USDC, for pairs that do
// not carry minPositionUsdc (the synthesized preview pairs, or an older
// gateway). The live gateway serves a per-pair value that varies from $10 to
// $300, so the pair's own figure always wins.
const FALLBACK_MIN_POSITION_USDC: Record<PerpCategory, bigint> = {
  crypto: 100n * 10n ** 6n,
  forex: 300n * 10n ** 6n,
  commodities: 300n * 10n ** 6n,
  equities: 300n * 10n ** 6n,
  other: 300n * 10n ** 6n,
};

export function minPositionBaseUnits(pair: PerpPair): bigint {
  const min = pair.minPositionUsdc;
  if (min != null && WIRE_DECIMAL.test(min)) return toBaseUnits(min, USDC_DECIMALS);
  return FALLBACK_MIN_POSITION_USDC[pair.category];
}

export interface OrderValidation {
  ok: boolean;
  // User-facing reason when not ok. English fallback; `code` lets the UI
  // render the same reason in the active language.
  message?: string;
  code?:
    | "enterCollateral"
    | "enterLeverage"
    | "overMaxLeverage"
    | "underMinLeverage"
    | "underMinPosition"
    | "overBalance";
  params?: Record<string, string | number>;
}

// Validates an order before any build call, so a trade that would revert
// on-chain (over max leverage, under minimum size) is stopped at the form.
export function validateOrder(
  pair: PerpPair,
  collateralUsdc: string,
  leverage: string,
  balanceUsdc?: string
): OrderValidation {
  if (!isWireAmount(collateralUsdc, USDC_DECIMALS)) {
    return { ok: false, message: "Enter a collateral amount.", code: "enterCollateral" };
  }
  if (!isWireAmount(leverage, 2)) {
    return { ok: false, message: "Enter a leverage.", code: "enterLeverage" };
  }
  const leverageHundredths = toBaseUnits(leverage, 2);
  if (leverageHundredths > BigInt(pair.maxLeverage) * 100n) {
    return {
      ok: false,
      message: `Max leverage for this market is ${pair.maxLeverage}x.`,
      code: "overMaxLeverage",
      params: { max: pair.maxLeverage },
    };
  }
  if (leverageHundredths < 100n) {
    return { ok: false, message: "Leverage must be at least 1x.", code: "underMinLeverage" };
  }
  const size = positionSizeBaseUnits(collateralUsdc, leverage);
  const min = minPositionBaseUnits(pair);
  if (size < min) {
    const minUsd = Number(min) / 10 ** USDC_DECIMALS;
    return {
      ok: false,
      message: `Minimum position for this market is $${minUsd}.`,
      code: "underMinPosition",
      params: { min: minUsd },
    };
  }
  if (balanceUsdc != null && isWireDecimal(balanceUsdc)) {
    if (collateralBaseUnits(collateralUsdc) > collateralBaseUnits(balanceUsdc)) {
      return { ok: false, message: "That is more than your USDC balance.", code: "overBalance" };
    }
  }
  return { ok: true };
}

// Per-field validity for live input feedback (the red borders that appear as
// the user types). Unlike validateOrder — which short-circuits to produce ONE
// message for the CTA — every field is judged independently, so an over-max
// leverage reads as wrong even while the collateral box is still empty. Empty
// fields are never flagged.
export interface OrderFieldValidity {
  collateralInvalid: boolean;
  leverageInvalid: boolean;
}

export function orderFieldValidity(
  pair: PerpPair,
  collateralUsdc: string,
  leverage: string,
  balanceUsdc?: string
): OrderFieldValidity {
  let collateralInvalid = false;
  let leverageInvalid = false;

  const collateralOk = isWireAmount(collateralUsdc, USDC_DECIMALS);
  const leverageOk = isWireAmount(leverage, 2);

  if (collateralUsdc !== "") {
    if (!collateralOk) {
      collateralInvalid = true;
    } else if (
      balanceUsdc != null &&
      isWireDecimal(balanceUsdc) &&
      collateralBaseUnits(collateralUsdc) > collateralBaseUnits(balanceUsdc)
    ) {
      collateralInvalid = true;
    }
  }

  if (leverage !== "") {
    if (!leverageOk) {
      leverageInvalid = true;
    } else {
      const hundredths = toBaseUnits(leverage, 2);
      if (hundredths < 100n || hundredths > BigInt(pair.maxLeverage) * 100n) {
        leverageInvalid = true;
      }
    }
  }

  // Under-minimum marks both entered fields once each is individually fine,
  // since raising either one fixes it.
  if (!collateralInvalid && !leverageInvalid && collateralOk && leverageOk) {
    if (positionSizeBaseUnits(collateralUsdc, leverage) < minPositionBaseUnits(pair)) {
      collateralInvalid = collateralUsdc !== "";
      leverageInvalid = leverage !== "";
    }
  }

  return { collateralInvalid, leverageInvalid };
}

// Crypto trades around the clock; forex, commodities, and equities close on
// weekends and outside session hours. When those markets are closed the Pyth
// feed goes stale, so a price older than this is treated as "likely closed"
// and the UI warns instead of letting an order sit pending until reopen.
const STALE_PRICE_SECONDS = 300;

export function isLikelyClosed(
  category: PerpCategory,
  priceUpdatedAt: number | null | undefined,
  nowSeconds: number
): boolean {
  if (category === "crypto") return false;
  if (priceUpdatedAt == null) return true;
  return nowSeconds - priceUpdatedAt > STALE_PRICE_SECONDS;
}

// Whether the approve step is needed: the current allowance does not cover
// this trade's collateral. Exact compare in base units.
export function needsApproval(allowance: bigint, collateralUsdc: string): boolean {
  return allowance < collateralBaseUnits(collateralUsdc);
}

// Step values arrive as wei decimal strings per the API contract, but the
// deployed gateway sends a plain JSON number 0 on approval steps. Accept a
// number only when it is a safe non-negative integer: a large numeric wei
// value would already have lost precision in JSON, so it must be rejected
// rather than signed wrong.
export function parseStepValueWei(value: string | number): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Transaction step has an invalid value.");
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("Transaction step has an invalid value.");
  }
  return BigInt(value);
}

// "TP: none" and "SL: none" travel as "0" on the wire.
export function isUnsetLevel(level: string): boolean {
  return !isPositiveWireDecimal(level);
}

// Display label for a pair, e.g. "ETH/USD".
export function pairSymbol(pair: PerpPair): string {
  return `${pair.from}/${pair.to}`;
}

// The curated major markets, in display order. The simple desk offers exactly
// these, and the dashboard overview previews the first few of them, so the set
// lives here rather than inside either component.
export const PERP_MAJOR_SYMBOLS = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "BNB/USD",
  "DOGE/USD",
  "AAVE/USD",
];

// Categories in presentation order for the market tabs.
export const CATEGORY_ORDER: readonly PerpCategory[] = [
  "crypto",
  "forex",
  "commodities",
  "equities",
];

export const CATEGORY_LABEL: Record<PerpCategory, string> = {
  crypto: "Crypto",
  forex: "Forex",
  commodities: "Commodities",
  equities: "Equities",
  other: "Other",
};

// Market stats (skew, depth, open interest) are USDC figures that reach nine
// digits, and spelled out they overflow the third-width stat boxes they sit
// in — QA caught 78,897,816.75 spilling past the card edge. Compact notation
// keeps any magnitude to a handful of characters, and unlike the RWA helper
// this one keeps the sign, because skew is long-minus-short and negative is
// half its meaning. Zero is a real reading; only a missing value is a dash.
export function formatCompactUsdc(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const compact = Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value < 0 ? "-" : ""}${compact}`;
}
