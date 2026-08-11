"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base } from "viem/chains";
import { useEvmSend } from "@/hooks/use-evm-send";
import { fetchClaimInfo } from "@/features/earn/lib/api/submissions";
import { encodeWithdraw } from "@/features/earn/lib/claim";

export const CLAIM_KEYS = {
  info: (listingId: string) => ["earn", "claim", listingId] as const,
};

// What this user can collect for a listing, read from the contract. Only asked
// for once winners are out; before that there is nothing to claim.
export function useClaimInfo(listingId: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: CLAIM_KEYS.info(listingId ?? "none"),
    queryFn: () => fetchClaimInfo(listingId as string),
    enabled: !!listingId && enabled,
  });

  return { info: query.data ?? null, isLoading: query.isLoading };
}

// Collects a released reward.
//
// The token comes from the service, never from the client: `withdraw` accepts
// any token address, and the native sentinel is a valid argument that collects
// a zero ETH balance instead of the reward.
export function useClaimReward(listingId: string) {
  const send = useEvmSend();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      escrowAddress,
      tokenAddress,
    }: {
      escrowAddress: string;
      tokenAddress: string;
    }) => {
      return send({
        to: escrowAddress as `0x${string}`,
        data: encodeWithdraw(tokenAddress),
        chainId: base.id,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAIM_KEYS.info(listingId) });
      void queryClient.invalidateQueries({ queryKey: ["earn", "submission"] });
    },
  });
}
