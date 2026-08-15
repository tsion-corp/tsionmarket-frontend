// Joining what the indexer says with what the chain says.
//
// The indexer trails the chain, and for the vault contract on Base it has never
// held a row: every game start, wager and settlement is on-chain and the feeds
// were empty. So the chain decides what exists, and the indexed row is used
// where it has one, because it carries what the contract cannot: USD figures,
// transaction hashes, exact times.
//
// Pure, so it is tested without React or a network.

import type { ChainSettledGame, ChainStart } from "@/features/casino/hooks/use-vault-actions";
import { weiToTokenAmount } from "@/features/casino/lib/last-standing/stake";
import type { VaultActivity, VaultWinner } from "@/features/casino/lib/vault-api";

/**
 * The indexed winners, backed by what the chain actually holds.
 *
 * The indexed feed has never carried a row for this contract, and a settled
 * game's record is a mapping read away. The chain decides which games have
 * settled; the indexed row is preferred where it has one, because it carries
 * the settlement transaction and the exact time, which the mapping does not.
 */
export function mergeWinners(
  indexed: VaultWinner[],
  chain: ChainSettledGame[],
  ethPrice: number
): VaultWinner[] {
  const byId = new Map(indexed.map((w) => [w.gameId, w]));
  const merged = chain.map(
    (g) =>
      byId.get(g.gameId) ?? {
        gameId: g.gameId,
        winner: g.winner,
        starter: g.starter,
        pot: weiToTokenAmount(g.potWei, ethPrice),
        toWinner: weiToTokenAmount(g.toWinnerWei, ethPrice),
        // No transaction hash without the indexer; the id keeps the row keyed
        // and deduplicated, which is all the table needs from it.
        settlementTx: `game-${g.gameId}`,
        settledAt: new Date(g.endTime * 1000).toISOString(),
      }
  );
  // Anything the index knows that the chain tail no longer reaches.
  const seen = new Set(merged.map((w) => w.gameId));
  for (const w of indexed) if (!seen.has(w.gameId)) merged.push(w);
  return merged.sort((a, b) => b.gameId - a.gameId);
}

/**
 * The indexed activity, backed by the starts the chain can see.
 *
 * GameStarted is the only event the contract emits for a player action, so the
 * chain can contribute starts and nothing else; joins and wins are the
 * indexer's alone. Both are shown, newest first, and where the two describe
 * the same transaction the indexed row wins.
 */
export function mergeActivities(indexed: VaultActivity[], chain: ChainStart[]): VaultActivity[] {
  const seenTx = new Set(indexed.map((a) => a.transactionHash.toLowerCase()));
  const fromChain: VaultActivity[] = chain
    .filter((s) => !seenTx.has(s.transactionHash.toLowerCase()))
    .map((s) => ({
      id: `chain-start-${s.gameId}`,
      action: "started",
      address: s.starter,
      amountWei: s.stakeWei.toString(),
      transactionHash: s.transactionHash,
      createdAt: new Date(s.timestamp * 1000).toISOString(),
    }));
  return [...indexed, ...fromChain].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
