import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: null, ready: true, authenticated: false }),
}));
vi.mock("@/hooks/use-withdraw", () => ({ useSendToken: () => ({ sendToken: vi.fn() }) }));
vi.mock("@/features/casino/hooks/use-arkjet", () => ({
  ARKJET_KEYS: { funding: ["arkjet", "funding"], balance: ["arkjet", "balance"] },
}));
vi.mock("@/features/casino/lib/api/arkjet", () => ({
  fetchArkjetFundingConfig: api.config,
  confirmArkjetDeposit: vi.fn(),
  createArkjetWithdrawal: vi.fn(),
}));

import { useArkjetFunding } from "./use-arkjet-funding";

function mountFunding() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const hook = renderHook(() => useArkjetFunding(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client };
}

afterEach(cleanup);
beforeEach(() => {
  api.config.mockReset();
});

describe("Arkjet funding availability", () => {
  it("does not automatically retry a rate-limited funding read", async () => {
    api.config.mockRejectedValue(Object.assign(new Error("Too many requests"), { status: 429 }));
    const { result, client, unmount } = mountFunding();
    await waitFor(() => expect(result.current.configError).not.toBeNull());
    expect(api.config).toHaveBeenCalledTimes(1);
    unmount();
    client.clear();
  });

  it("recovers a transient gateway failure instead of reporting funding disabled", async () => {
    api.config
      .mockRejectedValueOnce(
        Object.assign(new Error("temporary outage"), { code: "SERVICE_UNAVAILABLE" })
      )
      .mockResolvedValue({
        currency: "USDC",
        currencyDecimalPlaces: 6,
        tokenDecimals: 6,
        ledgerMinorPerUsdc: "1000000",
      });
    const { result, client, unmount } = mountFunding();
    await waitFor(() => expect(result.current.configured).toBe(true));
    expect(result.current.configUnavailable).toBe(false);
    expect(api.config).toHaveBeenCalledTimes(2);
    unmount();
    client.clear();
  });

  it("does not retry an explicitly unconfigured vault", async () => {
    api.config.mockImplementation(async () => {
      throw Object.assign(new Error("not configured"), { code: "CONFLICT" });
    });
    const { result, client, unmount } = mountFunding();
    await waitFor(() => expect(result.current.configUnavailable).toBe(true));
    expect(result.current.configError).toBeNull();
    expect(api.config).toHaveBeenCalledTimes(1);
    unmount();
    client.clear();
  });

  it("blocks a mixed rollout using the previous NGN funding configuration", async () => {
    api.config.mockResolvedValue({
      currency: "NGN",
      currencyDecimalPlaces: 2,
      tokenDecimals: 6,
      ngnMinorPerUsdc: "160000",
    });
    const { result, client, unmount } = mountFunding();
    await waitFor(() => expect(result.current.configUnavailable).toBe(true));
    expect(result.current.configured).toBe(false);
    expect(result.current.config).toBeNull();
    expect(api.config).toHaveBeenCalledTimes(1);
    unmount();
    client.clear();
  });

  it("keeps a persistent network outage retryable without claiming funding is disabled", async () => {
    api.config.mockImplementation(async () => {
      throw Object.assign(new Error("temporary outage"), { code: "SERVICE_UNAVAILABLE" });
    });
    const { result, client, unmount } = mountFunding();
    await waitFor(() => expect(result.current.configError).not.toBeNull());
    expect(result.current.configUnavailable).toBe(false);
    expect(api.config).toHaveBeenCalledTimes(4);
    unmount();
    client.clear();
  });
});
