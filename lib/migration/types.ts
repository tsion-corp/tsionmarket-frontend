// The contract between the migration flow and the venues it drains. Pure
// types, no framework: each feature implements a VenueAdapter against this
// file, the layout composes the adapters, and features/migrate runs them.
// Amounts are exact base units (bigint); valueUsd is display only.

import type { EIP1193Provider } from "viem";

export type Venue =
  "wallet" | "perps" | "polymarket" | "cpmm" | "cashier" | "vault" | "kash" | "earn" | "onramp";

// Why a holding cannot move right now, when it cannot. The review screen
// renders these as reasons; the scheduler routes on them.
export type Settleability =
  | { state: "now" }
  // `at` is null when the end is not knowable yet (a market awaiting resolution).
  | {
      state: "waitUntil";
      at: number | null;
      reason: "challengeWindow" | "awaitingResolution" | "keeper" | "settlement";
    }
  | {
      state: "needsBackend";
      reason:
        | "lockedBucket"
        | "pendingWithdrawal"
        | "swissSeat"
        | "lotteryTicket"
        | "subscriptionTier"
        | "referrals"
        | "earnPayoutAddress"
        | "kashPoints";
    }
  | {
      state: "stranded";
      reason:
        | "unsponsoredNetwork"
        | "insolventMarket"
        | "invalidMarket"
        | "noLiquidity"
        | "closedMarket"
        // Less than the venue's own withdrawal fee: nothing would arrive.
        | "belowMinimum";
    }
  | { state: "pending"; reason: "onramp" };

export interface LegacyHolding<TRef = unknown> {
  // Stable across re-discovery: `${venue}:${kind}:${ref}`.
  id: string;
  venue: Venue;
  kind: string;
  label: string;
  chainId?: number;
  amount: bigint;
  decimals: number;
  symbol: string;
  valueUsd: number;
  // false means the user must opt in: the action realises a loss or a price.
  deterministic: boolean;
  // Warn before running: closing a trade, selling into a book.
  irreversible: boolean;
  settleability: Settleability;
  // Adapter-private handle to whatever settle() needs.
  ref: TRef;
}

export interface LegacyAddresses {
  evm: string | null;
  solana: string | null;
}

export interface EvmBatchCall {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

// Signing with the OLD wallets, injected so adapters never import Privy.
export interface LegacySigner {
  addresses: LegacyAddresses;
  sendBatch(calls: EvmBatchCall[], chainId: number): Promise<`0x${string}`>;
  sendToken(params: {
    network: string;
    tokenAddress: string | null;
    decimals: number;
    to: string;
    amount: bigint;
  }): Promise<string>;
  getEthereumProvider(): Promise<EIP1193Provider>;
}

export interface DiscoverContext {
  legacy: LegacyAddresses;
  current: LegacyAddresses;
  // True once the user has signed in to the old account. Adapters that need
  // the legacy identity for reads are skipped until then.
  hasLegacySession: boolean;
  // Present exactly when hasLegacySession: some venues (Polymarket) can only
  // be read through a client built on the old signer.
  signer: LegacySigner | null;
  // Spot price for valuing ETH-denominated holdings (the vault). Display only;
  // 0 when unknown.
  ethPriceUsd: number;
}

export interface SettleContext extends DiscoverContext {
  signer: LegacySigner;
  signal: AbortSignal;
  onProgress(message: string): void;
}

export type SettleOutcome =
  | { ok: true; txHashes: string[] }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      /**
       * The venue asked us to slow down (a relayer answering 429, say). Not a
       * fault of the account or the money: the item simply waits for a later
       * attempt, and nothing reads it as a failure that could hold the
       * upgrade or trip the "this keeps failing" exit.
       */
      throttled?: boolean;
    };

export interface VenueAdapter<TRef = unknown> {
  venue: Venue;
  // Reads need the old identity (backend ledgers keyed by the session wallet,
  // the Polymarket client built on the old signer).
  requiresLegacySession: boolean;
  discover(ctx: DiscoverContext): Promise<LegacyHolding<TRef>[]>;
  // Settles the given holdings, batching where the venue allows. One entry
  // per holding id; a holding the adapter did not attempt is simply absent.
  settle(holdings: LegacyHolding<TRef>[], ctx: SettleContext): Promise<Map<string, SettleOutcome>>;
}

// A holding discovered on a venue whose discovery itself failed, so the review
// can say "we could not check X" instead of silently showing nothing.
export interface DiscoveryFailure {
  venue: Venue;
  error: string;
  /**
   * The HTTP status the venue's call answered with, when the failure came
   * from the gateway at all. A 401 is the session having expired, not the
   * venue being down, and the card must say so instead of "check back later".
   */
  status?: number;
}
