import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

import { markRampOrderPaid, useRampOrder } from "@/hooks/use-ramping";

const ORDER = "cmt-order-1";

function answer(status: string) {
  return new Response(
    JSON.stringify({ success: true, data: { id: ORDER, status, amount: "10000" } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// One order was polled by three parts of the dashboard at three intervals;
// React Query ran the shortest, 3 s, for as long as the sheet stayed open and
// 15 s from the dashboard after it closed. The hook now owns one cadence:
// quick while the user is expected to be paying, slow after, off once the
// rail will not move the order again (ADR-2026-09-09-portfolio-refresh-scope).
describe("useRampOrder cadence", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(async () => answer("awaiting_payment"));
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it("polls every 3 s for the first minute, then every 15 s", async () => {
    renderHook(() => useRampOrder("onramp", ORDER, { enabled: true }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).toHaveBeenCalledTimes(11);

    await act(() => vi.advanceTimersByTimeAsync(90_000));
    // 30 s more at 3 s, then 60 s at 15 s.
    expect(apiFetch).toHaveBeenCalledTimes(25);
  });

  it("costs one request per tick however many screens watch the order", async () => {
    renderHook(
      () => {
        useRampOrder("onramp", ORDER, { enabled: true });
        useRampOrder("onramp", ORDER, { enabled: true });
        useRampOrder("onramp", ORDER, { enabled: true });
      },
      { wrapper }
    );
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(apiFetch).toHaveBeenCalledTimes(11);
  });

  it("goes quick again when the user says the money is on its way", async () => {
    renderHook(() => useRampOrder("onramp", ORDER, { enabled: true }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    const before = apiFetch.mock.calls.length;

    markRampOrderPaid(ORDER);
    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(apiFetch.mock.calls.length - before).toBeGreaterThanOrEqual(9);
  });

  it("stops once the order is terminal", async () => {
    apiFetch.mockImplementation(async () => answer("completed"));
    renderHook(() => useRampOrder("onramp", ORDER, { enabled: true }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
