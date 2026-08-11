// Domain model for the Worldstreet on-chain prediction market (Base). No
// framework imports. Every money, reserve, share, and price value is a bigint
// in the contract's fixed-point units so nothing on the money path ever touches
// a float. USDC and share amounts are 6-decimal base units; prices are 6-decimal
// probability (0..1e6). Timestamps are unix seconds.

// Price fixed-point scale: priceYes is an integer in [0, PRICE_SCALE] = probability x 1e6.
export const PRICE_SCALE = 1_000_000n;

// USDC and outcome shares both use 6 decimals on this contract.
export const USDC_DECIMALS = 6;

export type MarketStatus = "Open" | "Closed" | "Resolved" | "Invalid";
export type Outcome = "Unresolved" | "Yes" | "No";
// Outcome side of a market. On-chain: 0 = YES, 1 = NO.
export type Side = "yes" | "no";
export type ChartInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Market {
  marketId: bigint;
  creator: string;
  // Off-chain metadata, null until attached via the write API.
  question: string | null;
  category: string | null;
  imageUrl: string | null;
  // Extended off-chain metadata for the rules panel (nullable until attached).
  description: string | null;
  rules: string | null;
  resolutionSource: string | null;
  status: MarketStatus;
  outcome: Outcome;
  closeTime: number; // unix seconds; trading stops at/after this
  feeBps: number; // trade fee accruing to LPs, in basis points
  priceYes: bigint; // 0..PRICE_SCALE
  priceNo: bigint; // = PRICE_SCALE - priceYes
  rYes: bigint; // AMM reserve, 6-dec
  rNo: bigint;
  totalLp: bigint; // LP shares outstanding
  collateral: bigint; // USDC locked (solvency anchor)
  volumeUsdc: bigint; // cumulative traded volume
}

export interface Trade {
  txHash: string;
  trader: string;
  buy: boolean; // true = buy, false = sell
  side: Side;
  usdcAmount: bigint; // 6-dec
  shareAmount: bigint; // 6-dec shares moved
  priceYes: bigint; // price AFTER the trade
  block: number;
}

// A time-bucketed probability point from the chart endpoint.
export interface ChartPoint {
  t: number; // bucket unix seconds
  yes: bigint; // 0..PRICE_SCALE
  no: bigint; // 0..PRICE_SCALE
}

// A raw YES-price observation at a block, from the prices endpoint.
export interface PricePoint {
  block: number;
  priceYes: bigint; // 0..PRICE_SCALE
}

export interface Position {
  marketId: bigint;
  side: Side;
  shares: bigint; // 6-dec
  costUsdc: bigint; // 6-dec cost basis
}

export interface LpPosition {
  marketId: bigint;
  lpShares: bigint;
}

// ── Multi-outcome EVENTS (Polymarket-style grouped markets) ──────────────────
// An event groups N independent on-chain binary markets, one per outcome (e.g. a
// candidate). Each outcome carries its own YES/NO price + volume; the group is
// off-chain presentation only.

export interface GroupOutcome {
  memberId: string;
  marketId: bigint;
  label: string; // "Marine Le Pen"
  imageUrl: string | null;
  status: MarketStatus | "Pending";
  outcome: Outcome;
  priceYes: bigint; // 0..PRICE_SCALE (raw pool price)
  priceNo: bigint;
  normalizedYes: bigint; // this YES ÷ Σ YES across outcomes, 0..PRICE_SCALE (display)
  volumeUsdc: bigint;
  closeTime: number;
}

// Multi-series event chart: one YES-probability line per outcome over time.
export interface EventChartSeries {
  marketId: bigint;
  label: string;
  points: Array<{ t: number; yes: bigint }>; // t unix seconds, yes 0..PRICE_SCALE
}

export interface MarketGroup {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  description: string | null;
  rules: string | null;
  resolutionSource: string | null;
  imageUrl: string | null;
  closeTime: number | null;
  status: "Open" | "Closed" | "Resolved";
  volumeUsdc: bigint; // event rollup
  outcomeCount: number;
  outcomes: GroupOutcome[];
}

// ── Top holders / activity / comments / quotes ───────────────────────────────

export interface Holder {
  holder: string;
  shares: bigint; // 6-dec
  costUsdc: bigint; // 6-dec
  marketId: bigint;
}

export type ActivityKind = "trade" | "lp_add" | "lp_remove" | "redeem" | "resolved";

export interface ActivityItem {
  id: string;
  txHash: string;
  kind: ActivityKind;
  marketId: bigint;
  actor: string;
  side: Side | null;
  buy: boolean | null;
  usdcAmount: bigint | null;
  shareAmount: bigint | null;
  priceYes: bigint | null;
  block: number;
  at: number; // unix ms
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface Comment {
  id: string;
  wallet: string;
  body: string;
  parentId: string | null;
  likeCount: number;
  deleted: boolean;
  at: number; // unix ms
}

// A size-aware CPMM quote (preview before signing).
export interface Quote {
  kind: "buy" | "sell";
  side: Side;
  sharesOut?: bigint; // for buy
  usdcOut?: bigint; // for sell
  avgPriceCents: number;
  priceYesBefore: bigint;
  priceYesAfter: bigint;
  priceImpactBps: number;
}
