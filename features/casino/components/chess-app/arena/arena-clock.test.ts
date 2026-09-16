import { describe, expect, it } from "vitest";
import {
  formatArenaClock,
  formatArenaDuration,
} from "@/features/casino/components/chess/arena/arena-clock";

describe("Arena clock formatting", () => {
  it("formats sub-hour and multi-hour countdowns", () => {
    expect(formatArenaClock(0)).toBe("0:00");
    expect(formatArenaClock(65)).toBe("1:05");
    expect(formatArenaClock(3_661)).toBe("1:01:01");
  });

  it("formats configured Arena durations", () => {
    expect(formatArenaDuration(20 * 60)).toBe("20 minutes");
    expect(formatArenaDuration(60 * 60)).toBe("1 hour");
    expect(formatArenaDuration(90 * 60)).toBe("1.5 hours");
  });
});
