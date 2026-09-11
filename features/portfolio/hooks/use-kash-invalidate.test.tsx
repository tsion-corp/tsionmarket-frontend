import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// After a buy, convert, claim or send only the account balance can have
// changed, yet every read under ["kash"] was refetched three times over: the
// engine status, the tier catalogue and the subscription along with it. Up
// to twelve calls per action, nine of them for figures that had not moved.

const reads = vi.hoisted(() => ({
  account: vi.fn(),
  status: vi.fn(),
  subscription: vi.fn(),
  tiers: vi.fn(),
}));
vi.mock("@/features/portfolio/lib/kash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/portfolio/lib/kash")>();
  return {
    ...actual,
    getKashAccount: (...a: unknown[]) => reads.account(...a),
    getKashStatus: () => reads.status(),
    getKashSubscription: (...a: unknown[]) => reads.subscription(...a),
    getKashSubscriptionTiers: () => reads.tiers(),
  };
});
const WALLET = "0x1111111111111111111111111111111111111111";
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: {}, ready: true, authenticated: true }),
  getAccessToken: () => Promise.resolve("test-token"),
  getIdentityToken: () => Promise.resolve("test-id-token"),
}));
vi.mock("@/lib/user", () => ({ getWalletAddress: () => WALLET }));

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset().mockResolvedValue({});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.useFakeTimers();
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

describe("useInvalidateKash", () => {
  it("refetches the account now and after the chain settles, and nothing else", async () => {
    const hooks = await import("@/features/portfolio/hooks/use-kash");
    const { result } = renderHook(
      () => {
        hooks.useKashAccount();
        hooks.useKashStatus();
        hooks.useKashSubscription();
        hooks.useKashSubscriptionTiers(true);
        return hooks.useInvalidateKash();
      },
      { wrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(reads.account).toHaveBeenCalledTimes(1);

    act(() => result.current());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // The immediate refresh and the two settle re-checks.
    expect(reads.account).toHaveBeenCalledTimes(4);
    expect(reads.status).toHaveBeenCalledTimes(1);
    expect(reads.subscription).toHaveBeenCalledTimes(1);
    expect(reads.tiers).toHaveBeenCalledTimes(1);
  });

  it("refetches the subscription too when asked, once", async () => {
    const hooks = await import("@/features/portfolio/hooks/use-kash");
    const { result } = renderHook(
      () => {
        hooks.useKashAccount();
        hooks.useKashSubscription();
        return hooks.useInvalidateKash({ subscription: true });
      },
      { wrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => result.current());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(reads.subscription).toHaveBeenCalledTimes(2);
    expect(reads.account).toHaveBeenCalledTimes(4);
  });
});
