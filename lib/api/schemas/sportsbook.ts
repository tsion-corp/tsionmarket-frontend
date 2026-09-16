import { z } from "zod";

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/u);
const naturalId = z.string().regex(/^\d+$/u);
const address = z.string().regex(/^0x[0-9a-f]{40}$/iu);
const hash = z.string().regex(/^0x[0-9a-f]{64}$/iu);
const uuid = z.string().uuid();

const token = z.object({ symbol: z.string(), decimals: z.number().int().min(0).max(36) });
const entity = z.object({ id: z.string().nullable(), slug: z.string(), name: z.string() });
const sport = z.object({ id: z.string(), slug: z.string(), name: z.string(), hub: z.string() });
const eventKind = z.enum(["sports", "esports", "virtual"]);
const eventState = z.enum([
  "prematch",
  "live",
  "finished",
  "pre_finished",
  "stopped",
  "suspended",
  "canceled",
  "coverage_lost",
  "unknown",
]);
const marketState = z.enum(["active", "stopped", "canceled", "won", "lost", "unknown"]);

const event = z.object({
  provider: z.enum(["azuro", "polymarket"]),
  eventKind,
  id: naturalId,
  slug: z.string(),
  title: z.string(),
  startsAt: z.number().int(),
  state: eventState,
  providerState: z.string(),
  turnover: decimal,
  sport,
  country: entity,
  league: entity,
  leagueIsTop: z.boolean(),
  participants: z.array(z.object({ name: z.string(), imageUrl: z.string().nullable() })),
});

const outcome = z.object({
  id: naturalId,
  title: z.string(),
  odds: decimal,
  point: decimal.nullable(),
  state: marketState,
  providerState: z.string(),
  hidden: z.boolean(),
  sortOrder: z.string().nullable(),
});

const market = z.object({
  id: naturalId,
  eventId: naturalId.nullable(),
  title: z.string(),
  state: marketState,
  providerState: z.string(),
  marketId: z.number().int().nullable(),
  category: z.string().nullable(),
  sortOrder: z.string().nullable(),
  expressForbidden: z.boolean(),
  prematchEnabled: z.boolean(),
  liveEnabled: z.boolean(),
  hidden: z.boolean(),
  outcomes: z.array(outcome),
});

const features = z.object({
  navigation: z.boolean(),
  search: z.boolean(),
  prematch: z.boolean(),
  live: z.boolean(),
  virtualBetting: z.boolean(),
  realtime: z.boolean(),
  calculations: z.boolean(),
  orderPlacement: z.boolean(),
  activity: z.boolean(),
  freebets: z.boolean(),
  settlement: z.boolean(),
  redemption: z.boolean(),
  cashout: z.boolean(),
  leaderboard: z.boolean(),
  favorites: z.boolean(),
  referrals: z.boolean(),
});

const capabilities = z.object({
  provider: z.enum(["azuro", "polymarket"]),
  chainId: z.number().int().positive(),
  environment: z.string(),
  token,
  features,
});

const navigation = z.object({
  provider: z.enum(["azuro", "polymarket"]),
  environment: z.string(),
  sports: z.array(
    z.object({
      sport,
      activeGames: z.number().int().nonnegative(),
      liveGames: z.number().int().nonnegative(),
      prematchGames: z.number().int().nonnegative(),
      countries: z.array(
        z.object({
          country: entity,
          turnover: decimal,
          activeGames: z.number().int().nonnegative(),
          liveGames: z.number().int().nonnegative(),
          prematchGames: z.number().int().nonnegative(),
          leagues: z.array(
            z.object({
              league: entity,
              eventKind,
              isTopLeague: z.boolean(),
              topWeight: z.number().int(),
              turnover: decimal,
              activeGames: z.number().int().nonnegative(),
              liveGames: z.number().int().nonnegative(),
              prematchGames: z.number().int().nonnegative(),
            })
          ),
        })
      ),
    })
  ),
});

const eventsPage = z.object({
  provider: z.enum(["azuro", "polymarket"]),
  environment: z.string(),
  events: z.array(event),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
});

const eventDetails = z.object({ event, markets: z.array(market) });
const eventMarkets = z.array(market);
const searchPage = z.object({
  provider: z.enum(["azuro", "polymarket"]),
  environment: z.string(),
  events: z.array(event),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().int().nonnegative().nullable(),
  totalPages: z.number().int().nonnegative().nullable(),
  nextPage: z.number().int().positive().nullable(),
});
const selection = z.object({ conditionId: naturalId, outcomeId: naturalId });
const calculation = z.object({
  provider: z.enum(["azuro", "polymarket"]),
  environment: z.string(),
  selections: z.array(selection),
  minimumStake: decimal,
  maximumStake: decimal,
  maximumPayout: decimal,
  token,
});

const typedData = z.object({
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number().int().positive(),
    verifyingContract: address,
  }),
  primaryType: z.string(),
  types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
  message: z.record(z.string(), z.unknown()),
});

const preparedOrder = z.object({
  ticketId: uuid,
  bookingCode: z.string(),
  ownerWallet: address,
  status: z.string(),
  kind: z.enum(["ordinary", "combo"]),
  environment: z.string(),
  stakeAtomic: naturalId,
  possiblePayoutAtomic: naturalId,
  bonusId: z.string().nullable(),
  isBetSponsored: z.boolean(),
  isFeeSponsored: z.boolean(),
  isSponsoredBetReturnable: z.boolean(),
  token,
  approval: z.object({
    chainId: z.number().int().positive(),
    token: address,
    spender: address,
    amountAtomic: naturalId,
  }),
  typedData,
  expiresAt: z.string().datetime(),
});

const orderStatus = z.enum([
  "draft",
  "awaiting_signature",
  "submitted",
  "accepted",
  "partially_accepted",
  "live",
  "pending_resolution",
  "won",
  "lost",
  "canceled",
  "partially_void",
  "cashed_out",
  "redeemable",
  "redeemed",
  "rejected",
  "failed",
]);
const order = z.object({
  ticketId: uuid,
  bookingCode: z.string(),
  ownerWallet: address,
  status: orderStatus,
  kind: z.enum(["ordinary", "combo"]),
  environment: z.string(),
  stakeAtomic: naturalId,
  possiblePayoutAtomic: naturalId.nullable(),
  payoutAtomic: naturalId.nullable(),
  bonusId: z.string().nullable(),
  token,
  providerOrderId: z.string().nullable(),
  betId: z.string().nullable(),
  transactionHash: hash.nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  signatureRequired: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  settlement: z
    .object({
      providerStatus: z.string().nullable(),
      providerResult: z.string().nullable(),
      freebetId: z.string().nullable(),
      paymasterContractAddress: address.nullable(),
      isFreebetAmountReturnable: z.boolean().nullable(),
      isRedeemable: z.boolean(),
      isRedeemed: z.boolean(),
      isCashedOut: z.boolean(),
      hasVoidedLegs: z.boolean(),
      resolvedAt: z.string().datetime().nullable(),
      syncedAt: z.string().datetime(),
    })
    .nullable(),
  legs: z.array(
    z.object({
      eventId: naturalId,
      eventTitle: z.string(),
      eventKind,
      conditionId: naturalId,
      marketTitle: z.string(),
      outcomeId: naturalId,
      outcomeTitle: z.string(),
      requestedOdds: decimal,
      acceptedOdds: decimal.nullable(),
      result: z.string().nullable(),
      index: z.number().int().nonnegative(),
    })
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const history = z.object({ items: z.array(order), nextCursor: z.string().nullable() });
const preparedRedemption = z.object({
  redemptionId: uuid,
  ticketId: uuid,
  bookingCode: z.string(),
  status: z.string(),
  redemptionKind: z.enum(["regular", "freebet"]),
  amountAtomic: naturalId,
  token,
  transaction: z.object({
    chainId: z.number().int().positive(),
    to: address,
    data: z.string().regex(/^0x[0-9a-f]*$/iu),
    valueAtomic: naturalId,
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const redemption = z.object({
  redemptionId: uuid,
  ticketId: uuid,
  status: z.string(),
  amountAtomic: naturalId,
  transactionHash: hash.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export function sportsbookSchemaFor(method: string, path: string): z.ZodType | null {
  if (method === "GET") {
    if (path === "sportsbook/capabilities") return capabilities;
    if (path === "sportsbook/navigation") return navigation;
    if (path === "sportsbook/events") return eventsPage;
    if (path === "sportsbook/search") return searchPage;
    if (/^sportsbook\/events\/\d+$/u.test(path)) return eventDetails;
    if (path === "sportsbook/orders") return history;
    if (/^sportsbook\/orders\/booking\/[A-Z0-9]+$/iu.test(path)) return order;
    if (/^sportsbook\/orders\/[0-9a-f-]+$/iu.test(path)) return order;
    if (/^sportsbook\/orders\/[0-9a-f-]+\/redemption$/iu.test(path)) return redemption;
    return null;
  }
  if (path === "sportsbook/calculations") return calculation;
  if (path === "sportsbook/events/markets") return eventMarkets;
  if (path === "sportsbook/orders/prepare") return preparedOrder;
  if (/^sportsbook\/orders\/[0-9a-f-]+\/submit$/iu.test(path)) return order;
  if (/^sportsbook\/orders\/[0-9a-f-]+\/redemption\/prepare$/iu.test(path)) {
    return preparedRedemption;
  }
  if (/^sportsbook\/orders\/[0-9a-f-]+\/redemption\/submit$/iu.test(path)) {
    return redemption;
  }
  return null;
}

export const calculationRequestSchema = z.object({
  selections: z.array(selection).min(1).max(20),
  wallet: address.optional(),
});
export const eventMarketsRequestSchema = z.object({
  gameIds: z.array(naturalId).min(1).max(100),
});
export const prepareOrderRequestSchema = z.object({
  selections: z
    .array(z.object({ eventId: naturalId, conditionId: naturalId, outcomeId: naturalId }))
    .min(1)
    .max(20),
  stake: decimal,
  slippageBps: z.number().int().min(0).max(5000).optional(),
  bonusId: z.string().optional(),
});
export const submitOrderRequestSchema = z.object({
  signature: z.string().regex(/^0x[0-9a-f]+$/iu),
});
export const submitRedemptionRequestSchema = z.object({ transactionHash: hash });
