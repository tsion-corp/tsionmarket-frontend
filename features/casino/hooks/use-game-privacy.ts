"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// The contract's own answer for a set of games, for as long as the keeper's
// snapshot cannot be trusted (it caches its ABI choice at startup, so one that
// started before the v5.1 upgrade calls every game public).
//
// Absent means unknown. The caller keeps what it had rather than treating a
// missing answer as public.
const STALE_MS = 30_000;

export function useGamePrivacy(gameIds: readonly number[]) {
  const ids = [...new Set(gameIds)].sort((a, b) => a - b);
  const key = ids.join(",");

  const query = useQuery<Record<string, boolean>>({
    queryKey: ["vault-privacy", key],
    enabled: ids.length > 0,
    staleTime: STALE_MS,
    retry: 1,
    queryFn: async () => {
      const res = await apiFetch(`/api/vault/privacy?ids=${key}`);
      if (!res.ok) throw new Error(`Could not read game privacy (${res.status})`);
      const body = (await res.json()) as { private?: Record<string, boolean> };
      return body.private ?? {};
    },
  });

  return query.data ?? {};
}
