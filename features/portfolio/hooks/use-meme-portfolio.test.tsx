import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PORTFOLIO_POSITION,
  PORTFOLIO_SUMMARY,
  TRADE_ACTIVITY,
} from "@/lib/api/schemas/trade.fixtures";

// The hook reads the session through the Decane-backed seam now; the fixture
// keeps its shape so the sign-in cases below are unchanged.
const privy = vi.hoisted(() => ({ ready: true, authenticated: true }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => privy }));

// The section's on-screen flag, driven by hand: the real one comes from an
// IntersectionObserver, which jsdom does not have.
const section = vi.hoisted(() => ({ active: true }));
vi.mock("@/components/ui/section-visibility", () => ({
  useSectionActive: () => section.active,
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const api = vi.hoisted(() => ({
  fetchPortfolio: vi.fn(),
  fetchPortfolioSummary: vi.fn(),
  fetchPosition: vi.fn(),
  fetchActivity: vi.fn(),
}));
vi.mock("@/lib/meme/portfolio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/portfolio")>()),
  ...api,
}));

import {
  MEME_PORTFOLIO_POLL_MS,
  useMemeActivity,
  useMemePortfolio,
  useMemePortfolioSummary,
  useMemePosition,
} from "@/features/portfolio/hooks/use-meme-portfolio";

// The service's portfolio on the portfolio screen: summary, positions (open and
// closed, all chains or one), one position's detail and the activity feed.
// Each list keeps the server's paging (50 a page, stop at page*limit >= total),
// each query polls every 60 s only while the section is on screen, and none
// runs before the user is signed in.

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LIMIT = 50;
function pageOf<T>(row: (i: number) => T, page: number, total: number) {
  const start = (page - 1) * LIMIT;
  const count = Math.max(0, Math.min(LIMIT, total - start));
  return {
    items: Array.from({ length: count }, (_, i) => row(start + i)),
    meta: { page, limit: LIMIT, total },
  };
}
const position = (i: number) => ({ ...PORTFOLIO_POSITION, address: `0x${i}` });
const activity = (i: number) => ({ ...TRADE_ACTIVITY, id: `swap-${i}` });

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  privy.ready = true;
  privy.authenticated = true;
  section.active = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useMemePortfolio", () => {
  it("pages 50 at a time until page * limit >= total, and never asks beyond", async () => {
    api.fetchPortfolio.mockImplementation(async (page: number) => pageOf(position, page, 120));
    const { result } = renderHook(() => useMemePortfolio(), { wrapper });
    await flush();
    expect(result.current.items).toHaveLength(50);
    expect(result.current.total).toBe(120);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.items).toHaveLength(120);
    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.fetchPortfolio.mock.calls).toEqual([
      [1, 50, undefined],
      [2, 50, undefined],
      [3, 50, undefined],
    ]);
  });

  it("scopes a chain tab by name on the server", async () => {
    api.fetchPortfolio.mockImplementation(async (page: number) => pageOf(position, page, 1));
    renderHook(() => useMemePortfolio("solana"), { wrapper });
    await flush();
    expect(api.fetchPortfolio).toHaveBeenCalledWith(1, 50, "solana");
  });

  it("keeps the failure on the hook rather than showing an empty portfolio", async () => {
    api.fetchPortfolio.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useMemePortfolio(), { wrapper });
    await flush();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useMemePortfolioSummary polling", () => {
  it("asks for nothing before the user is signed in", async () => {
    privy.authenticated = false;
    renderHook(() => useMemePortfolioSummary(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(3 * MEME_PORTFOLIO_POLL_MS));
    expect(api.fetchPortfolioSummary).not.toHaveBeenCalled();
  });

  it("refreshes every 60 s while the section is on screen", async () => {
    api.fetchPortfolioSummary.mockResolvedValue(PORTFOLIO_SUMMARY);
    const { result } = renderHook(() => useMemePortfolioSummary(), { wrapper });
    await flush();
    expect(result.current.summary?.marketValueComplete).toBe(false);
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(1);
    expect(MEME_PORTFOLIO_POLL_MS).toBe(60_000);

    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(2);
  });

  it("asks less often once the service stops answering", async () => {
    api.fetchPortfolioSummary.mockRejectedValue(new Error("Can't reach the server right now"));
    const { result } = renderHook(() => useMemePortfolioSummary(), { wrapper });
    await flush();
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeTruthy();

    // The healthy minute passes with nothing asked: a service that has stopped
    // answering is not asked at the rate a healthy one is.
    await act(() => vi.advanceTimersByTimeAsync(MEME_PORTFOLIO_POLL_MS));
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(1);

    // It backs off rather than stopping, so a service that recovers is noticed
    // without the user reloading the page.
    await act(() => vi.advanceTimersByTimeAsync(MEME_PORTFOLIO_POLL_MS));
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(2);
  });

  it("does not poll while the section is off screen, and reads once it scrolls into view", async () => {
    api.fetchPortfolioSummary.mockResolvedValue(PORTFOLIO_SUMMARY);
    section.active = false;
    const { rerender } = renderHook(() => useMemePortfolioSummary(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(3 * MEME_PORTFOLIO_POLL_MS));
    expect(api.fetchPortfolioSummary).not.toHaveBeenCalled();

    section.active = true;
    rerender();
    await flush();
    expect(api.fetchPortfolioSummary).toHaveBeenCalledTimes(1);
  });
});

describe("useMemePosition", () => {
  it("waits for a position to be chosen, then reads it by chain and exact address", async () => {
    const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    api.fetchPosition.mockResolvedValue({ ...PORTFOLIO_POSITION, activity: [TRADE_ACTIVITY] });
    const { rerender, result } = renderHook(
      ({ address }: { address: string | null }) => useMemePosition("solana", address),
      { wrapper, initialProps: { address: null as string | null } }
    );
    await flush();
    expect(api.fetchPosition).not.toHaveBeenCalled();

    rerender({ address: mint });
    await flush();
    expect(api.fetchPosition).toHaveBeenCalledWith("solana", mint);
    expect(result.current.position?.activity).toHaveLength(1);
  });
});

describe("useMemeActivity", () => {
  it("sends its filters and keeps the server's paging", async () => {
    api.fetchActivity.mockImplementation(async ({ page }: { page: number }) =>
      pageOf(activity, page, 60)
    );
    const { result } = renderHook(() => useMemeActivity({ chain: "base", side: "SELL" }), {
      wrapper,
    });
    await flush();
    expect(api.fetchActivity).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      chain: "base",
      side: "SELL",
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.items).toHaveLength(60);
    expect(result.current.hasMore).toBe(false);
  });
});
