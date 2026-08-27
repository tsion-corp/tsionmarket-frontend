import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every spot trade action that charges a Kash-eligible platform fee must
 * refresh Kash's reads on success. (Perps' own equivalent lives in
 * hyperliquid-actions.test.ts, on the Hyperliquid integration branch —
 * that surface isn't live yet.)
 *
 * Asserted structurally, same reasoning as
 * features/portfolio/hooks/use-kash-refresh.test.ts: the failure is silent —
 * a new fee-charging call site lands, nobody wires the refresh, and points
 * only ever show up on the next 10s background poll instead of feeling live.
 */
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("spot trade actions that charge a Kash-eligible fee refresh Kash on success", () => {
  it.each([
    "features/trade/components/buy-sheet.tsx",
    "features/trade/components/sell-sheet.tsx",
    "features/trade/components/spot-panel.tsx",
    "features/trade/components/meme-trade-sheet.tsx",
  ])("%s calls invalidateKash()", (path) => {
    expect(read(path)).toContain("invalidateKash()");
  });
});
