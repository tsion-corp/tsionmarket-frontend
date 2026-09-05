"use client";

import { SubscriptionClient, WebSocketTransport, type ISubscription } from "@nktkas/hyperliquid";
import type {
  ActiveAssetCtxEvent,
  L2BookEvent,
  TradesEvent,
} from "@nktkas/hyperliquid/api/subscription";

// Direct client-to-Hyperliquid WebSocket for real-time market data (order
// book, trade tape, mark/oracle/funding) — no API key needed, so this
// bypasses app/api/ entirely and talks to Hyperliquid's own public endpoint
// straight from the browser. That's a deliberate architecture decision
// already on record in apps/perp's src/streaming/README.md (market data
// streaming is the client's job, not the backend's) — not a new exception
// being carved out here. apps/perp's own Hyperliquid WS connection
// (streaming/hyperliquid-user-events-stream.ts) is unrelated: a
// server-side-only subscription to the authenticated user's own fills, for
// database ingestion, never market data.
//
// @nktkas/hyperliquid does the actual subscription protocol — hand-rolling
// that is exactly what this codebase already avoids for signing (see
// hyperliquid-signer.ts's doc comment); the same reasoning applies here.
// `WebSocketTransport` reconnects and re-subscribes automatically
// (`resubscribe: true` by default).

const HYPERLIQUID_IS_TESTNET = process.env.NEXT_PUBLIC_HYPERLIQUID_IS_TESTNET === "true";

let readyClient: Promise<SubscriptionClient> | null = null;

// Lazy on purpose: never opens a socket at module-eval time (SSR safety).
// The first real subscribe() call is what actually connects — and MUST wait
// for the transport to finish connecting first. Confirmed directly against
// Hyperliquid's live WS (not just from docs): calling client.l2Book() etc.
// immediately after `new WebSocketTransport()`, without awaiting
// `transport.ready()`, is a real race — subscribe confirmations came back
// anywhere from ~1.3s to ~9.6s later in repeated tests, and outright timed
// out (10s) once. That's exactly what "order book/trades aren't live"
// looks like from the outside. Awaiting `ready()` once here, before the
// very first subscribe, made every attempt resolve in under 500ms.
function getReadyClient(): Promise<SubscriptionClient> {
  readyClient ??= (async () => {
    const transport = new WebSocketTransport({ isTestnet: HYPERLIQUID_IS_TESTNET });
    await transport.ready();
    return new SubscriptionClient({ transport });
  })().catch((error: unknown) => {
    // Never actually connected — drop the cached promise so the next
    // subscribe() call retries a fresh connection instead of permanently
    // reusing a dead one.
    readyClient = null;
    throw error;
  });
  return readyClient;
}

interface ChannelEntry<Event> {
  listeners: Set<(data: Event) => void>;
  subscription: Promise<ISubscription> | null;
}

// One upstream Hyperliquid subscription per (channel, coin), shared across
// however many components/hooks ask for the same feed — ref-counted by
// listener count so the last unsubscribe actually tears the upstream
// subscription down instead of leaking one per mounted component.
function createChannelRegistry<Event>(
  start: (
    client: SubscriptionClient,
    coin: string,
    dispatch: (data: Event) => void
  ) => Promise<ISubscription>
) {
  const entries = new Map<string, ChannelEntry<Event>>();

  return function subscribe(coin: string, listener: (data: Event) => void): () => void {
    let entry = entries.get(coin);
    if (!entry) {
      entry = { listeners: new Set(), subscription: null };
      entries.set(coin, entry);
    }
    const current = entry;
    current.listeners.add(listener);

    if (!current.subscription) {
      current.subscription = getReadyClient()
        .then((client) =>
          start(client, coin, (data) => {
            current.listeners.forEach((one) => one(data));
          })
        )
        .catch((error: unknown) => {
          // Never actually established — drop the cached entry so the next
          // subscribe() call retries instead of permanently reusing a dead
          // promise.
          if (entries.get(coin) === current) entries.delete(coin);
          throw error;
        });
    }

    return () => {
      current.listeners.delete(listener);
      if (current.listeners.size === 0 && entries.get(coin) === current) {
        entries.delete(coin);
        current.subscription?.then((sub) => sub.unsubscribe()).catch(() => {});
      }
    };
  };
}

const l2BookRegistry = createChannelRegistry<L2BookEvent>((c, coin, dispatch) =>
  c.l2Book({ coin }, dispatch)
);
const tradesRegistry = createChannelRegistry<TradesEvent>((c, coin, dispatch) =>
  c.trades({ coin }, dispatch)
);
const assetContextRegistry = createChannelRegistry<ActiveAssetCtxEvent>((c, coin, dispatch) =>
  c.activeAssetCtx({ coin }, dispatch)
);

/** Subscribe to L2 order book updates for one asset. Returns an unsubscribe function. */
export function subscribeL2Book(coin: string, listener: (data: L2BookEvent) => void): () => void {
  return l2BookRegistry(coin, listener);
}

/** Subscribe to the live trade tape for one asset. Returns an unsubscribe function. */
export function subscribeTrades(coin: string, listener: (data: TradesEvent) => void): () => void {
  return tradesRegistry(coin, listener);
}

/** Subscribe to mark/oracle/funding/volume context for one asset. Returns an unsubscribe function. */
export function subscribeAssetContext(
  coin: string,
  listener: (data: ActiveAssetCtxEvent) => void
): () => void {
  return assetContextRegistry(coin, listener);
}
