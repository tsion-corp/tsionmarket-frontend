import { describe, expect, it } from "vitest";
import {
  inboxNotificationSchema,
  inboxPageSchema,
  readResultSchema,
  subscribeResultSchema,
  vapidKeySchema,
} from "@/lib/notifications/schema";

// The client's own parse of what the proxy returns. The proxy validates the
// upstream body with its own copy of these shapes, so this is a second gate on
// our side of the envelope, not the only one.

const row = {
  id: "ntf_1",
  campaignId: "cmp_1",
  title: "Perps are live",
  body: "Trade BTC and ETH with up to 20x.",
  url: "/perps",
  imageUrl: null,
  readAt: null,
  createdAt: "2026-09-21T10:00:00.000Z",
};

function without(field: keyof typeof row): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  delete copy[field];
  return copy;
}

describe("inboxNotificationSchema", () => {
  it("accepts a row with null imageUrl and null readAt", () => {
    expect(inboxNotificationSchema.parse(row)).toEqual(row);
  });

  it("accepts a read row with an image", () => {
    const full = {
      ...row,
      imageUrl: "https://cdn.example.com/banner.png",
      readAt: "2026-09-21T11:00:00.000Z",
    };
    expect(inboxNotificationSchema.parse(full)).toEqual(full);
  });

  it("rejects a missing imageUrl rather than reading it as null", () => {
    expect(inboxNotificationSchema.safeParse(without("imageUrl")).success).toBe(false);
  });

  it("rejects a row without a createdAt", () => {
    expect(inboxNotificationSchema.safeParse(without("createdAt")).success).toBe(false);
  });
});

describe("inboxPageSchema", () => {
  it("accepts a page with a cursor and one with none", () => {
    expect(inboxPageSchema.parse({ items: [row], unreadCount: 1, nextCursor: null })).toEqual({
      items: [row],
      unreadCount: 1,
      nextCursor: null,
    });
    const paged = inboxPageSchema.parse({
      items: [],
      unreadCount: 0,
      nextCursor: "2026-09-21T10:00:00.000Z",
    });
    expect(paged.nextCursor).toBe("2026-09-21T10:00:00.000Z");
  });

  it("rejects a fractional unread count", () => {
    expect(
      inboxPageSchema.safeParse({ items: [], unreadCount: 1.5, nextCursor: null }).success
    ).toBe(false);
  });

  it("rejects a page whose items are not rows", () => {
    expect(
      inboxPageSchema.safeParse({ items: [{ id: "x" }], unreadCount: 0, nextCursor: null }).success
    ).toBe(false);
  });
});

describe("readResultSchema", () => {
  it("reads the number of rows the server marked", () => {
    expect(readResultSchema.parse({ updated: 3 })).toEqual({ updated: 3 });
    expect(readResultSchema.safeParse({ updated: "3" }).success).toBe(false);
  });
});

describe("vapidKeySchema", () => {
  it("accepts a key and the null the server sends when push is not configured", () => {
    expect(vapidKeySchema.parse({ publicKey: "BPk...".repeat(1) })).toEqual({
      publicKey: "BPk...",
    });
    expect(vapidKeySchema.parse({ publicKey: null })).toEqual({ publicKey: null });
    expect(vapidKeySchema.safeParse({}).success).toBe(false);
  });
});

describe("subscribeResultSchema", () => {
  it("covers both the subscribe and the unsubscribe answer", () => {
    expect(subscribeResultSchema.parse({ subscribed: true })).toEqual({ subscribed: true });
    expect(subscribeResultSchema.parse({ subscribed: false })).toEqual({ subscribed: false });
    expect(subscribeResultSchema.safeParse({ subscribed: "yes" }).success).toBe(false);
  });
});
