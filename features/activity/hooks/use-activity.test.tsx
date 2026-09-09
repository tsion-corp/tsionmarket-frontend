import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    user: {
      linkedAccounts: [
        {
          type: "wallet",
          chainType: "ethereum",
          walletClientType: "privy",
          connectorType: "embedded",
          address: "0x1111111111111111111111111111111111111111",
        },
      ],
    },
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

  it("asks every ten minutes", async () => {
    renderHook(() => useActivity({ pollMs: BELL_POLL_MS }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(9 * 60_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("asks every two minutes on the activity page", async () => {
    renderHook(() => useActivity(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
