"use client";

// In-app notifications.
//
// These live in the earn service's own database rather than an email queue: the
// queue this service writes to has no consumer, so anything sent that way is
// never delivered. A notification row is readable by the app regardless.

import { earnAuthedGet, earnPost } from "@/lib/earn/api/client";
import type { EarnNotification, NotificationFeed } from "@/lib/earn/api/types";

interface NotificationWire {
  id?: string;
  type?: string;
  title?: string;
  body?: string | null;
  listingId?: string | null;
  listingSlug?: string | null;
  submissionId?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
}

interface FeedWire {
  items?: NotificationWire[];
  unread?: number;
}

const TYPES = ["WINNERS_ANNOUNCED", "YOU_WON", "SUBMISSION_REJECTED", "PAYMENT_SENT"] as const;

function toNotification(wire: NotificationWire): EarnNotification | null {
  // A notification with no id cannot be marked read, and one with no title has
  // nothing to say. Either way it is dropped rather than rendered blank.
  if (!wire?.id || !wire.title) return null;
  const type = TYPES.find((known) => known === wire.type) ?? "WINNERS_ANNOUNCED";
  return {
    id: wire.id,
    type,
    title: wire.title,
    body: wire.body && wire.body.length > 0 ? wire.body : null,
    listingSlug: wire.listingSlug && wire.listingSlug.length > 0 ? wire.listingSlug : null,
    isRead: !!wire.readAt,
    createdAt: wire.createdAt && wire.createdAt.length > 0 ? wire.createdAt : null,
  };
}

export async function fetchNotifications(): Promise<NotificationFeed> {
  const data = await earnAuthedGet<FeedWire>("/notifications");
  const items = Array.isArray(data?.items)
    ? data.items.map(toNotification).filter((n): n is EarnNotification => n !== null)
    : [];
  return {
    items,
    // Falls back to counting what arrived, so the badge still means something
    // if the service stops sending the count.
    unread: typeof data?.unread === "number" ? data.unread : items.filter((n) => !n.isRead).length,
  };
}

// Omitting ids marks everything read, which is what "mark all" does.
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await earnPost<unknown>("/notifications/read", ids?.length ? { ids } : {});
}
