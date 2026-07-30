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

// Collateral in USDC base units (6 decimals), for the exact allowance compare.
export function collateralBaseUnits(collateralUsdc: string): bigint {
  return toBaseUnits(collateralUsdc, USDC_DECIMALS);
}

// Position size (collateral x leverage) in USDC base units, computed exactly.
// Leverage supports up to 2 decimal places ("10", "7.5"); more precision than
// that is not a real leverage input and is rejected by validateOrder.
export function positionSizeBaseUnits(collateralUsdc: string, leverage: string): bigint {
  const collateral = toBaseUnits(collateralUsdc, USDC_DECIMALS);
  const leverageHundredths = toBaseUnits(leverage, 2);
  return (collateral * leverageHundredths) / 100n;
}

// Minimum position sizes per category, in USDC. The API does not expose a
// per-pair minimum yet, so these follow the backend guidance: crypto majors
// about $100, everything else about $300. Replace with pair.minPositionUsdc
// once the API adds it.
const MIN_POSITION_USDC: Record<PerpCategory, bigint> = {
  crypto: 100n * 10n ** 6n,
  forex: 300n * 10n ** 6n,
  commodities: 300n * 10n ** 6n,
  equities: 300n * 10n ** 6n,
  other: 300n * 10n ** 6n,
};

export function minPositionBaseUnits(category: PerpCategory): bigint {
  return MIN_POSITION_USDC[category];
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
  if (!isPositiveWireDecimal(collateralUsdc)) {
    return { ok: false, message: "Enter a collateral amount.", code: "enterCollateral" };
  }
  if (!isPositiveWireDecimal(leverage)) {
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
  const min = minPositionBaseUnits(pair.category);
  if (size < min) {
    const minUsd = Number(min / 10n ** 6n);
    return {
      ok: false,
      message: `Minimum position for this market is about $${minUsd}.`,
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

// Step values arrive as wei decimal strings. Parses one for signing, rejecting
// anything that is not a plain non-negative integer so a malformed step can
// never be signed with a garbage value.
export function parseStepValueWei(value: string): bigint {
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
