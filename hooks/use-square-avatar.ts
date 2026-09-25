"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { fetchSquareMe } from "@/lib/api/market-square";
import { queryKeys } from "@/lib/query-keys";

/**
 * The picture the player set on Market Square, for the account chrome here.
 *
 * One identity across the ecosystem: the square authenticates with the same
 * Decane session this app holds, and keys its profile on the same Decane user
 * id, so a picture set there is already this person's picture. Reading it is what
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
  return useSquareMe()?.avatarUrl ?? null;
}

/**
 * What `SquareAvatar` seeds its drawn fallback with: the profile's id on the
 * square, which is what the square itself seeds with — so the two draw the
 * same face. Before the profile has been read, the wallet, so the chrome
 * never draws from an empty seed.
 */
export function useSquareSeed(): string {
  const { evmAddress } = useAuthSession();
  return useSquareMe()?.id ?? evmAddress ?? "";
}

function useSquareMe() {
  const { ready, authenticated } = useAuthSession();

  const { data } = useQuery({
    // Shared with the Square page's own read, so the two are one request.
    queryKey: queryKeys.marketSquare.me(),
    queryFn: fetchSquareMe,
    enabled: ready && authenticated,
    staleTime: AVATAR_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return data ?? null;
}
