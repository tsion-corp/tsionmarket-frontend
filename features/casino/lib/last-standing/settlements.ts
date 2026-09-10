import { parseEther } from "viem";
import type { VaultWinner } from "@/features/casino/lib/vault-api";

// A settlement this browser has just learned of, from the socket's
// gameSettled frame or the winners feed, whichever arrives first. The
// screens watch the latest one to credit the payout to the balance card.
export interface Settlement {
  gameId: number;
  settlementTx: string;
  winner: string;
  starter: string;
  toWinnerWei: bigint;
  toStarterWei: bigint;
  // What settle() actually sent the winner's wallet, when the service says.
  // It carries the starter's share too when the same wallet opened the game.
  paidToWinnerWei: bigint | null;
  settledAt: number;
}

// A settlement older than this reached the wallet before the balance on
// screen was last read, so it is not credited again.
export const RECENT_SETTLEMENT_MS = 2 * 60_000;

export function settlementFromWinner(row: VaultWinner): Settlement {
  return {
    gameId: row.gameId,
    settlementTx: row.settlementTx,
    winner: row.winner,
    starter: row.starter,
    toWinnerWei: parseEther(row.toWinner.amount),
    toStarterWei: row.toStarter ? parseEther(row.toStarter.amount) : 0n,
    paidToWinnerWei: row.paidToWinner ? parseEther(row.paidToWinner.amount) : null,
    settledAt: Date.parse(row.settledAt),
  };
}

export function settlementFromFrame(frame: {
  gameId: number;
  winner: string;
  starter: string;
  toWinnerWei?: string;
  toStarterWei?: string;
  transactionHash?: string;
}): Settlement | null {
  if (!frame.transactionHash) return null;
  try {
    return {
      gameId: frame.gameId,
      settlementTx: frame.transactionHash,
      winner: frame.winner,
      starter: frame.starter,
      toWinnerWei: BigInt(frame.toWinnerWei ?? "0"),
      toStarterWei: BigInt(frame.toStarterWei ?? "0"),
      paidToWinnerWei: null,
      settledAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// What this wallet received from the settlement: the winner's share, the
// starter's share, or both for a wallet that opened the game and outlasted
// everyone. The service's paid figure wins when it has one.
export function payoutWei(s: Settlement, address: string | null | undefined): bigint {
  if (!address) return 0n;
  const me = address.toLowerCase();
  const won = s.winner.toLowerCase() === me;
  const started = s.starter.toLowerCase() === me;
  if (won && s.paidToWinnerWei !== null) return s.paidToWinnerWei;
  return (won ? s.toWinnerWei : 0n) + (started ? s.toStarterWei : 0n);
}

export function isRecentSettlement(s: Settlement, now = Date.now()): boolean {
  return now - s.settledAt < RECENT_SETTLEMENT_MS;
}

// The latest settlement seen, for useSyncExternalStore.
let latest: Settlement | null = null;
const listeners = new Set<() => void>();

export function noteSettlement(s: Settlement | null): void {
  if (!s || latest?.settlementTx === s.settlementTx) return;
  latest = s;
  for (const listener of listeners) listener();
}

export function subscribeSettlements(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function latestSettlement(): Settlement | null {
  return latest;
}

export function resetSettlements(): void {
  latest = null;
}
