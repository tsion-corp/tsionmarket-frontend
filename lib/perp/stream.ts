// Pure logic for the realtime price stream (ws-gateway). The gateway pushes
// coalesced Pyth marks (~1/sec per pair) over one WebSocket; these helpers
// build the subscribe topics and validate incoming frames so the hook that
// owns the socket never touches raw JSON shapes.

// The wire format prices arrive in — same decimal-string discipline as REST.
const WIRE_DECIMAL = /^\d+(\.\d+)?$/;

// Topic for one pair: "ETH/USD" -> "perp:price:eth-usd".
export function priceTopic(symbol: string): string {
  return `perp:price:${symbol.toLowerCase().replace(/\//g, "-")}`;
}

export interface StreamPrice {
  pair: string;
  price: string;
  publishTime: number;
}

// Parses one incoming frame; returns the price update or null for anything
// else (welcome, subscribed, pong, malformed). Malformed frames are dropped
// silently: a stream glitch must never take the UI down, the REST fallback
// keeps prices moving.
export function parsePriceFrame(raw: unknown): StreamPrice | null {
  if (typeof raw !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (msg == null || typeof msg !== "object") return null;
  const { type, data } = msg as { type?: unknown; data?: unknown };
  if (type !== "price" || data == null || typeof data !== "object") return null;
  const { pair, price, publishTime } = data as {
    pair?: unknown;
    price?: unknown;
    publishTime?: unknown;
  };
  if (typeof pair !== "string" || pair === "") return null;
  if (typeof price !== "string" || !WIRE_DECIMAL.test(price)) return null;
  if (typeof publishTime !== "number" || !Number.isFinite(publishTime)) return null;
  return { pair, price, publishTime };
}

export function subscribeMessage(symbols: readonly string[]): string {
  return JSON.stringify({ type: "subscribe", topics: symbols.map(priceTopic) });
}

export const PING_MESSAGE = JSON.stringify({ type: "ping" });

// Keepalive and reconnect cadence per the gateway's guidance (~25s ping).
export const STREAM_PING_MS = 25_000;
export const STREAM_RECONNECT_MS = 2_000;

// REST is the authoritative fallback when the stream gateway is unavailable.
// Do not keep reconnecting indefinitely from every open tab: after an initial
// failure we make one backoff retry, then leave prices to the REST poller.
export const STREAM_MAX_RECONNECTS = 1;

// A frame this recent means the stream is delivering and REST polling can
// slow to a background safety net.
export const STREAM_FRESH_MS = 10_000;
