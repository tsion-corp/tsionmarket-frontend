"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { base } from "viem/chains";
import { publicClientForChain } from "@/lib/trade/receipt";

// Keep direct Base reads on the same authenticated ZeroDev-backed route as the
// rest of the app instead of letting viem select a public chain default.
const client = publicClientForChain(base.id);

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

// The Base chain tip, polled every ~10s. Consumers watch this to invalidate
// queries that mirror on-chain state (balances, vault winnings) so they refresh
// shortly after a change without keeping an RPC poll alive on idle screens.
export function useBaseBlockNumber(enabled = true) {
  return useQuery<bigint>({
    queryKey: ["base-block"],
    queryFn: () => client.getBlockNumber(),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    staleTime: 8_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  });
}

// Invalidates direct Base contract reads on new blocks. Do not use this for
// indexed multi-chain APIs such as portfolio discovery: a block tick there
// turns one cheap chain read into several expensive provider requests.
export function useInvalidateOnBlock(
  queryKeys: readonly (readonly unknown[])[],
  enabled = true,
  minIntervalMs = 0
): void {
  const queryClient = useQueryClient();
  const shouldPoll = enabled && queryKeys.length > 0;
  const { data: blockNumber } = useBaseBlockNumber(shouldPoll);
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!shouldPoll || blockNumber === undefined) return;
    const now = Date.now();
    if (now - lastRunRef.current < minIntervalMs) return;
    lastRunRef.current = now;
    for (const queryKey of queryKeys) {
      queryClient.invalidateQueries({ queryKey });
    }
    // queryKeys is a stable literal from the caller; block ticks drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, shouldPoll, queryClient, minIntervalMs]);
}
