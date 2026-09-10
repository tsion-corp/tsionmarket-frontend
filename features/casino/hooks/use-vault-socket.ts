"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { VaultActivity, VaultGame } from "@/features/casino/lib/vault-api";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import {
  noteSettlement,
  settlementFromFrame,
} from "@/features/casino/lib/last-standing/settlements";
import { sortGameRows } from "@/features/casino/lib/vault-game";
import type { ChainGame } from "@/features/casino/lib/vault-game";
import { vaultLog } from "@/features/casino/lib/last-standing/log";

// One socket for the whole feature, however many components are listening.
//
// The lobby and a game screen both want live frames, and a per-component socket
// would open two connections, double the traffic and make the two views
// disagree while one lagged the other. This module keeps a single connection,
// ref-counted: it opens on the first subscriber and closes after the last one
// leaves.
//
// Frames are applied straight into the react-query caches with setQueryData, so
// nothing refetches on a push and consumers just read useQuery-shaped state
// without knowing whether REST or the socket last wrote it.

// Reconnects back off: two seconds, then doubling to half a minute. On a bad
// connection a fixed two-second retry is a request every two seconds that
// cannot succeed, and it competes with the REST polls that can. The counter
// resets the moment a connection opens.
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
let reconnectAttempts = 0;

/** How long to wait before reconnect attempt `attempt` (0 is the first). */
export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
}
const PING_MS = 25_000;
const MAX_ACTIVITIES = 30;

let socket: WebSocket | null = null;
let refCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let everConnected = false;

// Connection state lives here rather than in each consumer's useState, so a
// component that mounts after the socket opened reads the truth on its first
// render instead of correcting itself in an effect.
let isConnected = false;
const statusListeners = new Set<() => void>();

function setConnected(value: boolean): void {
  if (isConnected === value) return;
  isConnected = value;
  for (const listener of statusListeners) listener();
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

// Always disconnected on the server, so the first client render matches.
const statusServerSnapshot = () => false;

interface GameStartedFrame {
  gameId: number;
  starter: string;
  minWagerWei: string;
  potWei: string;
  endTime: number;
}

interface WagerPlacedFrame {
  gameId: number;
  player: string;
  amountWei: string;
  newPotWei: string;
  newEndTime: number;
  transactionHash?: string;
  /** Block time, unix seconds. */
  timestamp?: number;
}

// The split amounts ride along on the frame too, as wei; the winners feed is
// refetched for the priced row rather than built from them here.
interface GameSettledFrame {
  gameId: number;
  winner: string;
  starter: string;
  potWei?: string;
  toWinnerWei?: string;
  toTreasuryWei?: string;
  toStarterWei?: string;
  transactionHash?: string;
}

// The pot and wager arrive as wei on the socket but as USD-enriched Money over
// REST. Rather than invent a USD figure the socket cannot know, the amount is
// converted and the USD fields are carried over from the value already on
// screen, scaled by how much the pot grew. The next REST read corrects it.
function weiToEth(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const fraction = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : `${whole}`;
  } catch {
    return "0";
  }
}

function scaledUsd(previous: VaultGame["pot"], nextAmount: string): VaultGame["pot"] {
  const before = Number(previous.amount);
  const after = Number(nextAmount);
  const usd = before > 0 && Number.isFinite(after) ? (previous.usdValue / before) * after : 0;
  return {
    amount: nextAmount,
    tokenSymbol: previous.tokenSymbol,
    usdValue: usd,
    formattedUsd: `$${usd.toFixed(2)}`,
  };
}

function applyWager(client: QueryClient, frame: WagerPlacedFrame): void {
  const patch = (game: VaultGame): VaultGame => ({
    ...game,
    king: frame.player,
    endTime: frame.newEndTime,
    timeRemaining: Math.max(0, frame.newEndTime - Math.floor(Date.now() / 1000)),
    pot: scaledUsd(game.pot, weiToEth(frame.newPotWei)),
  });

  client.setQueryData<VaultGame>(VAULT_KEYS.game(frame.gameId), (game) =>
    game ? patch(game) : game
  );
  client.setQueryData<VaultGame[]>(VAULT_KEYS.games, (games) =>
    games?.map((game) => (game.gameId === frame.gameId ? patch(game) : game))
  );
}

function applySettled(client: QueryClient, frame: GameSettledFrame): void {
  const settle = (game: VaultGame): VaultGame => ({
    ...game,
    settled: true,
    active: false,
    timeRemaining: 0,
    king: frame.winner,
  });
  client.setQueryData<VaultGame>(VAULT_KEYS.game(frame.gameId), (game) =>
    game ? settle(game) : game
  );
  // Out of the lobby: it only lists games still accepting joins.
  client.setQueryData<VaultGame[]>(VAULT_KEYS.games, (games) =>
    games?.filter((game) => game.gameId !== frame.gameId)
  );
  void client.invalidateQueries({ queryKey: VAULT_KEYS.winners });
  void client.invalidateQueries({ queryKey: VAULT_KEYS.activities });
  noteSettlement(settlementFromFrame(frame));
}

function applyActivity(client: QueryClient, entry: VaultActivity): void {
  client.setQueryData<VaultActivity[]>(VAULT_KEYS.activities, (prev = []) =>
    prev.some((p) => p.transactionHash === entry.transactionHash)
      ? prev
      : [entry, ...prev].slice(0, MAX_ACTIVITIES)
  );
}

// The hub numbers every frame on a topic (`revision`) and tells a subscriber
// the current number on `subscribed`. A frame that skips a number means one
// was lost between hub and browser, and the caches are resynced from REST
// once, which costs nothing on the chain. Module state, like the socket
// itself: one connection, one counter.
let lastRevision: number | null = null;

// Exported for the tests, which run many connections through one module.
export function resetRevisionTracking(): void {
  lastRevision = null;
}

function trackRevision(client: QueryClient, revision: unknown): void {
  if (typeof revision !== "number") return;
  if (lastRevision !== null && revision > lastRevision + 1) {
    vaultLog("socket: revision gap, resyncing from REST", { from: lastRevision, to: revision });
    void client.invalidateQueries({ queryKey: VAULT_KEYS.all });
  }
  lastRevision = revision;
}

// A frame is an upstream payload and is validated here, at the boundary,
// before it can reach the cache and the components reading it. Exported for
// its tests; the socket wires it up below.
export function handleVaultFrame(client: QueryClient, raw: string): void {
  let frame: { type: string; data: unknown; revision?: unknown };
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }

  trackRevision(client, frame.revision);

  switch (frame.type) {
    case "subscribed": {
      const versions = (frame.data as { versions?: Record<string, unknown> } | null)?.versions;
      const version = versions?.[VAULT_TOPIC];
      if (typeof version === "number") lastRevision = version;
      vaultLog("socket: subscribed", { version: lastRevision });
      return;
    }
    case "activeGames": {
      const games = (frame.data as { games?: unknown } | null | undefined)?.games;
      // The periodic lobby snapshot is authoritative, so it replaces rather
      // than merges: a game missing from it has settled or gone away. Only a
      // real array replaces it: the hub has sent `games: {}`, and written to
      // the cache as-is that took the whole lobby down at `games.map`. A
      // malformed snapshot is dropped and the last good one stands; the
      // polled REST read keeps the lobby fresh regardless.
      if (Array.isArray(games)) {
        // The hub describes a game in the contract's shape (potWei,
        // minWagerWei), which is what the chain reader produces; those rows
        // go to the chain list, where mergeGames prices them. An API-shaped
        // row goes to the indexed list. Both lists are replaced, since the
        // snapshot is authoritative for both.
        const { api, chain, dropped } = sortGameRows(games);
        vaultLog("socket: activeGames", {
          api: api.map((g) => g.gameId),
          chain: chain.map((g) => g.gameId),
          dropped,
        });
        if (dropped > 0) {
          console.warn(`[vault] dropped ${dropped} activeGames row(s) in no known shape`);
        }
        client.setQueryData<VaultGame[]>(VAULT_KEYS.games, api);
        client.setQueryData<ChainGame[]>(VAULT_KEYS.chainGames, chain);
      } else if (games !== undefined) {
        console.warn("[vault] ignored an activeGames frame whose games is not an array");
      }
      return;
    }
    case "gameStarted": {
      const data = frame.data as GameStartedFrame;
      vaultLog("socket: gameStarted", { gameId: data?.gameId, starter: data?.starter });
      // A brand-new game has no USD figures on the socket, and the indexer
      // trails the chain by a few blocks, so pull the enriched row rather than
      // synthesising one that would flicker when the real one arrives.
      void client.invalidateQueries({ queryKey: VAULT_KEYS.games });
      void client.invalidateQueries({ queryKey: VAULT_KEYS.activities });
      if (data?.gameId) void client.invalidateQueries({ queryKey: VAULT_KEYS.game(data.gameId) });
      return;
    }
    case "wagerPlaced": {
      const data = frame.data as WagerPlacedFrame;
      if (!data?.gameId) return;
      vaultLog("socket: wagerPlaced", { gameId: data.gameId, player: data.player });
      applyWager(client, data);
      // The hub stamps every frame with its transaction and block time, so
      // the row it makes is the row the feed will index, and deduplicates
      // against it. An older hub without the stamp gets a synthetic key.
      applyActivity(client, {
        id: data.transactionHash ?? data.amountWei + data.player,
        gameId: data.gameId,
        action: "joined",
        address: data.player,
        amountWei: data.amountWei,
        transactionHash: data.transactionHash ?? data.amountWei + data.player,
        createdAt: new Date(
          typeof data.timestamp === "number" ? data.timestamp * 1000 : Date.now()
        ).toISOString(),
      });
      return;
    }
    case "gameSettled": {
      const data = frame.data as GameSettledFrame;
      vaultLog("socket: gameSettled", { gameId: data?.gameId, winner: data?.winner });
      if (data?.gameId) applySettled(client, data);
      return;
    }
    default:
      // Control acks (welcome/subscribed/pong/error) carry no game data.
      return;
  }
}

// Every handler below acts on `ws`, the socket it was attached to, and does
// nothing once that socket is no longer the shared one. A socket that was
// replaced (closed by the last subscriber leaving, then a new one opened by
// the next arriving in the same tick) still gets its close event later; it
// must not null out the replacement's reference, schedule a reconnect the
// replacement makes redundant, or send through the replacement while it is
// still connecting.
function open(client: QueryClient): void {
  const url = process.env.NEXT_PUBLIC_VAULT_WS_URL;
  if (!url || socket) return;

  const ws = new WebSocket(url);
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;
    setConnected(true);
    reconnectAttempts = 0;
    vaultLog("socket: open", { resync: everConnected });
    ws.send(JSON.stringify({ type: "subscribe", topics: [VAULT_TOPIC] }));
    // The hub does not replay state on subscribe, so every reconnect resyncs
    // from REST; the first connect already has it from the queries themselves.
    if (everConnected) {
      void client.invalidateQueries({ queryKey: VAULT_KEYS.all });
    }
    everConnected = true;
    pingTimer = setInterval(() => {
      if (socket === ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_MS);
  };

  ws.onmessage = (event) => {
    if (socket === ws) handleVaultFrame(client, event.data as string);
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    setConnected(false);
    vaultLog("socket: closed");
    lastRevision = null;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    // Only chase a reconnect while something is still listening. Offline,
    // there is no point trying until the browser says the network is back;
    // the REST polls carry the page meanwhile.
    if (refCount > 0) {
      const delay = reconnectDelay(reconnectAttempts);
      reconnectAttempts += 1;
      vaultLog("socket: reconnect scheduled", { inMs: delay, attempt: reconnectAttempts });
      reconnectTimer = setTimeout(() => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          const onOnline = () => {
            window.removeEventListener("online", onOnline);
            if (refCount > 0) open(client);
          };
          window.addEventListener("online", onOnline);
          return;
        }
        open(client);
      }, delay);
    }
  };

  ws.onerror = () => ws.close();
}

function close(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  const current = socket;
  socket = null;
  if (!current) return;
  // Its events are nobody's business any more: the close that follows must
  // not run the reconnect logic against whatever socket comes next.
  current.onopen = null;
  current.onmessage = null;
  current.onclose = null;
  current.onerror = null;
  current.close();
  setConnected(false);
}

export const VAULT_TOPIC = "vault:king-of-night";

/**
 * Joins the shared vault socket for as long as the component is mounted, and
 * reports whether it is currently connected.
 *
 * Every consumer shares one connection. The queries themselves poll as a
 * fallback while `connected` is false, which is why this returns it.
 */
export function useVaultSocket(): boolean {
  const queryClient = useQueryClient();
  const connected = useSyncExternalStore(subscribeStatus, () => isConnected, statusServerSnapshot);

  useEffect(() => {
    refCount += 1;
    open(queryClient);
    return () => {
      refCount -= 1;
      if (refCount === 0) {
        close();
        setConnected(false);
      }
    };
  }, [queryClient]);

  return connected;
}
