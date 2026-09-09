import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { pad, toHex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Portfolio } from "@/lib/server/alchemy";

const EVM = "0xabc0000000000000000000000000000000000001";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: null }),
}));
vi.mock("@/components/providers/server-session", () => ({
  useSessionWallet: (chain: string) => (chain === "ethereum" ? EVM : null),
}));

import { usePortfolio } from "@/hooks/use-portfolio";

const snapshot: Portfolio = {
  totalUsd: 10,
  tokens: [
    {
      symbol: "USDC",
      name: "USD Coin",
      network: "base-mainnet",
      address: USDC,
      decimals: 6,
      kind: "stablecoin",
      balance: 10,
      rawBalance: "10000000",
      priceUsd: 1,
      valueUsd: 10,
      logo: null,
    },
  ],
};

function answer(body: Portfolio) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const requestedUrls = () => apiFetch.mock.calls.map((call) => String(call[0]));

describe("usePortfolio fresh reads", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(async () => answer(snapshot));
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it("polls without a scope", async () => {
    renderHook(() => usePortfolio(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(requestedUrls()[0]).toBe(`/api/portfolio?evm=${EVM}`);
  });

  // A trade on Base names Base: the server re-reads that network and answers
  // the other 27 from cache (ADR-2026-09-09-portfolio-refresh-scope).
  // A snapshot that says a network did not answer is a floor, not the
  // balance. Ask again in seconds, not in a minute.
  it("polls again quickly while the snapshot is missing a network", async () => {
    apiFetch.mockImplementationOnce(async () => answer({ ...snapshot, missing: ["base-mainnet"] }));
    renderHook(() => usePortfolio(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(5_100));
    expect(apiFetch).toHaveBeenCalledTimes(2);

    // Whole again: back to the minute.
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("names the traded network on a fresh read", async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      const pending = result.current.refetchFresh(["base-mainnet"]);
      await vi.advanceTimersByTimeAsync(0);
      await pending;
    });

    expect(requestedUrls().at(-1)).toBe(`/api/portfolio?evm=${EVM}&fresh=base-mainnet`);
  });

  it("keeps naming the network while waiting for the balance to move", async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    let settled: Promise<boolean>;
    await act(async () => {
      settled = result.current.refetchUntilChanged(["base-mainnet"]);
      await vi.advanceTimersByTimeAsync(3_000);
      apiFetch.mockImplementation(async () =>
        answer({ ...snapshot, tokens: [{ ...snapshot.tokens[0], rawBalance: "7000000" }] })
      );
      await vi.advanceTimersByTimeAsync(6_000);
    });
    await expect(settled!).resolves.toBe(true);
    const fresh = requestedUrls().filter((u) => u.includes("fresh="));
    expect(fresh.length).toBeGreaterThan(1);
    expect(fresh.every((u) => u.endsWith("fresh=base-mainnet"))).toBe(true);
  });

  it("waits for a token on its own network only", async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      const pending = result.current.waitForTokenBalance("base-mainnet", USDC, 1n);
      await vi.advanceTimersByTimeAsync(0);
      await pending;
    });
    expect(requestedUrls().at(-1)).toBe(`/api/portfolio?evm=${EVM}&fresh=base-mainnet`);
  });
});

describe("usePortfolio.applyReceipt", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(async () => answer(snapshot));
  });
  afterEach(() => client.clear());

  // The receipt already says what left the wallet; the screen shows it at
  // once and the scoped read confirms it seconds later.
  it("moves the cached balance by the receipt's transfers without a request", async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(result.current.tokens.length).toBe(1));
    const before = apiFetch.mock.calls.length;

    act(() => {
      result.current.applyReceipt("base-mainnet", EVM, [
        {
          address: USDC,
          topics: [TRANSFER, pad(EVM as `0x${string}`), pad("0xaa")],
          data: pad(toHex(3_000_000n)),
        },
      ]);
    });

    // The cache moves at once; the observer is notified on the next tick.
    expect(client.getQueryData<Portfolio>(["portfolio", EVM, null])?.tokens[0].rawBalance).toBe(
      "7000000"
    );
    await vi.waitFor(() => expect(result.current.tokens[0].rawBalance).toBe("7000000"));
    expect(result.current.totalUsd).toBe(7);
    expect(apiFetch.mock.calls.length).toBe(before);
  });
});
