"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, erc20Abi, http } from "viem";
import { base } from "viem/chains";

// Reads go to Base's default public RPC. Block numbers and view calls don't
// need the premium key (that stays server-side for writes/sponsorship), and a
// public read is enough to know when to refresh on-chain-derived state.
const client = createPublicClient({ chain: base, transport: http() });

// One-shot ERC-20 balance read on Base, for flows that verify a delivery
// on-chain themselves (e.g. a swap's received tokens) instead of waiting on a
// server attestation.
export function readBaseTokenBalance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

// The Base chain tip, polled every ~4s. Consumers watch this to invalidate
// queries that mirror on-chain state (balances, vault winnings) so they refresh
// within a block of any change instead of on a slow fixed poll.
export function useBaseBlockNumber() {
  return useQuery<bigint>({
    queryKey: ["base-block"],
    queryFn: () => client.getBlockNumber(),
    refetchInterval: 4000,
    staleTime: 3000,
    refetchOnWindowFocus: true,
  });
}

// Invalidates the given query keys on every new Base block, so balances and
// winnings react to a deposit, withdrawal, wager or claim within ~2s instead of
// waiting for their own long poll. Enable it only where those balances are
// shown, so idle pages don't poll the chain.
export function useInvalidateOnBlock(
  queryKeys: readonly (readonly unknown[])[],
  enabled = true
): void {
  const queryClient = useQueryClient();
  const { data: blockNumber } = useBaseBlockNumber();

  useEffect(() => {
    if (!enabled || blockNumber === undefined) return;
    for (const queryKey of queryKeys) {
      queryClient.invalidateQueries({ queryKey });
    }
    // queryKeys is a stable literal from the caller; block ticks drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, enabled, queryClient]);
}
