// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingRwaSettlement } from "@/lib/trade/pending-settlement";

// The second leg of a Solana memecoin buy runs here, after the USDC has moved.
// It spends exactly the USDC that arrived, whether or not the sheet is still
// open.

const captured = vi.hoisted(() => ({
  completePurchase: null as
    | null
    | ((
        s: PendingRwaSettlement,
        ctx: { balance: bigint; solanaTaker: string }
      ) => Promise<boolean>),
}));
vi.mock("@/hooks/use-settlement-reconciler", () => ({
  useSettlementReconciler: (args: { completePurchase: typeof captured.completePurchase }) => {
    captured.completePurchase = args.completePurchase;
  },
}));
const trade = vi.hoisted(() => vi.fn());
vi.mock("@/features/trade/hooks/use-meme-trade", () => ({ useMemeTrade: () => ({ trade }) }));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ refetchFresh: vi.fn(async () => {}), refetchUntilChanged: vi.fn() }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/trade/pending-settlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trade/pending-settlement")>()),
  clearPendingRwaSettlement: vi.fn(),
}));

import { MemeSettlementTracker } from "@/features/trade/components/meme-settlement-tracker";

const settlement: PendingRwaSettlement = {
  requestId: "dep-7",
  product: "meme",
  direction: "base-to-solana",
  assetSymbol: "BONK",
  createdAt: 0,
  purchase: { assetAddress: "BonkMint", assetSymbol: "BONK", amountInRaw: "5000000" },
} as PendingRwaSettlement;

describe("MemeSettlementTracker", () => {
  beforeEach(() => {
    trade.mockReset();
  });

  it("buys the coin with the USDC that arrived", async () => {
    trade.mockResolvedValue({
      outcome: "confirmed",
      swapId: "swap-3",
      requestId: null,
      txHash: "SoLSig",
    });
    renderHook(() => MemeSettlementTracker());
    await captured.completePurchase!(settlement, { balance: 5_000_000n, solanaTaker: "S1" });

    expect(trade).toHaveBeenCalledWith({
      side: "BUY",
      tokenAddress: "BonkMint",
      amount: "5",
      chainId: expect.any(Number),
    });
  });
});
