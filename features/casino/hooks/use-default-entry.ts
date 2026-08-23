"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrices } from "@/hooks/use-prices";
import { readMinStartStake } from "@/features/casino/hooks/use-vault-actions";
import { defaultEntryUsd } from "@/features/casino/lib/last-standing/stake";

// The one answer to "what does opening a game cost right now", shared by the
// lobby button and the start sheet so they can never disagree. The contract's
// floor is read (a stake under it reverts) and priced at the live ETH price;
// `usd` stays null until both are known, and `floorFailed` is kept apart from
// "not loaded yet" so a failed read never masquerades as a zero floor.
export function useDefaultEntry(): {
  usd: number | null;
  floorWei: bigint | null;
  floorFailed: boolean;
  ethPrice: number;
} {
  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;
  const floor = useQuery({
    queryKey: ["vault", "minStartStake"],
    queryFn: readMinStartStake,
    staleTime: 60_000,
    retry: 1,
  });
  const floorWei = floor.data ?? null;
  return {
    usd: defaultEntryUsd(floorWei, ethPrice),
    floorWei,
    floorFailed: floor.isError,
    ethPrice,
  };
}
