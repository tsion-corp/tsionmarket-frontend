import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { InboxNotification } from "@/lib/notifications/types";
import { isPersistedKey } from "@/lib/query-persist";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  userId: "did:privy:alice" as string | null,
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
  profile: { name: "u", email: "", avatarSeed: "u" },
  logout: async () => {},
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));

import { notificationInboxKey, useNotificationInbox } from "@/hooks/use-notification-inbox";

const ALICE = "did:privy:alice";
const BOB = "did:privy:bob";

type WorkerListener = (event: MessageEvent) => void;
const workerListeners = new Set<WorkerListener>();

function installServiceWorkerStub() {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: (_type: string, listener: WorkerListener) => workerListeners.add(listener),
      removeEventListener: (_type: string, listener: WorkerListener) =>
        workerListeners.delete(listener),
    },
  });
}

function postFromWorker(data: unknown) {
  for (const listener of [...workerListeners]) listener({ data } as MessageEvent);
}

function row(id: string, over: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id,
    campaignId: `campaign-${id}`,
    title: `Title ${id}`,
    body: `Body ${id}`,
    url: "/perps",
    imageUrl: null,
    readAt: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    ...over,
  };
}

function answer(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function refusal(code: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: { code, message: "no" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const requestedUrls = () => apiFetch.mock.calls.map((call) => String(call[0]));

describe("useNotificationInbox", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    workerListeners.clear();
    installServiceWorkerStub();
    session.ready = true;
    session.authenticated = true;
    session.userId = ALICE;
  });

  afterEach(() => {
    client.clear();
  });

  it("asks for the first page with a limit and no cursor", async () => {
    apiFetch.mockResolvedValue(answer({ items: [row("a")], unreadCount: 1, nextCursor: null }));
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const url = requestedUrls()[0];
    expect(url).toContain(`/api/user-management/users/${encodeURIComponent(ALICE)}/notifications`);
    expect(url).toContain("limit=50");
    expect(url).not.toContain("cursor=");
  });

  it("pages with the cursor it was given and stops at a null one", async () => {
    apiFetch
      .mockResolvedValueOnce(
        answer({ items: [row("a")], unreadCount: 2, nextCursor: "2026-09-20T09:00:00.000Z" })
      )
      .mockResolvedValueOnce(answer({ items: [row("b")], unreadCount: 2, nextCursor: null }));

    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(requestedUrls()[1]).toContain(
      `cursor=${encodeURIComponent("2026-09-20T09:00:00.000Z")}`
    );
    expect(result.current.hasMore).toBe(false);
  });

  it("dedupes rows that arrive on two pages", async () => {
    apiFetch
      .mockResolvedValueOnce(answer({ items: [row("a")], unreadCount: 1, nextCursor: "c1" }))
      .mockResolvedValueOnce(
        answer({ items: [row("a"), row("b")], unreadCount: 1, nextCursor: null })
      );

    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("takes the badge from the server rather than counting the rows it holds", async () => {
    apiFetch.mockResolvedValue(
      answer({
        items: [row("a", { readAt: "2026-09-20T11:00:00.000Z" })],
        unreadCount: 40,
        nextCursor: null,
      })
    );
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.unreadCount).toBe(40);
  });

  it("surfaces a response that does not match the contract instead of showing nothing", async () => {
    apiFetch.mockResolvedValue(answer({ items: [{ id: "a" }], unreadCount: 1, nextCursor: null }));
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.items).toHaveLength(0);
  });

  it("marks rows read at once and rolls back when the server refuses", async () => {
    apiFetch.mockResolvedValueOnce(
      answer({ items: [row("a"), row("b")], unreadCount: 2, nextCursor: null })
    );
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let release: (value: Response) => void = () => {};
    apiFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.markRead(["a"]).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.items[0].readAt).not.toBeNull());
    expect(result.current.unreadCount).toBe(1);

    await act(async () => {
      release(refusal("UPSTREAM_ERROR", 502));
      await pending;
    });

    await waitFor(() => expect(result.current.items[0].readAt).toBeNull());
    expect(result.current.unreadCount).toBe(2);
  });

  it("sends the ids it was given on mark read", async () => {
    apiFetch.mockResolvedValueOnce(
      answer({ items: [row("a"), row("b")], unreadCount: 2, nextCursor: null })
    );
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    apiFetch.mockResolvedValueOnce(answer({ updated: 1 }));
    await act(() => result.current.markRead(["a"]));

    const call = apiFetch.mock.calls[1];
    expect(String(call[0])).toContain("/notifications/read");
    expect(call[1]).toMatchObject({ method: "POST", body: JSON.stringify({ ids: ["a"] }) });
    expect(call[2]).toEqual({ requireAuth: true });
  });

  it("sends an empty body on mark all read, never an empty id list", async () => {
    apiFetch.mockResolvedValueOnce(
      answer({ items: [row("a"), row("b")], unreadCount: 2, nextCursor: null })
    );
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    apiFetch.mockResolvedValueOnce(answer({ updated: 2 }));
    await act(() => result.current.markAllRead());

    expect(apiFetch.mock.calls[1][1]).toMatchObject({ body: "{}" });
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.items.every((item) => item.readAt !== null)).toBe(true);
  });

  it("refetches when the worker says a push landed", async () => {
    apiFetch.mockResolvedValue(answer({ items: [row("a")], unreadCount: 1, nextCursor: null }));
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      postFromWorker({ type: "notification", campaignId: "campaign-a" });
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  it("ignores a worker message that is not about a notification", async () => {
    apiFetch.mockResolvedValue(answer({ items: [row("a")], unreadCount: 1, nextCursor: null }));
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      postFromWorker({ type: "pushsubscriptionchange" });
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("is never written to the persisted cache snapshot", () => {
    expect(isPersistedKey(notificationInboxKey(ALICE))).toBe(false);
  });

  it("drops the previous account's inbox when the signed-in account changes", async () => {
    apiFetch.mockResolvedValue(answer({ items: [row("a")], unreadCount: 1, nextCursor: null }));
    const { result, rerender } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(client.getQueryData(notificationInboxKey(ALICE))).toBeTruthy();

    session.userId = BOB;
    rerender();

    await waitFor(() => expect(client.getQueryData(notificationInboxKey(ALICE))).toBeUndefined());
  });

  it("drops the inbox on sign-out", async () => {
    apiFetch.mockResolvedValue(answer({ items: [row("a")], unreadCount: 1, nextCursor: null }));
    const { result, rerender } = renderHook(() => useNotificationInbox(), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    session.userId = null;
    session.authenticated = false;
    rerender();

    await waitFor(() => expect(client.getQueryData(notificationInboxKey(ALICE))).toBeUndefined());
    expect(result.current.unreadCount).toBe(0);
  });

  it("asks for nothing while there is no signed-in account", async () => {
    session.userId = null;
    session.authenticated = false;
    const { result } = renderHook(() => useNotificationInbox(), { wrapper });

    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(0);
  });
});
