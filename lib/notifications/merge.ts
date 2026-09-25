import type { InboxNotification, ServiceNotification } from "@/lib/notifications/types";

// One list from two inboxes.
//
// The bell reads two stores: user-management, which carries what the team
// announces, and the notification service, which carries what the platform's
// own services publish (a Last Man win lands there). Both are real and both
// are wanted, so the reader sees one list and never learns there are two.
//
// The merge is display only. Each store keeps its own read state, which is why
// every row carries the store it came from: marking one read has to go back to
// the store that holds it.

export type BellSource = "platform" | "service";

export interface BellNotification {
  /** Unique across both stores; `id` alone is not, since they number apart. */
  key: string;
  id: string;
  source: BellSource;
  title: string;
  body: string;
  /** Null when it leads nowhere. Judge it with notificationDestination. */
  url: string | null;
  /** null while unread. */
  readAt: string | null;
  createdAt: string;
}

// An unreadable date sorts last rather than throwing or, worse, reading as
// epoch zero and taking the top of the list.
function at(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? -Infinity : ms;
}

export function mergeBellNotifications(
  platform: readonly InboxNotification[],
  service: readonly ServiceNotification[]
): BellNotification[] {
  const rows: BellNotification[] = [
    ...platform.map((item) => ({
      key: `platform:${item.id}`,
      id: item.id,
      source: "platform" as const,
      title: item.title,
      body: item.body,
      url: item.url,
      readAt: item.readAt,
      createdAt: item.createdAt,
    })),
    ...service.map((item) => ({
      key: `service:${item.id}`,
      id: item.id,
      source: "service" as const,
      title: item.title,
      body: item.body,
      url: item.url,
      readAt: item.readAt,
      createdAt: item.createdAt,
    })),
  ];
  return rows.sort((a, b) => at(b.createdAt) - at(a.createdAt));
}
