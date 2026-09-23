// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingRwaSettlement } from "@/lib/trade/pending-settlement";

// The Solana leg of a real-asset buy runs here once the USDC has arrived. It
// reports the trade from the USDC it actually spent.

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
vi.mock("@/features/rwa/hooks/use-execute-rwa", () => ({
  useExecuteRwa: () => vi.fn(async () => {}),
}));
vi.mock("@/features/rwa/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/rwa/lib/api")>()),
  buildRwaAction: vi.fn(async () => ({ actionId: "a1", chain: "solana", steps: [] })),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ refetchFresh: vi.fn(async () => {}), refetchUntilChanged: vi.fn() }),
}));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/trade/pending-settlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trade/pending-settlement")>()),
  clearPendingRwaSettlement: vi.fn(),
}));

import { RwaSettlementTracker } from "@/features/rwa/components/rwa-settlement-tracker";

describe("RwaSettlementTracker analytics", () => {
  beforeEach(() => analytics.track.mockClear());

  it("reports the background buy from the USDC it spent, with the settlement's reference", async () => {
    renderHook(() => RwaSettlementTracker());
    await captured.completePurchase!(
      {
        requestId: "dep-8",
        direction: "base-to-solana",
        assetSymbol: "ONDO",
        createdAt: 0,
        purchase: { assetAddress: "SoLONDO", assetSymbol: "ONDO", amountInRaw: "12500000" },
      } as PendingRwaSettlement,
      { balance: 12_500_000n, solanaTaker: "S1" }
    );

    expect(analytics.track).toHaveBeenCalledWith("trade_completed", {
      vertical: "rwa",
      asset: "ONDO",
      side: "buy",
      amount_usd: 12.5,
      amount_source: "fill",
      order_id: "dep-8",
      token_address: "SoLONDO",
    });
  });
});
