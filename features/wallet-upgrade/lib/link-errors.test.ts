import { describe, expect, it } from "vitest";
import { linkErrorMessage } from "./link-errors";

describe("linkErrorMessage", () => {
  it("explains each known code in plain words", () => {
    for (const code of [
      "UNAUTHORIZED",
      "NEW_ACCOUNT_NOT_FRESH",
      "LEGACY_ALREADY_LINKED",
      "ALREADY_LINKED",
      "NOT_FOUND",
      "NOT_CONFIGURED",
      "NOT_AVAILABLE",
      "SERVICE_UNAVAILABLE",
      "UPSTREAM_ERROR",
    ]) {
      const text = linkErrorMessage({ code });
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/[A-Z_]{8,}|\{|\}/);
    }
  });

  it("never shows raw server text for an unknown failure", () => {
    expect(linkErrorMessage({ code: "SOMETHING_NEW", message: "TypeError at foo (x.ts:1)" })).toBe(
      "Something went wrong and nothing was changed. Please try again."
    );
    expect(linkErrorMessage(new Error("boom"))).toMatch(/nothing was changed/);
    expect(linkErrorMessage(null)).toMatch(/nothing was changed/);
  });

  it("tells the person nothing changed when the service could not be reached", () => {
    expect(linkErrorMessage({ code: "SERVICE_UNAVAILABLE" })).toMatch(/nothing was changed/i);
  });
});
