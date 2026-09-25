import { z } from "zod";
import type {
  InboxNotification,
  InboxPage,
  ServiceInboxPage,
  ServiceNotification,
} from "@/lib/notifications/types";

// The client's parse of what the proxy returns. The proxy already judges the
// upstream body against its own copy of these shapes
// (lib/api/schemas/user-management.ts) and answers 502 on a mismatch; this is
// the browser's own gate on the data it is about to render.
//
// The inbox schemas are annotated with the domain types so the two cannot
// drift: drop a field here and the annotation stops typechecking.

export const inboxNotificationSchema: z.ZodType<InboxNotification> = z.object({
  id: z.string(),
  campaignId: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  // Nullable rather than optional: the service always writes the field, and
  // reading a missing one as null would hide a shape change.
  imageUrl: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const inboxPageSchema: z.ZodType<InboxPage> = z.object({
  items: z.array(inboxNotificationSchema),
  unreadCount: z.number().int(),
  nextCursor: z.string().nullable(),
});

// The notification service's own shape. `url` is nullable there and a string
// in user-management, which is exactly why the two are parsed separately
// rather than through one lenient schema that would accept either and tell
// the renderer nothing.
export const serviceNotificationSchema: z.ZodType<ServiceNotification> = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const serviceInboxPageSchema: z.ZodType<ServiceInboxPage> = z.object({
  items: z.array(serviceNotificationSchema),
  unread: z.number().int(),
  nextCursor: z.string().nullable(),
});

/** How many rows the server actually marked read. */
export const readResultSchema = z.object({ updated: z.number().int() });

/** null when the server has no VAPID keys, in which case subscribing 409s. */
export const vapidKeySchema = z.object({ publicKey: z.string().nullable() });

/** true from a subscribe, false from an unsubscribe. */
export const subscribeResultSchema = z.object({ subscribed: z.boolean() });

export type ReadResult = z.infer<typeof readResultSchema>;
export type VapidKeyResult = z.infer<typeof vapidKeySchema>;
export type SubscribeResult = z.infer<typeof subscribeResultSchema>;
