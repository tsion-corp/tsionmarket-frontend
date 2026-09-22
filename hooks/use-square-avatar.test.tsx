// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("server-only", () => ({}));

const privy = vi.hoisted(() => ({ ready: true, authenticated: true }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => privy }));

const fetchSquareMe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/market-square", () => ({ fetchSquareMe }));

const { useSquareAvatar } = await import("@/hooks/use-square-avatar");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function squareProfile(avatarUrl: string | null) {
  return {
    id: "did:privy:abc",
    username: "emmanuel",
    displayName: "Emmanuel Omemgboji",
    avatarUrl,
    verification: "none",
    role: "citizen" as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  privy.ready = true;
  privy.authenticated = true;
});

describe("useSquareAvatar", () => {
  it("reads the picture the person set on the square", async () => {
    fetchSquareMe.mockResolvedValue(squareProfile("https://cdn.example/me.png"));

    const { result } = renderHook(() => useSquareAvatar(), { wrapper });

    await waitFor(() => expect(result.current).toBe("https://cdn.example/me.png"));
  });

  // The square creates a profile row on the first authenticated read but never
  // mints an avatar for it, so null is the ordinary answer for anyone who has
  // not set one — not a failure, and not something to retry.
  it("answers null for somebody who has set no picture", async () => {
    fetchSquareMe.mockResolvedValue(squareProfile(null));

    const { result } = renderHook(() => useSquareAvatar(), { wrapper });

    await waitFor(() => expect(fetchSquareMe).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("answers null rather than throwing when the square is unreachable", async () => {
    fetchSquareMe.mockRejectedValue(new Error("Market Square is unavailable right now."));

    const { result } = renderHook(() => useSquareAvatar(), { wrapper });

    await waitFor(() => expect(fetchSquareMe).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("asks nothing of the square while signed out", () => {
    privy.authenticated = false;

    const { result } = renderHook(() => useSquareAvatar(), { wrapper });

    expect(fetchSquareMe).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
