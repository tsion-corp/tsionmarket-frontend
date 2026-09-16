import { describe, expect, it } from "vitest";
import { isHexBetCode, normalizeHexBetCodeInput } from "./ticket-code";

describe("prediction bet codes", () => {
  it("normalizes pasted hexadecimal codes", () => {
    expect(normalizeHexBetCodeInput(" ab-12-cd ", 6)).toBe("AB12CD");
    expect(normalizeHexBetCodeInput("01ab-23cd", 8)).toBe("01AB23CD");
  });

  it("rejects incomplete and non-hexadecimal codes", () => {
    expect(isHexBetCode("AB12CD", 6)).toBe(true);
    expect(isHexBetCode("01AB23CD", 8)).toBe(true);
    expect(isHexBetCode("AB12C", 6)).toBe(false);
    expect(isHexBetCode("ZZ12AA", 6)).toBe(false);
  });
});
