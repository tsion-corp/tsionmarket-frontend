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
