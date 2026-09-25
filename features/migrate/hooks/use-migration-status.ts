"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { errorStatus, isUnconfigured } from "@/lib/api/envelope";
import {
  EMPTY_MIGRATION_STATUS,
  getMigrationStatus,
  type MigrationStatus,
} from "@/features/migrate/lib/api";

// Lives outside the ["migration", ...] prefix on purpose: the sheet clears
// that prefix on close, and this status backs the Account modal badge and
// the balance-card button between openings.
export const MIGRATION_STATUS_KEY = ["migrationStatus"] as const;

// The server's view of the old wallet, tolerant of the service not being
// deployed yet (which reads as the empty status, never as an error).
export function useMigrationStatus() {
  const { authenticated } = useAuthSession();
  return useQuery<MigrationStatus>({
    queryKey: MIGRATION_STATUS_KEY,
    enabled: authenticated,
    staleTime: 5 * 60_000,
    // An expired session answers 401 on every retry; the card reads the
    // error and sends the person to sign in instead.
    retry: (count, error) => errorStatus(error) !== 401 && count < 3,
    queryFn: async () => {
      try {
        return await getMigrationStatus();
      } catch (error) {
        if (isUnconfigured(error)) return EMPTY_MIGRATION_STATUS;
        throw error;
      }
    },
  });
}
