"use client";

import { useEffect } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

const CHANNEL_NAME = "wsws.prediction.rq";

interface QueryUpdatedMessage {
  type: "updated";
  queryKey: QueryKey;
  data: string;
  dataUpdatedAt: number;
}

interface QueryRemovedMessage {
  type: "removed";
  queryKey: QueryKey;
}

type PredictionQueryMessage = QueryUpdatedMessage | QueryRemovedMessage;

export function isPredictionMarketQuery(queryKey: QueryKey): boolean {
  return String(queryKey[0]).startsWith("prediction-combo-");
}

function startPredictionQueryBroadcast(queryClient: QueryClient): () => void {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") {
    return () => undefined;
  }

  const channel = new window.BroadcastChannel(CHANNEL_NAME);
  let applyingRemoteUpdate = false;
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (applyingRemoteUpdate || !isPredictionMarketQuery(event.query.queryKey)) return;

    if (event.type === "updated" && event.action.type === "success") {
      try {
        channel.postMessage({
          type: "updated",
          queryKey: event.query.queryKey,
          data: JSON.stringify(event.query.state.data),
          dataUpdatedAt: event.query.state.dataUpdatedAt,
        } satisfies QueryUpdatedMessage);
      } catch {
        // A non-serializable result remains valid in this tab; only skip sharing it.
      }
    } else if (event.type === "removed") {
      channel.postMessage({
        type: "removed",
        queryKey: event.query.queryKey,
      } satisfies QueryRemovedMessage);
    }
  });

  const onMessage = (event: MessageEvent<PredictionQueryMessage>) => {
    const message = event.data;
    if (!message || !isPredictionMarketQuery(message.queryKey)) return;

    applyingRemoteUpdate = true;
    try {
      if (message.type === "updated") {
        queryClient.setQueryData(message.queryKey, JSON.parse(message.data), {
          updatedAt: message.dataUpdatedAt,
        });
      } else if (message.type === "removed") {
        queryClient.removeQueries({ queryKey: message.queryKey, exact: true });
      }
    } catch {
      // Ignore malformed cross-tab messages instead of corrupting local cache state.
    } finally {
      applyingRemoteUpdate = false;
    }
  };

  channel.addEventListener("message", onMessage);
  return () => {
    unsubscribe();
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}

export function usePredictionQueryBroadcast(queryClient: QueryClient): void {
  useEffect(() => {
    let stop = startPredictionQueryBroadcast(queryClient);
    const onPageHide = () => {
      stop();
      stop = () => undefined;
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) stop = startPredictionQueryBroadcast(queryClient);
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      stop();
    };
  }, [queryClient]);
}
