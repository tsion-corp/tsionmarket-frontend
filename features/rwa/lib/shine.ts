// What a confirmed real-asset trade tells Shine, and what it refuses to tell
// it. Pure, so the two call sites — the order ticket and the dashboard-scoped
// settlement worker — decide nothing for themselves.

import { rwaExecutionIsConfirmed } from "@/features/rwa/lib/chains";
import type { RwaApiAsset, RwaChain } from "@/lib/rwa/catalog";
import { entryPriceFromUsdString, type EntryPrice } from "@/lib/shine/money";
import type { ShineEvent } from "@/lib/shine/types";

export type RwaShineEvent = Extract<ShineEvent, { service: "rwa" }>;

/**
 * The dedup id for one RWA trade: the stable catalogue id of the asset, plus
 * the id of the action that was actually executed.
 *
 * `execute` returns void and the transaction hash never leaves it, so a hash
 * is not available to key by. The catalogue id is stable across a reload and
 * across a re-listing; the action id is what makes it unique per trade, so a
 * second buy of the same asset is a second post rather than a suppressed one.
 */
export function rwaTradeId(assetId: string, actionId: string): string {
  return `${assetId}:${actionId}`;
}

/**
 * The per-unit price a post may state, from the decimal string the catalogue
 * serves, or null when it serves none.
 *
 * This is the asset's quoted price, which is what the ticket showed the person
 * as they confirmed — not the executed fill price. The fill price is not
 * recoverable here: `execute` hands nothing back, and the quote's implied
 * price divides by the received asset's decimals, which on a first buy are
 * read from a holding the user does not have yet (the known defect recorded in
 * use-rwa-ticket.ts). A quoted price that is a shade off is still true about
 * what was on screen; a price derived from decimals that may be missing is not.
 */
export function rwaEntryPrice(
  asset: Pick<RwaApiAsset, "priceUsd"> & Partial<Pick<RwaApiAsset, "issuerData">>
): EntryPrice | null {
  return entryPriceFromUsdString(asset.priceUsd ?? asset.issuerData?.navPriceUsd ?? null);
}

export interface RwaShineInput {
  /** From `rwaTradeId`, or the settlement request id for a background purchase. */
  id: string;
  symbol: string;
  chain: RwaChain;
  side: "buy" | "sell";
  price: EntryPrice | null;
  /** How many steps the executed action carried. Nothing signed is nothing confirmed. */
  stepCount: number;
}

/**
 * The event a settled RWA trade warrants, or null when there is nothing Shine
 * is allowed to say about it.
 *
 * A sale carries no return: the app holds no cost basis for a real-world asset
 * anywhere, so there is no entry to measure an exit against. `pnl: null` is the
 * honest answer and the composer simply leaves it out of the sentence.
 */
export function rwaShineEvent(input: RwaShineInput): RwaShineEvent | null {
  if (input.id === "" || input.symbol === "") return null;
  if (input.stepCount <= 0) return null;
  if (!rwaExecutionIsConfirmed(input.chain)) return null;

  if (input.side === "buy") {
    return {
      service: "rwa",
      kind: "buy",
      id: input.id,
      symbol: input.symbol,
      price: input.price,
    };
  }
  return {
    service: "rwa",
    kind: "sell",
    id: input.id,
    symbol: input.symbol,
    price: input.price,
    pnl: null,
  };
}
