import { describe, expect, it } from "vitest";
import { isAppLive } from "@/lib/launch-gate";

const LAUNCH = Date.parse("2026-08-16T20:00:00+01:00");

describe("isAppLive", () => {
  it("is closed before the launch time and open from it", () => {
    expect(isAppLive(LAUNCH - 1, LAUNCH)).toBe(false);
    expect(isAppLive(LAUNCH, LAUNCH)).toBe(true);
    expect(isAppLive(LAUNCH + 60_000, LAUNCH)).toBe(true);
  });

  it("is open with no launch scheduled", () => {
    expect(isAppLive(0, null)).toBe(true);
  });

  it("reads the offset, so 8pm in Lagos is 7pm UTC", () => {
    expect(LAUNCH).toBe(Date.parse("2026-08-16T19:00:00Z"));
  });
});
