"use client";

// Casino venues. The chess cashier is a ledger keyed by wallet: the available
// balance is withdrawn on-chain to the OLD wallet (the proxy forces the
// player to the session wallet, so the request carries the Privy identity),
// and locked buckets, pending withdrawals and lottery tickets can only be
// re-keyed by the backend link. The Last Standing vault is a contract: an
// expired game the old wallet is king or starter of is settled, and whatever
// is credited to it is claimed. Both pay the old wallet; the sweep follows.

import { SETTLE_CHAINS } from "@/lib/deposit";
import { readBaseTokenBalance } from "@/hooks/use-base-block";
import { decimalToBaseUnits, holdingId } from "@/lib/migration/holding";
import type { LegacyHolding, SettleOutcome, VenueAdapter } from "@/lib/migration/types";
import {
  cashierLockBuckets,
  createChessWithdrawal,
  fetchChessBalance,
  isCashierAccessDenied,
  isCashierUnavailable,
  USDC_DECIMALS,
  type CashierBalance,
  type CashierLockBuckets,
} from "@/features/casino/lib/api/cashier";
import { fetchLotteryTickets, type LotteryTicket } from "@/features/casino/lib/api/lottery";
import {
  encodeVaultClaim,
  encodeVaultSettle,
  GAME_ASSET,
  isVaultConfigured,
  readGame,
  readNextGameId,
  readVaultPendingWithdrawal,
  VAULT_CHAIN_ID,
  vaultAddress,
} from "@/features/casino/lib/last-standing/vault-calls";

const BASE_CHAIN_ID = 8453;

// ---------------------------------------------------------------------------
// Chess cashier
// ---------------------------------------------------------------------------

export type CashierRef =
  | { kind: "available"; amountUsdc: string }
  | { kind: "locked"; bucket: keyof CashierLockBuckets }
  | { kind: "ticket"; ticketId: string };

const BUCKET_LABELS: Record<keyof CashierLockBuckets, string> = {
  lockedMatchUsdc: "Chess stakes in live matches",
  lockedSwissUsdc: "Swiss tournament entries",
  lockedBetUsdc: "Chess bets in play",
  pendingWithdrawalUsdc: "Cashier withdrawal in progress",
  lockedOtherUsdc: "Other cashier locks",
};

function usdcHolding(
  kind: CashierRef["kind"],
  refKey: string,
  label: string,
  amountUsdc: string,
  ref: CashierRef,
  settleability: LegacyHolding["settleability"],
  deterministic = true
): LegacyHolding<CashierRef> {
  return {
    id: holdingId("cashier", kind, refKey),
    venue: "cashier",
    kind,
    label,
    chainId: BASE_CHAIN_ID,
    amount: decimalToBaseUnits(amountUsdc, USDC_DECIMALS),
    decimals: USDC_DECIMALS,
    symbol: "USDC",
    valueUsd: Number(amountUsdc),
    deterministic,
    irreversible: false,
    settleability,
    ref,
  };
}

// Pure: a cashier balance and the wallet's tickets, as holdings. Exported for
// its test.
export function classifyCashier(
  balance: CashierBalance | null,
  tickets: LotteryTicket[]
): LegacyHolding<CashierRef>[] {
  const holdings: LegacyHolding<CashierRef>[] = [];
  if (balance) {
    const available = decimalToBaseUnits(balance.availableUsdc, USDC_DECIMALS);
    if (available > 0n) {
      holdings.push(
        usdcHolding(
          "available",
          "balance",
          "Chess cashier balance",
          balance.availableUsdc,
          { kind: "available", amountUsdc: balance.availableUsdc },
          { state: "now" }
        )
      );
    }
    const buckets = cashierLockBuckets(balance);
    for (const bucket of Object.keys(buckets) as (keyof CashierLockBuckets)[]) {
      if (decimalToBaseUnits(buckets[bucket], USDC_DECIMALS) <= 0n) continue;
      holdings.push(
        usdcHolding(
          "locked",
          bucket,
          BUCKET_LABELS[bucket],
          buckets[bucket],
          { kind: "locked", bucket },
          {
            state: "needsBackend",
            reason: bucket === "pendingWithdrawalUsdc" ? "pendingWithdrawal" : "lockedBucket",
          }
        )
      );
    }
  }
  for (const ticket of tickets) {
    // A won ticket's payout is credited to the cashier balance when the draw
    // settles; an active one is still in play. Both are ledger rows the
    // backend has to re-key. Lost and refunded tickets hold nothing.
    if (ticket.status !== "active" && ticket.status !== "won") continue;
    const amount = ticket.status === "won" ? ticket.payoutUsdc : ticket.priceUsdc;
    holdings.push(
      usdcHolding(
        "ticket",
        ticket.id,
        ticket.status === "won" ? "Lottery winnings" : "Lottery ticket in play",
        amount,
        { kind: "ticket", ticketId: ticket.id },
        { state: "needsBackend", reason: "lotteryTicket" }
      )
    );
  }
  return holdings;
}

// The cashier pays out on-chain after its own confirmation depth.
const PAYOUT_POLL_MS = 5_000;
const PAYOUT_POLL_ATTEMPTS = 18;

export const cashierMigrationAdapter: VenueAdapter<CashierRef> = {
  venue: "cashier",
  requiresLegacySession: true,
  async discover({ legacy }) {
    const wallet = legacy.evm;
    if (!wallet) return [];
    const quiet = (error: unknown) => {
      // Not deployed here, or the old account never opened the cashier: no
      // holdings, not a failure.
      if (isCashierUnavailable(error) || isCashierAccessDenied(error)) return null;
      throw error;
    };
    const [balance, tickets] = await Promise.all([
      // The balance is withdrawable money, so failing to read it fails this
      // venue: the review must not imply the cashier is empty.
      fetchChessBalance(wallet, "legacy").catch(quiet),
      // Tickets are informational: they re-key with the backend and nothing
      // settles from here. A lottery outage must not hide the balance above,
      // so it degrades to no tickets rather than taking the venue down.
      fetchLotteryTickets(wallet, 50, "legacy").catch((error) => {
        if (!isCashierUnavailable(error) && !isCashierAccessDenied(error)) {
          console.error("Migration: couldn't read the old account's lottery tickets", error);
        }
        return [] as LotteryTicket[];
      }),
    ]);
    return classifyCashier(balance, tickets);
  },
  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    const wallet = ctx.legacy.evm;
    if (!wallet) return outcomes;
    const available = holdings.find((h) => h.ref.kind === "available");
    if (!available || available.ref.kind !== "available") return outcomes;
    ctx.onProgress("Withdrawing the chess cashier balance");
    const usdc = SETTLE_CHAINS.base.usdc as `0x${string}`;
    const owner = wallet as `0x${string}`;
    try {
      const before = await readBaseTokenBalance(usdc, owner);
      const withdrawal = await createChessWithdrawal(wallet, available.ref.amountUsdc, "legacy");
      let landed = false;
      for (let attempt = 0; attempt < PAYOUT_POLL_ATTEMPTS && !ctx.signal.aborted; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, PAYOUT_POLL_MS));
        if ((await readBaseTokenBalance(usdc, owner)) > before) {
          landed = true;
          break;
        }
      }
      outcomes.set(
        available.id,
        landed
          ? { ok: true, txHashes: withdrawal.txHash ? [withdrawal.txHash] : [] }
          : {
              ok: false,
              error:
                "The cashier accepted the withdrawal but it has not paid out yet. Run again in a few minutes.",
              retryable: true,
            }
      );
    } catch (error) {
      outcomes.set(available.id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    }
    return outcomes;
  },
};

// ---------------------------------------------------------------------------
// Last Standing vault
// ---------------------------------------------------------------------------

export type VaultRef = { kind: "settle"; gameId: number } | { kind: "claim" };

export interface VaultGame {
  gameId: number;
  starter: string;
  king: string;
  /** The pot in the game's own base units — USDC (6 dp) on v5, not wei. */
  pot: bigint;
  /** The game's own decimals, read from the contract rather than assumed. */
  decimals: number;
  endTime: number;
  settled: boolean;
}

// v5 games are played in USDC, so a pot is priced at a dollar a unit rather
// than through an ETH oracle. Reading a 6-decimal USDC pot as 18-decimal ETH
// under-reports it by twelve orders of magnitude — a $40 pot shows as $0.00
// and the migration quietly leaves it behind.
function vaultHolding(
  kind: VaultRef["kind"],
  refKey: string,
  label: string,
  amount: bigint,
  decimals: number,
  ref: VaultRef
): LegacyHolding<VaultRef> {
  return {
    id: holdingId("vault", kind, refKey),
    venue: "vault",
    kind,
    label,
    chainId: VAULT_CHAIN_ID,
    amount,
    decimals,
    symbol: GAME_ASSET.symbol,
    valueUsd: Number(amount) / 10 ** decimals,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref,
  };
}

// Pure: the vault games the wallet has a stake in, as holdings. Exported for
// its test. A game is only worth settling once its timer has expired and it
// pays this wallet (king wins the pot's winner share, starter the starter
// share); the exact split is the contract's, so the pot is shown whole.
export function classifyVault(input: {
  wallet: string;
  games: VaultGame[];
  /** Credited-but-unclaimed balance, in GAME_ASSET base units. */
  pending: bigint;
  nowSeconds: number;
}): LegacyHolding<VaultRef>[] {
  const holdings: LegacyHolding<VaultRef>[] = [];
  const me = input.wallet.toLowerCase();
  for (const game of input.games) {
    if (game.settled || game.endTime > input.nowSeconds) continue;
    const isKing = game.king.toLowerCase() === me;
    const isStarter = game.starter.toLowerCase() === me;
    if (!isKing && !isStarter) continue;
    holdings.push(
      vaultHolding(
        "settle",
        String(game.gameId),
        isKing
          ? `Last Standing game #${game.gameId} (won)`
          : `Last Standing game #${game.gameId} (started)`,
        game.pot,
        game.decimals,
        { kind: "settle", gameId: game.gameId }
      )
    );
  }
  if (input.pending > 0n) {
    holdings.push(
      vaultHolding(
        "claim",
        "pending",
        "Last Standing winnings waiting to be claimed",
        input.pending,
        // The pending balance is read per token and this one is GAME_ASSET's,
        // so its decimals are the asset's, not any single game's.
        GAME_ASSET.decimals,
        { kind: "claim" }
      )
    );
  }
  return holdings;
}

// Only the most recent games are read; older ones are either settled or
// were never the old wallet's.
const VAULT_LOOKBACK = 50;

export const vaultMigrationAdapter: VenueAdapter<VaultRef> = {
  venue: "vault",
  requiresLegacySession: false,
  async discover({ legacy }) {
    const wallet = legacy.evm;
    if (!wallet || !isVaultConfigured()) return [];
    const [nextId, pending] = await Promise.all([
      readNextGameId(),
      readVaultPendingWithdrawal(wallet),
    ]);
    const first = Math.max(1, nextId - VAULT_LOOKBACK);
    const ids = Array.from({ length: Math.max(0, nextId - first) }, (_, i) => first + i);
    const games = (
      await Promise.all(
        ids.map(async (gameId): Promise<VaultGame | null> => {
          const game = await readGame(gameId);
          if (!game || !game.exists) return null;
          const { starter, king, pot, decimals, endTime, settled } = game;
          return { gameId, starter, king, pot, decimals, endTime, settled };
        })
      )
    ).filter((g): g is VaultGame => g !== null);
    return classifyVault({
      wallet,
      games,
      pending,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  },
  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    if (holdings.length === 0) return outcomes;
    ctx.onProgress("Settling Last Standing games");
    const to = vaultAddress();
    const calls = holdings
      .filter((h) => h.ref.kind === "settle")
      .map((h) => ({
        to,
        data: h.ref.kind === "settle" ? encodeVaultSettle(h.ref.gameId) : encodeVaultClaim(),
      }));
    // claim() pays msg.sender everything settle() just credited, and reverts
    // with NothingToClaim if there is nothing, so it goes last and only once.
    calls.push({ to, data: encodeVaultClaim() });
    try {
      const hash = await ctx.signer.sendBatch(calls, VAULT_CHAIN_ID);
      for (const h of holdings) outcomes.set(h.id, { ok: true, txHashes: [hash] });
    } catch (error) {
      for (const h of holdings) {
        outcomes.set(h.id, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          retryable: true,
        });
      }
    }
    return outcomes;
  },
};
