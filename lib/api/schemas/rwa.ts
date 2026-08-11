import { z } from "zod";

const chain = z.enum(["solana", "ethereum", "base", "arbitrum", "bsc", "polygon"]);

const asset = z.object({
  id: z.string(),
  chain,
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  issuer: z.string(),
  category: z.string(),
  freelyTradable: z.boolean(),
  priceUsd: z.string().nullable().optional(),
  // Null for 29 of 45 live assets, though the gateway spec types it as integer.
  yieldApyBps: z.number().nullable().optional(),
  accessMode: z.enum(["dex", "issuer", "hybrid"]).optional(),
  kycRequired: z.boolean().optional(),
  minInvestmentUsd: z.string().nullable().optional(),
  deprecated: z.boolean().optional(),
  tvlUsd: z.string().optional(),
});

const quote = z.object({
  provider: z.string(),
  input: z.object({ chain: z.string(), address: z.string(), amount: z.string() }),
  output: z.object({
    chain: z.string(),
    address: z.string(),
    amount: z.string(),
    amountMin: z.string().optional(),
  }),
  priceImpactBps: z.number().nullable(),
});

// kind decides how the client handles the step, so an unknown one must fail.
const step = z.object({
  id: z.string(),
  kind: z.enum(["sign-transaction", "sign-typed-data", "post-to-endpoint"]),
  chain,
  description: z.string(),
  tx: z
    .object({
      format: z.string(),
      base64: z.string().optional(),
      to: z.string().optional(),
      data: z.string().optional(),
      value: z.string().optional(),
    })
    .optional(),
  waitForConfirmation: z.boolean().optional(),
});

export const assetsSchema = z.array(asset);

export const categoriesSchema = z.array(z.object({ category: z.string(), count: z.number() }));

export const quoteSchema = z.object({
  best: quote.nullable(),
  all: z.array(quote),
  failed: z.array(z.unknown()),
});

export const buildSchema = z.object({
  actionId: z.string(),
  chain,
  expiresAt: z.string(),
  steps: z.array(step),
  warnings: z.array(z.string()).optional(),
});

// Mirrors the route's own allowlist in lib/server/wsapi.ts.
const RWA_SCHEMAS: { pattern: RegExp; schema: z.ZodType }[] = [
  { pattern: /^categories$/, schema: categoriesSchema },
  { pattern: /^assets$/, schema: assetsSchema },
  { pattern: /^assets\/[^/]+$/, schema: asset },
  { pattern: /^quote$/, schema: quoteSchema },
  { pattern: /^build$/, schema: buildSchema },
];

export function rwaSchemaFor(path: string): z.ZodType | null {
  return RWA_SCHEMAS.find((entry) => entry.pattern.test(path))?.schema ?? null;
}
