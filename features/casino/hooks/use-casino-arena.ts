"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createArena,
  fetchArena,
  fetchArenaList,
  joinArena,
  startArena,
  withdrawArena,
  type ArenaDetail,
  type ArenaSummary,
  type CreateArenaInput,
} from "@/features/casino/lib/api/arena";
import { defaultPlayerName, organizerWalletMatches } from "@/features/casino/lib/api/swiss";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";

const LIST_POLL_MS = 10_000;
const CREATED_POLL_MS = 3_000;
const STARTED_POLL_MS = 1_500;

export const ARENA_KEYS = {
  list: ["casino", "chess", "arena", "list"] as const,
  detail: (id: string, player: string) =>
    ["casino", "chess", "arena", "detail", id, player] as const,
};

function requireWallet(address: string | null): string {
  if (!address) throw new Error("Connect your wallet to join the tournament.");
  return address;
}

function joinedNameKey(arenaId: string, wallet: string): string {
  return `ws.chess.arena.name.${arenaId}.${wallet.toLowerCase()}`;
}

function recallJoinedName(arenaId: string, wallet: string | null): string | null {
  if (!wallet || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(joinedNameKey(arenaId, wallet));
  } catch {
    return null;
  }
}

function rememberJoinedName(arenaId: string, wallet: string, name: string): void {
  try {
    window.localStorage.setItem(joinedNameKey(arenaId, wallet), name);
  } catch {
    // The default wallet-derived name still recovers the seat when storage is unavailable.
  }
}

export function useArenaList() {
  const query = useQuery({
    queryKey: ARENA_KEYS.list,
    queryFn: fetchArenaList,
    refetchInterval: LIST_POLL_MS,
  });
  return {
    arenas: (query.data ?? []) as ArenaSummary[],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

export function useCreateArena() {
  const wallet = useCasinoWallet();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateArenaInput, "organizer">) =>
      createArena({
        ...input,
        organizer: defaultPlayerName(requireWallet(wallet.address)),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ARENA_KEYS.list }),
  });
}

export function useArenaTournament(arenaId: string) {
  const wallet = useCasinoWallet();
  const queryClient = useQueryClient();
  const countrySyncKey = useRef<string | null>(null);
  const defaultName = defaultPlayerName(wallet.address);
  const viewerName = recallJoinedName(arenaId, wallet.address) ?? defaultName;
  const detailKey = ARENA_KEYS.detail(arenaId, viewerName);
  const query = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchArena(arenaId, viewerName || undefined),
    refetchInterval: (state) => {
      if (state.state.data?.status === "finished") return false;
      return state.state.data?.status === "started" ? STARTED_POLL_MS : CREATED_POLL_MS;
    },
  });
  const detail = query.data as ArenaDetail | undefined;
  const applyDetail = (next: ArenaDetail) => {
    queryClient.setQueryData(ARENA_KEYS.detail(arenaId, next.me?.name ?? viewerName), next);
    queryClient.setQueryData(detailKey, next);
    void queryClient.invalidateQueries({ queryKey: ARENA_KEYS.list });
  };
  const join = useMutation({
    mutationFn: async () => {
      const address = requireWallet(wallet.address);
      const name = defaultPlayerName(address);
      const next = await joinArena(arenaId, { name, walletAddress: address });
      rememberJoinedName(arenaId, address, name);
      return next;
    },
    onSuccess: applyDetail,
  });
  const { mutate: syncCountry } = useMutation({
    mutationFn: async (name: string) => {
      const address = requireWallet(wallet.address);
      return joinArena(arenaId, { name, walletAddress: address });
    },
    onSuccess: applyDetail,
  });
  const withdraw = useMutation({
    mutationFn: () =>
      withdrawArena(arenaId, {
        name: detail?.me?.name ?? viewerName,
        walletAddress: requireWallet(wallet.address),
      }),
    onSuccess: applyDetail,
  });
  const start = useMutation({
    mutationFn: () => startArena(arenaId, detail?.organizer ?? ""),
    onSuccess: applyDetail,
  });

  useEffect(() => {
    const me = detail?.me;
    const address = wallet.address;
    if (!address || !me?.active || me.countryCode || detail?.status === "finished") return;

    const key = `${arenaId}:${address.toLowerCase()}`;
    if (countrySyncKey.current === key) return;
    countrySyncKey.current = key;
    syncCountry(me.name, {
      onError: () => {
        if (countrySyncKey.current === key) countrySyncKey.current = null;
      },
    });
  }, [arenaId, detail, syncCountry, wallet.address]);

  return {
    detail,
    isOrganizer: !!detail && organizerWalletMatches(detail.organizer, wallet.address),
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    join: join.mutateAsync,
    joining: join.isPending,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
    start: start.mutateAsync,
    starting: start.isPending,
  };
}
