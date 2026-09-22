"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { fetchSquareMe } from "@/lib/api/market-square";
import { queryKeys } from "@/lib/query-keys";

/**
 * The picture the player set on Market Square, for the account chrome here.
 *
 * One identity across the ecosystem: the square authenticates with the same
 * Privy session this app holds, and keys its profile on the same Privy DID, so
 * a picture set there is already this person's picture. Reading it is what
 * stops Ark drawing a generated pattern for somebody who has a face on the
 * other deployment.
 *
 * Null is the ordinary answer, not a failure: the square creates a profile row
 * on the first authenticated read but never STORES an avatar on it, so anyone
 * who has not uploaded one reads as null here. The face they see on the square
 * in that case is drawn client-side from a seeded hash of their identity, and
 * `SquareAvatar` draws the very same one from the very same seed — which is
 * the whole point. A null here is not "no picture", it is "the seeded one".
 *
 * Not retried, and not refetched on focus. A missing picture costs nothing
 * beyond the fallback that is already there, so it must never cost a retry
 * storm on a surface that is drawn on every page.
 */
const AVATAR_STALE_MS = 5 * 60_000;

export function useSquareAvatar(): string | null {
  const { ready, authenticated } = usePrivy();

  const { data } = useQuery({
    // Shared with the Square page's own read, so the two are one request.
    queryKey: queryKeys.marketSquare.me(),
    queryFn: fetchSquareMe,
    enabled: ready && authenticated,
    staleTime: AVATAR_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return data?.avatarUrl ?? null;
}
