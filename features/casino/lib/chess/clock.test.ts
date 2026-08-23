import { describe, expect, it } from "vitest";
import { formatChessClock, lowChessClockClass } from "@/features/casino/lib/chess/clock";

describe("chess clock presentation", () => {
  it("uses whole seconds above the one-minute warning", () => {
    expect(formatChessClock(61.8)).toBe("01:01");
    expect(formatChessClock(60)).toBe("01:00");
  });

  it("shows deciseconds below one minute without displaying 0:60.0", () => {
    expect(formatChessClock(59.99)).toBe("0:59.9");
    expect(formatChessClock(9.91)).toBe("0:10.0");
    expect(formatChessClock(0)).toBe("0:00.0");
  });

  it("turns live low-time clocks red", () => {
    expect(lowChessClockClass(59.9, true)).toContain("text-[#ff625e]");
    expect(lowChessClockClass(9.9, true)).toContain("animate-pulse");
    expect(lowChessClockClass(59.9, false)).toBe("");
  });
});
