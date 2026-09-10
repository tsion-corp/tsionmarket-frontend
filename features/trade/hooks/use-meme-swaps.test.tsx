import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
