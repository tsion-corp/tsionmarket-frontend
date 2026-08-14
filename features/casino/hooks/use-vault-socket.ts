"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { VaultActivity, VaultGame } from "@/features/casino/lib/vault-api";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";

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

const RECONNECT_MS = 2_000;
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
}

interface GameSettledFrame {
  gameId: number;
  winner: string;
  starter: string;
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
}

function applyActivity(client: QueryClient, entry: VaultActivity): void {
  client.setQueryData<VaultActivity[]>(VAULT_KEYS.activities, (prev = []) =>
    prev.some((p) => p.transactionHash === entry.transactionHash)
      ? prev
      : [entry, ...prev].slice(0, MAX_ACTIVITIES)
  );
}

function handleFrame(client: QueryClient, raw: string): void {
  let frame: { type: string; data: unknown };
  try {
    frame = JSON.parse(raw);
  } catch {
    return;
  }

  switch (frame.type) {
    case "activeGames": {
      const games = (frame.data as { games?: VaultGame[] } | undefined)?.games;
      // The periodic lobby snapshot is authoritative, so it replaces rather
      // than merges: a game missing from it has settled or gone away.
      if (games) client.setQueryData<VaultGame[]>(VAULT_KEYS.games, games);
      return;
    }
    case "gameStarted": {
      const data = frame.data as GameStartedFrame;
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
      applyWager(client, data);
      applyActivity(client, {
        id: data.amountWei + data.player,
        action: "joined",
        address: data.player,
        amountWei: data.amountWei,
        transactionHash: data.amountWei + data.player,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    case "gameSettled": {
      const data = frame.data as GameSettledFrame;
      if (data?.gameId) applySettled(client, data);
      return;
    }
    default:
      // Control acks (welcome/subscribed/pong/error) carry no game data.
      return;
  }
}

function open(client: QueryClient): void {
  const url = process.env.NEXT_PUBLIC_VAULT_WS_URL;
  if (!url || socket) return;

  socket = new WebSocket(url);

  socket.onopen = () => {
    setConnected(true);
    socket?.send(JSON.stringify({ type: "subscribe", topics: [VAULT_TOPIC] }));
    // The hub does not replay state on subscribe, so every reconnect resyncs
    // from REST; the first connect already has it from the queries themselves.
    if (everConnected) {
      void client.invalidateQueries({ queryKey: VAULT_KEYS.all });
    }
    everConnected = true;
    pingTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, PING_MS);
  };

  socket.onmessage = (event) => handleFrame(client, event.data as string);

  socket.onclose = () => {
    setConnected(false);
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    // Only chase a reconnect while something is still listening.
    if (refCount > 0) reconnectTimer = setTimeout(() => open(client), RECONNECT_MS);
  };

  socket.onerror = () => socket?.close();
}

function close(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  const current = socket;
  socket = null;
  current?.close();
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
