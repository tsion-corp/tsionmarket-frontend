"use client";

// Perpetuals (Avantis on Base) as a migration venue. Collateral lives inside
// the Avantis contracts keyed by the trader, so the only way out is to cancel
// resting orders and close open positions from the OLD wallet; every payout
// lands on that wallet and the sweep moves it. Closing realises PnL, so
// positions are opt-in. Orders are opt-in too (cancelling is a user
// decision), though cancelling loses nothing.

import {
  buildCancelOrder,
  buildCloseTrade,
  fetchPerpOrders,
  fetchPerpPairs,
  fetchPerpPositions,
  fetchPerpPrices,
} from "@/lib/perp/api";
import { ensureKeeperGas } from "@/lib/perp/gas-topup";
import { isLikelyClosed, PERP_CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS } from "@/lib/perp/logic";
import { toSignableCalls } from "@/lib/perp/steps";
import type { BuildResult, OpenPosition, PerpOrder, PerpPair, PerpPrice } from "@/lib/perp/types";
import { decimalToBaseUnits, holdingId } from "@/lib/migration/holding";
import type { LegacyHolding, SettleOutcome, VenueAdapter } from "@/lib/migration/types";

export type PerpRef =
  { kind: "position"; position: OpenPosition } | { kind: "order"; order: PerpOrder };

// Matches the positions panel: a close is keeper-executed and shows up in the
// trades feed a few seconds later.
const FILL_POLL_MS = 4_000;
const FILL_POLL_ATTEMPTS = 12;

function pairName(pairs: PerpPair[], pairIndex: number): string {
  const pair = pairs.find((p) => p.pairIndex === pairIndex);
  return pair ? `${pair.from}/${pair.to}` : `pair #${pairIndex}`;
}

function usd(value: string | null | undefined): number {
  const n = Number(value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

// Pure: what the trader holds at Avantis, as holdings. Exported for its test.
export function classifyPerps(input: {
  positions: OpenPosition[];
  orders: PerpOrder[];
  pairs: PerpPair[];
  prices: PerpPrice[];
  nowSeconds: number;
}): LegacyHolding<PerpRef>[] {
  const holdings: LegacyHolding<PerpRef>[] = [];
  for (const order of input.orders) {
    holdings.push({
      id: holdingId("perps", "order", `${order.pairIndex}:${order.index}`),
      venue: "perps",
      kind: "order",
      label: `${pairName(input.pairs, order.pairIndex)} ${order.isLong ? "long" : "short"} order at ${order.price}`,
      chainId: PERP_CHAIN_ID,
      amount: decimalToBaseUnits(order.collateralUsdc, USDC_DECIMALS),
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: usd(order.collateralUsdc),
      deterministic: false,
      irreversible: false,
      settleability: { state: "now" },
      ref: { kind: "order", order },
    });
  }
  for (const position of input.positions) {
    const pair = input.pairs.find((p) => p.pairIndex === position.pairIndex);
    const price = input.prices.find((p) => p.pairIndex === position.pairIndex);
    const closed = pair
      ? isLikelyClosed(pair.category, price?.publishTime ?? null, input.nowSeconds)
      : false;
    holdings.push({
      id: holdingId("perps", "position", `${position.pairIndex}:${position.index}`),
      venue: "perps",
      kind: "position",
      label: `${pairName(input.pairs, position.pairIndex)} ${position.isLong ? "long" : "short"} ${position.leverage}x`,
      chainId: PERP_CHAIN_ID,
      amount: decimalToBaseUnits(position.initialCollateralUsdc, USDC_DECIMALS),
      decimals: USDC_DECIMALS,
      symbol: "USDC",
      valueUsd: usd(position.initialCollateralUsdc) + usd(position.unrealizedPnlUsdc),
      deterministic: false,
      irreversible: true,
      // A closed market's keeper cannot fill until it reopens; listing it as
      // stranded keeps it visible without letting a close sit unfilled.
      settleability: closed ? { state: "stranded", reason: "closedMarket" } : { state: "now" },
      ref: { kind: "position", position },
    });
  }
  return holdings;
}

async function waitForKeeper(
  trader: string,
  positionKeys: Set<string>,
  orderKeys: Set<string>
): Promise<boolean> {
  for (let attempt = 0; attempt < FILL_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, FILL_POLL_MS));
    const [positions, orders] = await Promise.all([
      fetchPerpPositions(trader).catch(() => null),
      fetchPerpOrders(trader).catch(() => null),
    ]);
    if (!positions || !orders) continue;
    const positionsLeft = positions.some((p) => positionKeys.has(`${p.pairIndex}:${p.index}`));
    const ordersLeft = orders.some((o) => orderKeys.has(`${o.pairIndex}:${o.index}`));
    if (!positionsLeft && !ordersLeft) return true;
  }
  return false;
}

export const perpsMigrationAdapter: VenueAdapter<PerpRef> = {
  venue: "perps",
  requiresLegacySession: false,
  async discover({ legacy }) {
    if (!legacy.evm) return [];
    const [positions, orders, pairs, prices] = await Promise.all([
      fetchPerpPositions(legacy.evm),
      fetchPerpOrders(legacy.evm),
      fetchPerpPairs(),
      fetchPerpPrices().catch(() => [] as PerpPrice[]),
    ]);
    return classifyPerps({
      positions,
      orders,
      pairs,
      prices,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  },
  async settle(holdings, ctx) {
    const outcomes = new Map<string, SettleOutcome>();
    const trader = ctx.legacy.evm as `0x${string}` | null;
    if (!trader) return outcomes;
    const fail = (id: string, error: unknown, retryable = true) =>
      outcomes.set(id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable,
      });
    // The old wallet funds the keeper fee (real ETH msg.value) from its own
    // USDC when it is short, exactly as the trade sheet does for the app
    // wallet. Bought ETH is delivered to the old wallet.
    const sendUsdc = (to: string, amount: bigint) =>
      ctx.signer.sendToken({
        network: "base-mainnet",
        tokenAddress: USDC_ADDRESS,
        decimals: USDC_DECIMALS,
        to,
        amount,
      });
    const send = async (builds: BuildResult[]) => {
      const gas = await ensureKeeperGas(trader, builds, { sendUsdc });
      if (!gas.ok) throw new Error(`Keeper fee could not be funded (${gas.code}).`);
      return ctx.signer.sendBatch(toSignableCalls(builds), PERP_CHAIN_ID);
    };

    const orderHoldings = holdings.filter((h) => h.ref.kind === "order");
    const positionHoldings = holdings.filter((h) => h.ref.kind === "position");
    const cancelledKeys = new Set<string>();
    const closedKeys = new Set<string>();

    // Cancels first, batched: freed order collateral is not re-locked by a
    // close, and one cancel cannot revert on the keeper.
    if (orderHoldings.length > 0) {
      ctx.onProgress("Cancelling resting orders");
      try {
        const builds = await Promise.all(
          orderHoldings.map((h) =>
            h.ref.kind === "order"
              ? buildCancelOrder({
                  pairIndex: h.ref.order.pairIndex,
                  orderIndex: h.ref.order.index,
                })
              : Promise.reject(new Error("not an order"))
          )
        );
        const hash = await send(builds);
        for (const h of orderHoldings) {
          outcomes.set(h.id, { ok: true, txHashes: [hash] });
          if (h.ref.kind === "order")
            cancelledKeys.add(`${h.ref.order.pairIndex}:${h.ref.order.index}`);
        }
      } catch (error) {
        for (const h of orderHoldings) fail(h.id, error);
      }
    }

    // Closes one per transaction: a market the keeper cannot fill must not
    // take the others down with it.
    for (const h of positionHoldings) {
      if (ctx.signal.aborted || h.ref.kind !== "position") continue;
      const { position } = h.ref;
      ctx.onProgress(`Closing ${h.label}`);
      try {
        const build = await buildCloseTrade({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          collateralUsdc: position.initialCollateralUsdc,
        });
        const hash = await send([build]);
        outcomes.set(h.id, { ok: true, txHashes: [hash] });
        closedKeys.add(`${position.pairIndex}:${position.index}`);
      } catch (error) {
        fail(h.id, error);
      }
    }

    // The batch only queues the close; the keeper executes it. Wait for the
    // trades feed to drop the keys before the sweep reads the collateral.
    if (cancelledKeys.size > 0 || closedKeys.size > 0) {
      ctx.onProgress("Waiting for the keeper to execute");
      const filled = await waitForKeeper(trader, closedKeys, cancelledKeys);
      if (!filled) {
        for (const h of holdings) {
          const outcome = outcomes.get(h.id);
          if (outcome?.ok) {
            outcomes.set(h.id, {
              ok: false,
              error: "The keeper has not executed this yet. Run again in a minute.",
              retryable: true,
            });
          }
        }
      }
    }
    return outcomes;
  },
};
