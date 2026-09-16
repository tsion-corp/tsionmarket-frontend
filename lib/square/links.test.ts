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

  it("points the bell at the notifications route the app defines", () => {
    expect(squarePath.notifications()).toBe("notifications");
  });

  it("escapes ids, so a stray character cannot break out of the path", () => {
    expect(squarePath.post("a/b?c")).toBe("p/a%2Fb%3Fc");
    expect(squarePath.profile("a b")).toBe("u/a%20b");
  });
});

// The two routes the Square page's "do more" controls need on top of the
// three above: a house lives at `/houses/[id]`, and "Make some friends" views
// more at `/pals`.
describe("squarePath for the Square page", () => {
  it("points a house at houses/, escaped", () => {
    expect(squarePath.house("h_1")).toBe("houses/h_1");
    expect(squarePath.house("a/b")).toBe("houses/a%2Fb");
  });

  it("points the people deck's view-more at pals", () => {
    expect(squarePath.pals()).toBe("pals");
  });

  // Home's other three "View more" pills: rooms, houses and the feed.
  it("points the other view-more pills at the Square's own pages", () => {
    expect(squarePath.gistRooms()).toBe("gist-rooms");
    expect(squarePath.houses()).toBe("houses");
    expect(squarePath.feed()).toBe("feed");
  });

  // The banner's "Host Room" lands where the Square's own does: the rooms
  // page with its create sheet open. A search opens the Square's Explore,
  // which owns ?q= over there, with the words escaped.
  it("points the banner at the Square's rooms page with its create sheet open", () => {
    expect(squarePath.hostRoom()).toBe("gist-rooms?open=1");
  });

  // Home's search answers a room code with a way into that room, at the
  // Square's /code/[code]; a store hit opens the product at /store/[slug].
  it("points a room code and a product at the Square's own routes", () => {
    expect(squarePath.roomCode("abc2345bc")).toBe("code/abc2345bc");
    expect(squarePath.product("gold-tee")).toBe("store/gold-tee");
  });
});
