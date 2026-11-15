"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { devicePinEnabled } from "../lib/wallet-flow";

/** Whether this device has a PIN for the wallet. Read once, and again after it is set or removed. */
export function useDevicePin(uid: string | null | undefined, walletId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = ["devicePin", uid ?? "", walletId ?? ""] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => devicePinEnabled(uid as string, walletId as string),
    enabled: Boolean(uid && walletId),
    staleTime: 0,
    retry: false,
  });
  return {
    enabled: query.data === true,
    loading: query.isPending && Boolean(uid && walletId),
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}
