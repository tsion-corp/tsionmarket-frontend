"use client";

import { useQuery } from "@tanstack/react-query";
import { VAULT_KEYS } from "@/features/casino/lib/last-standing/keys";
import { DEFAULT_SPLIT_BPS, type SplitBps } from "@/features/casino/lib/last-standing/split";
import { fetchVaultConfig } from "@/features/casino/lib/vault-api";

// The contract's tunables the screens need: the floor a new game's stake has
// to clear, how a settled pot is split, and how long a round runs. The owner
// can retune all of them, so they are read rather than assumed, but they
// change rarely, so one read serves five minutes. The service reads them from
// the contract and caches them; the browser makes no contract read of its own.
const PARAMS_STALE_MS = 5 * 60_000;

/**
 * The floor, the split and the round length, shared by everything that
 * quotes a stake or a payout. `floorWei` stays null until read, and
 * `floorFailed` is kept apart from "not loaded yet" so a failed read never
 * masquerades as a zero floor. The split falls back to the deployment
 * values, which the contract has carried since launch.
 */
export function useVaultParams(): {
  floorWei: bigint | null;
  floorFailed: boolean;
  split: SplitBps;
  timerSeconds: number | null;
} {
  const query = useQuery({
    queryKey: VAULT_KEYS.params,
    queryFn: fetchVaultConfig,
    staleTime: PARAMS_STALE_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const config = query.data;
  return {
    floorWei: config ? BigInt(config.minStartStakeWei) : null,
    floorFailed: query.isError,
    split: config ? { winner: config.winnerBps, starter: config.starterBps } : DEFAULT_SPLIT_BPS,
    timerSeconds: config?.timerSeconds ?? null,
  };
}
