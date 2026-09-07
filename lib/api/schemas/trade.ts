import { z } from "zod";

// A freshly listed token has no market data, so every price field is nullable.

const nullableString = z.string().nullable();

const token = z.object({
  chainId: z.number(),
  address: z.string(),
  name: nullableString,
  symbol: nullableString,
  decimals: z.number().nullable(),
  logoUrl: nullableString,
  priceUsd: nullableString,
  liquidityUsd: nullableString,
  volume24hUsd: nullableString.optional(),
  priceChange24hPercent: nullableString.optional(),
  marketCapUsd: nullableString.optional(),
  fdvUsd: nullableString.optional(),
  pairAddress: nullableString.optional(),
  dexName: nullableString.optional(),
  riskLevel: z.string().optional(),
  buyEnabled: z.boolean().optional(),
  sellEnabled: z.boolean().optional(),
  warnings: z.array(z.unknown()).optional(),
});

export const tokenListSchema = z.object({ items: z.array(token) });
// search returns a bare array, unlike the other list endpoints.
export const tokenSearchSchema = z.array(token);
export const tokenSchema = token;

export const swapQuoteSchema = z.object({
  swapId: z.string(),
  calls: z.array(
    z.object({
      to: z.string(),
      data: z.string(),
      value: z.string().optional(),
    })
  ),
});

// One unsigned versioned transaction for the gas sponsor. The service
// returns more (chain id, side, amounts); only what the client relies on is
// pinned, so an additive change upstream is not a 502.
export const solanaSwapQuoteSchema = z.object({
  swapId: z.string(),
  unsignedTransactionBase64: z.string().min(1),
  platformFeeTokenAddress: nullableString.optional(),
  platformFeeAmountAtomic: z.string().optional(),
  expiresAt: z.string(),
});

const TRADE_SCHEMAS: { pattern: RegExp; schema: z.ZodType }[] = [
  { pattern: /^tokens$/, schema: tokenListSchema },
  { pattern: /^tokens\/trending$/, schema: tokenListSchema },
  { pattern: /^tokens\/search$/, schema: tokenSearchSchema },
  { pattern: /^swaps\/quote$/, schema: swapQuoteSchema },
  { pattern: /^solana\/swaps\/quote$/, schema: solanaSwapQuoteSchema },
];

export function tradeSchemaFor(path: string): z.ZodType | null {
  const clean = path.split("?")[0];
  return TRADE_SCHEMAS.find((entry) => entry.pattern.test(clean))?.schema ?? null;
}
