import { describe, expect, it } from "vitest";
import { formatElapsed, surfaceChipLabel, viewerLabel } from "./format";

describe("formatElapsed", () => {
  it("counts in mm:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9_000)).toBe("0:09");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(599_000)).toBe("9:59");
  });

  it("grows to h:mm:ss rather than showing 90 minutes", () => {
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });

  it("never shows a negative clock if the timestamp is ahead of the tick", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});

describe("surfaceChipLabel", () => {
  it("always says what is going out", () => {
    expect(surfaceChipLabel("ark", null)).toBe("Sharing: Ark only");
    expect(surfaceChipLabel("camera-ark", null)).toBe("Sharing: Camera + Ark");
    expect(surfaceChipLabel("screen", "a browser tab")).toBe("Sharing: a browser tab");
  });

  it("still says something when the browser reported no surface", () => {
    expect(surfaceChipLabel("screen", null)).toBe("Sharing: your screen");
    expect(surfaceChipLabel(null, null)).toBe("Sharing: nothing yet");
  });
});

describe("viewerLabel", () => {
  it("reports a count when one is known", () => {
    expect(viewerLabel(0)).toBe("0 watching");
    expect(viewerLabel(12)).toBe("12 watching");
  });

  it("says nothing rather than something wrong when it cannot be known", () => {
    expect(viewerLabel(null)).toBeNull();
  });
});
