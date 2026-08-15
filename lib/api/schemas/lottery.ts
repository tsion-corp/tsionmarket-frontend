import { z } from "zod";

export const lotterySelectionSchema = z.object({
  whiteNumbers: z.array(z.number().int().min(1).max(69)).length(5),
  powerNumber: z.number().int().min(1).max(26),
});

const lotteryResultSchema = z.object({
  drawId: z.string(),
  whiteNumbers: z.array(z.number().int()).length(5),
  powerNumber: z.number().int(),
  randomnessRound: z.number().int(),
  randomnessSignature: z.string(),
  randomnessValue: z.string(),
  resultHash: z.string(),
  drawnAt: z.string(),
});

export const lotteryDrawSchema = z.object({
  id: z.string(),
  sequence: z.number().int(),
  ruleVersion: z.number().int(),
  status: z.enum([
    "scheduled",
    "open",
    "sales_closed",
    "drawing",
    "drawn",
    "settling",
    "settled",
    "cancelled",
    "refunding",
    "refunded",
  ]),
  salesOpenAt: z.string(),
  salesCloseAt: z.string(),
  drawAt: z.string(),
  totalTickets: z.number().int().nonnegative(),
  totalPlayers: z.number().int().nonnegative(),
  currentPoolUsdc: z.string(),
  broughtForwardUsdc: z.string(),
  advertisedJackpotUsdc: z.string(),
  cashValueUsdc: z.string(),
  payoutUsdc: z.string(),
  payoutPerWinningTicketUsdc: z.string(),
  rolloverUsdc: z.string(),
  refundedUsdc: z.string(),
  winningTicketCount: z.number().int().nonnegative(),
  randomnessProvider: z.string(),
  randomnessChainHash: z.string(),
  randomnessRound: z.number().int(),
  randomnessRoundAt: z.string(),
  randomnessCommitment: z.string(),
  cancellationReason: z.string().nullable(),
  result: lotteryResultSchema.nullable(),
  settledAt: z.string().nullable(),
});

export const lotteryTicketSchema = z.object({
  id: z.string(),
  drawId: z.string(),
  player: z.string(),
  receiptHash: z.string(),
  priceUsdc: z.string(),
  whiteNumbers: z.array(z.number().int()).length(5),
  powerNumber: z.number().int(),
  status: z.enum(["active", "won", "lost", "refunded"]),
  payoutUsdc: z.string(),
  acceptedAt: z.string(),
  settledAt: z.string().nullable(),
});

export const lotteryConfigSchema = z.object({
  enabled: z.boolean(),
  automated: z.boolean(),
  authenticationRequired: z.boolean(),
  salesDurationSeconds: z.number().int().positive(),
  salesCloseBeforeDrawSeconds: z.number().int().nonnegative(),
  maxQuickPicksPerRequest: z.number().int().positive(),
  ticketLimitPerWalletPerDraw: z.number().int().nonnegative().nullable(),
  uniqueCombinationsRequired: z.boolean(),
  playerVerificationEnforced: z.boolean(),
  rule: z.object({
    version: z.number().int(),
    slug: z.string(),
    currency: z.literal("USDC"),
    ballPools: z.array(
      z.object({
        key: z.enum(["white", "powerball"]),
        label: z.string(),
        pickCount: z.number().int().positive(),
        numberMin: z.number().int().positive(),
        numberMax: z.number().int().positive(),
      })
    ),
    whitePickCount: z.literal(5),
    whiteNumberMin: z.literal(1),
    whiteNumberMax: z.literal(69),
    powerPickCount: z.literal(1),
    powerNumberMin: z.literal(1),
    powerNumberMax: z.literal(26),
    pricePerTicketUsdc: z.string(),
    minimumPaidTickets: z.number().int().positive(),
    minimumPaidPlayers: z.number().int().positive(),
    prizePolicy: z.string(),
    prizeTiers: z.array(
      z.object({
        key: z.string(),
        whiteMatches: z.number().int(),
        powerballMatch: z.boolean(),
        payoutPolicy: z.string(),
        oddsDenominator: z.number().int().positive(),
      })
    ),
    availableTicketCombinations: z.number().int().positive(),
    rolloverOnNoJackpotWinner: z.boolean(),
    winningCondition: z.string(),
  }),
});

export const lotteryEligibilitySchema = z.object({
  player: z.string(),
  eligible: z.boolean(),
  status: z.string(),
  verificationRequired: z.boolean(),
  ageVerified: z.boolean(),
  identityVerified: z.boolean(),
  jurisdiction: z.string().nullable(),
  dailyTicketLimit: z.number().int().nonnegative().nullable(),
  ticketsPurchasedLast24h: z.number().int().nonnegative(),
  selfExcludedUntil: z.string().nullable(),
  reason: z.string().nullable(),
});

const lotteryCheckSchema = z.object({
  drawId: z.string(),
  resultHash: z.string(),
  winningWhiteNumbers: z.array(z.number().int()).length(5),
  winningPowerNumber: z.number().int(),
  prizePerWinningTicketUsdc: z.string(),
  tickets: z.array(
    lotterySelectionSchema.extend({
      index: z.number().int().nonnegative(),
      matchedWhiteCount: z.number().int().nonnegative(),
      powerballMatched: z.boolean(),
      jackpotMatch: z.boolean(),
    })
  ),
});

const quickPickSchema = z.object({ tickets: z.array(lotterySelectionSchema) });

const LOTTERY_SCHEMAS: { pattern: RegExp; schema: z.ZodType }[] = [
  { pattern: /^lottery\/config$/u, schema: lotteryConfigSchema },
  { pattern: /^lottery\/draws\/current$/u, schema: lotteryDrawSchema },
  { pattern: /^lottery\/draws\/results$/u, schema: z.array(lotteryDrawSchema) },
  { pattern: /^lottery\/draws\/[^/]+$/u, schema: lotteryDrawSchema },
  { pattern: /^lottery\/draws\/[^/]+\/result$/u, schema: lotteryResultSchema },
  { pattern: /^lottery\/draws\/[^/]+\/check$/u, schema: lotteryCheckSchema },
  { pattern: /^lottery\/draws\/[^/]+\/quick-pick$/u, schema: quickPickSchema },
  { pattern: /^lottery\/draws\/[^/]+\/tickets$/u, schema: lotteryTicketSchema },
  { pattern: /^lottery\/tickets\/[^/]+$/u, schema: lotteryTicketSchema },
  { pattern: /^lottery\/players\/[^/]+\/tickets$/u, schema: z.array(lotteryTicketSchema) },
  { pattern: /^lottery\/players\/[^/]+\/eligibility$/u, schema: lotteryEligibilitySchema },
];

export function lotterySchemaFor(path: string): z.ZodType | null {
  return LOTTERY_SCHEMAS.find((entry) => entry.pattern.test(path))?.schema ?? null;
}

export type LotteryConfig = z.infer<typeof lotteryConfigSchema>;
export type LotteryDraw = z.infer<typeof lotteryDrawSchema>;
export type LotteryResult = z.infer<typeof lotteryResultSchema>;
export type LotterySelection = z.infer<typeof lotterySelectionSchema>;
export type LotteryTicket = z.infer<typeof lotteryTicketSchema>;
export type LotteryEligibility = z.infer<typeof lotteryEligibilitySchema>;
export type LotteryCheck = z.infer<typeof lotteryCheckSchema>;
