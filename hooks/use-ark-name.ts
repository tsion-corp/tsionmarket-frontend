"use client";

import { useQuery } from "@tanstack/react-query";
import { reverseResolveArkAddress } from "@/lib/bns/api";

// The wallet's own Ark ID, or null. Shares the ["bns","reverse",wallet] cache
// with the Kash card, the send modal and the Ark ID page, so one lookup serves
// every surface. Only a verified .ark reverse record counts: an unverified one
// is not pointed at this wallet yet.
export function useArkName(wallet: string | null | undefined): string | null {
  const reverse = useQuery({
    queryKey: ["bns", "reverse", wallet],
    queryFn: () => reverseResolveArkAddress(wallet as string),
    enabled: Boolean(wallet),
    staleTime: 60_000,
    retry: false,
  });
  return reverse.data?.verified && reverse.data.name?.toLowerCase().endsWith(".ark")
    ? reverse.data.name
    : null;
}
