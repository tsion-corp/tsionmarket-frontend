import { describe, expect, it } from "vitest";
import { bookingCodeFromSeed, isBookingCode, normalizeBookingCodeInput } from "./booking-code";

describe("booking codes", () => {
  it("creates a stable six-character alphanumeric code from a random seed", () => {
    expect(bookingCodeFromSeed("12345678-90ab-cdef")).toBe("7I0C3X");
  });

  it("accepts lowercase user input by normalizing it", () => {
    expect(normalizeBookingCodeInput("yn65gr")).toBe("YN65GR");
    expect(isBookingCode(normalizeBookingCodeInput("yn65gr"))).toBe(true);
  });

  it("removes separators and limits input to six characters", () => {
    expect(normalizeBookingCodeInput("yn-65-gr-extra")).toBe("YN65GR");
    expect(isBookingCode("YN65G")).toBe(false);
  });
});
