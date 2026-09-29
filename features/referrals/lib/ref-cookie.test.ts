import { describe, expect, it } from "vitest";
import { readRefCode } from "@/features/referrals/lib/ref-cookie";

// The cookie survives the whole sign-up flow, so whatever it holds is what is
// eventually claimed. It validated against the username pattern alone, which
// dropped every auto-provisioned code on the way back out (ADR-0015).
describe("the referral cookie", () => {
  it("reads back a code that starts with a digit", () => {
    expect(readRefCode("ark_ref=7k4m9x2p")).toBe("7k4m9x2p");
  });

  it("reads back a username", () => {
    expect(readRefCode("ark_ref=alice")).toBe("alice");
  });

  it("finds it beside other cookies", () => {
    expect(readRefCode("a=1; ark_ref=7k4m9x2p; b=2")).toBe("7k4m9x2p");
  });

  it("decodes what was written encoded", () => {
    expect(readRefCode(`ark_ref=${encodeURIComponent("7k4m9x2p")}`)).toBe("7k4m9x2p");
  });

  // Anything else is refused rather than passed to the claim, so a tampered
  // cookie cannot make the app post arbitrary strings at the engine.
  it.each(["ark_ref=ab", "ark_ref=has space", "ark_ref=", "other=7k4m9x2p", ""])(
    "refuses %o",
    (cookie) => {
      expect(readRefCode(cookie)).toBeNull();
    }
  );
});
