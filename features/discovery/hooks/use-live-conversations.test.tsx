import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchSquareFeed = vi.fn();
vi.mock("@/lib/api/market-square", () => ({
  fetchSquareFeed: (...args: unknown[]) => fetchSquareFeed(...args),
}));

const square = { hidden: false };
vi.mock("@/lib/market-square", () => ({
  get MARKET_SQUARE_HIDDEN() {
    return square.hidden;
  },
  marketSquareHref: (path?: string) =>
    path ? `https://square.example/${path}` : "https://square.example",
}));

const { useLiveConversations } = await import("./use-live-conversations");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const stream = (over: Record<string, unknown> = {}) => ({
  type: "stream",
  stream: {
    id: "r1",
    title: "Base season, who wins",
    status: "live",
    thumbnailUrl: null,
    peakViewers: 12,
    owner: {
      id: "u1",
      username: "ada",
      displayName: "Ada",
      avatarUrl: "https://cdn.example/ada.png",
    },
    ...over,
  },
});

beforeEach(() => {
  fetchSquareFeed.mockReset();
  square.hidden = false;
});

describe("useLiveConversations", () => {
  it("reads the live lane and shapes each room for the card", async () => {
    fetchSquareFeed.mockResolvedValue({
      items: [stream(), stream({ id: "r2", status: "ended" }), { type: "post" }],
    });
    const { result } = renderHook(() => useLiveConversations(), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(fetchSquareFeed).toHaveBeenCalledWith("live", null, 6);
    expect(result.current[0]).toEqual({
      id: "r1",
      title: "Base season, who wins",
      host: "Ada",
      avatars: ["https://cdn.example/ada.png"],
      href: "https://square.example/live/r1",
    });
  });

  it("yields no rooms, and no error, when the square cannot be read", async () => {
    fetchSquareFeed.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useLiveConversations(), { wrapper });
    await waitFor(() => expect(fetchSquareFeed).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("asks nothing of a hidden square", () => {
    square.hidden = true;
    const { result } = renderHook(() => useLiveConversations(), { wrapper });
    expect(result.current).toEqual([]);
    expect(fetchSquareFeed).not.toHaveBeenCalled();
  });
});
