import { describe, expect, it } from "vitest";
import {
  ORDERS_POLL_MS,
  POSITIONS_POLL_MS,
  ordersRefetchInterval,
  positionsRefetchInterval,
} from "@/features/trade/lib/perps-polling";
import type { HlOrderRow, HlPositionView } from "@/features/trade/lib/hyperliquid-types";

// llms.txt §10: background polls are distinct and gated. Positions every ~10s
// only while there is exposure; orders every ~30s only while one rests. A flat,
// orderless desk makes no repeat calls.

const position = { id: "p1" } as HlPositionView;
const order = (status: HlOrderRow["status"]) => ({ id: status, status }) as HlOrderRow;

describe("positionsRefetchInterval", () => {
  it("polls every ten seconds while a position is open", () => {
    expect(POSITIONS_POLL_MS).toBe(10_000);
    expect(positionsRefetchInterval([position], false)).toBe(POSITIONS_POLL_MS);
  });

  it("polls while a resting order could fill into a position, even with none open", () => {
    expect(positionsRefetchInterval([], true)).toBe(POSITIONS_POLL_MS);
  });

  it("does not poll a flat wallet with nothing resting, nor one not loaded yet", () => {
    expect(positionsRefetchInterval([], false)).toBe(false);
    expect(positionsRefetchInterval(undefined, false)).toBe(false);
  });
});

describe("ordersRefetchInterval", () => {
  it("polls every thirty seconds while any order is resting", () => {
    expect(ORDERS_POLL_MS).toBe(30_000);
    for (const status of ["submitted", "open", "partially_filled"] as const) {
      expect(ordersRefetchInterval([order("filled"), order(status)])).toBe(ORDERS_POLL_MS);
    }
  });

  it("does not poll when every order is filled, cancelled or rejected", () => {
    expect(ordersRefetchInterval([order("filled"), order("cancelled"), order("rejected")])).toBe(
      false
    );
    expect(ordersRefetchInterval([])).toBe(false);
    expect(ordersRefetchInterval(undefined)).toBe(false);
  });
});
