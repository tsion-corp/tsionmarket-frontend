import {
  isRestingOrder,
  type HlOrderRow,
  type HlPositionView,
} from "@/features/trade/lib/hyperliquid-types";

// The perps desk's background polls (llms.txt §10). Every action the desk
// takes already refetches exactly what it changed; these polls exist only to
// notice what happens with no click here, and only while something can.

/** Positions move with the mark, so they poll faster than orders. */
export const POSITIONS_POLL_MS = 10_000;
/** A resting order only changes when it fills or is cancelled. */
export const ORDERS_POLL_MS = 30_000;

/**
 * Poll positions while there is exposure: an open position, or a resting order
 * that could fill into one. A flat wallet with nothing resting is not polled;
 * refetch on focus and on each action still keeps it current.
 */
export function positionsRefetchInterval(
  positions: HlPositionView[] | undefined,
  hasRestingOrders: boolean
): number | false {
  return (positions?.length ?? 0) > 0 || hasRestingOrders ? POSITIONS_POLL_MS : false;
}

/** Poll orders only while at least one is still resting. */
export function ordersRefetchInterval(orders: HlOrderRow[] | undefined): number | false {
  return (orders ?? []).some(isRestingOrder) ? ORDERS_POLL_MS : false;
}
