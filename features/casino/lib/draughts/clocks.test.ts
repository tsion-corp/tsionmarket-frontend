import { describe, expect, it } from "vitest";
import { draughtsTimeControl, resolveDraughtsMinutes } from "./clocks";

describe("draughts clock choices", () => {
  it("uses the fixed minute presets without an increment", () => {
    expect(draughtsTimeControl(1, "")).toBe("1+0");
    expect(draughtsTimeControl(15, "")).toBe("15+0");
  });

  it("accepts a bounded whole-minute custom clock", () => {
    expect(resolveDraughtsMinutes("custom", "25")).toBe(25);
    expect(draughtsTimeControl("custom", "25")).toBe("25+0");
    expect(resolveDraughtsMinutes("custom", "0")).toBeNull();
    expect(resolveDraughtsMinutes("custom", "181")).toBeNull();
    expect(resolveDraughtsMinutes("custom", "3.5")).toBeNull();
  });
});
