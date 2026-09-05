import { z } from "zod";

export const comboSportSchema = z.enum([
  "soccer",
  "mlb",
  "tennis",
  "cricket",
  "basketball",
  "efootball",
  "tabletennis",
  "icehockey",
  "ufc",
  "nfl",
]);

export const normalSportSchema = z.enum(["football", "basketball"]);

const marketTypeSchema = z.enum(["moneyline", "spread", "total"]);

const leagueSchema = z.object({
  slug: z.string(),
  providerSlug: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  seriesId: z.string(),
  primaryTagId: z.number().int().nullable(),
  teamOrdering: z.string().nullable(),
});

const selectionSchema = z.object({
  outcome: z.string(),
  outcomeIndex: z.number().int().nonnegative(),
  tokenId: z.string().nullable(),
  positionId: z.string().nullable(),
  referencePrice: z.number().min(0).max(1).nullable(),
  decimalOdds: z.number().positive().nullable(),
});

const marketSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  slug: z.string(),
  question: z.string(),
  label: z.string().nullable(),
  marketType: marketTypeSchema,
  line: z.number().nullable(),
  positionIds: z.array(z.string()),
  selections: z.array(selectionSchema),
  volume: z.number().nullable(),
  liquidity: z.number().nullable(),
});

export const comboTeamSchema = z.object({
  id: z.number().int().nullable(),
  name: z.string(),
  alias: z.string().nullable(),
  abbreviation: z.string().nullable(),
  record: z.string().nullable(),
  logoUrl: z.string().nullable(),
  color: z.string().nullable(),
  ordering: z.string().nullable(),
});

export const comboEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  startTime: z.string().nullable(),
  eventDate: z.string().nullable(),
  live: z.boolean(),
  volume: z.number().nullable(),
  liquidity: z.number().nullable(),
  league: z.object({
    slug: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
  }),
  teams: z.array(comboTeamSchema),
  moneyline: z.array(marketSchema),
  spreads: z.array(marketSchema),
  totals: z.array(marketSchema),
});

export const comboFiltersSchema = z.object({
  sports: z.array(z.object({ slug: comboSportSchema, label: z.string() })),
  selectedSport: comboSportSchema,
  leagues: z.array(leagueSchema),
  marketTypes: z.array(marketTypeSchema),
});

export const comboEventsSchema = z.object({
  sport: comboSportSchema,
  league: leagueSchema.nullable(),
  events: z.array(comboEventSchema),
  nextCursor: z.string().nullable(),
});

export const sportsFiltersSchema = z.object({
  sports: z.array(z.object({ slug: normalSportSchema, label: z.string() })),
  selectedSport: normalSportSchema,
  selectedLeague: z.string(),
  leagues: z.array(leagueSchema),
  marketTypes: z.array(marketTypeSchema),
});

export const sportsEventsSchema = z.object({
  sport: normalSportSchema,
  league: leagueSchema.nullable(),
  events: z.array(comboEventSchema),
  nextCursor: z.string().nullable(),
});

export const comboQuoteSchema = z.object({
  id: z.string().uuid(),
  rfqId: z.string().nullable(),
  quoteId: z.string().nullable(),
  direction: z.string(),
  requestedUnit: z.string(),
  requestedValueE6: z.string().regex(/^\d+$/u),
  legPositionIds: z.array(z.string().regex(/^\d+$/u)),
  comboConditionId: z.string().nullable(),
  comboYesPositionId: z.string().nullable(),
  comboNoPositionId: z.string().nullable(),
  builderCode: z.string().nullable(),
  status: z.string(),
  expiresAt: z.string().nullable(),
  blendedPriceE6: z.string().nullable(),
  makerAmountE6: z.string().nullable(),
  takerAmountE6: z.string().nullable(),
  totalRequiredE6: z.string().nullable(),
  netReceiveE6: z.string().nullable(),
  takerOrderHash: z.string().nullable(),
  transactionHash: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  finalizedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const singlesOrderStatusSchema = z.enum(["filled", "pending", "failed"]);
const singlesTicketStatusSchema = z.enum(["filled", "partial", "pending", "failed"]);

const singlesTicketOrderSchema = z.object({
  selectionId: z.string(),
  source: z.enum(["sports", "discovery"]),
  eventId: z.string(),
  eventTitle: z.string(),
  marketId: z.string(),
  conditionId: z.string(),
  tokenId: z.string().regex(/^\d+$/u),
  marketLabel: z.string(),
  outcome: z.string(),
  status: singlesOrderStatusSchema,
  orderId: z.string().nullable(),
  transactionHash: z.string().nullable(),
  error: z.string().nullable(),
});

export const singlesTicketSchema = z.object({
  id: z.string().uuid(),
  bookingCode: z.string().regex(/^[A-Z0-9]{6}$/u),
  status: singlesTicketStatusSchema,
  requestedStakeE6: z.string().regex(/^\d+$/u),
  spentE6: z.string().regex(/^\d+$/u),
  referenceReturnE6: z.string().regex(/^\d+$/u),
  filledCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  orders: z.array(singlesTicketOrderSchema).min(1).max(15),
  placedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const discoveryOutcomeSchema = z.object({
  name: z.string(),
  tokenId: z.string().nullable(),
  referencePrice: z.number().min(0).max(1).nullable(),
  decimalOdds: z.number().positive().nullable(),
});

const discoveryMarketSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  slug: z.string(),
  question: z.string(),
  groupItemTitle: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  imageUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  active: z.boolean(),
  closed: z.boolean(),
  acceptingOrders: z.boolean(),
  restricted: z.boolean(),
  enableOrderBook: z.boolean(),
  outcomes: z.array(discoveryOutcomeSchema),
  liquidity: z.number().nullable(),
  volume: z.number().nullable(),
  volume24h: z.number().nullable(),
  bestBid: z.number().nullable(),
  bestAsk: z.number().nullable(),
  lastTradePrice: z.number().nullable(),
  spread: z.number().nullable(),
  oneDayPriceChange: z.number().nullable(),
  negRisk: z.boolean(),
  rfqEnabled: z.boolean(),
});

export const discoveryEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  active: z.boolean(),
  closed: z.boolean(),
  restricted: z.boolean(),
  liquidity: z.number().nullable(),
  volume: z.number().nullable(),
  volume24h: z.number().nullable(),
  oneDayPriceChange: z.number().nullable(),
  marketCount: z.number().int().nonnegative(),
  markets: z.array(discoveryMarketSchema),
  tags: z.array(z.object({ id: z.string(), label: z.string(), slug: z.string() })),
});

export const discoveryEventsSchema = z.object({
  category: z.enum([
    "trending",
    "sports",
    "basketball",
    "nfl",
    "politics",
    "crypto",
    "esports",
    "iran",
    "finance",
    "geopolitics",
    "tech",
    "culture",
    "economy",
    "weather",
    "mentions",
    "elections",
  ]),
  sort: z.enum(["volume_24h", "volume", "liquidity", "newest", "ending_soon"]),
  events: z.array(discoveryEventSchema),
  nextCursor: z.string().nullable(),
});

const SCHEMAS: Record<string, z.ZodType> = {
  "sports/combo-filters": comboFiltersSchema,
  "sports/combo-events": comboEventsSchema,
  "sports/filters": sportsFiltersSchema,
  "sports/events": sportsEventsSchema,
  "sports/teams": z.array(comboTeamSchema),
  "markets/events": discoveryEventsSchema,
  "combos/quotes": comboQuoteSchema,
  "singles/tickets": singlesTicketSchema,
};

export function predictionComboSchemaFor(path: string): z.ZodType | null {
  if (/^sports\/combo-events\/\d+$/.test(path)) return comboEventSchema;
  if (/^sports\/events\/\d+$/.test(path)) return comboEventSchema;
  if (/^markets\/events\/\d+$/.test(path)) return discoveryEventSchema;
  if (/^singles\/tickets\/[A-Z0-9]{6}$/iu.test(path)) return singlesTicketSchema;
  return SCHEMAS[path] ?? null;
}
