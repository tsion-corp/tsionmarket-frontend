"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useGameBalance } from "@/features/casino/hooks/use-game-balance";
import { vaultLog } from "@/features/casino/lib/last-standing/log";
import {
  isRecentSettlement,
  latestSettlement,
  noteSettlement,
  payoutWei,
  settlementFromWinner,
  subscribeSettlements,
} from "@/features/casino/lib/last-standing/settlements";
import type { VaultWinner } from "@/features/casino/lib/vault-api";

// Settlements this browser has already credited, across screens: the socket
// frame and the winners row describe the same payout, and so do the lobby
// and the game page when the player moves between them.
const credited = new Set<string>();

// Credits a payout to the balance card when it lands. The socket's settle
// frame is the usual trigger; a winners row is the fallback when the socket
// is down or the page opened after the round. A settlement more than two
// minutes old reached the wallet before the balance was last read, so it is
// left alone.
export function usePayoutRefresh(address: string | null | undefined, winners?: VaultWinner[]) {
  const { settle } = useGameBalance();
  const latest = useSyncExternalStore(subscribeSettlements, latestSettlement, () => null);

  const newestRow = winners?.[0];
  useEffect(() => {
    if (newestRow) noteSettlement(settlementFromWinner(newestRow));
  }, [newestRow]);

  const settleRef = useRef(settle);
  useEffect(() => {
    settleRef.current = settle;
  }, [settle]);

  useEffect(() => {
    if (!latest || credited.has(latest.settlementTx)) return;
    if (!isRecentSettlement(latest)) return;
    const credit = payoutWei(latest, address);
    if (credit === 0n) return;
    credited.add(latest.settlementTx);
    vaultLog(`round ${latest.gameId} paid`, { credit: credit.toString() });
    void settleRef.current(credit);
  }, [latest, address]);
}

export function resetPayoutCredits(): void {
  credited.clear();
}
