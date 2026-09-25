// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("server-only", () => ({}));

// The session, through the Decane-backed seam: `privy` still drives
// ready/authenticated so the cases below keep their meaning.
const privy = vi.hoisted(() => ({ ready: true, authenticated: true }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    evmAddress: "0xEvm",
    solanaAddress: "SoL1",
    profile: { name: "", email: "", avatarSeed: "" },
    logout: vi.fn(),
    ...privy,
  }),
}));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const { useGlobalBalance } = await import("@/hooks/use-global-balance");

// A portfolio worth `totalUsd`, held in one token. The total is derived from
// the holdings (dust is left out of it), so a payload that names a figure with
// nothing behind it is not a payload the server can send.
function portfolioResponse(totalUsd: number) {
  const token = {
    symbol: "USDC",
    name: "USD Coin",
    network: "base-mainnet",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    kind: "stablecoin",
    balance: totalUsd,
    rawBalance: String(Math.round(totalUsd * 1e6)),
    priceUsd: 1,
    valueUsd: totalUsd,
    logo: null,
  };
  return { ok: true, status: 200, json: async () => ({ totalUsd, tokens: [token] }) };
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

  // llms.txt §10: the perps balance is not polled in the background. It is
  // refreshed on window focus and after money moves (perpsBalanceQueryKey).
  it("reads the perps balance once rather than on a timer", async () => {
    mockRoutes({ portfolio: portfolioResponse(100), perps: perpsResponse("25.5") });
    const perpsCalls = () =>
      apiFetch.mock.calls.filter(([path]) => !String(path).includes("/api/portfolio")).length;

    // Fake timers from the start, so any interval the query sets up is one the
    // test controls.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useGlobalBalance(), { wrapper });
      await waitFor(() => expect(result.current.perpsUsd).toBe(25.5));
      const afterFirstRead = perpsCalls();

      await vi.advanceTimersByTimeAsync(90_000);

      expect(perpsCalls()).toBe(afterFirstRead);
    } finally {
      vi.useRealTimers();
    }
  });

  it("names its query so a money move elsewhere can refresh it", async () => {
    const { perpsBalanceQueryKey } = await import("@/hooks/use-global-balance");
    expect(perpsBalanceQueryKey("0xEvm")).toEqual(["perps-balance", "0xEvm"]);
    expect(perpsBalanceQueryKey()).toEqual(["perps-balance"]);
  });
});
