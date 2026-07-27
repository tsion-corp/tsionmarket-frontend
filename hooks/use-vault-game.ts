"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchVaultActivities,
  fetchVaultStatus,
  fetchVaultWinners,
  type VaultActivity,
  type VaultActivityAction,
  type VaultGameStatus,
  type VaultWinner,
} from "@/lib/vault-api";

const STATUS_KEY = ["vault-status"] as const;
const ACTIVITIES_KEY = ["vault-activities"] as const;
const WINNERS_KEY = ["vault-winners"] as const;

// The realtime hub is a generic pub/sub gateway: open one socket at the root
// and subscribe to this game's topic. It does not replay state on subscribe,
// so we bootstrap from the REST snapshot (below) and apply socket frames as
// deltas.
const GAME_TOPIC = "vault:king-of-night";

// The socket is the live path — the server pushes gameState roughly every 10s
// and again after every wager/settle. REST is only a fallback while the socket
// is down; the gateway rate-limits (~100/min shared), so keep it slow and only
// poll when disconnected.
const FALLBACK_POLL_MS = 15_000;
// The feed (activities/winners) changes less often than status, so poll it
// slower when the socket is down. Total disconnected REST load stays well
// under the gateway's ~100/min shared budget.
const FALLBACK_FEED_POLL_MS = 30_000;
const RECONNECT_MS = 2_000;
const PING_MS = 25_000;
const MAX_ACTIVITIES = 30;

interface RawActivityFrame {
  action: VaultActivityAction;
  address: string;
  amountWei: string;
  transactionHash: string;
}

interface WinnerDeclaredFrame {
  winner: string;
  prize: { amount: string };
}

export interface LastWinner {
  address: string;
  prizeWei: string;
}

// Live state for the Last Standing vault game: a WebSocket connection feeds
// the same react-query caches a plain REST poll would, so every consumer
// just reads useQuery-shaped state regardless of which source is currently
// updating it. Falls back to REST-only polling if the socket never connects.
export function useVaultGame() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastWinner, setLastWinner] = useState<LastWinner | null>(null);

  const status = useQuery<VaultGameStatus>({
    queryKey: STATUS_KEY,
    queryFn: fetchVaultStatus,
    staleTime: FALLBACK_POLL_MS,
    // When the socket is live it pushes gameState; poll only as a fallback
    // while disconnected, so we don't burn the shared REST rate limit.
    refetchInterval: connected ? false : FALLBACK_POLL_MS,
  });
  // When the socket is down these carry the live feed, so poll them on a slow
  // fallback; when it's up, socket frames drive them and we stop polling.
  const activities = useQuery<VaultActivity[]>({
    queryKey: ACTIVITIES_KEY,
    queryFn: fetchVaultActivities,
    staleTime: FALLBACK_POLL_MS,
    refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS,
  });
  const winners = useQuery<VaultWinner[]>({
    queryKey: WINNERS_KEY,
    queryFn: fetchVaultWinners,
    staleTime: 60_000,
    refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS,
  });

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_VAULT_WS_URL;
    if (!url) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let closedByUs = false;
    let everConnected = false;

    const connect = () => {
      socket = new WebSocket(url);

      socket.onopen = () => {
        setConnected(true);
        socket?.send(JSON.stringify({ type: "subscribe", topics: [GAME_TOPIC] }));
        // The hub doesn't replay state on subscribe, so on every reconnect
        // resync the snapshot from REST; the very first connect already has it
        // from the queries above.
        if (everConnected) {
          void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
          void queryClient.invalidateQueries({ queryKey: ACTIVITIES_KEY });
          void queryClient.invalidateQueries({ queryKey: WINNERS_KEY });
        }
        everConnected = true;
        pingTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_MS);
      };

      socket.onmessage = (event) => {
        let frame: { type: string; data: unknown };
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }

        // Control acks (welcome/subscribed/unsubscribed/pong/error) carry no
        // game data; only the three game frames update state.
        if (frame.type === "gameState") {
          queryClient.setQueryData<VaultGameStatus>(STATUS_KEY, frame.data as VaultGameStatus);
        } else if (frame.type === "playerActivity") {
          const incoming =
            (frame.data as { activities?: RawActivityFrame[] } | undefined)?.activities ?? [];
          if (incoming.length === 0) return;
          const now = new Date().toISOString();
          queryClient.setQueryData<VaultActivity[]>(ACTIVITIES_KEY, (prev = []) => {
            const seen = new Set(prev.map((p) => p.transactionHash));
            const mapped: VaultActivity[] = incoming
              .filter((a) => !seen.has(a.transactionHash))
              .map((a) => ({
                id: a.transactionHash,
                action: a.action,
                address: a.address,
                amountWei: a.amountWei,
                transactionHash: a.transactionHash,
                createdAt: now,
              }));
            return [...mapped, ...prev].slice(0, MAX_ACTIVITIES);
          });
        } else if (frame.type === "winnerDeclared") {
          const data = frame.data as WinnerDeclaredFrame;
          setLastWinner({ address: data.winner, prizeWei: data.prize.amount });
          void queryClient.invalidateQueries({ queryKey: WINNERS_KEY });
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        socket = null;
        if (!closedByUs) reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      socket?.close();
    };
  }, [queryClient]);

  return {
    status: status.data ?? null,
    statusLoading: status.isPending,
    statusError: status.isError,
    activities: activities.data ?? [],
    winners: winners.data ?? [],
    winnersLoading: winners.isPending,
    connected,
    lastWinner,
  };
}
