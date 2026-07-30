// Domain types for perpetual futures on Avantis (Base mainnet). These mirror
// the perp gateway contract exactly: money, prices, and leverage travel as
// DECIMAL STRINGS in human units, never as numbers, so nothing on the wire is
// ever a float. Components only ever see these types, never raw payloads.

export type PerpCategory = "crypto" | "forex" | "commodities" | "equities" | "other";

export interface PerpPair {
  pairIndex: number;
  from: string;
  to: string;
  groupIndex: number;
  group: string;
  category: PerpCategory;
  feeIndex: number;
  maxLeverage: number;
  // Minimum notional (collateral x leverage) in USDC, per pair. Varies widely
  // ($10 to $300 on the live gateway), so it must never be hardcoded.
  minPositionUsdc: string;
  spread: { min: number; max: number };
  maxLongOiP: number;
  maxShortOiP: number;
}

export interface PerpPairMarket {
  pairIndex: number;
  pair: string;
  category?: PerpCategory;
  price?: string | null;
  priceUpdatedAt?: number | null;
  openInterest?: { long: number; short: number };
  skew?: number;
  depth?: { above: number; below: number };
  spread?: number;
}

export interface PerpPrice {
  pairIndex: number;
  pair: string;
  price: string | null;
  publishTime: number | null;
}

export interface OpenPosition {
  trader: string;
  pairIndex: number;
  index: number;
  initialCollateralUsdc: string;
  openPrice: string;
  isLong: boolean;
  leverage: string;
  // "0" means none for both.
  takeProfit: string;
  stopLoss: string;
  // Live analytics computed by the gateway. Optional: older deployments omit
  // them, and the UI falls back to its own mark-price estimate when absent.
  markPrice?: string | null;
  liquidationPrice?: string;
  // Net of funding; may carry a leading minus sign, unlike wire inputs.
  unrealizedPnlUsdc?: string;
  unrealizedPnlPct?: string;
  fundingFeeUsdc?: string;
}

// A pending (unfilled) limit or stop order, from GET /orders. `index` is the
// orderIndex that /build/cancel-order takes.
export interface PerpOrder {
  trader: string;
  pairIndex: number;
  index: number;
  isLong: boolean;
  collateralUsdc: string;
  leverage: string;
  // The trigger/limit price the keeper fills at.
  price: string;
  takeProfit: string;
  stopLoss: string;
  slippagePct: string;
}

export interface TradeQuote {
  pair: string;
  pairIndex: number;
  isLong: boolean;
  collateralUsdc: string;
  leverage: string;
  positionSizeUsdc: string;
  openingFeeUsdc: string;
  priceImpactSpread: string;
  executionFeeEth: string;
}

// One unsigned transaction the user's wallet signs. `value` is wei as a decimal
// string per the contract ("0" for approvals, the keeper execution fee for
// open/close), but the deployed gateway sends approval zeros as a JSON number,
// so the type reflects the wire reality. parseStepValueWei guards both.
export interface TransactionStep {
  to: string;
  data: string;
  value: string | number;
  label: string;
}

export interface BuildResult {
  steps: TransactionStep[];
  chainId: 8453;
}

export type PerpOrderType = "market" | "limit" | "stop_limit" | "market_zero_fee";

export interface OpenTradeRequest {
  trader: string;
  pair: string;
  isLong: boolean;
  collateralUsdc: string;
  leverage: string;
  orderType: PerpOrderType;
  // The live Pyth price, passed even for market orders so the keeper fills
  // within slippagePct of it. Required for limit and stop_limit.
  openPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
  slippagePct: string;
  referrer?: string;
}
