import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// The swap history the memecoin transactions feed reads. The hook is the only
// place the request and its poll live, so this suite covers the request it
// makes and the three states it reports, not the card that draws them.

const api = vi.hoisted(() => ({ fetchSwapHistory: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchSwapHistory: api.fetchSwapHistory,
}));

import { useMemeSwaps } from "@/features/trade/hooks/use-meme-swaps";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the wallet's swap history", () => {
  it("asks for the first page at the feed's limit", async () => {
    api.fetchSwapHistory.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
    renderHook(() => useMemeSwaps(), { wrapper });
    await waitFor(() => expect(api.fetchSwapHistory).toHaveBeenCalledWith(1, 20));
  });

  it("reports loading before the first answer and hands the page over after it", async () => {
    api.fetchSwapHistory.mockResolvedValue({
      items: [{ id: "swap-1" }],
      meta: { page: 1, limit: 20, total: 1 },
    });
    const { result } = renderHook(() => useMemeSwaps(), { wrapper });
    expect(result.current.status).toBe("loading");
    expect(result.current.swaps).toEqual([]);

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.swaps).toHaveLength(1);
  });

  it("reports the failure rather than an empty page", async () => {
    api.fetchSwapHistory.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useMemeSwaps(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.swaps).toEqual([]);
  });

  it("asks again when told to", async () => {
    api.fetchSwapHistory.mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
    const { result } = renderHook(() => useMemeSwaps(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    result.current.refetch();
    await waitFor(() => expect(api.fetchSwapHistory).toHaveBeenCalledTimes(2));
  });
});

// A feed against a service that has stopped answering. React Query keeps firing
// refetchInterval while every attempt errors, so without a back-off the feed
// asks every fifteen seconds for as long as the tab is open.
describe("the swap feed's cadence", () => {
  const emptyPage = { items: [], meta: { page: 1, limit: 20, total: 0 } };

  // One client per hook under test, held for the run: the suite's other wrapper
  // builds a fresh one on every render, which a poll cannot be measured against.
  function paced() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    function Paced({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return Paced;
  }

  // TanStack settles observers on a zero-delay timer, so every step needs the
  // tick after the fetch as well as the wait itself.
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks every fifteen seconds while the service answers", async () => {
    api.fetchSwapHistory.mockResolvedValue(emptyPage);
    renderHook(() => useMemeSwaps(), { wrapper: paced() });
    await advance(1);
    expect(api.fetchSwapHistory).toHaveBeenCalledTimes(1);

    await advance(15_000);
    expect(api.fetchSwapHistory).toHaveBeenCalledTimes(2);
  });

  it("drops to a minute once the service stops answering", async () => {
    api.fetchSwapHistory.mockRejectedValue(new Error("nope"));
    renderHook(() => useMemeSwaps(), { wrapper: paced() });
    await advance(1);
    expect(api.fetchSwapHistory).toHaveBeenCalledTimes(1);

    // The healthy cadence comes and goes three times over with nothing asked.
    await advance(45_000);
    expect(api.fetchSwapHistory).toHaveBeenCalledTimes(1);

    // It backs off rather than stopping, so a service that recovers is noticed.
    await advance(15_001);
    expect(api.fetchSwapHistory).toHaveBeenCalledTimes(2);
  });
});
