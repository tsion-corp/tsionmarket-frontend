import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "@/lib/waitlist";

describe("normalizeEmail", () => {
  it("trims and lowercases so one person is one entry", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts the addresses people actually have", () => {
    for (const email of [
      "ada@example.com",
      "ada+waitlist@example.co.uk",
      "ada.lovelace@sub.domain.io",
      "  Ada@Example.com  ",
    ]) {
      expect(isValidEmail(email), email).toBe(true);
    }
  });

  it("rejects what could never be delivered", () => {
    for (const email of [
      "",
      "   ",
      "ada",
      "ada@",
      "@example.com",
      "ada@example",
      "ada@@example.com",
      "ada example@test.com",
      "ada@exam ple.com",
    ]) {
      expect(isValidEmail(email), email).toBe(false);
    }
  });

  it("rejects an address past the addressable length", () => {
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});
