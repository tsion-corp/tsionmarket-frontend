"use client";

import { useQuery } from "@tanstack/react-query";
import {
  calculateBet,
  getCapabilities,
  getEventDetails,
  getEventMarkets,
  getSportsbookBoard,
  getNavigation,
  getOrder,
  getOrderHistory,
  searchSportsbook,
  sportsbookKeys,
  type EventsQuery,
  type ProviderSelection,
  type SportsbookOrder,
} from "../api";

const PUBLIC_STALE_MS = 30_000;
const PROCESSING_STATUSES = new Set(["awaiting_signature", "submitted"]);
const ACTIVE_STATUSES = new Set(["accepted", "partially_accepted", "live", "pending_resolution"]);

export function useSportsbookCapabilities() {
  return useQuery({
    queryKey: sportsbookKeys.capabilities,
    queryFn: getCapabilities,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useSportsbookNavigation() {
  return useQuery({
    queryKey: sportsbookKeys.navigation,
    queryFn: getNavigation,
    staleTime: PUBLIC_STALE_MS,
  });
}

export function useSportsbookEvents(params: EventsQuery) {
  return useQuery({
    queryKey: sportsbookKeys.board(params),
    queryFn: () => getSportsbookBoard(params),
    staleTime: 10_000,
    refetchInterval: params.state === "live" ? 15_000 : 30_000,
  });
}

export function useSportsbookSearch(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: sportsbookKeys.search(normalized),
    queryFn: () => searchSportsbook(normalized),
    enabled: normalized.length >= 3,
    staleTime: 30_000,
  });
}

export function useSportsbookEvent(eventId: string) {
  return useQuery({
    queryKey: sportsbookKeys.event(eventId),
    queryFn: () => getEventDetails(eventId),
    enabled: /^\d+$/u.test(eventId),
    staleTime: 10_000,
  });
}

export function useSportsbookMarkets(eventIds: string[]) {
  const normalized = [...new Set(eventIds)].toSorted();
  return useQuery({
    queryKey: sportsbookKeys.markets(normalized),
    queryFn: () => getEventMarkets(normalized),
    enabled: normalized.length > 0,
    staleTime: 2_000,
    refetchInterval: 5_000,
  });
}

export function useBetCalculation(selections: ProviderSelection[]) {
  return useQuery({
    queryKey: sportsbookKeys.calculation(selections),
    queryFn: () => calculateBet(selections),
    enabled: selections.length > 0,
    staleTime: 5_000,
    retry: 1,
  });
}

export function useSportsbookOrder(ticketId: string | null) {
  return useQuery({
    queryKey: sportsbookKeys.order(ticketId ?? "none"),
    queryFn: () => getOrder(ticketId as string),
    enabled: Boolean(ticketId),
    refetchInterval: (query) => {
      const order = query.state.data as SportsbookOrder | undefined;
      if (!order || PROCESSING_STATUSES.has(order.status)) return 2_000;
      if (ACTIVE_STATUSES.has(order.status)) return 15_000;
      return false;
    },
  });
}

export function useSportsbookOrderHistory(enabled: boolean) {
  return useQuery({
    queryKey: sportsbookKeys.orders,
    queryFn: () => getOrderHistory({ limit: 30 }),
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}
