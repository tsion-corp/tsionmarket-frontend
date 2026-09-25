import { describe, expect, it } from "vitest";
import { notificationDestination } from "@/lib/notifications/destination";

// Where a click on a notification sends the reader. This is a security
// boundary, so the rejections matter more than the acceptances, and
// public/push-service-worker.js mirrors all of them in plain JS.

describe("notificationDestination", () => {
  it("accepts an app-relative path", () => {
    expect(notificationDestination("/perps")).toEqual({ kind: "internal", path: "/perps" });
    expect(notificationDestination("/")).toEqual({ kind: "internal", path: "/" });
  });

  it("keeps the query and the hash on an internal path", () => {
    expect(notificationDestination("/meme?tab=x#y")).toEqual({
      kind: "internal",
      path: "/meme?tab=x#y",
    });
  });

  it("accepts an absolute https URL", () => {
    expect(notificationDestination("https://docs.example.com/a")).toEqual({
      kind: "external",
      href: "https://docs.example.com/a",
    });
  });

  it("rejects javascript: and data:", () => {
    expect(notificationDestination("javascript:alert(1)")).toBeNull();
    expect(notificationDestination("JavaScript:alert(1)")).toBeNull();
    expect(notificationDestination("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects a protocol-relative URL, which would leave the app", () => {
    expect(notificationDestination("//evil.com")).toBeNull();
    expect(notificationDestination("//evil.com/perps")).toBeNull();
  });

  it("rejects a backslash after the leading slash, which some parsers read as //", () => {
    expect(notificationDestination("/\\evil.com")).toBeNull();
  });

  it("rejects plain http", () => {
    expect(notificationDestination("http://x")).toBeNull();
    expect(notificationDestination("http://docs.example.com/a")).toBeNull();
  });

  it("rejects an empty or blank url", () => {
    expect(notificationDestination("")).toBeNull();
    expect(notificationDestination("   ")).toBeNull();
  });

  it("rejects anything unparsable", () => {
    expect(notificationDestination("not a url")).toBeNull();
    expect(notificationDestination("perps")).toBeNull();
    expect(notificationDestination("https://")).toBeNull();
  });

  it("rejects embedded credentials, which disguise the real host", () => {
    expect(notificationDestination("https://docs.example.com@evil.com/a")).toBeNull();
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(notificationDestination("  /perps  ")).toEqual({ kind: "internal", path: "/perps" });
  });

  it("normalises a traversal inside an internal path", () => {
    expect(notificationDestination("/a/../b")).toEqual({ kind: "internal", path: "/b" });
  });

  it("does not let an internal path escape to another origin", () => {
    const result = notificationDestination("/../../evil.com");
    expect(result).toEqual({ kind: "internal", path: "/evil.com" });
  });
});
