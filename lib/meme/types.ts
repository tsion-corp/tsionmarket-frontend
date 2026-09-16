// The trade service's token shape, in a file with no client directive so the
// server can import the type without pulling the browser client along.

export type TokenRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

// The service's lifecycle state for a catalogue row.
export type TokenStatus = "ACTIVE" | "BLOCKED" | "DISCOVERED";

export interface TokenWarning {
  code: string;
  message: string;
}

export interface MemeToken {
  chainId: number;
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
  priceUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  priceChange24hPercent: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  pairAddress: string | null;
  dexName: string | null;
  riskLevel: TokenRiskLevel;
  // The service's lifecycle state: ACTIVE, DISCOVERED (unrated), BLOCKED.
  // Absent on the search and detail routes.
  status?: TokenStatus;
  buyEnabled: boolean;
  sellEnabled: boolean;
  warnings: TokenWarning[];
  // Market activity per window, from the list and trending routes only. A
  // window the providers do not fill is absent or all null, never estimated
  // from another window (llms.txt: no 4h for 6h, no 12h from 24h).
  activity?: Partial<Record<MemeTimeframe, MemeActivity>>;
  // When the coin's top pair was created (ISO), the screener's "age".
  pairCreatedAt?: string | null;
}

// The screener's windows (llms.txt "timeframe").
export type MemeTimeframe = "5m" | "1h" | "6h" | "12h" | "24h";

// One window of activity. Money and percentages are decimal strings, counts
// are integers; percentages are points ("12.5" is +12.5%).
export interface MemeActivity {
  volumeUsd: string | null;
  transactions: number | null;
  traders: number | null;
  priceChangePercent: string | null;
}

// GET /tokens/{address}/risk. Advisory: not a guarantee of safety.
export interface TokenRisk {
  level: TokenRiskLevel;
  blocked: boolean;
  warnings: TokenWarning[];
  assessedAt: string;
  disclaimer: string;
}

// GET /tokens/{address}/tradability. The two switches are policy hints; the
// quote still re-checks them server-side.
export interface TokenTradability {
  buyEnabled: boolean;
  sellEnabled: boolean;
  risk: TokenRisk;
}

// A token as a preview or quote names it. Only the address and symbol are read
// here; the rest arrives when the service sends it.
export interface SwapTokenRef {
  address: string;
  symbol: string | null;
  chainId?: number;
  name?: string | null;
  decimals?: number | null;
  logoUrl?: string | null;
}

export interface SwapPreview {
  side: "BUY" | "SELL";
  chainId?: number;
  walletAddress?: string;
  sellToken: SwapTokenRef;
  buyToken: SwapTokenRef;
  sellAmountAtomic: string;
  sellAmountFormatted: string;
  expectedBuyAmountAtomic: string;
  expectedBuyAmountFormatted: string;
  minimumBuyAmountAtomic: string;
  minimumBuyAmountFormatted: string;
  priceImpactBps: number | null;
  slippageBps: number;
  platformFeeAmountAtomic: string;
  platformFeeAmountFormatted: string;
  liquidityAvailable?: boolean;
  approvalRequired?: boolean;
  riskLevel: TokenRiskLevel;
  warnings: TokenWarning[];
  expiresAt: string;
}

export interface PreparedCall {
  type?: "APPROVAL" | "SWAP";
  to: string;
  data: string;
  value: string;
}

export interface PreparedSwap {
  swapId: string;
  quoteId?: string;
  chainId: number;
  side: "BUY" | "SELL";
  walletAddress?: string;
  sellToken: SwapTokenRef;
  buyToken: SwapTokenRef;
  sellAmountAtomic: string;
  expectedBuyAmountAtomic: string;
  minimumBuyAmountAtomic: string;
  slippageBps?: number;
  priceImpactBps?: number | null;
  executionMode?: "SINGLE_CALL" | "BATCHED_CALLS";
  calls: PreparedCall[];
  warnings?: TokenWarning[];
  expiresAt: string;
}

// The Solana quote is one unsigned versioned transaction for the gas
// sponsor, not a list of calls.
export interface PreparedSolanaSwap {
  swapId: string;
  unsignedTransactionBase64: string;
  platformFeeTokenAddress?: string | null;
  platformFeeAmountAtomic?: string;
  expiresAt: string;
}

export type SwapStatus =
  | "QUOTED"
  | "AWAITING_SUBMISSION"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "REVERTED"
  | "EXPIRED"
  | "CANCELLED";

export interface SwapDetail {
  id: string;
  walletAddress: string;
  chainId: number;
  side: "BUY" | "SELL";
  status: SwapStatus;
  sellTokenAddress: string;
  buyTokenAddress: string;
  sellTokenDecimals: number;
  buyTokenDecimals: number;
  sellAmountAtomic: string;
  quotedBuyAmountAtomic: string;
  actualSellAmountAtomic: string | null;
  actualBuyAmountAtomic: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface SwapStatusUpdate {
  swapId: string;
  status: SwapStatus;
  updatedAt: string;
}

export interface SubmissionReceipt {
  swapId: string;
  status: SwapStatus;
  callIndex?: number;
}

export interface WalletChallenge {
  challengeId: string;
  message: string;
  expiresAt: string;
}

// The trade service's portfolio, profit/loss and activity model (the
// contract's "Portfolio, profit/loss, and complete user activity"). Every
// quantity, USD amount, price and percentage is a decimal string; a null
// valuation means the providers cannot currently value the asset, never zero.

export type PortfolioChain = "base" | "solana";

export type TradeActivityStatus = Exclude<SwapStatus, "QUOTED">;

export interface PortfolioPosition {
  chain: PortfolioChain;
  chainId: number;
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  logoUrl: string | null;
  positionStatus: "OPEN" | "CLOSED";
  // PARTIAL: the live wallet balance and the service's ledger differ, or a
  // confirmed sell exceeded tracked buys. Cost basis and P&L are incomplete.
  costBasisStatus: "COMPLETE" | "PARTIAL";
  quantityBought: string;
  quantitySold: string;
  // The live balance when every wallet could be read, otherwise the ledger's.
  quantityRemaining: string;
  ledgerQuantityRemaining: string;
  walletQuantity: string | null;
  externalQuantityDelta: string | null;
  // UNAVAILABLE: quantityRemaining is ledger-derived, not live.
  balanceStatus: "MATCHED" | "LOWER_THAN_LEDGER" | "HIGHER_THAN_LEDGER" | "UNAVAILABLE";
  balanceUpdatedAt: string | null;
  totalInvestedUsd: string;
  totalProceedsUsd: string;
  remainingCostBasisUsd: string;
  averageEntryPriceUsd: string | null;
  lowestEntryPriceUsd: string | null;
  highestEntryPriceUsd: string | null;
  currentPriceUsd: string | null;
  // An informational mark, never guaranteed sell proceeds.
  currentValueUsd: string | null;
  realizedPnlUsd: string;
  realizedReturnPercent: string | null;
  unrealizedPnlUsd: string | null;
  unrealizedReturnPercent: string | null;
  totalPnlUsd: string;
  // Percentage points: "32" is +32%.
  totalReturnPercent: string | null;
  buyCount: number;
  sellCount: number;
  firstBoughtAt: string;
  lastBoughtAt: string;
  lastActivityAt: string;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  priceChange24hPercent: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  pairAddress: string | null;
  dexName: string | null;
  marketDataUpdatedAt: string | null;
  // PARTIAL: a price exists but complete pair identity does not.
  marketDataStatus: "READY" | "PARTIAL" | "UNAVAILABLE";
  riskLevel: TokenRiskLevel;
  sellEnabled: boolean;
  warnings: TokenWarning[];
  valuationDisclaimer: string;
}

export interface PortfolioSummary {
  totalPositions: number;
  openPositions: number;
  closedPositions: number;
  totalInvestedUsd: string;
  totalProceedsUsd: string;
  currentValueUsd: string;
  realizedPnlUsd: string;
  unrealizedPnlUsd: string;
  totalPnlUsd: string;
  totalReturnPercent: string | null;
  profitablePositions: number;
  losingPositions: number;
  // false: the aggregate value and unrealised/total P&L leave out positions
  // that cannot be priced, and must be labelled partial.
  marketValueComplete: boolean;
  calculatedAt: string;
}

export interface TradeActivity {
  id: string;
  quoteId: string;
  chain: PortfolioChain;
  chainId: number;
  side: "BUY" | "SELL";
  status: TradeActivityStatus;
  walletAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenLogoUrl: string | null;
  sellTokenAddress: string;
  buyTokenAddress: string;
  sellAmountAtomic: string;
  sellAmount: string;
  buyAmountAtomic: string;
  buyAmount: string;
  usdAmount: string;
  platformFeeAmountAtomic: string | null;
  platformFeeAmountUsd: string | null;
  transactionHashes: string[];
  userOperationHashes: string[];
  createdAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  updatedAt: string;
  failureCode: string | null;
  failureReason: string | null;
}

/** GET /portfolio/{chain}/{address}: the position and its confirmed trades, newest first. */
export interface PortfolioPositionDetail extends PortfolioPosition {
  activity: TradeActivity[];
}
