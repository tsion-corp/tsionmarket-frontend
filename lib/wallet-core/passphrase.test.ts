import { describe, expect, it } from "vitest";
import {
  MIN_PASSPHRASE_LENGTH,
  WeakPassphraseError,
  assertStrongPassphrase,
  checkPassphrase,
  normalizePassphrase,
  passphraseProblem,
} from "./passphrase";

describe("checkPassphrase", () => {
  it("accepts a long ordinary phrase", () => {
    expect(checkPassphrase("correct horse battery staple")).toEqual({ ok: true });
  });

  it("rejects short, common, repetitive and sequential phrases with a reason", () => {
    expect(checkPassphrase("short one")).toEqual({ ok: false, reason: "too_short" });
    expect(checkPassphrase("password1234")).toEqual({ ok: false, reason: "too_common" });
    expect(checkPassphrase("PassWord Password")).toEqual({ ok: false, reason: "too_common" });
    expect(checkPassphrase("aaaaaaaaaaaaaaaa")).toEqual({ ok: false, reason: "too_repetitive" });
    expect(checkPassphrase("abababababababab")).toEqual({ ok: false, reason: "too_repetitive" });
    expect(checkPassphrase("abcdefghijklmnop")).toEqual({ ok: false, reason: "sequence" });
  });

  it("counts characters, not UTF-16 units", () => {
    expect(checkPassphrase("🙂".repeat(MIN_PASSPHRASE_LENGTH - 1)).ok).toBe(false);
    expect(checkPassphrase("🙂🙃🙁😀😃😄😁😆😅😂🤣😊").ok).toBe(true);
  });

  it("measures length after normalisation", () => {
    // 11 visible characters plus a decomposed accent that composes into one.
    expect(checkPassphrase("abcdefghijké").ok).toBe(true);
  });

  it("gives plain-English guidance for every reason", () => {
    for (const reason of ["too_short", "too_common", "too_repetitive", "sequence"] as const) {
      expect(passphraseProblem(reason).length).toBeGreaterThan(20);
    }
  });

  it("throws a typed error from the asserting form", () => {
    expect(() => assertStrongPassphrase("short")).toThrow(WeakPassphraseError);
    expect(() => assertStrongPassphrase("correct horse battery staple")).not.toThrow();
  });
});

describe("normalizePassphrase", () => {
  it("makes visually identical input identical", () => {
    expect(normalizePassphrase("é")).toBe("é");
    expect(normalizePassphrase("ﬁne")).toBe("fine");
    expect(normalizePassphrase("１２３")).toBe("123");
  });

  it("does not trim: spaces are part of what was typed", () => {
    expect(normalizePassphrase("  hello  ")).toBe("  hello  ");
  });
});
