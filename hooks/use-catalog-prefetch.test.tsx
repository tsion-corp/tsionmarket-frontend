import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const deposit = vi.hoisted(() => ({
  fetchDepositChains: vi.fn(),
  fetchMasterEligibility: vi.fn(),
  fetchDepositTokens: vi.fn(),
}));

vi.mock("@/hooks/use-deposit", () => ({
  DEPOSIT_CHAINS_KEY: ["deposit-chains"],
  MASTER_ELIGIBILITY_KEY: ["deposit-master-eligibility"],
  depositTokensKey: (chainId: number) => ["deposit-tokens", chainId],
  fetchDepositChains: deposit.fetchDepositChains,
  fetchMasterEligibility: deposit.fetchMasterEligibility,
  fetchDepositTokens: deposit.fetchDepositTokens,
}));

import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { SETTLE_ORDER } from "@/lib/deposit";

// A promise the test resolves by hand, so it can observe what was started
// before anything finished.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("usePrefetchDepositCatalog", () => {
  beforeEach(() => {
    deposit.fetchDepositChains.mockReset();
    deposit.fetchMasterEligibility.mockReset();
    deposit.fetchDepositTokens.mockReset();
  });

  it("warms every settlement chain's tokens at once, not one after another", async () => {
    deposit.fetchDepositChains.mockResolvedValue([]);
    deposit.fetchMasterEligibility.mockResolvedValue({ keys: ["USDC"], chainIds: [] });
    const pending = deferred<unknown[]>();
    deposit.fetchDepositTokens.mockReturnValue(pending.promise);

    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => usePrefetchDepositCatalog(), { wrapper });

    // Nothing has resolved yet. Every chain's request must already be in
    // flight; a serial loop would have started exactly one.
    await waitFor(() =>
      expect(deposit.fetchDepositTokens).toHaveBeenCalledTimes(SETTLE_ORDER.length)
    );

    pending.resolve([]);
  });

  it("skips token warming when eligibility did not load", async () => {
    deposit.fetchDepositChains.mockResolvedValue([]);
    deposit.fetchMasterEligibility.mockRejectedValue(new Error("down"));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => usePrefetchDepositCatalog(), { wrapper });

    await waitFor(() => expect(deposit.fetchMasterEligibility).toHaveBeenCalledTimes(1));
    // Give the chain a tick to run past the eligibility gate.
    await new Promise((r) => setTimeout(r, 20));

    expect(deposit.fetchDepositTokens).not.toHaveBeenCalled();
  });
});
