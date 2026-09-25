"use client";

// Prediction markets as migration venues. Two very different places hold a
// user's money here:
//
// Polymarket: the deposit wallet is derived from the OLD signer, the outcome
// tokens cannot be transferred, and collateral is pUSD on Polygon. Winners are
// redeemed, open positions are sold into the book (opt-in, lossy), and the
// collateral is settled straight to the NEW wallet as USDC on Base.
//
// World Street CPMM (our own contract on Base): winning shares redeem 1:1 after
// the challenge window, LP is returned, open shares can be sold into the pool
// (opt-in, lossy), and everything credited to pendingWithdrawals is claimed.
// Every payout lands on the OLD wallet; the sweep moves it afterwards.

import { encodeFunctionData } from "viem";
import { PREDICTION_ABI } from "@/features/prediction/lib/abi";
import { getLpPositions, getPositions, listMarkets } from "@/features/prediction/lib/api";
import {
  readPendingWithdrawals,
  readPoolState,
  readRedeemableAt,
  readShareBalance,
} from "@/features/prediction/lib/chain-reads";
import {
  buildLegacyClaimCalls,
  readLegacyClaimState,
  type LegacyRedeemable,
} from "@/features/prediction/lib/legacy-claim";
import {
  PREDICTION_CHAIN_ID,
  predictionContractAddress,
  sideToUint,
} from "@/features/prediction/lib/logic";
import { winningSide } from "@/features/prediction/lib/lp-return";
import { minOut, quoteSell } from "@/features/prediction/lib/math";
import {
  betSlip,
  isCashoutable,
  isClaimable,
  type RawPosition,
} from "@/features/prediction/lib/positions";
import type { LpPosition, Market, Position, Side } from "@/features/prediction/lib/types";
import { PRICE_SCALE, USDC_DECIMALS } from "@/features/prediction/lib/types";
import { readCollateralUsd, readUnsettledUsdcUsd } from "@/lib/polymarket/collateral";
import { POLYGON_CHAIN_ID } from "@/lib/polymarket/config";
import {
  CashoutError,
  ensureDepositWallet,
  isNoLiquidity,
  redeemCondition,
  sellWithApprovalRetry,
} from "@/lib/polymarket/exit";
import { buildSecureClient, type SecureClient } from "@/lib/polymarket/secure-client";
import { settleCollateral } from "@/lib/polymarket/settle";
import { decimalToBaseUnits, holdingId } from "@/lib/migration/holding";
import type {
  EvmBatchCall,
  LegacyHolding,
  SettleOutcome,
  VenueAdapter,
} from "@/lib/migration/types";

// ---------------------------------------------------------------------------
// Polymarket
// ---------------------------------------------------------------------------

export type PolymarketRef =
  | { kind: "redeem"; conditionId: string }
  | { kind: "shares"; tokenId: string; shares: number }
  | { kind: "collateral" };

function usdcUnits(usd: number): bigint {
  return decimalToBaseUnits(usd.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

// Pure: raw Polymarket positions plus the collateral figures, as holdings.
// Exported for its test.
export function classifyPolymarket(input: {
  positions: RawPosition[];
  collateralUsd: number;
  unsettledUsdcUsd: number;
}): LegacyHolding<PolymarketRef>[] {
  const holdings: LegacyHolding<PolymarketRef>[] = [];
  // One redeem per condition pays out every winning token of that market.
  const redeemed = new Set<string>();
  for (const raw of input.positions) {
    const slip = betSlip(raw);
    if (isClaimable(slip.redeemable, slip.currentValue) && slip.conditionId) {
      if (redeemed.has(slip.conditionId)) continue;
      redeemed.add(slip.conditionId);
      holdings.push({
        id: holdingId("polymarket", "redeem", slip.conditionId),
        venue: "polymarket",
        kind: "redeem",
        label: `${slip.market} (${slip.outcome}) winnings`,
        chainId: POLYGON_CHAIN_ID,
        amount: usdcUnits(slip.currentValue),
        decimals: USDC_DECIMALS,
        symbol: "USDC",
        valueUsd: slip.currentValue,
        deterministic: true,
        irreversible: false,
        settleability: { state: "now" },
        ref: { kind: "redeem", conditionId: slip.conditionId },
      });
      continue;
    }
    if (isCashoutable(slip.redeemable, slip.shares, slip.tokenId) && slip.tokenId) {
      holdings.push({
        id: holdingId("polymarket", "shares", slip.tokenId),
        venue: "polymarket",
        kind: "shares",
        label: `${slip.market} (${slip.outcome})`,
        chainId: POLYGON_CHAIN_ID,
        amount: usdcUnits(slip.currentValue),
        decimals: USDC_DECIMALS,
        symbol: "USDC",
        valueUsd: slip.currentValue,
        deterministic: false,
        irreversible: true,
        settleability: { state: "now" },
        ref: { kind: "shares", tokenId: slip.tokenId, shares: slip.shares },
      });
    }
  }
  const collateralUsd = input.collateralUsd + input.unsettledUsdcUsd;
  if (collateralUsd > 0) {
    holdings.push({
      id: holdingId("polymarket", "collateral", "polygon"),
      venue: "polymarket",
      kind: "collateral",
      label: "Prediction balance",
      chainId: POLYGON_CHAIN_ID,
      amount: usdcUnits(collateralUsd),
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: collateralUsd,
      deterministic: true,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "collateral" },
    });
  }
  return holdings;
}

// The client is bound to the old signer; building it deploys nothing, so one
// per address is safe to keep across discover and settle.
let cachedClient: { address: string; client: SecureClient } | null = null;

async function legacyClient(
  address: string,
  signer: { getEthereumProvider(): Promise<Parameters<typeof buildSecureClient>[1]> }
): Promise<SecureClient> {
  if (cachedClient?.address === address) return cachedClient.client;
  const provider = await signer.getEthereumProvider();
  const client = await buildSecureClient(address, provider, { identity: "legacy" });
  cachedClient = { address, client };
  return client;
}

export const polymarketMigrationAdapter: VenueAdapter<PolymarketRef> = {
  venue: "polymarket",
  requiresLegacySession: true,
  async discover({ legacy, signer }) {
    if (!legacy.evm || !signer) return [];
    const client = await legacyClient(legacy.evm, signer);
    const [page, collateralUsd, unsettledUsdcUsd] = await Promise.all([
      client.listPositions().firstPage(),
      readCollateralUsd(client),
      readUnsettledUsdcUsd(legacy.evm),
    ]);
    return classifyPolymarket({
      positions: page.items as RawPosition[],
      collateralUsd,
      unsettledUsdcUsd,
    });
  },
  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    const eoa = ctx.legacy.evm;
    if (!eoa) return outcomes;
    if (!ctx.current.evm) {
      for (const h of holdings) {
        outcomes.set(h.id, { ok: false, error: "The new wallet is not ready.", retryable: true });
      }
      return outcomes;
    }
    const client = await legacyClient(eoa, ctx.signer);
    ctx.onProgress("Preparing the prediction account");
    await ensureDepositWallet(client);

    const fail = (id: string, error: unknown, retryable: boolean) =>
      outcomes.set(id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable,
      });

    // Winnings first: they add to the collateral the last step moves.
    for (const h of holdings) {
      if (ctx.signal.aborted || h.ref.kind !== "redeem") continue;
      ctx.onProgress(`Claiming ${h.label}`);
      try {
        await redeemCondition(client, h.ref.conditionId);
        outcomes.set(h.id, { ok: true, txHashes: [] });
      } catch (error) {
        fail(h.id, error, true);
      }
    }
    // Then the opted-in sells. A book with no bid leaves the position where it
    // is; the user can hold it to resolution instead.
    for (const h of holdings) {
      if (ctx.signal.aborted || h.ref.kind !== "shares") continue;
      ctx.onProgress(`Selling ${h.label}`);
      try {
        await sellWithApprovalRetry(client, { tokenId: h.ref.tokenId, shares: h.ref.shares });
        outcomes.set(h.id, { ok: true, txHashes: [] });
      } catch (error) {
        const noBid = error instanceof CashoutError || isNoLiquidity(error);
        fail(h.id, error, !noBid);
      }
    }
    // Finally the collateral, which now includes whatever the steps above
    // freed, delivered as USDC on Base straight to the new wallet.
    const collateral = holdings.find((h) => h.ref.kind === "collateral");
    if (collateral && !ctx.signal.aborted) {
      ctx.onProgress("Moving the prediction balance to your new wallet");
      try {
        const result = await settleCollateral({
          client,
          eoa,
          recipient: ctx.current.evm,
          sendBatch: (calls, chainId) => ctx.signer.sendBatch(calls, chainId),
          sendToken: ctx.signer.sendToken,
        });
        outcomes.set(collateral.id, { ok: true, txHashes: result.txHashes });
      } catch (error) {
        fail(collateral.id, error, true);
      }
    }
    return outcomes;
  },
};

// ---------------------------------------------------------------------------
// World Street CPMM
// ---------------------------------------------------------------------------

export type CpmmRef =
  | { kind: "claim" }
  | { kind: "redeem"; marketId: bigint; side: Side; shares: bigint }
  | { kind: "shares"; marketId: bigint; side: Side; shares: bigint }
  | { kind: "lp"; marketId: bigint; lpShares: bigint; winning: Side | null }
  | { kind: "legacy"; redeemables: LegacyRedeemable[] };

export interface CpmmInput {
  markets: Market[];
  // Live on-chain share balances, one per (market, side) the wallet holds.
  positions: Position[];
  lpPositions: LpPosition[];
  // Seconds since the epoch, the moment redeem() starts paying.
  redeemableAt: Map<string, number>;
  pendingWithdrawals: bigint;
  legacy: { redeemables: LegacyRedeemable[]; pending: bigint };
  nowSeconds: number;
}

function marketLabel(market: Market | undefined, marketId: bigint): string {
  return market?.question ?? `market #${marketId.toString()}`;
}

function priceOf(market: Market, side: Side): bigint {
  return side === "yes" ? market.priceYes : market.priceNo;
}

// USDC (6 decimals) as a display number.
function usdcToUsd(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

// Pure: what the wallet holds in the CPMM, as holdings. Exported for its test.
export function classifyCpmm(input: CpmmInput): LegacyHolding<CpmmRef>[] {
  const holdings: LegacyHolding<CpmmRef>[] = [];
  const byId = new Map(input.markets.map((m) => [m.marketId.toString(), m]));
  const base = {
    venue: "cpmm" as const,
    chainId: PREDICTION_CHAIN_ID,
    decimals: USDC_DECIMALS,
    symbol: "USDC",
  };

  if (input.pendingWithdrawals > 0n) {
    holdings.push({
      ...base,
      id: holdingId("cpmm", "claim", "pending"),
      kind: "claim",
      label: "Prediction payouts waiting to be claimed",
      amount: input.pendingWithdrawals,
      valueUsd: usdcToUsd(input.pendingWithdrawals),
      deterministic: true,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "claim" },
    });
  }

  for (const position of input.positions) {
    if (position.shares <= 0n) continue;
    const key = position.marketId.toString();
    const market = byId.get(key);
    const label = `${marketLabel(market, position.marketId)} (${position.side.toUpperCase()})`;
    const ref = { marketId: position.marketId, side: position.side, shares: position.shares };
    if (!market) {
      holdings.push({
        ...base,
        id: holdingId("cpmm", "shares", `${key}:${position.side}`),
        kind: "shares",
        label,
        amount: position.shares,
        valueUsd: 0,
        deterministic: false,
        irreversible: true,
        settleability: { state: "stranded", reason: "invalidMarket" },
        ref: { kind: "shares", ...ref },
      });
      continue;
    }
    const winner = winningSide(market.status, market.outcome);
    if (market.status === "Resolved" && winner) {
      // The losing side of a resolved market is worth nothing; nothing to move.
      if (winner !== position.side) continue;
      const at = input.redeemableAt.get(key) ?? null;
      const open = at !== null && at <= input.nowSeconds;
      holdings.push({
        ...base,
        id: holdingId("cpmm", "redeem", `${key}:${position.side}`),
        kind: "redeem",
        label: `${label} winnings`,
        amount: position.shares,
        valueUsd: usdcToUsd(position.shares),
        deterministic: true,
        irreversible: false,
        settleability: open
          ? { state: "now" }
          : { state: "waitUntil", at: at === null ? null : at * 1000, reason: "challengeWindow" },
        ref: { kind: "redeem", ...ref },
      });
      continue;
    }
    if (market.status === "Invalid") {
      holdings.push({
        ...base,
        id: holdingId("cpmm", "shares", `${key}:${position.side}`),
        kind: "shares",
        label,
        amount: position.shares,
        valueUsd: 0,
        deterministic: false,
        irreversible: true,
        settleability: { state: "stranded", reason: "invalidMarket" },
        ref: { kind: "shares", ...ref },
      });
      continue;
    }
    const valueUsd = usdcToUsd((position.shares * priceOf(market, position.side)) / PRICE_SCALE);
    holdings.push({
      ...base,
      id: holdingId("cpmm", "shares", `${key}:${position.side}`),
      kind: "shares",
      label,
      amount: position.shares,
      valueUsd,
      deterministic: false,
      irreversible: true,
      // A closed market no longer trades; the shares wait for resolution.
      settleability:
        market.status === "Open"
          ? { state: "now" }
          : { state: "waitUntil", at: null, reason: "awaitingResolution" },
      ref: { kind: "shares", ...ref },
    });
  }

  for (const lp of input.lpPositions) {
    if (lp.lpShares <= 0n) continue;
    const key = lp.marketId.toString();
    const market = byId.get(key);
    const winning = market ? winningSide(market.status, market.outcome) : null;
    const share =
      market && market.totalLp > 0n ? (market.collateral * lp.lpShares) / market.totalLp : 0n;
    const resolved = market?.status === "Resolved" && winning !== null;
    holdings.push({
      ...base,
      id: holdingId("cpmm", "lp", key),
      kind: "lp",
      label: `${marketLabel(market, lp.marketId)} liquidity`,
      amount: share,
      valueUsd: usdcToUsd(share),
      deterministic: resolved,
      irreversible: !resolved,
      settleability: !market
        ? { state: "stranded", reason: "invalidMarket" }
        : market.status === "Invalid"
          ? { state: "stranded", reason: "invalidMarket" }
          : resolved || market.status === "Open"
            ? { state: "now" }
            : { state: "waitUntil", at: null, reason: "awaitingResolution" },
      ref: { kind: "lp", marketId: lp.marketId, lpShares: lp.lpShares, winning },
    });
  }

  const solvent = input.legacy.redeemables.filter((r) => r.solvent);
  const blocked = input.legacy.redeemables.filter((r) => !r.solvent);
  const claimable = solvent.reduce((sum, r) => sum + r.shares, 0n) + input.legacy.pending;
  if (claimable > 0n) {
    holdings.push({
      ...base,
      id: holdingId("cpmm", "legacy", "claim"),
      kind: "legacy",
      label: "Payouts from the previous prediction contract",
      amount: claimable,
      valueUsd: usdcToUsd(claimable),
      deterministic: true,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "legacy", redeemables: solvent },
    });
  }
  for (const r of blocked) {
    holdings.push({
      ...base,
      id: holdingId("cpmm", "legacy", `${r.marketId.toString()}:${r.side}`),
      kind: "legacy",
      label: r.label,
      amount: r.shares,
      valueUsd: usdcToUsd(r.shares),
      deterministic: true,
      irreversible: false,
      settleability: { state: "stranded", reason: "insolventMarket" },
      ref: { kind: "legacy", redeemables: [r] },
    });
  }
  return holdings;
}

function contractCall(data: `0x${string}`): EvmBatchCall {
  return { to: predictionContractAddress(), data };
}

function redeemCall(marketId: bigint, side: Side, shares: bigint): EvmBatchCall {
  return contractCall(
    encodeFunctionData({
      abi: PREDICTION_ABI,
      functionName: "redeem",
      args: [marketId, sideToUint(side), shares],
    })
  );
}

function claimCall(): EvmBatchCall {
  return contractCall(encodeFunctionData({ abi: PREDICTION_ABI, functionName: "claim", args: [] }));
}

function removeLiquidityCall(marketId: bigint, lpShares: bigint): EvmBatchCall {
  return contractCall(
    encodeFunctionData({
      abi: PREDICTION_ABI,
      functionName: "removeLiquidity",
      args: [marketId, lpShares, 0n],
    })
  );
}

const SELL_TOLERANCE_BPS = 50;

async function sellCall(marketId: bigint, side: Side, shares: bigint): Promise<EvmBatchCall> {
  const pool = await readPoolState(marketId);
  const quote = quoteSell(pool.rYes, pool.rNo, side, shares, pool.feeBps);
  return contractCall(
    encodeFunctionData({
      abi: PREDICTION_ABI,
      functionName: "sell",
      args: [marketId, sideToUint(side), shares, minOut(quote.usdcOut, SELL_TOLERANCE_BPS)],
    })
  );
}

export const cpmmMigrationAdapter: VenueAdapter<CpmmRef> = {
  venue: "cpmm",
  requiresLegacySession: false,
  async discover({ legacy }) {
    const wallet = legacy.evm;
    if (!wallet) return [];
    const [markets, indexed, lpPositions, pendingWithdrawals, legacyState] = await Promise.all([
      listMarkets(),
      getPositions(wallet),
      getLpPositions(wallet),
      readPendingWithdrawals(wallet),
      readLegacyClaimState(wallet),
    ]);
    // The indexer says where to look; the contract says what is really there.
    const positions = (
      await Promise.all(
        indexed.map(async (p) => ({
          ...p,
          shares: await readShareBalance(wallet, p.marketId, p.side),
        }))
      )
    ).filter((p) => p.shares > 0n);
    const resolvedIds = [
      ...new Set(
        positions
          .map((p) => p.marketId)
          .filter((id) => markets.find((m) => m.marketId === id)?.status === "Resolved")
          .map((id) => id.toString())
      ),
    ];
    const redeemableAt = new Map<string, number>();
    await Promise.all(
      resolvedIds.map(async (id) => {
        redeemableAt.set(id, await readRedeemableAt(BigInt(id)));
      })
    );
    return classifyCpmm({
      markets,
      positions,
      lpPositions,
      redeemableAt,
      pendingWithdrawals,
      legacy: { redeemables: legacyState.redeemables, pending: legacyState.pending },
      nowSeconds: Math.floor(Date.now() / 1000),
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
    const send = (calls: EvmBatchCall[]) => ctx.signer.sendBatch(calls, PREDICTION_CHAIN_ID);

    // Redeems and the claim ride together: redeem() only credits
    // pendingWithdrawals, claim() pays msg.sender.
    const redeems = holdings.filter((h) => h.ref.kind === "redeem");
    const claim = holdings.find((h) => h.ref.kind === "claim");
    if (redeems.length > 0 || claim) {
      ctx.onProgress("Claiming prediction winnings");
      try {
        const calls: EvmBatchCall[] = [];
        for (const h of redeems) {
          if (h.ref.kind === "redeem")
            calls.push(redeemCall(h.ref.marketId, h.ref.side, h.ref.shares));
        }
        calls.push(claimCall());
        const hash = await send(calls);
        for (const h of redeems) outcomes.set(h.id, { ok: true, txHashes: [hash] });
        if (claim) outcomes.set(claim.id, { ok: true, txHashes: [hash] });
      } catch (error) {
        for (const h of redeems) fail(h.id, error);
        if (claim) fail(claim.id, error);
      }
    }

    // The previous contract has its own claim path.
    for (const h of holdings) {
      if (ctx.signal.aborted || h.ref.kind !== "legacy") continue;
      ctx.onProgress("Claiming from the previous prediction contract");
      try {
        const hash = await send(buildLegacyClaimCalls(h.ref.redeemables));
        outcomes.set(h.id, { ok: true, txHashes: [hash] });
      } catch (error) {
        fail(h.id, error);
      }
    }

    // Sells one per transaction so a pool that moved does not revert the rest.
    for (const h of holdings) {
      if (ctx.signal.aborted || h.ref.kind !== "shares") continue;
      ctx.onProgress(`Selling ${h.label}`);
      try {
        const hash = await send([await sellCall(h.ref.marketId, h.ref.side, h.ref.shares)]);
        outcomes.set(h.id, { ok: true, txHashes: [hash] });
      } catch (error) {
        fail(h.id, error);
      }
    }

    // LP: removeLiquidity hands back USDC plus the pool's share tokens. On a
    // resolved market the winning tokens are worth 1:1, so a second batch
    // redeems what came back and claims it.
    for (const h of holdings) {
      if (ctx.signal.aborted || h.ref.kind !== "lp") continue;
      ctx.onProgress(`Returning ${h.label}`);
      try {
        const { marketId, lpShares, winning } = h.ref;
        const hashes = [await send([removeLiquidityCall(marketId, lpShares)])];
        if (winning) {
          const shares = await readShareBalance(wallet, marketId, winning);
          const calls = shares > 0n ? [redeemCall(marketId, winning, shares)] : [];
          calls.push(claimCall());
          hashes.push(await send(calls));
        }
        outcomes.set(h.id, { ok: true, txHashes: hashes });
      } catch (error) {
        fail(h.id, error);
      }
    }
    return outcomes;
  },
};
