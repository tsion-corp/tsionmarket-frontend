export type SportsbookProvider = "azuro" | "polymarket";
export type SportsbookEventKind = "sports" | "esports" | "virtual";
export type SportsbookGameState = "prematch" | "live" | "all";
export type EventState =
  | "prematch"
  | "live"
  | "finished"
  | "pre_finished"
  | "stopped"
  | "suspended"
  | "canceled"
  | "coverage_lost"
  | "unknown";
export type MarketState = "active" | "stopped" | "canceled" | "won" | "lost" | "unknown";

export interface BetToken {
  symbol: string;
  decimals: number;
}

export interface SportsbookFeatures {
  navigation: boolean;
  search: boolean;
  prematch: boolean;
  live: boolean;
  virtualBetting: boolean;
  realtime: boolean;
  calculations: boolean;
  orderPlacement: boolean;
  activity: boolean;
  freebets: boolean;
  settlement: boolean;
  redemption: boolean;
  cashout: boolean;
  leaderboard: boolean;
  favorites: boolean;
  referrals: boolean;
}

export interface SportsbookCapabilities {
  provider: SportsbookProvider;
  chainId: number;
  environment: string;
  token: BetToken;
  features: SportsbookFeatures;
}

export interface SportsbookEntity {
  id: string | null;
  slug: string;
  name: string;
}

export interface SportReference {
  id: string;
  slug: string;
  name: string;
  hub: string;
}

export interface LeagueNavigation {
  league: SportsbookEntity;
  eventKind: SportsbookEventKind;
  isTopLeague: boolean;
  topWeight: number;
  turnover: string;
  activeGames: number;
  liveGames: number;
  prematchGames: number;
}

export interface CountryNavigation {
  country: SportsbookEntity;
  turnover: string;
  activeGames: number;
  liveGames: number;
  prematchGames: number;
  leagues: LeagueNavigation[];
}

export interface SportNavigation {
  sport: SportReference;
  activeGames: number;
  liveGames: number;
  prematchGames: number;
  countries: CountryNavigation[];
}

export interface SportsbookNavigation {
  provider: SportsbookProvider;
  environment: string;
  sports: SportNavigation[];
}

export interface SportsbookEvent {
  provider: SportsbookProvider;
  eventKind: SportsbookEventKind;
  id: string;
  slug: string;
  title: string;
  startsAt: number;
  state: EventState;
  providerState: string;
  turnover: string;
  sport: SportReference;
  country: SportsbookEntity;
  league: SportsbookEntity;
  leagueIsTop: boolean;
  participants: Array<{ name: string; imageUrl: string | null }>;
}

export interface SportsbookEventsPage {
  provider: SportsbookProvider;
  environment: string;
  events: SportsbookEvent[];
  limit: number;
  offset: number;
  total: number;
  nextOffset: number | null;
}

export interface MarketOutcome {
  id: string;
  title: string;
  odds: string;
  point: string | null;
  state: MarketState;
  providerState: string;
  hidden: boolean;
  sortOrder: string | null;
}

export interface SportsbookMarket {
  id: string;
  eventId: string | null;
  title: string;
  state: MarketState;
  providerState: string;
  marketId: number | null;
  category: string | null;
  sortOrder: string | null;
  expressForbidden: boolean;
  prematchEnabled: boolean;
  liveEnabled: boolean;
  hidden: boolean;
  outcomes: MarketOutcome[];
}

export interface SportsbookEventDetails {
  event: SportsbookEvent;
  markets: SportsbookMarket[];
}

export interface SportsbookBoardEvent extends SportsbookEvent {
  markets: SportsbookMarket[];
}

export interface SportsbookBoardPage extends Omit<SportsbookEventsPage, "events"> {
  events: SportsbookBoardEvent[];
}

export interface SportsbookSearchPage {
  provider: SportsbookProvider;
  environment: string;
  events: SportsbookEvent[];
  page: number;
  perPage: number;
  total: number | null;
  totalPages: number | null;
  nextPage: number | null;
}

export interface ProviderSelection {
  conditionId: string;
  outcomeId: string;
}

export interface BetCalculation {
  provider: SportsbookProvider;
  environment: string;
  selections: ProviderSelection[];
  minimumStake: string;
  maximumStake: string;
  maximumPayout: string;
  token: BetToken;
}

export interface Eip712TypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}

export interface PreparedSportsbookOrder {
  ticketId: string;
  bookingCode: string;
  ownerWallet: string;
  status: string;
  kind: "ordinary" | "combo";
  environment: string;
  stakeAtomic: string;
  possiblePayoutAtomic: string;
  bonusId: string | null;
  isBetSponsored: boolean;
  isFeeSponsored: boolean;
  isSponsoredBetReturnable: boolean;
  token: BetToken;
  approval: {
    chainId: number;
    token: string;
    spender: string;
    amountAtomic: string;
  };
  typedData: Eip712TypedData;
  expiresAt: string;
}

export type SportsbookOrderStatus =
  | "draft"
  | "awaiting_signature"
  | "submitted"
  | "accepted"
  | "partially_accepted"
  | "live"
  | "pending_resolution"
  | "won"
  | "lost"
  | "canceled"
  | "partially_void"
  | "cashed_out"
  | "redeemable"
  | "redeemed"
  | "rejected"
  | "failed";

export interface SportsbookOrder {
  ticketId: string;
  bookingCode: string;
  ownerWallet: string;
  status: SportsbookOrderStatus;
  kind: "ordinary" | "combo";
  environment: string;
  stakeAtomic: string;
  possiblePayoutAtomic: string | null;
  payoutAtomic: string | null;
  bonusId: string | null;
  token: BetToken;
  providerOrderId: string | null;
  betId: string | null;
  transactionHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  signatureRequired: boolean;
  expiresAt: string | null;
  settlement: {
    providerStatus: string | null;
    providerResult: string | null;
    freebetId: string | null;
    paymasterContractAddress: string | null;
    isFreebetAmountReturnable: boolean | null;
    isRedeemable: boolean;
    isRedeemed: boolean;
    isCashedOut: boolean;
    hasVoidedLegs: boolean;
    resolvedAt: string | null;
    syncedAt: string;
  } | null;
  legs: Array<{
    eventId: string;
    eventTitle: string;
    eventKind: SportsbookEventKind;
    conditionId: string;
    marketTitle: string;
    outcomeId: string;
    outcomeTitle: string;
    requestedOdds: string;
    acceptedOdds: string | null;
    result: string | null;
    index: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SportsbookOrderHistory {
  items: SportsbookOrder[];
  nextCursor: string | null;
}

export interface PreparedRedemption {
  redemptionId: string;
  ticketId: string;
  bookingCode: string;
  status: string;
  redemptionKind: "regular" | "freebet";
  amountAtomic: string;
  token: BetToken;
  transaction: { chainId: number; to: string; data: string; valueAtomic: string };
  createdAt: string;
  updatedAt: string;
}

export interface SportsbookRedemption {
  redemptionId: string;
  ticketId: string;
  status: string;
  amountAtomic: string;
  transactionHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlipSelection {
  id: string;
  eventId: string;
  eventTitle: string;
  eventKind: SportsbookEventKind;
  conditionId: string;
  marketTitle: string;
  outcomeId: string;
  outcomeTitle: string;
  odds: string;
  expressForbidden: boolean;
}

export interface RealtimeConditionEvent {
  type: "condition";
  conditionId: string;
  gameId: string | null;
  state: string;
  hidden: boolean | null;
  liveEnabled: boolean | null;
  prematchEnabled: boolean | null;
  cashoutEnabled: boolean | null;
  outcomes: Array<{
    outcomeId: string;
    odds: string | null;
    turnover: string | null;
    state: string;
    hidden: boolean | null;
  }>;
}
