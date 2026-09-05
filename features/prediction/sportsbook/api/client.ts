"use client";

import { createServiceClient } from "@/lib/api/service";
import type {
  BetCalculation,
  PreparedRedemption,
  PreparedSportsbookOrder,
  ProviderSelection,
  SportsbookBoardPage,
  SportsbookCapabilities,
  SportsbookEventDetails,
  SportsbookEventKind,
  SportsbookEventsPage,
  SportsbookGameState,
  SportsbookMarket,
  SportsbookNavigation,
  SportsbookOrder,
  SportsbookOrderHistory,
  SportsbookOrderStatus,
  SportsbookRedemption,
  SportsbookSearchPage,
} from "./types";

const api = createServiceClient("/api/sportsbook", "Sportsbook is unavailable right now.");

export const sportsbookKeys = {
  all: ["sportsbook"] as const,
  capabilities: ["sportsbook", "capabilities"] as const,
  navigation: ["sportsbook", "navigation"] as const,
  events: (params: EventsQuery) => ["sportsbook", "events", params] as const,
  board: (params: EventsQuery) => ["sportsbook", "board", params] as const,
  event: (eventId: string) => ["sportsbook", "event", eventId] as const,
  markets: (eventIds: string[]) => ["sportsbook", "markets", eventIds] as const,
  search: (query: string) => ["sportsbook", "search", query] as const,
  calculation: (selections: ProviderSelection[]) =>
    ["sportsbook", "calculation", selections] as const,
  orders: ["sportsbook", "orders"] as const,
  order: (ticketId: string) => ["sportsbook", "order", ticketId] as const,
};

export interface EventsQuery {
  sport: string;
  eventKind?: SportsbookEventKind;
  state?: SportsbookGameState;
  country?: string;
  league?: string;
  sort?: "starts_at" | "turnover";
  direction?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export const getCapabilities = () => api.get<SportsbookCapabilities>("/capabilities");
export const getNavigation = () => api.get<SportsbookNavigation>("/navigation");
export const getEvents = (params: EventsQuery) =>
  api.get<SportsbookEventsPage>("/events", {
    sport: params.sport,
    eventKind: params.eventKind,
    state: params.state,
    country: params.country,
    league: params.league,
    sort: params.sort,
    direction: params.direction,
    limit: params.limit,
    offset: params.offset,
  });
export const getEventDetails = (eventId: string) =>
  api.get<SportsbookEventDetails>(`/events/${eventId}`);
export const getEventMarkets = (gameIds: string[]) =>
  api.publicPost<SportsbookMarket[]>("/events/markets", { gameIds });
export const getSportsbookBoard = async (params: EventsQuery): Promise<SportsbookBoardPage> => {
  const page = await getEvents(params);
  if (page.events.length === 0) return { ...page, events: [] };
  const markets = await getEventMarkets(page.events.map(({ id }) => id));
  const byEvent = new Map<string, SportsbookMarket[]>();
  for (const market of markets) {
    if (!market.eventId) continue;
    const current = byEvent.get(market.eventId) ?? [];
    current.push(market);
    byEvent.set(market.eventId, current);
  }
  return {
    ...page,
    events: page.events.map((event) => ({ ...event, markets: byEvent.get(event.id) ?? [] })),
  };
};
export const searchSportsbook = (query: string) =>
  api.get<SportsbookSearchPage>("/search", { query, perPage: 20 });
export const calculateBet = (selections: ProviderSelection[]) =>
  api.publicPost<BetCalculation>("/calculations", { selections });

export function prepareOrder(input: {
  selections: Array<{ eventId: string; conditionId: string; outcomeId: string }>;
  stake: string;
  slippageBps?: number;
}) {
  return api.postRawJson<PreparedSportsbookOrder>("/orders/prepare", JSON.stringify(input), {
    "idempotency-key": crypto.randomUUID(),
  });
}

export const submitOrder = (ticketId: string, signature: string) =>
  api.post<SportsbookOrder>(`/orders/${ticketId}/submit`, { signature });
export const getOrder = (ticketId: string) => api.authedGet<SportsbookOrder>(`/orders/${ticketId}`);
export const getOrderByBookingCode = (bookingCode: string) =>
  api.authedGet<SportsbookOrder>(`/orders/booking/${bookingCode}`);
export const getOrderHistory = (params?: {
  status?: SportsbookOrderStatus;
  cursor?: string;
  limit?: number;
}) => api.authedGet<SportsbookOrderHistory>("/orders", params);
export const prepareRedemption = (ticketId: string) =>
  api.post<PreparedRedemption>(`/orders/${ticketId}/redemption/prepare`);
export const submitRedemption = (ticketId: string, transactionHash: string) =>
  api.post<SportsbookRedemption>(`/orders/${ticketId}/redemption/submit`, {
    transactionHash,
  });
