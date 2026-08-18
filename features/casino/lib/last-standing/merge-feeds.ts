// Joining what the indexer says with what the chain says.
//
// The indexer trails the chain, and for the vault contract on Base it has never
// held a row: every game start, wager and settlement is on-chain and the feeds
// were empty. So the chain decides what exists, and the indexed row is used
// where it has one, because it carries what the contract cannot: USD figures
// and the service's own ids and times.
//
// Pure, so it is tested without React or a network.

import type { ChainActivity, ChainSettledGame } from "@/features/casino/hooks/use-vault-actions";
import { weiToTokenAmount } from "@/features/casino/lib/last-standing/stake";
import type { VaultActivity, VaultWinner } from "@/features/casino/lib/vault-api";

/**
 * The indexed winners, backed by what the chain actually holds.
 *
 * The indexed feed has never carried a row for this contract, and a settled
 * game's record is a mapping read away. The chain decides which games have
 * settled; the indexed row is preferred where it has one, because it carries
 * USD figures priced at settlement. A chain row links to the settle()
 * transaction when its log is inside the scanned window; older than that it
 * is keyed by game id and dated by when the clock ran out.
 */
export function mergeWinners(
  indexed: VaultWinner[],
  chain: ChainSettledGame[],
  ethPrice: number
): VaultWinner[] {
  const byId = new Map(indexed.map((w) => [w.gameId, w]));
  const merged = chain.map((g) => {
    const row = byId.get(g.gameId);
    // The indexed row keeps its settlement tx and time, but the payout is the
    // chain's: it is what settle() sent, including the starter's share when
    // the winner opened the game, which the indexed feed reports as the
    // winner's share alone.
    if (row) return { ...row, toWinner: weiToTokenAmount(g.toWinnerWei, ethPrice) };
    return {
      gameId: g.gameId,
      winner: g.winner,
      starter: g.starter,
      pot: weiToTokenAmount(g.potWei, ethPrice),
      toWinner: weiToTokenAmount(g.toWinnerWei, ethPrice),
      // Without the log the id keeps the row keyed and deduplicated, which
      // is all the table needs from it.
      settlementTx: g.settlementTx ?? `game-${g.gameId}`,
      settledAt: new Date((g.settledAt ?? g.endTime) * 1000).toISOString(),
    };
  });
  // Anything the index knows that the chain tail no longer reaches.
  const seen = new Set(merged.map((w) => w.gameId));
  for (const w of indexed) if (!seen.has(w.gameId)) merged.push(w);
  return merged.sort((a, b) => b.gameId - a.gameId);
}

/**
 * The indexed activity, backed by what the chain's logs say.
 *
 * The contract emits a log for every player action (a start, a join, a win),
 * so the chain can carry the whole recent feed. Both are shown, newest first,
 * and where the two describe the same transaction the indexed row wins.
 */
export function mergeActivities(indexed: VaultActivity[], chain: ChainActivity[]): VaultActivity[] {
  const seenTx = new Set(indexed.map((a) => a.transactionHash.toLowerCase()));
  const fromChain: VaultActivity[] = chain
    .filter((s) => !seenTx.has(s.transactionHash.toLowerCase()))
    .map((s) => ({
      id: `chain-${s.action}-${s.gameId}-${s.transactionHash}`,
      gameId: s.gameId,
      action: s.action,
      address: s.address,
      amountWei: s.amountWei.toString(),
      transactionHash: s.transactionHash,
      createdAt: new Date(s.timestamp * 1000).toISOString(),
    }));
  return [...indexed, ...fromChain].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
