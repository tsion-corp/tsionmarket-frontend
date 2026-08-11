"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PING_MESSAGE,
  STREAM_FRESH_MS,
  STREAM_PING_MS,
  STREAM_RECONNECT_MS,
  parsePriceFrame,
  subscribeMessage,
  type StreamPrice,
} from "@/lib/perp/stream";

// One WebSocket to the ws-gateway pushing live Pyth marks for the subscribed
// pairs. This is the doc's intended live-price path (REST /prices is for the
// first paint); the hook merely overlays what the socket delivers on top of
// the REST-polled map, so when the stream is quiet — the production publisher
// is not live yet, a market is closed, the socket drops — the UI keeps
// ticking on REST and nothing downstream can tell the difference.
//
// Incoming frames are buffered and flushed on an interval instead of one
// setState per frame: at ~1 update/sec/pair across a hundred subscribed pairs
// that difference is what keeps the section from re-rendering constantly.

const WS_URL = process.env.NEXT_PUBLIC_PERP_WS_URL ?? "wss://ws.worldstreetwebservices.com";

const FLUSH_MS = 1_000;

export function usePerpPriceStream(symbols: readonly string[], enabled: boolean) {
  const [prices, setPrices] = useState<ReadonlyMap<string, StreamPrice>>(new Map());
  const [healthy, setHealthy] = useState(false);

  // The symbols array is rebuilt every render by callers; the joined key only
  // changes when the actual set does, so the socket is not torn down on every
  // render. In practice it changes once, when the live pair list arrives.
  const symbolsKey = symbols.join(",");

  useEffect(() => {
    if (!enabled || symbolsKey === "") return;
    const topics = symbolsKey.split(",");
    // Pairs no longer on screen are pruned at the next flush, so a delisted
    // pair's frozen mark cannot keep beating REST forever.
    const wanted = new Set(topics);

    let ws: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    const buffer = new Map<string, StreamPrice>();
    let lastFrameAt = 0;
    // Exponential backoff so a downed gateway is not hammered by every open
    // tab in lockstep; a delivered frame resets it.
    let reconnectDelay = STREAM_RECONNECT_MS;

    const open = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        // A malformed URL throws synchronously; without the stream the REST
        // fallback carries prices, so fail quiet and don't retry a bad URL.
        return;
      }
      ws.onopen = () => {
        ws?.send(subscribeMessage(topics));
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(PING_MESSAGE);
        }, STREAM_PING_MS);
      };
      ws.onmessage = (event) => {
        const update = parsePriceFrame(event.data);
        if (update == null) return;
        lastFrameAt = Date.now();
        reconnectDelay = STREAM_RECONNECT_MS;
        // After a reconnect, frames can arrive out of order; never let an
        // older publish overwrite a newer mark.
        const held = buffer.get(update.pair);
        if (held == null || update.publishTime >= held.publishTime) {
          buffer.set(update.pair, update);
        }
      };
      ws.onclose = () => {
        if (pingTimer != null) clearInterval(pingTimer);
        pingTimer = null;
        if (!disposed) {
          reconnectTimer = setTimeout(open, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        }
      };
      // onclose fires after onerror; reconnect handling lives there alone.
      ws.onerror = () => {};
    };

    // One flusher for both the price map and the health flag. Health decays on
    // its own: when frames stop arriving the flag drops within a tick and REST
    // polling speeds back up.
    const flushTimer = setInterval(() => {
      setHealthy(Date.now() - lastFrameAt < STREAM_FRESH_MS);
      if (buffer.size === 0) return;
      const updates = new Map(buffer);
      buffer.clear();
      setPrices((prev) => {
        const next = new Map<string, StreamPrice>();
        for (const [pair, held] of prev) {
          if (wanted.has(pair)) next.set(pair, held);
        }
        for (const [pair, update] of updates) {
          const current = next.get(pair);
          if (current == null || update.publishTime >= current.publishTime) {
            next.set(pair, update);
          }
        }
        return next;
      });
    }, FLUSH_MS);

    open();

    return () => {
      disposed = true;
      clearInterval(flushTimer);
      if (pingTimer != null) clearInterval(pingTimer);
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      ws?.close();
      setHealthy(false);
    };
  }, [enabled, symbolsKey]);

  return useMemo(() => ({ prices, healthy }), [prices, healthy]);
}
