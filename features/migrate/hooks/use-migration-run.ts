"use client";

import { useCallback, useRef, useState } from "react";
import { track } from "@/lib/analytics/mixpanel";
import type { SettlementPlan } from "@/lib/migration/schedule";
import type { LegacyAddresses, LegacySigner, VenueAdapter } from "@/lib/migration/types";
import { runSettlement, type RunResult } from "@/features/migrate/lib/run";

export interface MigrationRunInput {
  adapters: readonly VenueAdapter[];
  legacy: LegacyAddresses;
  current: LegacyAddresses;
  signer: LegacySigner | null;
  ethPriceUsd: number;
}

export interface RunProgress {
  message: string;
  done: number;
  total: number;
}

// Drives one settlement run from the UI: progress for the screen, analytics
// per step, and a cancel that takes effect between venues (a step already
// signed is never abandoned midway).
export function useMigrationRun(input: MigrationRunInput) {
  const { adapters, legacy, current, signer, ethPriceUsd } = input;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(
    async (plan: SettlementPlan): Promise<RunResult> => {
      if (!signer) throw new Error("Sign in to your old account first.");
      const abort = new AbortController();
      controller.current = abort;
      const total = plan.phases.reduce((sum, p) => sum + p.holdings.length, 0);
      let done = 0;
      setRunning(true);
      setProgress({ message: "", done, total });
      try {
        return await runSettlement(
          plan,
          adapters,
          {
            legacy,
            current,
            hasLegacySession: true,
            signer,
            ethPriceUsd,
            signal: abort.signal,
            onProgress: (message) => setProgress({ message, done, total }),
          },
          {
            onStep: (holding, outcome) => {
              done += 1;
              setProgress((p) => ({ message: p?.message ?? "", done, total }));
              if (outcome.ok) {
                track("migration_step_completed", { venue: holding.venue, kind: holding.kind });
              } else {
                track("migration_step_failed", {
                  venue: holding.venue,
                  kind: holding.kind,
                  retryable: outcome.retryable,
                });
              }
            },
          }
        );
      } finally {
        controller.current = null;
        setRunning(false);
      }
    },
    [adapters, legacy, current, signer, ethPriceUsd]
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { run, cancel, running, progress };
}
