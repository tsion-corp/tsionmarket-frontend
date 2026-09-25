import { describe, expect, it } from "vitest";
import type { InboxNotification, InboxPage } from "@/lib/notifications/types";

// The domain shape the service sends. This suite is mostly a compile-time
// guard: if a field is dropped or stops being nullable, the fixtures below
// stop typechecking, which is what `pnpm typecheck` is for.

const unread: InboxNotification = {
  id: "ntf_1",
  campaignId: "cmp_1",
  title: "Perps are live",
  body: "Trade BTC and ETH with up to 20x.",
  url: "/perps",
  imageUrl: null,
  readAt: null,
  createdAt: "2026-09-21T10:00:00.000Z",
};

const read: InboxNotification = {
  ...unread,
  id: "ntf_2",
  imageUrl: "https://cdn.example.com/banner.png",
  readAt: "2026-09-21T11:00:00.000Z",
};

describe("InboxNotification", () => {
  it("carries the id, the campaign and both timestamps", () => {
    expect(Object.keys(unread).sort()).toEqual([
      "body",
      "campaignId",
      "createdAt",
      "id",
      "imageUrl",
      "readAt",
      "title",
      "url",
    ]);
  });

  it("marks an unread row with a null readAt, not a missing one", () => {
    expect(unread.readAt).toBeNull();
    expect("readAt" in unread).toBe(true);
    expect(read.readAt).not.toBeNull();
  });
});

describe("InboxPage", () => {
  it("carries the server's unread count and an opaque cursor", () => {
    const last: InboxPage = { items: [unread, read], unreadCount: 1, nextCursor: null };
    const more: InboxPage = {
      items: [unread],
      unreadCount: 1,
      nextCursor: "2026-09-21T10:00:00.000Z",
    };
    expect(last.nextCursor).toBeNull();
    expect(more.nextCursor).toBe("2026-09-21T10:00:00.000Z");
    // The badge is the server's figure, not a count of the rows loaded.
    expect(last.unreadCount).not.toBe(last.items.length);
  });
});
