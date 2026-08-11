import { describe, expect, it } from "vitest";
import { pickMarketImage } from "@/lib/prediction-image";

describe("pickMarketImage", () => {
  it("prefers the market's own image above all", () => {
    expect(
      pickMarketImage(
        { image: "market.png", icon: "market-icon.png" },
        { image: "event.png", icon: "event-icon.png" }
      )
    ).toBe("market.png");
  });

  it("falls back to the market icon when the market has no image", () => {
    expect(pickMarketImage({ icon: "market-icon.png" }, { image: "event.png" })).toBe(
      "market-icon.png"
    );
  });

  it("falls back to the event image when the market has no art", () => {
    expect(pickMarketImage({}, { image: "event.png", icon: "event-icon.png" })).toBe("event.png");
  });

  it("falls back to the event icon last", () => {
    expect(pickMarketImage({}, { icon: "event-icon.png" })).toBe("event-icon.png");
  });

  it("treats empty strings as absent", () => {
    expect(pickMarketImage({ image: "", icon: "" }, { image: "", icon: "event-icon.png" })).toBe(
      "event-icon.png"
    );
  });

  it("returns null when nothing is set", () => {
    expect(pickMarketImage({}, {})).toBeNull();
    expect(pickMarketImage({ image: null, icon: null }, { image: null, icon: null })).toBeNull();
  });
});
