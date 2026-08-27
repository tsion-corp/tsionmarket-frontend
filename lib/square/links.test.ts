import { describe, expect, it } from "vitest";
import { squarePath } from "@/lib/square/links";

/**
 * These pin the Market Square app's ACTUAL routes (its `app/` folders):
 * `/p/[id]`, `/live/[id]`, `/u/[username]`.
 *
 * A post shipped linking to `/post/<id>`, which 404s — the composer reported
 * success and then sent people to a missing page. Asserting the shape here is
 * what makes that a failed test run rather than a failed tap.
 */
describe("squarePath", () => {
  it("points a post at p/, not post/", () => {
    expect(squarePath.post("abc")).toBe("p/abc");
    expect(squarePath.post("abc")).not.toContain("post/");
  });

  it("uses the live and profile routes the app actually defines", () => {
    expect(squarePath.live("st_1")).toBe("live/st_1");
    expect(squarePath.profile("adeey")).toBe("u/adeey");
  });

  it("escapes ids, so a stray character cannot break out of the path", () => {
    expect(squarePath.post("a/b?c")).toBe("p/a%2Fb%3Fc");
    expect(squarePath.profile("a b")).toBe("u/a%20b");
  });
});
