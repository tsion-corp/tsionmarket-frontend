// The notification inbox's domain types, as the user-management service sends
// them. Timestamps stay as the ISO strings the service wrote: they are only
// ever displayed or sent back as an opaque cursor, so parsing them here would
// lose the exact value for no gain.

export interface InboxNotification {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  /** Where a click sends the reader. Judge it with notificationDestination. */
  url: string;
  imageUrl: string | null;
  /** null while unread. */
  readAt: string | null;
  createdAt: string;
}

export interface InboxPage {
  items: InboxNotification[];
  /** The server's own figure, which is the badge. Not a count of loaded rows. */
  unreadCount: number;
  /** An opaque cursor to send back as received, or null on the last page. */
  nextCursor: string | null;
}

// The SECOND inbox: the notification service, which other services publish
// into over the broker. This is where the vault's "you won" lands.
//
// A different service with a different shape, so it gets its own type rather
// than being coerced into InboxNotification above. The two are merged for
// display only (components/layout/notification-bell.tsx); each keeps its own
// read state, because marking one read cannot mark the other.
export interface ServiceNotification {
  id: string;
  /** e.g. "vault.game.won". Rendered by the service; we only ever group by it. */
  type: string;
  title: string;
  body: string;
  /** Null when the notification leads nowhere. Judge it with notificationDestination. */
  url: string | null;
  imageUrl: string | null;
  /** null while unread. */
  readAt: string | null;
  createdAt: string;
}

export interface ServiceInboxPage {
  items: ServiceNotification[];
  /** The service's own figure, which is the badge. Not a count of loaded rows. */
  unread: number;
  /** An opaque cursor to send back as received, or null on the last page. */
  nextCursor: string | null;
}
