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
    ]) {
      expect(marketSquareProxyPaths.allows("POST", path), `POST ${path} must be relayed`).toBe(
        true
      );
    }
  });

  it("relays the reads those flows depend on", () => {
    for (const path of ["streams", "streams/abc", "streams/abc/speaker-requests/me"]) {
      expect(marketSquareProxyPaths.allows("GET", path), `GET ${path} must be relayed`).toBe(true);
    }
  });

  // The allowlist is the whole point of the proxy: Ark forwards the user's
  // session, so anything relayed is done AS them.
  it("refuses what these flows never need, so the session is not a general key", () => {
    for (const path of ["admin/stats", "me", "conversations", "posts/abc/like"]) {
      expect(marketSquareProxyPaths.allows("POST", path), `POST ${path} must be refused`).toBe(
        false
      );
    }
    expect(marketSquareProxyPaths.allows("GET", "me/conversations")).toBe(false);
  });

  it("matches whole paths, so a lookalike prefix is not relayed", () => {
    expect(marketSquareProxyPaths.allows("POST", "posts/abc")).toBe(false);
    expect(marketSquareProxyPaths.allows("POST", "streams/abc/go-live/extra")).toBe(false);
  });
});
