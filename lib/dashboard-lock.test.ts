import { describe, expect, it } from "vitest";
import { isOpenWhileLocked } from "@/lib/dashboard-lock";

describe("isOpenWhileLocked", () => {
  it.each(["/", "/privacy", "/terms", "/api", "/api/waitlist"])("keeps %s open", (path) => {
    expect(isOpenWhileLocked(path)).toBe(true);
  });

  it.each(["/dashboard", "/portfolio", "/auth", "/sign-in", "/apix", "/maintenance"])(
    "closes %s",
    (path) => {
      expect(isOpenWhileLocked(path)).toBe(false);
    }
  );
});
