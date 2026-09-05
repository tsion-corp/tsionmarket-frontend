"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  sportsbookKeys,
  type EventsQuery,
  type RealtimeConditionEvent,
  type SportsbookBoardPage,
  type SportsbookEventDetails,
  type SportsbookMarket,
} from "../api";

function parseConditionEvent(raw: string): RealtimeConditionEvent | null {
  try {
    const value = JSON.parse(raw) as Partial<RealtimeConditionEvent>;
    if (value.type !== "condition" || typeof value.conditionId !== "string") return null;
    return value as RealtimeConditionEvent;
  } catch {
    return null;
  }
}

function applyConditionUpdate(market: SportsbookMarket, update: RealtimeConditionEvent) {
  if (market.id !== update.conditionId) return market;
  return {
    ...market,
    hidden: update.hidden ?? market.hidden,
    liveEnabled: update.liveEnabled ?? market.liveEnabled,
    prematchEnabled: update.prematchEnabled ?? market.prematchEnabled,
    outcomes: market.outcomes.map((outcome) => {
      const changed = update.outcomes.find(({ outcomeId }) => outcomeId === outcome.id);
      return changed
        ? {
            ...outcome,
            odds: changed.odds ?? outcome.odds,
            hidden: changed.hidden ?? outcome.hidden,
            providerState: changed.state,
          }
        : outcome;
    }),
  };
}

export function useSportsbookRealtime(eventId: string, conditionIds: string[], enabled: boolean) {
  const queryClient = useQueryClient();
  const conditionKey = [...new Set(conditionIds)].sort().join(",");

  useEffect(() => {
    if (!enabled || !conditionKey) return;
    const params = new URLSearchParams({ conditionIds: conditionKey, gameIds: eventId });
    const source = new EventSource(`/api/sportsbook/realtime?${params}`);

    const onCondition = (message: MessageEvent<string>) => {
      const update = parseConditionEvent(message.data);
      if (!update) return;
      queryClient.setQueryData<SportsbookEventDetails>(sportsbookKeys.event(eventId), (current) => {
        if (!current) return current;
        return {
          ...current,
          markets: current.markets.map((market) => applyConditionUpdate(market, update)),
        };
      });
    };
    const onResync = () =>
      void queryClient.invalidateQueries({ queryKey: sportsbookKeys.event(eventId) });
    source.addEventListener("condition", onCondition as EventListener);
    source.addEventListener("resync", onResync);
    return () => source.close();
  }, [conditionKey, enabled, eventId, queryClient]);
}

export function useSportsbookBoardRealtime(
  params: EventsQuery,
  eventIds: string[],
  conditionIds: string[],
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const eventKey = [...new Set(eventIds)].sort().join(",");
  const conditionKey = [...new Set(conditionIds)].sort().slice(0, 80).join(",");

  useEffect(() => {
    if (!enabled || (!eventKey && !conditionKey)) return;
    const query = new URLSearchParams();
    if (eventKey) query.set("gameIds", eventKey);
    if (conditionKey) query.set("conditionIds", conditionKey);
    const source = new EventSource(`/api/sportsbook/realtime?${query}`);
    const onCondition = (message: MessageEvent<string>) => {
      const update = parseConditionEvent(message.data);
      if (!update) return;
      queryClient.setQueryData<SportsbookBoardPage>(sportsbookKeys.board(params), (current) => {
        if (!current) return current;
        return {
          ...current,
          events: current.events.map((event) =>
            update.gameId && update.gameId !== event.id
              ? event
              : {
                  ...event,
                  markets: event.markets.map((market) => applyConditionUpdate(market, update)),
                }
          ),
        };
      });
    };
    const onResync = () =>
      void queryClient.invalidateQueries({ queryKey: sportsbookKeys.board(params) });
    source.addEventListener("condition", onCondition as EventListener);
    source.addEventListener("resync", onResync);
    return () => source.close();
  }, [conditionKey, enabled, eventKey, params, queryClient]);
}
