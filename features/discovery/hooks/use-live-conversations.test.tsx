import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchSquareFeed = vi.fn();
const fetchRoomDetail = vi.fn();
vi.mock("@/lib/api/market-square", () => ({
  fetchSquareFeed: (...args: unknown[]) => fetchSquareFeed(...args),
  fetchRoomDetail: (...args: unknown[]) => fetchRoomDetail(...args),
}));

const square = { hidden: false };
vi.mock("@/lib/market-square", () => ({
  get MARKET_SQUARE_HIDDEN() {
    return square.hidden;
  },
  // The zone path, which is what the real one returns now.
  marketSquareHref: (path?: string) => (path ? `/square/${path}` : "/square"),
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
  fetchRoomDetail.mockReset();
  fetchRoomDetail.mockResolvedValue({ id: "r1", category: null, participants: [] });
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
      href: "/square/live/r1",
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

/**
 * The faces on the card, and which screen the pill opens.
 *
 * The feed names a live room but says neither who is in it nor what kind of
 * room it is, so each room's own row is read for both. Before that, the card
 * drew the host's avatar and the scatter repeated that one face across every
 * slot — a card about a conversation showing one person several times.
 */
describe("useLiveConversations room detail", () => {
  it("draws the people in the room, and opens the gist room screen", async () => {
    fetchSquareFeed.mockResolvedValue({ items: [stream()] });
    fetchRoomDetail.mockResolvedValue({
      id: "r1",
      category: "house",
      participants: [
        { id: "u1", username: "ada", displayName: "Ada", avatarUrl: "https://cdn.example/ada.png" },
        { id: "u2", username: "bo", displayName: "Bo", avatarUrl: "https://cdn.example/bo.png" },
      ],
    });

    const { result } = renderHook(() => useLiveConversations(), { wrapper });
    await waitFor(() => expect(result.current[0]?.avatars).toHaveLength(2));
    expect(result.current[0]?.avatars).toEqual([
      "https://cdn.example/ada.png",
      "https://cdn.example/bo.png",
    ]);
    expect(result.current[0]?.href).toBe("/square/gist-rooms/r1");
    expect(fetchRoomDetail).toHaveBeenCalledWith("r1");
  });

  // A person with no picture is not a face to draw, and an empty participants
  // list is a real answer upstream — presence is keyed by view session, so a
  // signed-out listener has nobody behind theirs. Either way the host's own
  // avatar is the fallback, never a gap.
  it("falls back to the host when the room has no faces to give", async () => {
    fetchSquareFeed.mockResolvedValue({ items: [stream()] });
    fetchRoomDetail.mockResolvedValue({
      id: "r1",
      category: "house",
      participants: [{ id: "u9", username: "zed", displayName: "Zed", avatarUrl: null }],
    });

    const { result } = renderHook(() => useLiveConversations(), { wrapper });
    await waitFor(() => expect(result.current[0]?.href).toBe("/square/gist-rooms/r1"));
    expect(result.current[0]?.avatars).toEqual(["https://cdn.example/ada.png"]);
  });

  // The room still renders while its own row is in flight, and corrects itself
  // when it lands: a card that waited would flicker in and out on every poll.
  it("renders the room before its detail arrives", async () => {
    fetchSquareFeed.mockResolvedValue({ items: [stream()] });
    fetchRoomDetail.mockRejectedValue(new Error("down"));

    const { result } = renderHook(() => useLiveConversations(), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.avatars).toEqual(["https://cdn.example/ada.png"]);
    expect(result.current[0]?.href).toBe("/square/live/r1");
  });
});
