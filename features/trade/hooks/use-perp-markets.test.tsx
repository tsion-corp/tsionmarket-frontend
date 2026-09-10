import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({
  fetchPerpPrices: vi.fn(),
}));

vi.mock("@/lib/perp/api", () => ({
  fetchPerpMarket: vi.fn(),
  fetchPerpPairs: vi.fn(),
  fetchPerpPrices: api.fetchPerpPrices,
  isPerpUnavailable: () => false,
  perpErrorCode: () => null,
}));

import { usePerpPrices } from "@/features/trade/hooks/use-perp-markets";

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("usePerpPrices", () => {
  beforeEach(() => {
    api.fetchPerpPrices.mockReset();
    api.fetchPerpPrices.mockResolvedValue([{ pair: "BTC/USD", price: "65000" }]);
  });

  it("fetches and keys the marks by pair when subscribed", async () => {
    const client = new QueryClient();
    const { result } = renderHook(() => usePerpPrices(true), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.prices.get("BTC/USD")?.price).toBe("65000"));
    expect(api.fetchPerpPrices).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing while the caller's section is off screen", async () => {
    const client = new QueryClient();
    renderHook(() => usePerpPrices(true, true, false), { wrapper: wrapperFor(client) });

    // Give a fetch every chance to start; it must not.
    await new Promise((r) => setTimeout(r, 30));
    expect(api.fetchPerpPrices).not.toHaveBeenCalled();
  });

  it("keeps the last marks on screen after the section scrolls away", async () => {
    const client = new QueryClient();
    const { result, rerender } = renderHook(
      ({ subscribed }: { subscribed: boolean }) => usePerpPrices(true, true, subscribed),
      { wrapper: wrapperFor(client), initialProps: { subscribed: true } }
    );
    await waitFor(() => expect(result.current.prices.size).toBe(1));

    rerender({ subscribed: false });

    // Detached, not disabled: the data is still there for the rows to show.
    expect(result.current.prices.get("BTC/USD")?.price).toBe("65000");
  });
});
