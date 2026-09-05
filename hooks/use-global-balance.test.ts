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

const { useGlobalBalance } = await import("@/hooks/use-global-balance");

function portfolioResponse(totalUsd: number) {
  return { ok: true, status: 200, json: async () => ({ totalUsd, tokens: [] }) };
}

function perpsResponse(withdrawable: string) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, data: { withdrawable } }),
  };
}

function failedPerpsResponse() {
  return {
    ok: false,
    status: 503,
    text: async () =>
      JSON.stringify({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }),
  };
}

// Branch on the request path rather than call order — usePortfolio's own
// query and this hook's perps query both fire from the same render, and
// nothing here should depend on which one the client issues first.
function mockRoutes(handlers: { portfolio: unknown; perps: unknown }) {
  apiFetch.mockImplementation(async (path: string) => {
    if (String(path).includes("/api/portfolio")) return handlers.portfolio;
    return handlers.perps;
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGlobalBalance", () => {
  it("combines spot holdings and the perps wallet balance into one total", async () => {
    mockRoutes({ portfolio: portfolioResponse(100), perps: perpsResponse("25.5") });

    const { result } = renderHook(() => useGlobalBalance(), { wrapper });

    await waitFor(() => expect(result.current.perpsUsd).toBe(25.5));
    expect(result.current.spotUsd).toBe(100);
    expect(result.current.totalUsd).toBe(125.5);
  });

  it("treats a never-traded or unreachable perps balance as 0 without blocking the spot total", async () => {
    mockRoutes({ portfolio: portfolioResponse(100), perps: failedPerpsResponse() });

    const { result } = renderHook(() => useGlobalBalance(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.perpsUsd).toBe(0);
    expect(result.current.totalUsd).toBe(100);
  });
});
