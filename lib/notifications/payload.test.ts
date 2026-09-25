import { describe, expect, it } from "vitest";
import { readPushPayload } from "@/lib/notifications/payload";

// What the browser is handed by the push service. public/push-service-worker.js
// mirrors every rule below in plain JS, so a change here is a change there.

const REAL = {
  campaignId: "cmp_01J8ZK",
  title: "Perps are live",
  body: "Trade BTC and ETH with up to 20x.",
  url: "/perps",
  imageUrl: "https://cdn.example.com/banner.png",
  tag: "admin:cmp_01J8ZK",
};

function without(field: keyof typeof REAL): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...REAL };
  delete copy[field];
  return copy;
}

describe("readPushPayload", () => {
  it("reads the payload the service sends", () => {
    expect(readPushPayload(REAL)).toEqual(REAL);
  });

  it("reads a payload with no image", () => {
    const payload = readPushPayload({ ...REAL, imageUrl: null });
    expect(payload?.imageUrl).toBeNull();
  });

  it("treats an empty image URL as no image", () => {
    expect(readPushPayload({ ...REAL, imageUrl: "" })?.imageUrl).toBeNull();
    expect(readPushPayload({ ...REAL, imageUrl: 42 })?.imageUrl).toBeNull();
  });

  it("returns null without a title, because a notification needs one", () => {
    expect(readPushPayload(without("title"))).toBeNull();
    expect(readPushPayload({ ...REAL, title: "" })).toBeNull();
    expect(readPushPayload({ ...REAL, title: "   " })).toBeNull();
    expect(readPushPayload({ ...REAL, title: 7 })).toBeNull();
  });

  it("returns null for foreign JSON", () => {
    expect(readPushPayload({ hello: "world" })).toBeNull();
    expect(readPushPayload({ notification: { title: "nested" } })).toBeNull();
    expect(readPushPayload([REAL])).toBeNull();
    expect(readPushPayload("Perps are live")).toBeNull();
    expect(readPushPayload(null)).toBeNull();
    expect(readPushPayload(undefined)).toBeNull();
    expect(readPushPayload(12)).toBeNull();
  });

  it("reads the rest defensively rather than dropping a usable notification", () => {
    const payload = readPushPayload({ title: "Maintenance window" });
    expect(payload).toEqual({
      campaignId: "",
      title: "Maintenance window",
      body: "",
      url: "",
      imageUrl: null,
      tag: "",
    });
  });

  it("derives the tag from the campaign when the sender left it out", () => {
    expect(readPushPayload(without("tag"))?.tag).toBe("admin:cmp_01J8ZK");
  });

  it("keeps a tag the sender did send", () => {
    expect(readPushPayload({ ...REAL, tag: "admin:other" })?.tag).toBe("admin:other");
  });

  it("does not judge the url, which destination.ts decides on", () => {
    expect(readPushPayload({ ...REAL, url: "javascript:alert(1)" })?.url).toBe(
      "javascript:alert(1)"
    );
    expect(readPushPayload({ ...REAL, url: 3 })?.url).toBe("");
  });

  it("ignores extra fields the service may add later", () => {
    expect(readPushPayload({ ...REAL, sentAt: "2026-09-21T10:00:00.000Z" })).toEqual(REAL);
  });
});
