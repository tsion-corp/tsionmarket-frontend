export type ComboSport =
  | "soccer"
  | "mlb"
  | "tennis"
  | "cricket"
  | "basketball"
  | "efootball"
  | "tabletennis"
  | "icehockey"
  | "ufc"
  | "nfl";

export type ComboMarketType = "moneyline" | "spread" | "total";

export type NormalSport = "football" | "basketball";

export interface ComboLeague {
  slug: string;
  providerSlug: string;
  name: string;
  imageUrl: string | null;
  seriesId: string;
  primaryTagId: number | null;
  teamOrdering: string | null;
}

export interface ComboLeagueSummary {
  slug: string;
  name: string;
  imageUrl: string | null;
}

export interface ComboTeam {
  id: number | null;
  name: string;
  alias: string | null;
  abbreviation: string | null;
  record: string | null;
  logoUrl: string | null;
  color: string | null;
  ordering: string | null;
}

export interface ComboSelection {
  outcome: string;
  outcomeIndex: number;
  tokenId: string | null;
  positionId: string | null;
  referencePrice: number | null;
  decimalOdds: number | null;
}

export interface ComboMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  label: string | null;
  marketType: ComboMarketType;
  line: number | null;
  positionIds: string[];
  selections: ComboSelection[];
  volume: number | null;
  liquidity: number | null;
}

export interface ComboEvent {
  id: string;
  slug: string;
  title: string;
  startTime: string | null;
  eventDate: string | null;
  live: boolean;
  volume: number | null;
  liquidity: number | null;
  league: ComboLeagueSummary;
  teams: ComboTeam[];
  moneyline: ComboMarket[];
  spreads: ComboMarket[];
  totals: ComboMarket[];
}

export interface ComboFilters {
  sports: Array<{ slug: ComboSport; label: string }>;
  selectedSport: ComboSport;
  featuredLeagues: ComboLeague[];
  leagues: ComboLeague[];
  marketTypes: ComboMarketType[];
}

export interface ComboEventsPage {
  sport: ComboSport;
  league: ComboLeague | null;
  events: ComboEvent[];
  nextCursor: string | null;
}

export interface ComboEventsParams {
  sport: ComboSport;
  league?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SportsFilters {
  sports: Array<{ slug: NormalSport; label: string }>;
  selectedSport: NormalSport;
  selectedLeague: string;
  leagues: ComboLeague[];
  marketTypes: ComboMarketType[];
}

export type SportsEvent = ComboEvent;

export interface SportsEventsPage {
  sport: NormalSport;
  league: ComboLeague | null;
  events: SportsEvent[];
  nextCursor: string | null;
}

export interface SportsEventsParams {
  sport: NormalSport;
  league?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface RequestComboBuyQuoteInput {
  legPositionIds: string[];
  notionalE6: string;
  idempotencyKey: string;
}

export interface ComboQuote {
  id: string;
  rfqId: string | null;
  quoteId: string | null;
  direction: string;
  requestedUnit: string;
  requestedValueE6: string;
  legPositionIds: string[];
  comboConditionId: string | null;
  comboYesPositionId: string | null;
  comboNoPositionId: string | null;
  builderCode: string | null;
  status: string;
  expiresAt: string | null;
  blendedPriceE6: string | null;
  makerAmountE6: string | null;
  takerAmountE6: string | null;
  totalRequiredE6: string | null;
  netReceiveE6: string | null;
  takerOrderHash: string | null;
  transactionHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  acceptedAt: string | null;
  finalizedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DiscoveryCategory =
  | "trending"
  | "sports"
  | "basketball"
  | "nfl"
  | "politics"
  | "crypto"
  | "esports"
  | "iran"
  | "finance"
  | "geopolitics"
  | "tech"
  | "culture"
  | "economy"
  | "weather"
  | "mentions"
  | "elections";
export type DiscoveryMarketSort = "volume_24h" | "volume" | "liquidity" | "newest" | "ending_soon";

export interface DiscoveryMarketOutcome {
  name: string;
  tokenId: string | null;
  referencePrice: number | null;
  decimalOdds: number | null;
}

export interface DiscoveryMarketSummary {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  groupItemTitle: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  restricted: boolean;
  enableOrderBook: boolean;
  outcomes: DiscoveryMarketOutcome[];
  liquidity: number | null;
  volume: number | null;
  volume24h: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  spread: number | null;
  oneDayPriceChange: number | null;
  negRisk: boolean;
  rfqEnabled: boolean;
}

export interface DiscoveryMarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  closed: boolean;
  restricted: boolean;
  liquidity: number | null;
  volume: number | null;
  volume24h: number | null;
  oneDayPriceChange: number | null;
  marketCount: number;
  markets: DiscoveryMarketSummary[];
  tags: Array<{ id: string; label: string; slug: string }>;
}

export interface DiscoveryEventsPage {
  category: DiscoveryCategory;
  sort: DiscoveryMarketSort;
  events: DiscoveryMarketEvent[];
  nextCursor: string | null;
}

export interface DiscoveryEventsParams {
  category: DiscoveryCategory;
  sort?: DiscoveryMarketSort;
  cursor?: string;
  limit?: number;
}

export type SinglesOrderStatus = "filled" | "pending" | "failed";
export type SinglesTicketStatus = "filled" | "partial" | "pending" | "failed";

export interface SinglesTicketOrder {
  selectionId: string;
  source: "sports" | "discovery";
  eventId: string;
  eventTitle: string;
  marketId: string;
  conditionId: string;
  tokenId: string;
  marketLabel: string;
  outcome: string;
  status: SinglesOrderStatus;
  orderId: string | null;
  transactionHash: string | null;
  error: string | null;
}

export interface SinglesTicket {
  id: string;
  bookingCode: string;
  status: SinglesTicketStatus;
  requestedStakeE6: string;
  spentE6: string;
  referenceReturnE6: string;
  filledCount: number;
  acceptedCount: number;
  orders: SinglesTicketOrder[];
  placedAt: string;
  createdAt: string;
  updatedAt: string;
}
