import { describe, expect, it } from "vitest";
import { mergeBellNotifications } from "./merge";
import type { InboxNotification, ServiceNotification } from "./types";

const platform = (over: Partial<InboxNotification> = {}): InboxNotification => ({
  id: "p1",
  campaignId: "c1",
  title: "Platform notice",
  body: "from the team",
  url: "/square",
  imageUrl: null,
  readAt: null,
  createdAt: "2026-09-25T10:00:00.000Z",
  ...over,
});

const service = (over: Partial<ServiceNotification> = {}): ServiceNotification => ({
  id: "s1",
  type: "vault.game.won",
  title: "You won",
  body: "0.5 USDC",
  url: "/casino/last-standing/244",
  imageUrl: null,
  readAt: null,
  createdAt: "2026-09-25T11:00:00.000Z",
  ...over,
});

describe("mergeBellNotifications", () => {
  it("interleaves both stores newest first, whichever they came from", () => {
    const merged = mergeBellNotifications(
      [platform({ id: "p1", createdAt: "2026-09-25T09:00:00.000Z" })],
      [service({ id: "s1", createdAt: "2026-09-25T11:00:00.000Z" })]
    );
    expect(merged.map((m) => m.id)).toEqual(["s1", "p1"]);
  });

  // The source rides along because marking a row read has to go back to the
  // store that holds it. Losing it would send a vault read to user-management,
  // which would answer 404 and leave the badge stuck.
  it("carries which store each row came from", () => {
    const merged = mergeBellNotifications([platform()], [service()]);
    expect(merged.find((m) => m.id === "p1")?.source).toBe("platform");
    expect(merged.find((m) => m.id === "s1")?.source).toBe("service");
  });

  // The two stores number their rows independently, so a collision is a
  // question of when, not if.
  it("keeps two rows that share an id, because the stores do not share a numbering", () => {
    const merged = mergeBellNotifications([platform({ id: "same" })], [service({ id: "same" })]);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((m) => m.key)).size).toBe(2);
  });

  it("carries a service row's null url rather than inventing one", () => {
    const merged = mergeBellNotifications([], [service({ url: null })]);
    expect(merged[0].url).toBeNull();
  });

  it("is empty when both stores are", () => {
    expect(mergeBellNotifications([], [])).toEqual([]);
  });

  it("works when only one store has anything", () => {
    expect(mergeBellNotifications([platform()], [])).toHaveLength(1);
    expect(mergeBellNotifications([], [service()])).toHaveLength(1);
  });

  // An unparseable date sorts last rather than throwing or jumping to the top.
  it("does not let a malformed timestamp take the top of the list", () => {
    const merged = mergeBellNotifications(
      [platform({ id: "bad", createdAt: "not-a-date" })],
      [service({ id: "good" })]
    );
    expect(merged[0].id).toBe("good");
  });
});
