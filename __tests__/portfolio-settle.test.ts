import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("server-only", () => ({}));

const privy = vi.hoisted(() => ({ user: {}, ready: true, authenticated: true }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => privy }));
vi.mock("@/lib/user", () => ({
  getWalletAddress: (_u: unknown, chain: string) => (chain === "solana" ? "SoL1" : "0xEvm"),
}));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const { usePortfolio } = await import("@/hooks/use-portfolio");

function token(rawBalance: string) {
  return {
    symbol: "GLDx",
    name: "Gold",
    network: "solana-mainnet",
    address: "Xsv9",
    decimals: 8,
    kind: "rwa",
    balance: Number(rawBalance) / 1e8,
    rawBalance,
    priceUsd: 378,
    valueUsd: 2.93,
    logo: null,
  };
}

function respond(tokens: ReturnType<typeof token>[]) {
  return { ok: true, status: 200, json: async () => ({ totalUsd: 1, tokens }) };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refetchUntilChanged", () => {
  it("keeps polling until the balance index reflects the trade", async () => {
    // The index lags: the first two reads still show the pre-trade balance.
    apiFetch
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValue(respond([token("770000")]));

    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.refetchUntilChanged()).resolves.toBe(true);
    await waitFor(() => expect(result.current.tokens).toHaveLength(1));
  }, 20_000);

  it("asks the server to skip its shared cache while settling", async () => {
    apiFetch.mockResolvedValueOnce(respond([])).mockResolvedValue(respond([token("770000")]));

    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(String(apiFetch.mock.calls[0][0])).not.toContain("fresh=1");

    await result.current.refetchUntilChanged();
    const settling = apiFetch.mock.calls.slice(1);
    expect(settling.length).toBeGreaterThan(0);
    expect(settling.every((c) => String(c[0]).includes("fresh=1"))).toBe(true);
  }, 20_000);

  it("stops asking for fresh reads once it has settled", async () => {
    apiFetch.mockResolvedValueOnce(respond([])).mockResolvedValue(respond([token("770000")]));

    const { result } = renderHook(() => usePortfolio(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.refetchUntilChanged();

    apiFetch.mockClear();
    await result.current.refetch();
    expect(String(apiFetch.mock.calls[0][0])).not.toContain("fresh=1");
  }, 20_000);
});
