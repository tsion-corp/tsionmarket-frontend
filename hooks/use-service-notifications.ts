"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { apiFetch } from "@/lib/api";
import type { ServiceInboxPage, ServiceNotification } from "@/lib/notifications/types";

// The second inbox: the notification service, which the vault and the other
// services publish into over the broker. "You won" lands here, not in the
// user-management store the bell has always read.
//
// Kept as its own hook rather than folded into useNotificationInbox: two
// services, two shapes, two read states. Marking a row read here cannot mark
// one read there, and pretending otherwise would lose a badge.
//
// The zod parsers are imported on response rather than statically, the same
// rule use-notification-inbox follows: the bell is in the first-load payload
// of every route, and pulling zod into it broke the budget once already.
async function parsers(): Promise<typeof import("@/lib/notifications/schema")> {
  return import("@/lib/notifications/schema");
}

const KEY = "service-notifications";
const ROUTE = "/api/notification";
const PAGE_LIMIT = 50;
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const EMPTY: ServiceNotification[] = [];

/** The cache key for one account's service inbox. Exported so tests can address it. */
export function serviceNotificationsKey(userId: string | null) {
  return [KEY, userId] as const;
}

async function readPage(): Promise<ServiceInboxPage> {
  const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  const res = await apiFetch(
    `${ROUTE}/notifications?${query.toString()}`,
    {},
    { requireAuth: true }
  );
  if (!res.ok) throw new Error(`Could not read your notifications (${res.status})`);
  const body = (await res.json()) as { data?: unknown };
  const { serviceInboxPageSchema } = await parsers();
  return serviceInboxPageSchema.parse(body?.data ?? body);
}

export interface ServiceNotifications {
  items: ServiceNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: unknown;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  refetch(): void;
}

export function useServiceNotifications(): ServiceNotifications {
  const { userId } = useAuthSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => serviceNotificationsKey(userId), [userId]);

  // Enabled on sign-in rather than when the bell opens. The read is also what
  // links this wallet to this person on the service side, and a wallet it has
  // never heard from has its notifications DROPPED rather than stored. Waiting
  // for somebody to open the bell would mean the first win is the one lost.
  const query = useQuery({
    queryKey,
    enabled: userId !== null,
    queryFn: readPage,
    staleTime: 30 * 1000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const markRead = useCallback(
    async (id: string) => {
      const res = await apiFetch(
        `${ROUTE}/notifications/${encodeURIComponent(id)}/read`,
        { method: "POST", headers: JSON_HEADERS },
        { requireAuth: true }
      );
      if (!res.ok) throw new Error(`Could not mark that read (${res.status})`);
      invalidate();
    },
    [invalidate]
  );

  const markAllRead = useCallback(async () => {
    const res = await apiFetch(
      `${ROUTE}/notifications/read-all`,
      { method: "POST", headers: JSON_HEADERS },
      { requireAuth: true }
    );
    if (!res.ok) throw new Error(`Could not mark those read (${res.status})`);
    invalidate();
  }, [invalidate]);

  return {
    items: query.data?.items ?? EMPTY,
    unreadCount: query.data?.unread ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    markRead,
    markAllRead,
    refetch: invalidate,
  };
}
