import { z } from "zod";

// The trade service's frontend contract (trade-llms.txt), one schema per route
// the relay forwards. The relay judges every successful envelope against these
// (app/api/trade/[...path]/route.ts) and the browser client parses through the
// same schemas (lib/meme/parse.ts), so a shape drift is a 502 with a requestId,
// never a crash in a component.
//
// Objects are not strict: a field the service adds is not a failure. Fields
// this client does not read are left out rather than guessed at.

// Money, prices, percentages and atomic quantities are decimal strings, never
// numbers. A freshly listed token has no market data, so market fields are
// nullable: null means "not currently available", not zero.
const decimal = z.string();
const nullableDecimal = decimal.nullable();
const nullableString = z.string().nullable();

export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);
export const tokenStatusSchema = z.enum(["ACTIVE", "BLOCKED", "DISCOVERED"]);
export const warningSchema = z.object({ code: z.string(), message: z.string() });
export const swapStatusSchema = z.enum([
  // Not in the contract's lifecycle, but a status this client has been sent.
  "QUOTED",
  "AWAITING_SUBMISSION",
  "SUBMITTED",
  "CONFIRMING",
  "CONFIRMED",
  "FAILED",
  "REVERTED",
  "EXPIRED",
  "CANCELLED",
]);
const sideSchema = z.enum(["BUY", "SELL"]);
const chainSchema = z.enum(["base", "solana"]);

const metaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});

function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), meta: metaSchema });
}

const marketFields = {
  priceUsd: nullableDecimal,
  liquidityUsd: nullableDecimal,
  volume24hUsd: nullableDecimal,
  priceChange24hPercent: nullableDecimal,
  marketCapUsd: nullableDecimal,
  fdvUsd: nullableDecimal,
  pairAddress: nullableString,
  dexName: nullableString,
};

const identityFields = {
  chainId: z.number().int(),
  address: z.string().min(1),
  name: nullableString,
  symbol: nullableString,
  decimals: z.number().int().nullable(),
  logoUrl: nullableString,
};

// One window of market activity. Money and the change are decimal strings
// like every other market field, so a negative change ("-4.5") or a float
// artifact ("12.340000000000002") passes as sent. Counts are any number here:
// the list routes served the catalogue before these fields were read, so a
// provider's fractional or negative count must not fail the whole page. The
// parser reads such a count as unavailable. A field the providers do not fill
// may be null or absent.
const count = z.number().nullable().optional();
const activityWindowSchema = z.object({
  volumeUsd: nullableDecimal.optional(),
  transactions: count,
  traders: count,
  priceChangePercent: nullableDecimal.optional(),
});

// The screener's windows. An object with optional keys rather than
// z.record(z.enum(...)): in zod 4 that record requires every key and fails on
// one it does not list, and a window the service adds (or leaves out, or
// sends as null) must not turn the whole list into a 502. Unknown windows are
// dropped by the non-strict object.
const optionalWindow = activityWindowSchema.nullable().optional();
const activitySchema = z.object({
  "5m": optionalWindow,
  "1h": optionalWindow,
  "6h": optionalWindow,
  "12h": optionalWindow,
  "24h": optionalWindow,
});

// TokenView on the list and search routes. The live search route omits the
// whole risk block and status (probed 2026-09-14), so those stay optional here
// and the client fills them (withRiskDefaults).
export const tokenListItemSchema = z.object({
  ...identityFields,
  priceUsd: nullableDecimal,
  liquidityUsd: nullableDecimal,
  volume24hUsd: nullableDecimal.optional(),
  priceChange24hPercent: nullableDecimal.optional(),
  marketCapUsd: nullableDecimal.optional(),
  fdvUsd: nullableDecimal.optional(),
  pairAddress: nullableString.optional(),
  dexName: nullableString.optional(),
  riskLevel: riskLevelSchema.optional(),
  buyEnabled: z.boolean().optional(),
  sellEnabled: z.boolean().optional(),
  warnings: z.array(warningSchema).optional(),
  status: tokenStatusSchema.optional(),
  // Only the list and trending routes carry these; search does not.
  activity: activitySchema.optional(),
  pairCreatedAt: nullableString.optional(),
});

export const tokenListSchema = pageOf(tokenListItemSchema);
// search returns a bare array, unlike the other list endpoints.
export const tokenSearchSchema = z.array(tokenListItemSchema);

// GET /tokens/{address}: the trade surface's fresh read, so the risk block is
// required; the route carries no status.
export const tokenDetailSchema = z.object({
  ...identityFields,
  ...marketFields,
  riskLevel: riskLevelSchema,
  buyEnabled: z.boolean(),
  sellEnabled: z.boolean(),
  warnings: z.array(warningSchema),
  status: tokenStatusSchema.optional(),
});

// GET /tokens/{address}/market. A Solana read omits the identity fields a Base
// read carries.
export const tokenMarketSchema = z.object({
  chainId: z.number().int(),
  address: z.string().min(1),
  name: nullableString.optional(),
  symbol: nullableString.optional(),
  decimals: z.number().int().nullable().optional(),
  logoUrl: nullableString.optional(),
  ...marketFields,
});

// GET /tokens/{address}/risk
export const tokenRiskSchema = z.object({
  level: riskLevelSchema,
  blocked: z.boolean(),
  warnings: z.array(warningSchema),
  assessedAt: z.string(),
  disclaimer: z.string(),
});

// GET /tokens/{address}/tradability
export const tokenTradabilitySchema = z.object({
  buyEnabled: z.boolean(),
  sellEnabled: z.boolean(),
  risk: tokenRiskSchema,
});

// A token as a preview or quote names it: the client reads its address and
// symbol; the rest is carried when present.
const swapTokenSchema = z.object({
  address: z.string().min(1),
  symbol: nullableString,
  chainId: z.number().int().optional(),
  name: nullableString.optional(),
  decimals: z.number().int().nullable().optional(),
  logoUrl: nullableString.optional(),
});

// POST /swaps/preview and /solana/swaps/preview: what the ticket shows before
// anything is signed. The contract's display list is sell amount, expected and
// minimum output, slippage, impact, risk and warnings, platform fee, expiry.
export const swapPreviewSchema = z.object({
  side: sideSchema,
  chainId: z.number().int().optional(),
  walletAddress: z.string().optional(),
  sellToken: swapTokenSchema,
  buyToken: swapTokenSchema,
  sellAmountAtomic: decimal,
  sellAmountFormatted: decimal,
  expectedBuyAmountAtomic: decimal,
  expectedBuyAmountFormatted: decimal,
  minimumBuyAmountAtomic: decimal,
  minimumBuyAmountFormatted: decimal,
  priceImpactBps: z.number().nullable(),
  slippageBps: z.number(),
  platformFeeAmountAtomic: decimal,
  platformFeeAmountFormatted: decimal,
  liquidityAvailable: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  riskLevel: riskLevelSchema,
  warnings: z.array(warningSchema),
  expiresAt: z.string(),
});

// POST /swaps/quote: the ordered calls the wallet signs, and the expiry the
// client refuses to execute past.
export const swapQuoteSchema = z.object({
  swapId: z.string().min(1),
  quoteId: z.string().optional(),
  chainId: z.number().int(),
  side: sideSchema,
  walletAddress: z.string().optional(),
  sellToken: swapTokenSchema,
  buyToken: swapTokenSchema,
  sellAmountAtomic: decimal,
  expectedBuyAmountAtomic: decimal,
  minimumBuyAmountAtomic: decimal,
  slippageBps: z.number().optional(),
  priceImpactBps: z.number().nullable().optional(),
  executionMode: z.enum(["SINGLE_CALL", "BATCHED_CALLS"]).optional(),
  calls: z.array(
    z.object({
      type: z.enum(["APPROVAL", "SWAP"]).optional(),
      to: z.string(),
      data: z.string(),
      value: z.string().optional(),
    })
  ),
  warnings: z.array(warningSchema).optional(),
  expiresAt: z.string(),
});

// POST /solana/swaps/quote: one unsigned versioned transaction for the gas
// sponsor, not a list of calls.
export const solanaSwapQuoteSchema = z.object({
  swapId: z.string().min(1),
  unsignedTransactionBase64: z.string().min(1),
  platformFeeTokenAddress: nullableString.optional(),
  platformFeeAmountAtomic: decimal.optional(),
  expiresAt: z.string(),
});

// GET /swaps/{id}, and each row of GET /swaps.
export const swapDetailSchema = z.object({
  id: z.string().min(1),
  walletAddress: z.string(),
  chainId: z.number().int(),
  side: sideSchema,
  status: swapStatusSchema,
  sellTokenAddress: z.string(),
  buyTokenAddress: z.string(),
  sellTokenDecimals: z.number().int(),
  buyTokenDecimals: z.number().int(),
  sellAmountAtomic: decimal,
  quotedBuyAmountAtomic: decimal,
  actualSellAmountAtomic: nullableDecimal,
  actualBuyAmountAtomic: nullableDecimal,
  failureCode: nullableString,
  failureReason: nullableString,
  createdAt: z.string(),
});

export const swapPageSchema = pageOf(swapDetailSchema);

// GET /swaps/{id}/status
export const swapStatusResponseSchema = z.object({
  swapId: z.string().min(1),
  status: swapStatusSchema,
  updatedAt: z.string(),
});

// POST /swaps/{id}/submissions and /solana/swaps/{id}/submissions
export const submissionSchema = z.object({
  swapId: z.string().min(1),
  status: swapStatusSchema,
  callIndex: z.number().int().optional(),
});

// POST /wallets/challenges and /solana/wallets/challenges
export const walletChallengeSchema = z.object({
  challengeId: z.string().min(1),
  message: z.string().min(1),
  expiresAt: z.string(),
});

// POST /wallets/verify and /solana/wallets/verify. The contract names no
// response fields and the client reads none, so only "an object came back" is
// pinned.
export const walletVerifySchema = z.object({});

// Portfolio and activity, ahead of the slice that renders them.
const portfolioPositionSchema = z.object({
  chain: chainSchema,
  chainId: z.number().int(),
  address: z.string().min(1),
  name: nullableString,
  symbol: nullableString,
  decimals: z.number().int(),
  logoUrl: nullableString,
  positionStatus: z.enum(["OPEN", "CLOSED"]),
  costBasisStatus: z.enum(["COMPLETE", "PARTIAL"]),
  quantityBought: decimal,
  quantitySold: decimal,
  quantityRemaining: decimal,
  ledgerQuantityRemaining: decimal,
  walletQuantity: nullableDecimal,
  externalQuantityDelta: nullableDecimal,
  balanceStatus: z.enum(["MATCHED", "LOWER_THAN_LEDGER", "HIGHER_THAN_LEDGER", "UNAVAILABLE"]),
  balanceUpdatedAt: nullableString,
  totalInvestedUsd: decimal,
  totalProceedsUsd: decimal,
  remainingCostBasisUsd: decimal,
  averageEntryPriceUsd: nullableDecimal,
  lowestEntryPriceUsd: nullableDecimal,
  highestEntryPriceUsd: nullableDecimal,
  currentPriceUsd: nullableDecimal,
  currentValueUsd: nullableDecimal,
  realizedPnlUsd: decimal,
  realizedReturnPercent: nullableDecimal,
  unrealizedPnlUsd: nullableDecimal,
  unrealizedReturnPercent: nullableDecimal,
  totalPnlUsd: decimal,
  totalReturnPercent: nullableDecimal,
  buyCount: z.number().int(),
  sellCount: z.number().int(),
  firstBoughtAt: z.string(),
  lastBoughtAt: z.string(),
  lastActivityAt: z.string(),
  // The position's mark is currentPriceUsd above; there is no priceUsd here.
  liquidityUsd: nullableDecimal,
  volume24hUsd: nullableDecimal,
  priceChange24hPercent: nullableDecimal,
  marketCapUsd: nullableDecimal,
  fdvUsd: nullableDecimal,
  pairAddress: nullableString,
  dexName: nullableString,
  marketDataUpdatedAt: nullableString,
  marketDataStatus: z.enum(["READY", "PARTIAL", "UNAVAILABLE"]),
  riskLevel: riskLevelSchema,
  sellEnabled: z.boolean(),
  warnings: z.array(warningSchema),
  valuationDisclaimer: z.string(),
});

export const tradeActivitySchema = z.object({
  id: z.string().min(1),
  quoteId: z.string(),
  chain: chainSchema,
  chainId: z.number().int(),
  side: sideSchema,
  status: swapStatusSchema.exclude(["QUOTED"]),
  walletAddress: z.string(),
  tokenAddress: z.string(),
  tokenDecimals: z.number().int(),
  tokenName: nullableString,
  tokenSymbol: nullableString,
  tokenLogoUrl: nullableString,
  sellTokenAddress: z.string(),
  buyTokenAddress: z.string(),
  sellAmountAtomic: decimal,
  sellAmount: decimal,
  buyAmountAtomic: decimal,
  buyAmount: decimal,
  usdAmount: decimal,
  platformFeeAmountAtomic: nullableDecimal,
  platformFeeAmountUsd: nullableDecimal,
  transactionHashes: z.array(z.string()),
  userOperationHashes: z.array(z.string()),
  createdAt: z.string(),
  submittedAt: nullableString,
  confirmedAt: nullableString,
  updatedAt: z.string(),
  failureCode: nullableString,
  failureReason: nullableString,
});

export const portfolioPageSchema = pageOf(portfolioPositionSchema);
export const portfolioPositionDetailSchema = portfolioPositionSchema.extend({
  activity: z.array(tradeActivitySchema),
});
export const portfolioSummarySchema = z.object({
  totalPositions: z.number().int(),
  openPositions: z.number().int(),
  closedPositions: z.number().int(),
  totalInvestedUsd: decimal,
  totalProceedsUsd: decimal,
  currentValueUsd: decimal,
  realizedPnlUsd: decimal,
  unrealizedPnlUsd: decimal,
  totalPnlUsd: decimal,
  totalReturnPercent: nullableDecimal,
  profitablePositions: z.number().int(),
  losingPositions: z.number().int(),
  marketValueComplete: z.boolean(),
  calculatedAt: z.string(),
});
export const activityPageSchema = pageOf(tradeActivitySchema);

// Route templates, most specific first: a literal segment ("trending",
// "preview", "summary") is listed before the id template that would otherwise
// swallow it. `:id` matches exactly one path segment.
const TRADE_ROUTES: [template: string, schema: z.ZodType][] = [
  ["tokens", tokenListSchema],
  ["tokens/trending", tokenListSchema],
  ["tokens/search", tokenSearchSchema],
  ["tokens/:address", tokenDetailSchema],
  ["tokens/:address/market", tokenMarketSchema],
  ["tokens/:address/risk", tokenRiskSchema],
  ["tokens/:address/tradability", tokenTradabilitySchema],
  ["wallets/challenges", walletChallengeSchema],
  ["wallets/verify", walletVerifySchema],
  ["solana/wallets/challenges", walletChallengeSchema],
  ["solana/wallets/verify", walletVerifySchema],
  ["swaps", swapPageSchema],
  ["swaps/preview", swapPreviewSchema],
  ["swaps/quote", swapQuoteSchema],
  ["swaps/:id", swapDetailSchema],
  ["swaps/:id/status", swapStatusResponseSchema],
  ["swaps/:id/submissions", submissionSchema],
  ["solana/swaps/preview", swapPreviewSchema],
  ["solana/swaps/quote", solanaSwapQuoteSchema],
  ["solana/swaps/:id/submissions", submissionSchema],
  ["portfolio", portfolioPageSchema],
  ["portfolio/summary", portfolioSummarySchema],
  ["portfolio/:chain/:address", portfolioPositionDetailSchema],
  ["activity", activityPageSchema],
];

function matches(template: string[], segments: string[]): boolean {
  return (
    template.length === segments.length &&
    template.every((part, i) => part.startsWith(":") || part === segments[i])
  );
}

const COMPILED = TRADE_ROUTES.map(([template, schema]) => ({
  parts: template.split("/"),
  schema,
}));

// A literal match always wins over a template match, whatever the order, so a
// route added later cannot shadow "tokens/trending" with "tokens/:address".
export function tradeSchemaFor(path: string): z.ZodType | null {
  const segments = path.split("?")[0].split("/");
  const candidates = COMPILED.filter((route) => matches(route.parts, segments));
  const literal = candidates.find((route) => route.parts.every((part) => !part.startsWith(":")));
  return (literal ?? candidates[0])?.schema ?? null;
}
