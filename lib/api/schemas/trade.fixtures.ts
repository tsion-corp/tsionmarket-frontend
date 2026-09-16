// Trade-service payloads for tests. The token, market, risk and tradability
// samples were captured from api.tsionark.com/v1/trade on 2026-09-14; the
// authenticated shapes (previews, quotes, swaps, submissions, wallets,
// portfolio, activity) answer 401 without a bearer, so those follow the
// contract (trade-llms.txt) and the fields this client already reads.

export const LIVE_LIST_TOKEN = {
  chainId: 8453,
  address: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
  name: "Ethoswarm",
  symbol: "MENTE",
  decimals: 18,
  logoUrl: "https://token-media.defined.fi/8453_0x4cd9a847f39106e19a4e41aea8a232e915c82af5.png",
  priceUsd: "0.0168851763302",
  liquidityUsd: "1887590",
  volume24hUsd: "64352",
  priceChange24hPercent: "0.6923345280779767",
  marketCapUsd: "16885173",
  fdvUsd: "16885176",
  pairAddress: "0x34f9372f0e90e0f94b0abfd4ab66ebac3d6eba59",
  dexName: "UniswapV3",
  riskLevel: "LOW",
  buyEnabled: true,
  sellEnabled: true,
  warnings: [],
  status: "ACTIVE",
};

export const LIVE_SOLANA_LIST_TOKEN = {
  chainId: 101,
  address: "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp",
  name: "Hachiko",
  symbol: "$HACHIKO",
  decimals: 4,
  logoUrl: null,
  priceUsd: "1.21495281918e-9",
  liquidityUsd: "56699",
  volume24hUsd: "38850",
  priceChange24hPercent: "-7.101470854639828",
  marketCapUsd: "1172724",
  fdvUsd: "1172724",
  pairAddress: "DqAfrGV2GBxpGRsq6Xk1z9ojRncqgLeeVPaKg5bCc24Z",
  dexName: "MeteoraPools",
  riskLevel: "HIGH",
  buyEnabled: true,
  sellEnabled: true,
  warnings: [
    {
      code: "LOW_LIQUIDITY",
      message: "Liquidity is below $50,000. You may proceed at your own risk.",
    },
  ],
  status: "ACTIVE",
};

export const LIVE_TOKEN_PAGE = {
  items: [LIVE_SOLANA_LIST_TOKEN, LIVE_LIST_TOKEN],
  meta: { page: 1, limit: 2, total: 105200 },
};

// Trending adds a `chain` slug the catalog route does not carry.
export const LIVE_TRENDING_PAGE = {
  items: [{ chain: "base", ...LIVE_LIST_TOKEN }],
  meta: { page: 1, limit: 2, total: 2 },
};

// Search is a bare array and omits the whole risk block and status.
export const LIVE_SEARCH_ROW = {
  chain: "solana",
  chainId: 101,
  address: "9tPeuW6hAw6YuKGypfuMwBrSrN2ktpdhqXQqxR9z5PCq",
  name: "Bonk Coin",
  symbol: "Bonk",
  decimals: null,
  logoUrl: null,
  priceUsd: "0.00002099",
  liquidityUsd: "50394585.67",
  volume24hUsd: "0.24",
  priceChange24hPercent: null,
  marketCapUsd: "2057751021",
  fdvUsd: "2057751021",
  pairAddress: "4RX3HeVhvDT1N2Qnn9wMVtHfSGE3NqU3GYnuhaCoKDUD",
  dexName: "raydium",
};

// The detail route carries the risk block but no status.
export const LIVE_TOKEN_DETAIL = {
  chainId: 101,
  address: "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp",
  name: "Hachiko",
  symbol: "$HACHIKO",
  decimals: 4,
  logoUrl: null,
  priceUsd: "0.00000000128201349502",
  liquidityUsd: "57318",
  volume24hUsd: "36965",
  priceChange24hPercent: "-1.2232949233783732",
  marketCapUsd: "1237454",
  fdvUsd: "1237454",
  pairAddress: "DqAfrGV2GBxpGRsq6Xk1z9ojRncqgLeeVPaKg5bCc24Z",
  dexName: "MeteoraPools",
  riskLevel: "HIGH",
  buyEnabled: true,
  sellEnabled: true,
  warnings: [{ code: "LOW_LIQUIDITY", message: "Liquidity is below the warning threshold." }],
};

// A Solana market read omits name, symbol, decimals and logo; a Base one
// carries them.
export const LIVE_SOLANA_MARKET = {
  priceUsd: "0.00000000128201349502",
  liquidityUsd: "57318",
  volume24hUsd: "36965",
  priceChange24hPercent: "-1.2232949233783732",
  marketCapUsd: "1237454",
  fdvUsd: "1237454",
  pairAddress: "DqAfrGV2GBxpGRsq6Xk1z9ojRncqgLeeVPaKg5bCc24Z",
  dexName: "MeteoraPools",
  chainId: 101,
  address: "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp",
};

export const LIVE_RISK = {
  level: "HIGH",
  blocked: false,
  warnings: [{ code: "LOW_LIQUIDITY", message: "Liquidity is below the warning threshold." }],
  assessedAt: "2026-09-14T15:15:08.724Z",
  disclaimer: "No automated check can guarantee that a token is safe or will remain sellable.",
};

export const LIVE_TRADABILITY = { buyEnabled: true, sellEnabled: true, risk: LIVE_RISK };

const USDC_REF = {
  chainId: 8453,
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
};

export const SWAP_PREVIEW = {
  side: "BUY",
  chainId: 8453,
  walletAddress: "0xwallet",
  sellToken: USDC_REF,
  buyToken: { ...LIVE_LIST_TOKEN },
  sellAmountAtomic: "5000000",
  sellAmountFormatted: "5",
  expectedBuyAmountAtomic: "4000000000000000000",
  expectedBuyAmountFormatted: "4",
  minimumBuyAmountAtomic: "3960000000000000000",
  minimumBuyAmountFormatted: "3.96",
  priceImpactBps: 12,
  slippageBps: 100,
  platformFeeAmountAtomic: "25000",
  platformFeeAmountFormatted: "0.025",
  liquidityAvailable: true,
  approvalRequired: true,
  riskLevel: "LOW",
  warnings: [],
  expiresAt: "2026-09-14T15:20:00.000Z",
};

export const SWAP_QUOTE = {
  swapId: "swap-1",
  quoteId: "quote-1",
  chainId: 8453,
  side: "BUY",
  walletAddress: "0xwallet",
  sellToken: USDC_REF,
  buyToken: { ...LIVE_LIST_TOKEN },
  sellAmountAtomic: "5000000",
  expectedBuyAmountAtomic: "4000000000000000000",
  minimumBuyAmountAtomic: "3960000000000000000",
  slippageBps: 100,
  priceImpactBps: 12,
  executionMode: "BATCHED_CALLS",
  calls: [
    { type: "APPROVAL", to: "0xusdc", data: "0x095ea7b3", value: "0" },
    { type: "SWAP", to: "0xrouter", data: "0xabcdef", value: "0" },
  ],
  warnings: [],
  expiresAt: "2026-09-14T15:20:00.000Z",
};

export const SOLANA_SWAP_QUOTE = {
  swapId: "swap-sol-1",
  unsignedTransactionBase64: "AQAB",
  platformFeeTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  platformFeeAmountAtomic: "25000",
  expiresAt: "2026-09-14T15:20:00.000Z",
};

export const SWAP_DETAIL = {
  id: "swap-1",
  walletAddress: "0xwallet",
  chainId: 8453,
  side: "BUY",
  status: "CONFIRMED",
  sellTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  buyTokenAddress: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
  sellTokenDecimals: 6,
  buyTokenDecimals: 18,
  sellAmountAtomic: "5000000",
  quotedBuyAmountAtomic: "4000000000000000000",
  actualSellAmountAtomic: "5000000",
  actualBuyAmountAtomic: null,
  failureCode: null,
  failureReason: null,
  createdAt: "2026-09-14T15:10:00.000Z",
};

export const SWAP_PAGE = { items: [SWAP_DETAIL], meta: { page: 1, limit: 20, total: 1 } };

export const SWAP_STATUS = {
  swapId: "swap-1",
  status: "CONFIRMING",
  updatedAt: "2026-09-14T15:11:00.000Z",
};

export const SUBMISSION = { swapId: "swap-1", status: "SUBMITTED", callIndex: 0 };
export const SOLANA_SUBMISSION = { swapId: "swap-sol-1", status: "SUBMITTED" };

export const WALLET_CHALLENGE = {
  challengeId: "5b0e3c1e-7d0c-4a4f-9f1b-2f9d0f4d9e11",
  message: "Sign to link this wallet",
  expiresAt: "2026-09-14T15:20:00.000Z",
};

export const WALLET_VERIFIED = { walletAddress: "0xwallet", verified: true };

export const PORTFOLIO_POSITION = {
  chain: "base",
  chainId: 8453,
  address: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
  name: "Ethoswarm",
  symbol: "MENTE",
  decimals: 18,
  logoUrl: null,
  positionStatus: "OPEN",
  costBasisStatus: "COMPLETE",
  quantityBought: "4",
  quantitySold: "0",
  quantityRemaining: "4",
  ledgerQuantityRemaining: "4",
  walletQuantity: null,
  externalQuantityDelta: null,
  balanceStatus: "UNAVAILABLE",
  balanceUpdatedAt: null,
  totalInvestedUsd: "5",
  totalProceedsUsd: "0",
  remainingCostBasisUsd: "5",
  averageEntryPriceUsd: "1.25",
  lowestEntryPriceUsd: "1.25",
  highestEntryPriceUsd: "1.25",
  currentPriceUsd: null,
  currentValueUsd: null,
  realizedPnlUsd: "0",
  realizedReturnPercent: null,
  unrealizedPnlUsd: null,
  unrealizedReturnPercent: null,
  totalPnlUsd: "0",
  totalReturnPercent: null,
  buyCount: 1,
  sellCount: 0,
  firstBoughtAt: "2026-09-14T15:10:00.000Z",
  lastBoughtAt: "2026-09-14T15:10:00.000Z",
  lastActivityAt: "2026-09-14T15:10:00.000Z",
  liquidityUsd: null,
  volume24hUsd: null,
  priceChange24hPercent: null,
  marketCapUsd: null,
  fdvUsd: null,
  pairAddress: null,
  dexName: null,
  marketDataUpdatedAt: null,
  marketDataStatus: "UNAVAILABLE",
  riskLevel: "LOW",
  sellEnabled: true,
  warnings: [],
  valuationDisclaimer: "Current value is an informational mark, not guaranteed proceeds.",
};

export const PORTFOLIO_PAGE = {
  items: [PORTFOLIO_POSITION],
  meta: { page: 1, limit: 50, total: 1 },
};

export const PORTFOLIO_SUMMARY = {
  totalPositions: 1,
  openPositions: 1,
  closedPositions: 0,
  totalInvestedUsd: "5",
  totalProceedsUsd: "0",
  currentValueUsd: "0",
  realizedPnlUsd: "0",
  unrealizedPnlUsd: "0",
  totalPnlUsd: "0",
  totalReturnPercent: null,
  profitablePositions: 0,
  losingPositions: 0,
  marketValueComplete: false,
  calculatedAt: "2026-09-14T15:12:00.000Z",
};

export const TRADE_ACTIVITY = {
  id: "swap-1",
  quoteId: "quote-1",
  chain: "base",
  chainId: 8453,
  side: "BUY",
  status: "CONFIRMED",
  walletAddress: "0xwallet",
  tokenAddress: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
  tokenDecimals: 18,
  tokenName: "Ethoswarm",
  tokenSymbol: "MENTE",
  tokenLogoUrl: null,
  sellTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  buyTokenAddress: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
  sellAmountAtomic: "5000000",
  sellAmount: "5",
  buyAmountAtomic: "4000000000000000000",
  buyAmount: "4",
  usdAmount: "5",
  platformFeeAmountAtomic: "25000",
  platformFeeAmountUsd: null,
  transactionHashes: ["0xtx"],
  userOperationHashes: [],
  createdAt: "2026-09-14T15:10:00.000Z",
  submittedAt: "2026-09-14T15:10:10.000Z",
  confirmedAt: "2026-09-14T15:10:40.000Z",
  updatedAt: "2026-09-14T15:10:40.000Z",
  failureCode: null,
  failureReason: null,
};

export const PORTFOLIO_POSITION_DETAIL = { ...PORTFOLIO_POSITION, activity: [TRADE_ACTIVITY] };

export const ACTIVITY_PAGE = { items: [TRADE_ACTIVITY], meta: { page: 1, limit: 50, total: 1 } };
