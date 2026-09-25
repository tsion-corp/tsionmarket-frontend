import { describe, expect, it } from "vitest";
import { isSquareZonePath, SQUARE_ZONE_PATH, withSquareHandoff } from "./square-zone";

describe("isSquareZonePath", () => {
  it("claims the Square's own paths", () => {
    expect(isSquareZonePath(SQUARE_ZONE_PATH)).toBe(true);
    expect(isSquareZonePath("/square/pals")).toBe(true);
    expect(isSquareZonePath("/square?compose=1")).toBe(true);
    expect(isSquareZonePath("/square#top")).toBe(true);
  });

  it("leaves this app's routes alone, including its own Square API", () => {
    expect(isSquareZonePath("/api/square/symbols")).toBe(false);
    expect(isSquareZonePath("/squared")).toBe(false);
    expect(isSquareZonePath("/market")).toBe(false);
    expect(isSquareZonePath("https://square.tsionark.com")).toBe(false);
  });
});

describe("withSquareHandoff", () => {
  const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJ1aWQiOiJ1LTEifQ.sig";

  it("hands the session over as decane_token on the square's path", () => {
    expect(withSquareHandoff("/square", TOKEN)).toBe(`/square?decane_token=${TOKEN}`);
  });

  it("keeps a query and a fragment already on the link", () => {
    expect(withSquareHandoff("/square/u/korex?tab=posts#top", TOKEN)).toBe(
      `/square/u/korex?tab=posts&decane_token=${TOKEN}#top`
    );
  });

  it("replaces a stale token rather than adding a second", () => {
    expect(withSquareHandoff(`/square?decane_token=old`, TOKEN)).toBe(
      `/square?decane_token=${TOKEN}`
    );
  });

  it("leaves the link alone when there is no session to hand over", () => {
    expect(withSquareHandoff("/square", null)).toBe("/square");
    expect(withSquareHandoff("/square?tab=posts", null)).toBe("/square?tab=posts");
  });
});
