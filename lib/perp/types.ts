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
