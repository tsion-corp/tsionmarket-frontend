import { describe, expect, it } from "vitest";
import {
  completeLotterySelection,
  formatLotteryUsdc,
  lotteryCountdown,
  lotterySalesOpen,
  lotterySelectionKey,
  toggleWhiteBall,
} from "@/features/casino/lib/lottery";

describe("lottery ticket rules", () => {
  it("keeps five unique sorted white balls and allows deselection", () => {
    let selected: number[] = [];
    for (const number of [9, 2, 69, 4, 18, 33]) {
      selected = toggleWhiteBall(selected, number);
    }
    expect(selected).toEqual([2, 4, 9, 18, 69]);
    expect(toggleWhiteBall(selected, 9)).toEqual([2, 4, 18, 69]);
    expect(toggleWhiteBall(selected, 0)).toEqual(selected);
  });

  it("accepts only an exact 5-of-69 plus 1-of-26 selection", () => {
    expect(completeLotterySelection([7, 18, 23, 41, 62], 14)).toEqual({
      whiteNumbers: [7, 18, 23, 41, 62],
      powerNumber: 14,
    });
    expect(completeLotterySelection([1, 2, 3, 4], 5)).toBeNull();
    expect(completeLotterySelection([1, 2, 3, 4, 70], 5)).toBeNull();
    expect(completeLotterySelection([1, 2, 3, 4, 5], 27)).toBeNull();
    expect(completeLotterySelection([1, 1, 2, 3, 4], 5)).toBeNull();
  });

  it("uses an order-independent fingerprint for duplicate detection", () => {
    expect(lotterySelectionKey({ whiteNumbers: [62, 7, 41, 18, 23], powerNumber: 14 })).toBe(
      "7-18-23-41-62:14"
    );
  });

  it("computes a stable countdown and closes sales at the cutoff", () => {
    const now = Date.parse("2026-08-15T00:00:00Z");
    expect(lotteryCountdown("2026-08-16T02:03:04Z", now)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4,
    });
    expect(lotterySalesOpen("open", "2026-08-15T00:00:01Z", now)).toBe(true);
    expect(lotterySalesOpen("open", "2026-08-15T00:00:00Z", now)).toBe(false);
    expect(lotterySalesOpen("closed", "2026-08-16T00:00:00Z", now)).toBe(false);
  });

  it("formats USDC decimal strings without floating-point conversion", () => {
    expect(formatLotteryUsdc("0001234567.120000", 6)).toBe("1,234,567.12");
    expect(formatLotteryUsdc("0.370000")).toBe("0.37");
  });
});
