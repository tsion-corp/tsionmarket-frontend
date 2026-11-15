"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { apiError } from "@/lib/api/envelope";
import type { Portfolio } from "@/lib/server/alchemy";
import { runSweep } from "@/lib/migration/sweep-run";
import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import {
  assertMovable,
  destinationProblems,
  dryRunOutcomes,
  planMove,
  sourcesMatchLink,
  summarizeMove,
  type Addresses,
  type MovePlanView,
  type MoveSummary,
} from "../lib/move-funds";
import { useDecaneSigner } from "./use-decane-signer";

export interface MoveScan {
  plan: MovePlanView;
  /** Networks whose balances could not be read just now; what is shown is a floor. */
  missing: string[];
}

export const moveScanKey = (sources: Addresses | null) =>
  ["moveScan", sources?.evm ?? null, sources?.solana ?? null] as const;

/**
 * What the old wallet holds right now, as a plan. Read through the same
 * portfolio route and "legacy" scope the earlier migration used (the whole
 * wallet, not only the tokens on the live allowlist), uncached so money that
 * moved seconds ago does not still show.
 */
export function useMoveScan(sources: Addresses | null, enabled: boolean) {
  return useQuery<MoveScan>({
    queryKey: moveScanKey(sources),
    enabled: enabled && Boolean(sources && (sources.evm || sources.solana)),
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sources?.evm) params.set("evm", sources.evm);
      if (sources?.solana) params.set("solana", sources.solana);
      params.set("fresh", "1");
      params.set("scope", "legacy");
      const res = await apiFetch(`/api/portfolio?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok)
        throw apiError("BAD_RESPONSE", "Couldn't check your current wallet.", res.status);
      const portfolio = (await res.json()) as Portfolio;
      return { plan: planMove(portfolio.tokens), missing: portfolio.missing ?? [] };
    },
  });
}

export interface RunMoveInput {
  config: WalletUpgradeConfig;
  /** What the link recorded as the account being upgraded. */
  linked: Addresses | null;
  destinations: Addresses;
  plan: MovePlanView;
}

/**
 * The one button. Re-checks everything that matters at the moment of sending
 * (not just when the page loaded): the signed-in account is the linked one, the
 * destinations are valid and are not the source. In a rehearsal it stops there
 * and reports success without sending.
 */
export function useRunMove(sources: Addresses | null) {
  const signer = useDecaneSigner();
  const queryClient = useQueryClient();

  return useMutation<MoveSummary, Error, RunMoveInput>({
    mutationFn: async ({ config, linked, destinations, plan }) => {
      const held = signer?.addresses ?? { evm: null, solana: null };
      if (!sourcesMatchLink(held, linked)) {
        throw new Error(
          "You're signed in to a different current account than the one you connected."
        );
      }
      const problems = destinationProblems(destinations, held);
      if (problems.length > 0) throw new Error(problems[0]);

      assertMovable(plan.chains);

      const outcomes = config.dryRun
        ? dryRunOutcomes(plan.chains)
        : await runSweep(plan.chains, destinations, requireSigner(signer));
      return summarizeMove(plan.chains, outcomes);
    },
    onSuccess: (_summary, input) => {
      // A rehearsal changed nothing, so there is nothing to re-read.
      if (!input.config.dryRun)
        void queryClient.invalidateQueries({ queryKey: moveScanKey(sources) });
    },
  });
}

function requireSigner<T>(signer: T | null): T {
  if (!signer) throw new Error("Your current account isn't connected. Sign in again.");
  return signer;
}
