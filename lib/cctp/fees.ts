import { z } from "zod";

// Circle's live CCTP V2 fee quote (GET /v2/burn/USDC/fees/:source/:dest) and
// the maxFee a burn should carry. maxFee caps what Circle may take at mint: a
// burn whose maxFee is below the real fee is never minted, and the USDC sits
// burned until someone re-attests it. So nothing here estimates or rounds down.

const feeRowSchema = z.object({
  finalityThreshold: z.number().int(),
  // Basis points of the amount (1 = 0.01%). Circle may quote a fraction.
  minimumFee: z.number().nonnegative(),
  // Forwarding Service gas and forward fees, in USDC base units. Present only
  // when the quote was asked for with forward=true.
  forwardFee: z
    .object({
      low: z.number().int().nonnegative(),
      medium: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
    })
    .optional(),
});

export type CctpFeeQuote = z.infer<typeof feeRowSchema>[];

/** Circle's response, validated. Null when it is not the documented shape. */
export function parseFeeQuote(raw: unknown): CctpFeeQuote | null {
  const parsed = z.array(feeRowSchema).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// A non-negative JavaScript number as an exact fraction: digits / 10^scale.
// Read from its decimal string, so 1.3 is 13/10 and not 1.3000000000000000444.
function exactDecimal(value: number): { digits: bigint; scale: number } | null {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return { digits: BigInt(whole + fraction), scale: fraction.length };
}

const ceilDiv = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;

/**
 * The maxFee for burning `amount` USDC base units: the protocol fee for the
 * chosen finality, rounded up, plus Circle's highest forwarding fee when the
 * user pays for the forward. Null when the quote cannot price this burn, which
 * callers must treat as "do not burn".
 */
export function maxFeeFromQuote({
  amount,
  quote,
  finality,
  includeForwardFee,
}: {
  amount: bigint;
  quote: CctpFeeQuote;
  finality: number;
  includeForwardFee: boolean;
}): bigint | null {
  const row = quote.find((entry) => entry.finalityThreshold === finality);
  if (!row) return null;
  const bps = exactDecimal(row.minimumFee);
  if (!bps) return null;

  // amount * (digits / 10^scale) / 10_000, rounded up.
  const protocolFee = ceilDiv(amount * bps.digits, 10_000n * 10n ** BigInt(bps.scale));
  if (!includeForwardFee) return protocolFee;
  if (!row.forwardFee) return null;
  // The high tier: a forward priced at "medium" can still be refused when gas
  // spikes between the quote and the mint, and the difference is cents.
  return protocolFee + BigInt(row.forwardFee.high);
}
