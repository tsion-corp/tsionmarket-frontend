import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0x1111111111111111111111111111111111111111",
    solanaAddress: null,
  }),
}));

import { BELL_POLL_MS, useActivity } from "@/features/activity/hooks/use-activity";

// The bell sits on every screen, so its poll multiplies across every
// signed-in tab. Ten minutes is well inside what anyone notices for a nudge
// that something happened (ADR-2026-09-09-portfolio-polling-at-scale).
describe("useActivity poll from the bell", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  // The hook also reads the old account's stored activity, once. Only the
  // live sweeps are what these cases count.
  const sweeps = () =>
    apiFetch.mock.calls.filter(([url]) => String(url).startsWith("/api/activity?")).length;

  it("asks every ten minutes", async () => {
    renderHook(() => useActivity({ pollMs: BELL_POLL_MS }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(9 * 60_000));
    expect(sweeps()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(sweeps()).toBe(2);
  });

  /*
    The old account's history is a snapshot the service holds, not a sweep:
    read once, held for the session, and merged into the one timeline with
    its rows marked. A live sweep costs an upstream call per network per
    direction; this costs one small read.
  */
  it("reads the old account's snapshot once and merges it, marked", async () => {
    apiFetch.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            String(url).startsWith("/api/migration/legacy-activity")
              ? {
                  success: true,
                  data: {
                    items: [
                      {
                        id: "old",
                        hash: "0xold",
                        network: "base-mainnet",
                        direction: "in",
                        symbol: "USDC",
                        amount: 5,
                        timestamp: 1_000,
                        counterparty: null,
                        logo: null,
                        legacy: true,
                      },
                    ],
                  },
                }
              : {
                  items: [
                    {
                      id: "new",
                      hash: "0xnew",
                      network: "base-mainnet",
                      direction: "in",
                      symbol: "USDC",
                      amount: 7,
                      timestamp: 2_000,
                      counterparty: null,
                      logo: null,
                    },
                  ],
                }
          ),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    const { result } = renderHook(() => useActivity(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.items.map((e) => [e.hash, e.legacy ?? false])).toEqual([
      ["0xnew", false],
      ["0xold", true],
    ]);
    // Two polls later, the snapshot has still been read exactly once.
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(
      apiFetch.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/migration/legacy-activity")
      ).length
    ).toBe(1);
  });

  it("asks every two minutes on the activity page", async () => {
    renderHook(() => useActivity(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(sweeps()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(sweeps()).toBe(2);
  });
});
