"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSwiss,
  defaultPlayerName,
  fetchSwiss,
  fetchSwissList,
  joinSwiss,
  organizerWalletMatches,
  reconcileSwiss,
  seatedName,
  startNextSwissRound,
  withdrawSwiss,
  type SwissDetail,
  type SwissSummary,
} from "@/lib/casino/api/swiss";
import { parseTimeControl } from "@/lib/casino/api/chess-wire";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import type { ChessTimeControl } from "@/lib/casino/api/types";

// Like the rest of chess, tournaments have no socket, so polling is the live
// path. The list can lag a little; a detail page someone is playing from
// cannot, since it is where "the round is over, start the next" shows up.
const LIST_POLL_MS = 10_000;
const DETAIL_POLL_MS = 5_000;

export const SWISS_KEYS = {
  list: ["casino", "chess", "swiss", "list"] as const,
  detail: (id: string) => ["casino", "chess", "swiss", "detail", id] as const,
};

function requireWallet(address: string | null): string {
  if (!address) throw new Error("Connect your wallet to play.");
  return address;
}

// The display name this wallet joined a tournament under. The service knows
// players only by that name, so it is remembered per tournament and wallet;
// losing it (another device, cleared storage) falls back to the derived
// default name, which is also what the join form suggests.
function nameStorageKey(tournamentId: string, wallet: string): string {
  return `ws.chess.swiss.name.${tournamentId}.${wallet.toLowerCase()}`;
}

function recallJoinedName(tournamentId: string, wallet: string | null): string | null {
  if (!wallet || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(nameStorageKey(tournamentId, wallet));
  } catch {
    return null;
  }
}

function rememberJoinedName(tournamentId: string, wallet: string | null, name: string): void {
  if (!wallet || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(nameStorageKey(tournamentId, wallet), name);
  } catch {
    // Storage being unavailable only costs the reminder, not the seat.
  }
}

export function useSwissList() {
  const query = useQuery({
    queryKey: SWISS_KEYS.list,
    queryFn: fetchSwissList,
    refetchInterval: LIST_POLL_MS,
  });

  return {
    tournaments: (query.data ?? []) as SwissSummary[],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

export interface CreateSwissFormInput {
  name: string;
  nbRounds: number;
  timeControl: ChessTimeControl;
  password?: string;
  forbiddenPairings?: string;
}

export function useCreateSwiss() {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();

  return useMutation({
    mutationFn: (input: CreateSwissFormInput) => {
      const address = requireWallet(wallet.address);
      const { initialSeconds, incrementSeconds } = parseTimeControl(input.timeControl);
      return createSwiss({
        organizer: defaultPlayerName(address),
        name: input.name,
        nbRounds: input.nbRounds,
        initialSeconds,
        incrementSeconds,
        password: input.password,
        forbiddenPairings: input.forbiddenPairings,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SWISS_KEYS.list });
    },
  });
}

// One tournament, with everything the detail screen acts on: the seat this
// wallet holds (by display name), whether it is the organizer, and the
// join / withdraw / next-round writes, each of which returns the fresh detail
// that replaces the cached one.
export function useSwissTournament(tournamentId: string | null) {
  const queryClient = useQueryClient();
  const wallet = useCasinoWallet();
  // Bumped after a join so the remembered name is re-read without a reload.
  const [nameVersion, setNameVersion] = useState(0);

  const query = useQuery({
    queryKey: SWISS_KEYS.detail(tournamentId ?? "none"),
    queryFn: () => fetchSwiss(tournamentId as string),
    enabled: !!tournamentId,
    refetchInterval: (q) => (q.state.data?.state === "finished" ? false : DETAIL_POLL_MS),
  });

  const detail = query.data;

  const yourName = useMemo(() => {
    void nameVersion;
    if (!detail || !tournamentId) return null;
    return seatedName(detail, recallJoinedName(tournamentId, wallet.address), wallet.address);
  }, [detail, tournamentId, wallet.address, nameVersion]);

  const isOrganizer = !!detail && organizerWalletMatches(detail.organizer, wallet.address);

  const applyDetail = (next: SwissDetail) => {
    queryClient.setQueryData(SWISS_KEYS.detail(next.id), next);
    void queryClient.invalidateQueries({ queryKey: SWISS_KEYS.list });
  };

  const join = useMutation({
    mutationFn: ({ name, password }: { name: string; password?: string }) =>
      joinSwiss(tournamentId as string, {
        name,
        walletAddress: requireWallet(wallet.address),
        password,
      }),
    onSuccess: (next, { name }) => {
      rememberJoinedName(tournamentId as string, wallet.address, name);
      setNameVersion((v) => v + 1);
      applyDetail(next);
    },
  });

  const withdraw = useMutation({
    mutationFn: ({ forfeit }: { forfeit: boolean }) =>
      withdrawSwiss(tournamentId as string, {
        name: yourName as string,
        walletAddress: requireWallet(wallet.address),
        forfeit,
      }),
    onSuccess: applyDetail,
  });

  const nextRound = useMutation({
    // manualPairings is an optional organizer override; omitted, the service
    // pairs automatically with the bundled engine.
    mutationFn: (manualPairings?: string) =>
      startNextSwissRound(
        tournamentId as string,
        (detail as SwissDetail).organizer,
        manualPairings
      ),
    onSuccess: applyDetail,
  });

  const reconcile = useMutation({
    mutationFn: () => reconcileSwiss(tournamentId as string, (detail as SwissDetail).organizer),
    onSuccess: applyDetail,
  });

  return {
    detail,
    yourName,
    isOrganizer,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    join: join.mutateAsync,
    joining: join.isPending,
    withdraw: withdraw.mutateAsync,
    withdrawing: withdraw.isPending,
    startNextRound: nextRound.mutateAsync,
    startingRound: nextRound.isPending,
    reconcile: reconcile.mutateAsync,
    reconciling: reconcile.isPending,
  };
}
