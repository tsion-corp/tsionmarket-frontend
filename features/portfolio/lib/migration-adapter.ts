"use client";

// Kash as a migration venue. KSH is a plain ERC-20 on Base, so tokens move
// with a transfer from the old wallet. Points, lifetime totals and the
// subscription tier live in the Kash ledger keyed by wallet: unclaimed points
// can be minted to the old wallet (and then transferred) once claiming is
// live, everything else waits for the backend link to re-key the account.

import { toHex } from "viem";
import { readBaseTokenBalance } from "@/hooks/use-base-block";
import { decimalToBaseUnits, holdingId } from "@/lib/migration/holding";
import type { LegacyHolding, SettleOutcome, VenueAdapter } from "@/lib/migration/types";
import { KASH_POINTS_LIVE } from "@/features/portfolio/lib/kash-launch";
import {
  claimSettlementMessage,
  getKashAccount,
  getKashStatus,
  getKashSubscription,
  postKashClaim,
  type KashAccount,
  type KashSubscription,
} from "@/features/portfolio/lib/kash";

// KSH has 18 decimals (see kashToWei).
const KSH_DECIMALS = 18;
const BASE_CHAIN_ID = 8453;

export type KashRef =
  { kind: "token"; tokenAddress: `0x${string}` } | { kind: "points" } | { kind: "tier" };

export interface KashInput {
  tokenAddress: string | null;
  tokenBalance: bigint;
  account: KashAccount | null;
  subscription: KashSubscription | null;
  pointsLive: boolean;
}

function usdOf(amount: bigint, priceUsd: string): number {
  const price = Number(priceUsd);
  if (!Number.isFinite(price)) return 0;
  return (Number(amount) / 10 ** KSH_DECIMALS) * price;
}

// Pure: the wallet's Kash state as holdings. Exported for its test.
export function classifyKash(input: KashInput): LegacyHolding<KashRef>[] {
  const holdings: LegacyHolding<KashRef>[] = [];
  const price = input.account?.kashPriceUsd ?? "0";
  if (input.tokenAddress && input.tokenBalance > 0n) {
    holdings.push({
      id: holdingId("kash", "token", input.tokenAddress),
      venue: "kash",
      kind: "token",
      label: "KSH tokens",
      chainId: BASE_CHAIN_ID,
      amount: input.tokenBalance,
      decimals: KSH_DECIMALS,
      symbol: "KSH",
      valueUsd: usdOf(input.tokenBalance, price),
      deterministic: true,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "token", tokenAddress: input.tokenAddress as `0x${string}` },
    });
  }
  const unclaimed = input.account?.week.unclaimed ?? "0";
  if (Number(unclaimed) > 0) {
    holdings.push({
      id: holdingId("kash", "points", "unclaimed"),
      venue: "kash",
      kind: "points",
      label: `${unclaimed} unclaimed Kash points`,
      amount: decimalToBaseUnits(unclaimed, 0),
      decimals: 0,
      symbol: "points",
      valueUsd: 0,
      deterministic: true,
      irreversible: false,
      settleability: input.pointsLive
        ? { state: "now" }
        : { state: "needsBackend", reason: "kashPoints" },
      ref: { kind: "points" },
    });
  }
  if (input.subscription && input.subscription.tier > 0) {
    holdings.push({
      id: holdingId("kash", "tier", String(input.subscription.tier)),
      venue: "kash",
      kind: "tier",
      label: `Kash tier ${input.subscription.tier}`,
      amount: 0n,
      decimals: 0,
      symbol: "tier",
      valueUsd: 0,
      deterministic: true,
      irreversible: false,
      settleability: { state: "needsBackend", reason: "subscriptionTier" },
      ref: { kind: "tier" },
    });
  }
  return holdings;
}

// Minting is asynchronous on the Kash side; give it a moment to land before
// the token transfer reads the balance.
const MINT_POLL_MS = 3_000;
const MINT_POLL_ATTEMPTS = 10;

export const kashMigrationAdapter: VenueAdapter<KashRef> = {
  venue: "kash",
  requiresLegacySession: true,
  async discover({ legacy }) {
    const wallet = legacy.evm;
    if (!wallet) return [];
    const status = await getKashStatus();
    const tokenAddress = status.chain?.tokenAddress ?? null;
    const [tokenBalance, account, subscription] = await Promise.all([
      tokenAddress
        ? readBaseTokenBalance(tokenAddress as `0x${string}`, wallet as `0x${string}`)
        : Promise.resolve(0n),
      getKashAccount(wallet, "legacy").catch(() => null),
      getKashSubscription(wallet, "legacy").catch(() => null),
    ]);
    return classifyKash({
      tokenAddress,
      tokenBalance,
      account,
      subscription,
      pointsLive: KASH_POINTS_LIVE,
    });
  },
  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    const wallet = ctx.legacy.evm;
    if (!wallet) return outcomes;
    const fail = (id: string, error: unknown) =>
      outcomes.set(id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      });

    const token = holdings.find((h) => h.ref.kind === "token");
    const tokenAddress = token?.ref.kind === "token" ? token.ref.tokenAddress : null;
    let expected = token?.amount ?? 0n;

    const points = holdings.find((h) => h.ref.kind === "points");
    if (points && !ctx.signal.aborted) {
      ctx.onProgress("Claiming Kash points");
      try {
        // REVIEW(decane-migration): staging reworked the kash claim to be
        // signature-based. The sweep must sign claimSettlementMessage with the
        // OLD wallet and post with the legacy identity — mirrors the normal
        // useKashClaim flow (features/portfolio/hooks/use-kash.ts), but the
        // legacy signer has no signMessage, so we personal_sign via its raw
        // provider. Verify against a real legacy claim before trusting at scale.
        const timestamp = Date.now();
        const provider = await ctx.signer.getEthereumProvider();
        const signature = (await provider.request({
          method: "personal_sign",
          params: [toHex(claimSettlementMessage(wallet, timestamp)), wallet as `0x${string}`],
        })) as string;
        await postKashClaim(wallet, signature, timestamp, "legacy");
        outcomes.set(points.id, { ok: true, txHashes: [] });
        if (tokenAddress) {
          for (let attempt = 0; attempt < MINT_POLL_ATTEMPTS; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, MINT_POLL_MS));
            const balance = await readBaseTokenBalance(tokenAddress, wallet as `0x${string}`);
            if (balance > expected) {
              expected = balance;
              break;
            }
          }
        }
      } catch (error) {
        fail(points.id, error);
      }
    }

    if (token && tokenAddress && !ctx.signal.aborted) {
      if (!ctx.current.evm) {
        fail(token.id, new Error("The new wallet is not ready."));
        return outcomes;
      }
      ctx.onProgress("Moving KSH to your new wallet");
      try {
        const balance = await readBaseTokenBalance(tokenAddress, wallet as `0x${string}`);
        const hash = await ctx.signer.sendToken({
          network: "base-mainnet",
          tokenAddress,
          decimals: KSH_DECIMALS,
          to: ctx.current.evm,
          amount: balance > 0n ? balance : token.amount,
        });
        outcomes.set(token.id, { ok: true, txHashes: [hash] });
      } catch (error) {
        fail(token.id, error);
      }
    }
    return outcomes;
  },
};
