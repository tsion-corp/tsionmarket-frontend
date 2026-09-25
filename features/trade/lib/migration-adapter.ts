"use client";

// The perps venue of the account upgrade: what the OLD wallet still holds on
// Hyperliquid, and how it is flattened and brought across.
//
// Perp's money is not in perp (apps/perp/DECANE_MIGRATION.md): margin,
// positions, orders and the USDC balance live on Hyperliquid, keyed by the
// address that signed for them, and only that address's key can touch them.
// So the upgrade signs every action with the legacy wallet — the same
// prepare/sign/submit pairs the live trade screen uses, through the same
// gateway routes — and never moves a database row. The old address counts
// as migrated when it is flat and empty; the service is the one to say so.
//
// Order of operations, one settle call: cancel resting orders (freed
// collateral is not re-locked by a close), close open positions, then
// withdraw whatever is withdrawable to the old wallet on Arbitrum and bring
// it the last hop to Base, where the wallet sweep already moves USDC to the
// new account. A hop that does not finish leaves the money on Arbitrum with
// the venue's own pending-withdrawal record, and the next discovery offers
// that hop again rather than losing track of it.

import type { Address } from "viem";
import {
  getAccountState,
  getArbitrumBalance,
  getOrCreateWallet,
  getPendingWithdrawal,
  listAssets,
  listOrders,
  listPositions,
  prepareCancelOrder,
  prepareClosePosition,
  prepareWithdrawal,
  submitCancelOrder,
  submitClosePosition,
  submitWithdrawal,
} from "@/features/trade/lib/hyperliquid-api";
import { createHyperliquidSigner } from "@/features/trade/lib/hyperliquid-signer";
import {
  isRestingOrder,
  type HlAsset,
  type HlOrderRow,
  type HlPositionView,
} from "@/features/trade/lib/hyperliquid-types";
import { getCctpFeeQuote, lookupCctpAttestation } from "@/features/trade/lib/cctp-api";
import { sendArbitrumUsdcToBase } from "@/features/trade/lib/cctp-transfers";
import {
  PERPS_PLATFORM_WITHDRAWAL_FEE_USDC,
  planWithdrawal,
} from "@/features/trade/lib/perps-withdrawal";
import { toBaseUnits } from "@/lib/trade/math";
import { decimalToBaseUnits, holdingId } from "@/lib/migration/holding";
import type {
  LegacyHolding,
  SettleContext,
  SettleOutcome,
  VenueAdapter,
} from "@/lib/migration/types";

const USDC_DECIMALS = 6;

export type PerpRef =
  | { kind: "position"; position: HlPositionView }
  | { kind: "order"; order: HlOrderRow }
  // The withdrawable USDC balance on Hyperliquid.
  | { kind: "balance"; walletId: string }
  // A withdrawal that reached the old wallet on Arbitrum and never made the
  // hop to Base — the venue still records it as pending.
  | { kind: "arbitrum"; walletId: string };

// A close is a market order the venue fills in seconds; the mirror the
// gateway serves catches up on its next reconciliation pass.
const FLAT_POLL_MS = 4_000;
const FLAT_POLL_ATTEMPTS = 12;
// Withdrawals settle slower than deposits (matches the trade screen's own
// WITHDRAWAL_POLL_TIMEOUT_MS): give the Arbitrum credit that long to land.
const ARBITRUM_POLL_MS = 4_000;
const ARBITRUM_POLL_TIMEOUT_MS = 240_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function num(value: string | null | undefined): number {
  const n = Number(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function usdc(value: number): bigint {
  return decimalToBaseUnits(Math.max(0, value).toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

function symbolOf(assets: HlAsset[], assetId: string): string {
  return assets.find((a) => a.id === assetId)?.symbol ?? "perp";
}

// Pure: what the old wallet holds at Hyperliquid, as holdings. Exported for
// its test.
export function classifyPerps(input: {
  walletId: string;
  positions: HlPositionView[];
  orders: HlOrderRow[];
  assets: HlAsset[];
  /** The account's withdrawable USDC, as the venue reports it. */
  withdrawable: string;
  /** USDC sitting on the old wallet's Arbitrum address, ONLY when the venue
   *  records an unfinished withdrawal for it; null otherwise. */
  strandedOnArbitrum: string | null;
}): LegacyHolding<PerpRef>[] {
  const holdings: LegacyHolding<PerpRef>[] = [];

  for (const order of input.orders.filter(isRestingOrder)) {
    const symbol = symbolOf(input.assets, order.assetId);
    holdings.push({
      id: holdingId("perps", "order", order.id),
      venue: "perps",
      kind: "order",
      label: `${symbol} ${order.side} ${order.orderType.replace("_", " ")}${
        order.limitPrice ? ` at ${order.limitPrice}` : ""
      }`,
      // A resting order locks no collateral on a cross-margined account; it
      // is listed so it is cancelled, not for what it is worth.
      amount: 0n,
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: 0,
      deterministic: false,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "order", order },
    });
  }

  for (const position of input.positions.filter((p) => p.status === "open")) {
    const asset = input.assets.find((a) => a.id === position.assetId);
    const symbol = asset?.symbol ?? "perp";
    const margin =
      position.leverage > 0
        ? (num(position.size) * num(position.entryPrice)) / position.leverage
        : 0;
    holdings.push({
      id: holdingId("perps", "position", position.id),
      venue: "perps",
      kind: "position",
      label: `${symbol} ${position.side} ${position.leverage}x`,
      amount: usdc(margin),
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: margin + num(position.unrealizedPnlUsdc),
      deterministic: false,
      irreversible: true,
      // A delisted market cannot be closed at market; listing it as stranded
      // keeps it visible without letting a close sit unfilled.
      settleability:
        asset && !asset.isActive ? { state: "stranded", reason: "closedMarket" } : { state: "now" },
      ref: { kind: "position", position },
    });
  }

  const withdrawable = num(input.withdrawable);
  if (withdrawable > 0) {
    const plan = planWithdrawal({ total: input.withdrawable, withdrawable: input.withdrawable });
    holdings.push({
      id: holdingId("perps", "balance", input.walletId),
      venue: "perps",
      kind: "balance",
      label: "USDC on Perpetuals",
      amount: usdc(withdrawable),
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: withdrawable,
      deterministic: true,
      irreversible: false,
      // Below the venue's own withdrawal fee there is nothing to receive.
      settleability:
        plan.kind === "ok" ? { state: "now" } : { state: "stranded", reason: "belowMinimum" },
      ref: { kind: "balance", walletId: input.walletId },
    });
  }

  const onArbitrum = num(input.strandedOnArbitrum);
  if (onArbitrum > 0) {
    holdings.push({
      id: holdingId("perps", "arbitrum", input.walletId),
      venue: "perps",
      kind: "arbitrum",
      label: "USDC on Arbitrum, on its way from Perpetuals",
      amount: usdc(onArbitrum),
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: onArbitrum,
      deterministic: true,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "arbitrum", walletId: input.walletId },
    });
  }

  return holdings;
}

async function waitUntilFlat(walletId: string, closed: Set<string>): Promise<Set<string>> {
  let stillOpen = closed;
  for (let attempt = 0; attempt < FLAT_POLL_ATTEMPTS && stillOpen.size > 0; attempt++) {
    await delay(FLAT_POLL_MS);
    const positions = await listPositions(walletId).catch(() => null);
    if (!positions) continue;
    stillOpen = new Set(
      positions.filter((p) => p.status === "open" && closed.has(p.id)).map((p) => p.id)
    );
  }
  return stillOpen;
}

// Brings USDC that a withdrawal put on the old wallet's Arbitrum address to
// Base, signed by the old wallet, so the wallet sweep can carry it across.
// `since` is the balance before the withdrawal; the hop waits for it to grow.
async function hopArbitrumToBase(
  ctx: SettleContext,
  address: Address,
  since: bigint | null
): Promise<void> {
  const decimals = USDC_DECIMALS;
  let amount = 0n;
  if (since === null) {
    amount = toBaseUnits(await getArbitrumBalance(address), decimals);
  } else {
    ctx.onProgress("Waiting for the withdrawal to reach Arbitrum");
    const deadline = Date.now() + ARBITRUM_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = await getArbitrumBalance(address).catch(() => null);
      if (current !== null && toBaseUnits(current, decimals) > since) {
        amount = toBaseUnits(current, decimals) - since;
        break;
      }
      await delay(ARBITRUM_POLL_MS);
    }
    if (amount === 0n) {
      throw new Error("The withdrawal has not reached Arbitrum yet. Try again in a few minutes.");
    }
  }
  if (amount <= 0n) return;
  ctx.onProgress("Moving it from Arbitrum to Base");
  await sendArbitrumUsdcToBase(
    {
      sendBatch: (calls, chainId) => ctx.signer.sendBatch(calls, chainId),
      feeQuote: getCctpFeeQuote,
      lookupAttestation: lookupCctpAttestation,
    },
    { amount, recipient: address }
  );
}

export const perpsMigrationAdapter: VenueAdapter<PerpRef> = {
  venue: "perps",
  requiresLegacySession: false,

  async discover({ legacy }) {
    if (!legacy.evm) return [];
    const wallet = await getOrCreateWallet(legacy.evm);
    const [positions, orders, assets, state, pending] = await Promise.all([
      listPositions(wallet.id),
      listOrders(wallet.id),
      listAssets().catch(() => [] as HlAsset[]),
      getAccountState(legacy.evm),
      getPendingWithdrawal(wallet.id).catch(() => null),
    ]);
    // Gated on the venue's own record of an unfinished withdrawal, never on
    // an Arbitrum balance alone: a wallet mid-funding has one too, and that
    // must not be sent to Base.
    const strandedOnArbitrum = pending
      ? await getArbitrumBalance(legacy.evm).catch(() => null)
      : null;
    return classifyPerps({
      walletId: wallet.id,
      positions,
      orders,
      assets,
      withdrawable: state.withdrawable,
      strandedOnArbitrum,
    });
  },

  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    const address = ctx.legacy.evm as Address | null;
    if (!address || holdings.length === 0) return outcomes;
    const walletId = (() => {
      const [first] = holdings;
      const ref = first.ref;
      return ref.kind === "position"
        ? ref.position.walletId
        : ref.kind === "order"
          ? ref.order.walletId
          : ref.walletId;
    })();
    const signer = createHyperliquidSigner({
      address,
      getEthereumProvider: () => ctx.signer.getEthereumProvider(),
    });
    const fail = (id: string, error: unknown, retryable = true) =>
      outcomes.set(id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable,
      });

    // Cancels first: freed collateral is not re-locked by a close.
    const orderHoldings = holdings.filter((h) => h.ref.kind === "order");
    if (orderHoldings.length > 0) ctx.onProgress("Cancelling resting orders");
    for (const h of orderHoldings) {
      if (h.ref.kind !== "order") continue;
      try {
        const prepared = await prepareCancelOrder(walletId, h.ref.order.id);
        const signature = await signer.signL1(prepared.action, prepared.nonce);
        await submitCancelOrder(walletId, prepared, signature);
        outcomes.set(h.id, { ok: true, txHashes: [] });
      } catch (error) {
        fail(h.id, error);
      }
    }

    // Closes, one signed action each, then wait for the venue to report flat.
    const positionHoldings = holdings.filter((h) => h.ref.kind === "position");
    const closed = new Set<string>();
    if (positionHoldings.length > 0) ctx.onProgress("Closing open positions");
    for (const h of positionHoldings) {
      if (h.ref.kind !== "position") continue;
      try {
        const prepared = await prepareClosePosition(walletId, h.ref.position.id);
        const signature = await signer.signL1(prepared.action, prepared.nonce);
        await submitClosePosition(walletId, prepared, signature);
        closed.add(h.ref.position.id);
      } catch (error) {
        fail(h.id, error);
      }
    }
    if (closed.size > 0) {
      ctx.onProgress("Waiting for the closes to fill");
      const stillOpen = await waitUntilFlat(walletId, closed);
      for (const h of positionHoldings) {
        if (h.ref.kind !== "position" || !closed.has(h.ref.position.id)) continue;
        if (stillOpen.has(h.ref.position.id)) {
          fail(h.id, new Error("The close has not filled yet. Try again in a moment."));
        } else {
          outcomes.set(h.id, { ok: true, txHashes: [] });
        }
      }
    }

    // Whatever is withdrawable now — the balance itself, and the margin the
    // closes just freed — leaves for the old wallet on Arbitrum, then Base.
    const balanceHolding = holdings.find((h) => h.ref.kind === "balance");
    if (balanceHolding || closed.size > 0) {
      try {
        const state = await getAccountState(address);
        let plan = planWithdrawal({ total: state.withdrawable, withdrawable: state.withdrawable });
        if (plan.kind === "ok") {
          ctx.onProgress("Withdrawing from Perpetuals");
          const before = await getArbitrumBalance(address)
            .then((b) => toBaseUnits(b, USDC_DECIMALS))
            .catch(() => null);
          // prepare takes the withdraw3 amount itself, so the platform fee is
          // subtracted before it. The backend is the authority on that fee:
          // if it prepared a different one, plan again with its figure.
          let prepared = await prepareWithdrawal(walletId, plan.withdraw3Amount);
          const preparedFee = prepared.fee?.amountUsdc ?? "0";
          if (
            toBaseUnits(preparedFee, USDC_DECIMALS) !==
            toBaseUnits(PERPS_PLATFORM_WITHDRAWAL_FEE_USDC, USDC_DECIMALS)
          ) {
            plan = planWithdrawal({
              total: state.withdrawable,
              withdrawable: state.withdrawable,
              platformFee: preparedFee,
            });
            if (plan.kind !== "ok")
              throw new Error("Too little is left to cover the withdrawal fee.");
            prepared = await prepareWithdrawal(walletId, plan.withdraw3Amount);
          }
          const signature = await signer.signWithdrawal(prepared.withdraw.action);
          const fee = prepared.fee
            ? {
                action: prepared.fee.action,
                signature: await signer.signDexTransfer(prepared.fee.action),
              }
            : null;
          await submitWithdrawal(walletId, prepared.withdraw.action, signature, fee);
          if (balanceHolding) outcomes.set(balanceHolding.id, { ok: true, txHashes: [] });
          // The venue has accepted it: the money is the old wallet's, on
          // Arbitrum, from here. The hop is best effort and reported as its
          // own failure — the next discovery finds the pending withdrawal and
          // offers the hop again.
          try {
            await hopArbitrumToBase(ctx, address, before ?? 0n);
          } catch (error) {
            console.warn(
              "Perps withdrawal reached Arbitrum; the move to Base did not finish",
              error
            );
            if (balanceHolding) fail(balanceHolding.id, error);
          }
        } else if (balanceHolding) {
          fail(
            balanceHolding.id,
            new Error("Too little is left on Perpetuals to cover the withdrawal fee."),
            false
          );
        }
      } catch (error) {
        if (balanceHolding) fail(balanceHolding.id, error);
      }
    }

    // A withdrawal from an earlier attempt that is still sitting on Arbitrum.
    const arbitrumHolding = holdings.find((h) => h.ref.kind === "arbitrum");
    if (arbitrumHolding) {
      try {
        await hopArbitrumToBase(ctx, address, null);
        outcomes.set(arbitrumHolding.id, { ok: true, txHashes: [] });
      } catch (error) {
        fail(arbitrumHolding.id, error);
      }
    }

    return outcomes;
  },
};
