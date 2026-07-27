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

// The socket is the live path — the server pushes gameState roughly every
// 10s and again after every wager/settle. This poll is only a fallback for
// when the socket is down or hasn't connected yet, so it can stay slow.
const FALLBACK_POLL_MS = 15_000;
const RECONNECT_MS = 2_000;
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
    refetchInterval: FALLBACK_POLL_MS,
  });
  const activities = useQuery<VaultActivity[]>({
    queryKey: ACTIVITIES_KEY,
    queryFn: fetchVaultActivities,
    staleTime: FALLBACK_POLL_MS,
  });
  const winners = useQuery<VaultWinner[]>({
    queryKey: WINNERS_KEY,
    queryFn: fetchVaultWinners,
    staleTime: 60_000,
  });

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_VAULT_WS_URL;
    if (!url) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;

    const connect = () => {
      socket = new WebSocket(url);

      socket.onopen = () => {
        setConnected(true);
        socket?.send(JSON.stringify({ type: "getGameState" }));
      };

      socket.onmessage = (event) => {
        let frame: { type: string; data: unknown };
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }

        if (frame.type === "gameState") {
          queryClient.setQueryData<VaultGameStatus>(STATUS_KEY, frame.data as VaultGameStatus);
        } else if (frame.type === "playerActivity") {
          const incoming =
            (frame.data as { activities?: RawActivityFrame[] } | undefined)?.activities ?? [];
          if (incoming.length === 0) return;
          const now = new Date().toISOString();
          queryClient.setQueryData<VaultActivity[]>(ACTIVITIES_KEY, (prev = []) => {
            const mapped: VaultActivity[] = incoming.map((a, i) => ({
              id: `${a.transactionHash}-${i}`,
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
        socket = null;
        if (!closedByUs) reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
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
