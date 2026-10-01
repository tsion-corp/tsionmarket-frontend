import { describe, expect, it } from "vitest";
import {
  isReferralCode,
  REF_CODE_PATTERN,
  USERNAME_PATTERN,
  withReferral,
  addressWithReferral,
} from "@/lib/referral-code";

// The frontend has to accept the code kash hands out (ADR-0015). It only ever
// accepted usernames, so every auto-provisioned code was silently dropped:
// /r/7k4m9x2p set no cookie and attributed nobody, with no error anywhere.
describe("the two kinds of referral code", () => {
  it("accepts a username, as it always did", () => {
    for (const name of ["ada", "ada_lovelace", "a1b2c3"]) {
      expect(isReferralCode(name)).toBe(true);
    }
  });

  it("accepts a code that starts with a digit", () => {
    for (const code of ["7k4m9x2p", "2abcde", "9zzzzzzzzzzzzzzz"]) {
      expect(isReferralCode(code)).toBe(true);
    }
  });

  // The whole of the collision handling: a username leads with a letter, a
  // code with a digit, so one string can never be both.
  it("never lets one string be both", () => {
    for (const value of ["ada", "7k4m9x2p", "a1b2c3", "2abcde"]) {
      expect(USERNAME_PATTERN.test(value) && REF_CODE_PATTERN.test(value)).toBe(false);
    }
  });

  it("refuses what is neither", () => {
    for (const bad of ["", "ab", "AB3DEF", "has space", "has.dot", "under_score_but_digit_first"]) {
      expect(isReferralCode(bad)).toBe(false);
    }
  });

  // A wallet address is not a referral code, and must not be treated as one.
  it("refuses a wallet address", () => {
    expect(isReferralCode("0x85178feb764f92a919ff49717d9b493aa4f55784")).toBe(false);
  });

  // Mirrors kash's own pattern. If the engine's changes, this is where it is
  // caught rather than in production.
  it("matches the engine's shape", () => {
    expect(REF_CODE_PATTERN.source).toBe("^[0-9][a-z0-9]{5,15}$");
  });
});

// The other half: putting the code onto a link. The middleware reads it back.
describe("a shared link carrying its sharer's code", () => {
  it("adds the code to a plain url", () => {
    expect(withReferral("https://tsionark.com/casino/last-standing/274", "7k4m9x2p")).toBe(
      "https://tsionark.com/casino/last-standing/274?ref=7k4m9x2p"
    );
  });

  it("keeps a query the url already had", () => {
    const out = withReferral("https://tsionark.com/prediction?market=9", "7k4m9x2p");
    expect(out).toContain("market=9");
    expect(out).toContain("ref=7k4m9x2p");
  });

  it("keeps a relative url relative", () => {
    expect(withReferral("/casino/last-standing/274", "7k4m9x2p")).toBe(
      "/casino/last-standing/274?ref=7k4m9x2p"
    );
  });

  it("keeps a fragment", () => {
    expect(withReferral("/prediction#rules", "7k4m9x2p")).toBe("/prediction?ref=7k4m9x2p#rules");
  });

  it.each([null, undefined, ""])("leaves the url alone for %o", (code) => {
    expect(withReferral("https://tsionark.com/spot", code)).toBe("https://tsionark.com/spot");
  });

  it("leaves the url alone for something that is not a code", () => {
    expect(withReferral("https://tsionark.com/spot", "0xabc")).toBe("https://tsionark.com/spot");
  });

  // The referral belongs to whoever brought the visitor first.
  it("never replaces a code the url already carries", () => {
    expect(withReferral("https://tsionark.com/spot?ref=alice", "7k4m9x2p")).toBe(
      "https://tsionark.com/spot?ref=alice"
    );
  });
});

// The signed-in user's own code, kept in the address bar so a link copied from
// it credits them (ADR-2026-10-01-referral-code-in-address-bar).
describe("addressWithReferral", () => {
  it("adds the code to a bare path", () => {
    expect(addressWithReferral("/prediction/local", "adaeze")).toBe("/prediction/local?ref=adaeze");
  });

  it("keeps the other parameters and the hash", () => {
    expect(addressWithReferral("/prediction/local?event=x&sport=boxing#top", "adaeze")).toBe(
      "/prediction/local?event=x&sport=boxing&ref=adaeze#top"
    );
  });

  it("replaces somebody else's code with the user's own", () => {
    expect(addressWithReferral("/spot?ref=7k4m9x2p", "adaeze")).toBe("/spot?ref=adaeze");
  });

  it("answers null when the address already carries the user's code", () => {
    expect(addressWithReferral("/spot?ref=adaeze", "adaeze")).toBeNull();
  });

  it("answers null without a valid code", () => {
    expect(addressWithReferral("/spot", null)).toBeNull();
    expect(addressWithReferral("/spot", "0xabc")).toBeNull();
  });
});
