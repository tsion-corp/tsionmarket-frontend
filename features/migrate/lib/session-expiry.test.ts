import { describe, expect, it } from "vitest";
import { apiError } from "@/lib/api/envelope";
import { isSessionExpired } from "@/features/migrate/lib/session-expiry";

describe("isSessionExpired", () => {
  it("is true when any venue's discovery answered 401", () => {
    expect(
      isSessionExpired([
        { venue: "cashier", error: "boom" },
        { venue: "wallet", error: "Unauthorized", status: 401 },
      ])
    ).toBe(true);
  });

  it("is true when a call the card made answered 401", () => {
    expect(isSessionExpired([], null, apiError("UNAUTHORIZED", "sign in again", 401))).toBe(true);
  });

  it("is false for outages, other statuses and plain errors", () => {
    expect(
      isSessionExpired(
        [
          { venue: "perps", error: "boom" },
          { venue: "kash", error: "down", status: 503 },
        ],
        new Error("network"),
        apiError("SERVICE_UNAVAILABLE", "down", 502),
        undefined
      )
    ).toBe(false);
  });
});
