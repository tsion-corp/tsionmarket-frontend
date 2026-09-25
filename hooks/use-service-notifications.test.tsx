import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
const { useAuthSession } = vi.hoisted(() => ({ useAuthSession: vi.fn() }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession }));

import { useServiceNotifications } from "./use-service-notifications";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const WIN = {
  id: "n1",
  type: "vault.game.won",
  title: "You won",
  body: "0.5 USDC",
  url: "/casino/last-standing/244",
  imageUrl: null,
  readAt: null,
  createdAt: "2026-09-25T10:00:00.000Z",
};

function page(items: unknown[], unread = 1, nextCursor: string | null = null) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: { items, unread, nextCursor } }),
  } as Response);
}

beforeEach(() => {
  apiFetch.mockReset();
  useAuthSession.mockReturnValue({ userId: "did:test" });
});

describe("useServiceNotifications", () => {
  it("reads the vault's notifications from the notification service", async () => {
    apiFetch.mockReturnValue(page([WIN]));
    const { result } = renderHook(() => useServiceNotifications(), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].type).toBe("vault.game.won");
    expect(result.current.unreadCount).toBe(1);
    expect(apiFetch.mock.calls[0][0]).toContain("/api/notification/notifications");
  });

  // Reading the inbox is what links this wallet to this person on the service
  // side. A winner it has never heard from is dropped, not stored, so the read
  // has to happen on sign-in rather than when the bell is opened.
  it("reads on mount for a signed-in account, without being opened", async () => {
    apiFetch.mockReturnValue(page([]));
    renderHook(() => useServiceNotifications(), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it("asks for nothing when nobody is signed in", async () => {
    useAuthSession.mockReturnValue({ userId: null });
    renderHook(() => useServiceNotifications(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  // A malformed row is a shape change, and rendering half of one is worse than
  // rendering none: the parse is the boundary.
  it("rejects a page whose rows are not the shape the service documents", async () => {
    apiFetch.mockReturnValue(page([{ id: "n1", title: "no body or type" }]));
    const { result } = renderHook(() => useServiceNotifications(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.items).toEqual([]);
  });

  it("marks one read and asks the service, not the other inbox", async () => {
    apiFetch.mockReturnValue(page([WIN]));
    const { result } = renderHook(() => useServiceNotifications(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    apiFetch.mockClear();
    apiFetch.mockReturnValue(
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    );
    await act(async () => {
      await result.current.markRead("n1");
    });
    expect(apiFetch.mock.calls[0][0]).toBe("/api/notification/notifications/n1/read");
  });

  it("marks everything read through the service's own route", async () => {
    apiFetch.mockReturnValue(page([WIN]));
    const { result } = renderHook(() => useServiceNotifications(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    apiFetch.mockClear();
    apiFetch.mockReturnValue(
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    );
    await act(async () => {
      await result.current.markAllRead();
    });
    expect(apiFetch.mock.calls[0][0]).toBe("/api/notification/notifications/read-all");
  });
});
