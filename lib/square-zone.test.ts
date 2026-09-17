import { describe, expect, it } from "vitest";
import { isSquareZonePath, SQUARE_ZONE_PATH } from "./square-zone";

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
