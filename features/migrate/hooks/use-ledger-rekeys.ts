"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorStatus } from "@/lib/api/envelope";
import {
  getMigrationStatus,
  type MigrationStatus,
  type RekeyState,
} from "@/features/migrate/lib/api";
import { MIGRATION_STATUS_KEY } from "@/features/migrate/hooks/use-migration-status";
import { anyLedgerPending, ledgerRefreshes } from "@/features/migrate/lib/ledger-rekeys";

// The services re-key on their own time; a few seconds is the usual case.
const POLL_MS = 3_000;
// After this, stop asking: a ledger still pending is the service's problem,
// reported in the status the account menu already shows.
const DEADLINE_MS = 3 * 60_000;

/**
 * WATCH THE LEDGERS LAND, AND REFRESH WHAT SHOWS THEM.
 *
 * Once the account is linked, each service moves its ledger — Kash points,
 * casino balances, predictions — from the old wallet to the new and reports
 * it. This polls the migration status while any ledger is still pending and,
 * the moment one reports done, invalidates the queries that draw it, so the
 * Kash chip shows the moved balance seconds after it moved instead of at the
 * end of its stale window.
 *
 * Bounded, and only while something is pending: a settled status ends it at
 * once, and the deadline ends it however the services are doing.
 */
export function useLedgerRekeys(enabled: boolean): void {
  const queryClient = useQueryClient();
  const last = useRef<Record<string, RekeyState> | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const settle = (status: MigrationStatus) => {
      for (const prefix of ledgerRefreshes(last.current, status.rekey)) {
        void queryClient.invalidateQueries({ queryKey: [...prefix] });
      }
      last.current = status.rekey;
      // Everything else reading the status sees the same answer.
      queryClient.setQueryData(MIGRATION_STATUS_KEY, status);
    };

    const tick = async () => {
      let status: MigrationStatus | null = null;
      try {
        status = await getMigrationStatus();
      } catch (error) {
        // The session is gone: every further poll answers the same, and the
        // card is already sending the person back to sign in.
        if (errorStatus(error) === 401) return;
        // A silent poll changes nothing; the next one asks again.
      }
      if (!live) return;
      if (status) settle(status);
      const pending = status ? anyLedgerPending(status.rekey) : true;
      if (!pending || Date.now() - startedAt >= DEADLINE_MS) return;
      timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, queryClient]);
}
