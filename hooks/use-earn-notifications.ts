"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, markNotificationsRead } from "@/lib/earn/api/notifications";

export const NOTIFICATION_KEYS = {
  feed: ["earn", "notifications"] as const,
};

// Polled rather than pushed, because a browser that has refused notification
// permission still has to see the badge update. Push, where it is allowed,
// arrives on top of this rather than replacing it.
const POLL_MS = 60_000;

export function useNotifications() {
  const query = useQuery({
    queryKey: NOTIFICATION_KEYS.feed,
    queryFn: fetchNotifications,
    refetchInterval: POLL_MS,
    // A tab left open in the background does not need to keep polling; it
    // refetches when the reader comes back to it.
    refetchIntervalInBackground: false,
  });

  return {
    items: query.data?.items ?? [],
    unread: query.data?.unread ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.feed });
    },
  });
}
