import { describe, expect, it } from "vitest";
import { marketSquareProxyPaths } from "./market-square-proxy-paths";

/**
 * "Post to Market Square" shipped as a 404: the composer worked, the square
 * accepted posts, and Ark's own proxy refused the write before it ever left.
 * A missing entry here looks like the square is down, so the list is pinned.
 */
describe("market square proxy allowlist", () => {
  it("relays the writes the share and broadcast flows depend on", () => {
    for (const path of [
      "posts",
      "streams",
      "streams/abc/go-live",
      "streams/abc/end",
      "streams/abc/speaker-requests",
      "streams/abc/speaker-requests/r1/approve",
      "streams/abc/speaker-token",
      "me/creator-application",
      "posts/abc/like",
      "posts/abc/repost",
      "posts/abc/comments",
      "posts/abc/views",
      "profiles/abc/follow",
    ]) {
      expect(marketSquareProxyPaths.allows("POST", path), `POST ${path} must be relayed`).toBe(
        true
      );
    }
  });

  it("relays the reads those flows depend on", () => {
    for (const path of ["feed", "streams", "streams/abc", "streams/abc/speaker-requests/me"]) {
      expect(marketSquareProxyPaths.allows("GET", path), `GET ${path} must be relayed`).toBe(true);
    }
  });

  // The allowlist is the whole point of the proxy: Ark forwards the user's
  // session, so anything relayed is done AS them.
  it("refuses what these flows never need, so the session is not a general key", () => {
    for (const path of ["admin/stats", "me", "conversations", "posts/abc/unlike"]) {
      expect(marketSquareProxyPaths.allows("POST", path), `POST ${path} must be refused`).toBe(
        false
      );
    }
    expect(marketSquareProxyPaths.allows("GET", "me/conversations")).toBe(false);
    // The dashboard reads the feed; it has no business reading anyone's
    // bookmarks or notifications through the same relay.
    expect(marketSquareProxyPaths.allows("GET", "me/bookmarks")).toBe(false);
    expect(marketSquareProxyPaths.allows("GET", "me/conversations")).toBe(false);
    expect(marketSquareProxyPaths.allows("GET", "feed/abc")).toBe(false);
    // The dashboard reads the feed; it has no business reading anyone's
    // bookmarks or notifications through the same relay.
    expect(marketSquareProxyPaths.allows("GET", "me/bookmarks")).toBe(false);
    expect(marketSquareProxyPaths.allows("GET", "me/conversations")).toBe(false);
    expect(marketSquareProxyPaths.allows("GET", "feed/abc")).toBe(false);
  });

  it("relays only the undo DELETEs, and nothing else", () => {
    expect(marketSquareProxyPaths.allows("DELETE", "posts/abc/like")).toBe(true);
    expect(marketSquareProxyPaths.allows("DELETE", "posts/abc/repost")).toBe(true);
    expect(marketSquareProxyPaths.allows("DELETE", "profiles/abc/follow")).toBe(true);
    for (const path of ["posts/abc", "posts", "streams/abc", "me", "posts/abc/bookmark"]) {
      expect(marketSquareProxyPaths.allows("DELETE", path), `DELETE ${path} must be refused`).toBe(
        false
      );
    }
  });

  // Ark forwards the player's session, so a relayed path acts AS them. Like is
  // the one engagement widened for the dashboard feed, because its entire
  // blast radius is a heart on a post. The rest stay in the square.
  // Engagement relayed here is scoped to ONE post the reader is looking at.
  // Anything that reaches another account, or the reader's own settings, stays
  // in the square — Ark forwards the session, so a relayed path acts as them.
  it("does not relay anything that reaches beyond the post being read", () => {
    for (const path of [
      "posts/abc/bookmark",
      "profiles/abc/block",
      "reports",
      "me/interests",
      "admin/verification",
    ]) {
      expect(marketSquareProxyPaths.allows("POST", path), `POST ${path} must be refused`).toBe(
        false
      );
    }
  });

  // Ark's proxy demands a session by default, which turned the dashboard's
  // square section into a 401 for signed-out readers even though the feed
  // upstream answers anybody. Only the genuinely public reads are exempt.
  it("exempts only the square's public reads from the session check", () => {
    for (const path of ["feed", "topics", "hashtags/trending", "posts/abc/comments"]) {
      expect(marketSquareProxyPaths.isPublicGet(path), `${path} should be public`).toBe(true);
    }
    for (const path of [
      "me",
      "me/unread",
      "me/notifications",
      "me/creator-application",
      "streams",
      "streams/abc/speaker-requests/me",
      "posts/abc/comments/extra",
      "hashtags",
    ]) {
      expect(marketSquareProxyPaths.isPublicGet(path), `${path} must need a session`).toBe(false);
    }
  });

  it("matches whole paths, so a lookalike prefix is not relayed", () => {
    expect(marketSquareProxyPaths.allows("POST", "posts/abc")).toBe(false);
    expect(marketSquareProxyPaths.allows("POST", "streams/abc/go-live/extra")).toBe(false);
  });
});
