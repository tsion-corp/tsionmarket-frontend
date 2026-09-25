"use client";

import { useCallback } from "react";
import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";
import { runSweep, type SweepDestinations } from "@/features/migrate/lib/sweep";
import type { ChainSweep } from "@/features/migrate/lib/plan";

export type { SweepDestinations } from "@/features/migrate/lib/sweep";

export interface SweepResult {
  done: number;
  failed: number;
  // The first failure's message, for the toast; later failures repeat the
  // same causes (expired session, refused signature) almost every time.
  firstError: string | null;
}

// The one-click sweep: runSweep over the legacy signer, summarised. Clicking
// Update Balance again replans from whatever balances remain, which is the
// retry.
export function useSweep() {
  const signer = useLegacySigner();

  return useCallback(
    async (plan: ChainSweep[], destinations: SweepDestinations): Promise<SweepResult> => {
      if (!signer) throw new Error("Your old account isn't connected. Sign in again.");
      const outcomes = await runSweep(plan, destinations, signer);
      let done = 0;
      let failed = 0;
      let firstError: string | null = null;
      for (const outcome of outcomes.values()) {
        if (outcome.ok) done += 1;
        else {
          failed += 1;
          if (firstError === null) firstError = outcome.error;
        }
      }
      return { done, failed, firstError };
    },
    [signer]
  );
}
