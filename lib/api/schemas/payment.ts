import { z } from "zod";

const tokenAmount = z.object({
  amount: z.string(),
  chainId: z.number(),
  asset: z.string(),
  decimals: z.number(),
});

const fiatQuote = z.object({
  fxRate: z.string(),
  receive: z.object({ amount: z.string(), currency: z.string() }),
  send: z.object({ amount: z.string(), currency: z.string() }),
  // Dropped by the rail; the review step only renders the row when present.
  totalFee: z.string().optional(),
});

export const corridorsSchema = z.object({
  corridors: z.array(z.object({ country: z.string(), currencies: z.array(z.string()) })),
});

export const banksSchema = z.object({
  banks: z.array(z.object({ id: z.string(), name: z.string(), country: z.string() })),
});

export const walletsSchema = z.object({
  providers: z.array(
    z.object({
      name: z.string(),
      country: z.string(),
      // Ghana returns empty strings for both.
      minPerTx: z.string(),
      maxPerTx: z.string(),
    })
  ),
});

export const verifyRecipientSchema = z.object({
  verified: z.boolean(),
  accountName: z.string().optional(),
});

export const offrampQuoteSchema = z.object({
  provider: z.string(),
  fiat: fiatQuote,
  spreadBps: z.number(),
  settlement: tokenAmount,
  pay: z.object({ amountIn: tokenAmount }),
});

export const rampOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  publicStatus: z.enum(["awaiting_deposit", "processing", "completed", "needs_attention"]),
  depositAddress: z.string(),
  expectedSettlement: tokenAmount.optional(),
  fiatQuote: fiatQuote.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Mirrors the route's own allowlist.
export const PAYMENT_SCHEMAS: { pattern: RegExp; schema: z.ZodType }[] = [
  { pattern: /^corridors$/, schema: corridorsSchema },
  { pattern: /^corridors\/[A-Za-z]{2}\/banks$/, schema: banksSchema },
  { pattern: /^corridors\/[A-Za-z]{2}\/wallets$/, schema: walletsSchema },
  { pattern: /^offramp\/orders\/[\w-]+$/, schema: rampOrderSchema },
  { pattern: /^offramp\/quote$/, schema: offrampQuoteSchema },
  { pattern: /^offramp\/orders$/, schema: rampOrderSchema },
  { pattern: /^offramp\/verify-recipient$/, schema: verifyRecipientSchema },
];

export function paymentSchemaFor(path: string): z.ZodType | null {
  return PAYMENT_SCHEMAS.find((entry) => entry.pattern.test(path))?.schema ?? null;
}
