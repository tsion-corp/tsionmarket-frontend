import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const reads = vi.hoisted(() => ({
  readGroupOfMarket: vi.fn(async () => 0n),
  readRedeemableAt: vi.fn(async () => 0),
}));
vi.mock("@/features/prediction/lib/chain-reads", () => reads);
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ ready: true, authenticated: false }),
}));

import {
  useMarketGroupId,
  useRedeemableAt,
} from "@/features/prediction/hooks/use-prediction-neg-risk";

// The RPC proxy needs a session, so a visitor's market page must not call it.
describe("prediction chain reads without a session", () => {
  it("are not made", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useMarketGroupId(7n), { wrapper });
    renderHook(() => useRedeemableAt(7n), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(reads.readGroupOfMarket).not.toHaveBeenCalled();
    expect(reads.readRedeemableAt).not.toHaveBeenCalled();
  });
});
