"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";
import { NOTIFICATION_ROUTES } from "@/lib/notifications/routes";
import type { InboxNotification, InboxPage } from "@/lib/notifications/types";

// The bell mounts in the app shell, so this hook is in the first-load payload
// of every route. A static import of the zod-backed parsers put zod and every
// schema there and CI's budget refused the build
// (hooks/notifications.first-load.test.ts). They are loaded when a response
// comes back instead, never on first paint, the same rule lib/meme/api.ts
// follows.
async function parsers(): Promise<typeof import("@/lib/notifications/schema")> {
  return import("@/lib/notifications/schema");
}

// The platform notification inbox, which is the durable record. A push
// message and a realtime frame are only signals that something arrived: they
// never become a row here, they only make this query read again.
//
// The key carries the signed-in Privy DID, so two accounts in one browser can
// never see each other's rows, and the previous account's pages are dropped
// from the cache as soon as the DID changes. The key is deliberately absent
// from PERSISTED_PREFIXES (lib/query-persist): this is private mail, and it
// has no business in a localStorage snapshot that outlives the session.

const INBOX_KEY = "notification-inbox";

// The service's default, and its maximum is 100.
const PAGE_LIMIT = 50;

// The service refuses a longer id list, so a bulk mark goes in batches rather
// than losing the tail.
const MAX_READ_IDS = 100;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const EMPTY: InboxNotification[] = [];

type InboxData = InfiniteData<InboxPage, string | null>;

/** The cache key for one account's inbox. Exported so tests can address it. */
export function notificationInboxKey(userId: string | null) {
  return [INBOX_KEY, userId] as const;
}

async function fetchInboxPage(userId: string, cursor: string | null): Promise<InboxPage> {
  const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  // The cursor is an opaque ISO timestamp the server handed us. It goes back
  // exactly as it came, never rebuilt from a date.
  if (cursor) query.set("cursor", cursor);
  const res = await apiFetch(
    `${NOTIFICATION_ROUTES.inbox(userId)}?${query.toString()}`,
    {},
    { requireAuth: true }
  );
  // Parsed, not coerced. A page that does not match the contract belongs in
  // the query's error state, not in a half-empty list on screen.
  const body = await unwrap<unknown>(res, "Could not load your notifications");
  return (await parsers()).inboxPageSchema.parse(body);
}

async function postRead(userId: string, ids: string[] | null): Promise<void> {
  const res = await apiFetch(
    NOTIFICATION_ROUTES.read(userId),
    {
      method: "POST",
      headers: JSON_HEADERS,
      // Mark-all sends an empty object. Sending `ids: []` would mark nothing
      // at all while answering 200, which is the handoff's trap.
      body: ids ? JSON.stringify({ ids }) : "{}",
    },
    { requireAuth: true }
  );
  const body = await unwrap<unknown>(res, "Could not mark your notifications read");
  (await parsers()).readResultSchema.parse(body);
}

// The same edit the server is about to make, applied to every cached page so
// the dot clears on the click rather than on the round trip. `ids` of null
// means everything.
function applyRead(data: InboxData | undefined, ids: Set<string> | null): InboxData | undefined {
  if (!data) return data;
  const readAt = new Date().toISOString();
  let cleared = 0;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.readAt !== null) return item;
      if (ids && !ids.has(item.id)) return item;
      cleared += 1;
      return { ...item, readAt };
    }),
  }));
  return {
    ...data,
    pages: pages.map((page) => ({
      ...page,
      unreadCount: ids ? Math.max(0, page.unreadCount - cleared) : 0,
    })),
  };
}

export interface NotificationInbox {
  items: InboxNotification[];
  /** The server's own figure, which is the badge. Not a count of loaded rows. */
  unreadCount: number;
  hasMore: boolean;
  loadMore(): void;
  isLoadingMore: boolean;
  markRead(ids: string[]): Promise<void>;
  markAllRead(): Promise<void>;
  isLoading: boolean;
  error: unknown;
  refetch(): void;
}

export function useNotificationInbox(): NotificationInbox {
  const { userId } = useAuthSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => notificationInboxKey(userId), [userId]);

  const query = useInfiniteQuery({
    queryKey,
    enabled: userId !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      // Guarded rather than asserted: the query is disabled without an
      // account, and a run without one is a bug worth seeing.
      if (!userId) throw new Error("No signed-in account");
      return fetchInboxPage(userId, pageParam);
    },
    getNextPageParam: (last: InboxPage) => last.nextCursor,
  });

  // Another account's private mail has no business staying in this tab's
  // cache. Signing out leaves userId null, which this covers as well.
  useEffect(() => {
    queryClient.removeQueries({
      predicate: (cached) => cached.queryKey[0] === INBOX_KEY && cached.queryKey[1] !== userId,
    });
  }, [queryClient, userId]);

  const { refetch } = query;

  // The worker tells every open tab when a push passed validation. The push
  // is only the signal; this read is what updates the bell.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const worker = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      if (!data || data.type !== "notification") return;
      void refetch();
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [refetch]);

  const items = useMemo(() => {
    const pages = query.data?.pages;
    if (!pages) return EMPTY;
    // A row can land on two pages when something is published between one
    // request and the next, because the cursor is a timestamp.
    const seen = new Set<string>();
    const list: InboxNotification[] = [];
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        list.push(item);
      }
    }
    return list;
  }, [query.data]);

  const mark = useCallback(
    async (ids: string[] | null) => {
      if (!userId) return;
      const previous = queryClient.getQueryData<InboxData>(queryKey);
      if (previous) {
        queryClient.setQueryData<InboxData>(queryKey, (old) =>
          applyRead(old, ids ? new Set(ids) : null)
        );
      }
      try {
        if (ids === null) {
          await postRead(userId, null);
          return;
        }
        for (let from = 0; from < ids.length; from += MAX_READ_IDS) {
          await postRead(userId, ids.slice(from, from + MAX_READ_IDS));
        }
      } catch (cause) {
        // Put the dots back. Showing a row as read when the server still has
        // it unread would lose it on the next load.
        if (previous) queryClient.setQueryData<InboxData>(queryKey, previous);
        throw cause;
      }
    },
    [queryClient, queryKey, userId]
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await mark(ids);
    },
    [mark]
  );

  const markAllRead = useCallback(async () => {
    await mark(null);
  }, [mark]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    items,
    unreadCount: query.data?.pages[0]?.unreadCount ?? 0,
    hasMore: hasNextPage,
    loadMore,
    isLoadingMore: isFetchingNextPage,
    markRead,
    markAllRead,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void refetch();
    },
  };
}
