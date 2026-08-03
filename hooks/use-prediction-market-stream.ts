"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PING_MESSAGE,
  STREAM_FRESH_MS,
  STREAM_PING_MS,
  STREAM_RECONNECT_MS,
  parseMarketFrame,
  subscribeMessage,
  type MarketFrame,
} from "@/lib/prediction/stream";
import { priceYesFromReserves } from "@/lib/prediction/math";
import { PRICE_SCALE, type Market, type Trade } from "@/lib/prediction/types";

// One WebSocket to the ws-gateway for a single market's live frames. It overlays
// the streamed reserves onto the REST-cached market (so the price/chart tick live)
// and surfaces recent trades for the tape. When the stream is quiet, REST polling
// carries the UI and nothing downstream can tell the difference.

const WS_URL =
  process.env.NEXT_PUBLIC_WS_GATEWAY_URL ??
  process.env.NEXT_PUBLIC_PERP_WS_URL ??
  "wss://ws.worldstreetwebservices.com";

const FLUSH_MS = 1_000;
// Cap the live trade buffer so a long-lived detail page can't grow it unbounded.
const MAX_LIVE_TRADES = 40;

export interface MarketStreamState {
  liveTrades: Trade[];
  healthy: boolean;
}

export function usePredictionMarketStream(marketId: string | null): MarketStreamState {
  const queryClient = useQueryClient();
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);
  const [healthy, setHealthy] = useState(false);
  // Latest reserves seen this flush window, applied to the market cache in one go.
  const pendingReservesRef = useRef<{ rYes: bigint; rNo: bigint } | null>(null);

  // Drop the previous market's live trades when the id changes. Render-phase
  // reset (React's "adjust state on prop change" pattern), not an effect.
  const [trackedId, setTrackedId] = useState(marketId);
  if (marketId !== trackedId) {
    setTrackedId(marketId);
    setLiveTrades([]);
  }

  useEffect(() => {
    if (!marketId) return;

    let ws: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let lastFrameAt = 0;
    let reconnectDelay = STREAM_RECONNECT_MS;
    const tradeBuffer: Trade[] = [];
    let settled = false;

    const applyFrame = (frame: MarketFrame) => {
      lastFrameAt = Date.now();
      reconnectDelay = STREAM_RECONNECT_MS;
      switch (frame.type) {
        case "trade":
          pendingReservesRef.current = { rYes: frame.rYes, rNo: frame.rNo };
          tradeBuffer.push({
            txHash: `live-${lastFrameAt}-${tradeBuffer.length}`,
            trader: frame.trader,
            buy: frame.buy,
            side: frame.side,
            usdcAmount: frame.usdcAmount,
            shareAmount: frame.shareAmount,
            priceYes: priceYesFromReserves(frame.rYes, frame.rNo),
            block: 0,
          });
          break;
        case "liquidity":
          pendingReservesRef.current = { rYes: frame.rYes, rNo: frame.rNo };
          break;
        case "closed":
        case "resolved":
        case "invalidated":
        case "redeemed":
          // Settlement changes status/outcome and the user's positions; let the
          // REST hooks refetch the source of truth rather than guess it here.
          settled = true;
          break;
        default:
          break;
      }
    };

    const open = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        return;
      }
      ws.onopen = () => {
        ws?.send(subscribeMessage([marketId]));
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(PING_MESSAGE);
        }, STREAM_PING_MS);
      };
      ws.onmessage = (event) => {
        const frame = parseMarketFrame(event.data);
        if (frame != null) applyFrame(frame);
      };
      ws.onclose = () => {
        if (pingTimer != null) clearInterval(pingTimer);
        pingTimer = null;
        if (!disposed) {
          reconnectTimer = setTimeout(open, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        }
      };
      ws.onerror = () => {};
    };

    const flushTimer = setInterval(() => {
      setHealthy(Date.now() - lastFrameAt < STREAM_FRESH_MS);

      const reserves = pendingReservesRef.current;
      if (reserves) {
        pendingReservesRef.current = null;
        const priceYes = priceYesFromReserves(reserves.rYes, reserves.rNo);
        queryClient.setQueryData<Market>(["prediction", "market", marketId], (prev) =>
          prev
            ? {
                ...prev,
                rYes: reserves.rYes,
                rNo: reserves.rNo,
                priceYes,
                priceNo: PRICE_SCALE - priceYes,
              }
            : prev
        );
      }

      if (tradeBuffer.length > 0) {
        const batch = tradeBuffer.splice(0, tradeBuffer.length);
        setLiveTrades((prev) => [...batch.reverse(), ...prev].slice(0, MAX_LIVE_TRADES));
      }

      if (settled) {
        settled = false;
        void queryClient.invalidateQueries({ queryKey: ["prediction", "market", marketId] });
        void queryClient.invalidateQueries({ queryKey: ["prediction", "positions"] });
        void queryClient.invalidateQueries({ queryKey: ["prediction", "withdrawable"] });
      }
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
  }, [marketId, queryClient]);

  return useMemo(() => ({ liveTrades, healthy }), [liveTrades, healthy]);
}
