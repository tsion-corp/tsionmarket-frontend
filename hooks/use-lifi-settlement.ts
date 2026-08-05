"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLifiStatus } from "@/lib/trade/lifi";
import type { DepositProgress } from "@/lib/deposit";

const POLL_MS = 3_000;

// Settlement of a LI.FI transfer, shaped like a Dextopus deposit's progress so
// the sell sheet renders both rails with the same stage machinery. The
// transaction is already signed and broadcast when this starts, so the journey
// begins at "processing" — there is no waiting-for-deposit phase.
export function useLifiSettlement(txHash: string | null): DepositProgress {
  const status = useQuery({
    queryKey: ["lifi", "settlement", txHash],
    enabled: txHash !== null,
    refetchInterval: (query) => {
      const s = query.state.data;
      return s === "DONE" || s === "FAILED" ? false : POLL_MS;
    },
    queryFn: () => fetchLifiStatus(txHash as string),
  });

  if (status.data === "DONE") {
    return { stage: "settled", pct: 100, label: "Funds settled", terminal: true };
  }
  if (status.data === "FAILED") {
    return { stage: "failed", pct: 100, label: "Transfer failed", terminal: true };
  }
  return { stage: "processing", pct: 70, label: "Bridging across chains", terminal: false };
}
