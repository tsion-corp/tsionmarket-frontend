import { describe, expect, it } from "vitest";
import {
  displayLink,
  inviteLink,
  referralGoal,
  referralHandle,
  referralProgress,
  sanitizeUsernameInput,
  splitReferrals,
  usernameProblem,
  type ReferralEntry,
} from "./referrals";
import { readRefCode } from "./ref-cookie";

describe("usernameProblem", () => {
  it("accepts a well-formed name", () => {
    expect(usernameProblem("mark_08")).toBeNull();
  });

  it("rejects names shorter than three characters", () => {
    expect(usernameProblem("ab")).toBe("too_short");
  });

  it("rejects names longer than twenty characters", () => {
    expect(usernameProblem("a".repeat(21))).toBe("too_long");
  });

  it("rejects a leading digit and uppercase letters", () => {
    expect(usernameProblem("1abc")).toBe("invalid_characters");
    expect(usernameProblem("Abc")).toBe("invalid_characters");
  });
});

describe("sanitizeUsernameInput", () => {
  it("lowercases and strips everything outside the allowed alphabet", () => {
    expect(sanitizeUsernameInput("Mark David!")).toBe("markdavid");
  });

  it("caps the length at twenty", () => {
    expect(sanitizeUsernameInput("x".repeat(30))).toHaveLength(20);
  });
});

describe("referralGoal", () => {
  it("aims at ten until ten is reached", () => {
    expect(referralGoal(0)).toBe(10);
    expect(referralGoal(9)).toBe(10);
  });

  it("rolls to the next multiple of ten at each milestone", () => {
    expect(referralGoal(10)).toBe(20);
    expect(referralGoal(19)).toBe(20);
    expect(referralGoal(20)).toBe(30);
  });
});

describe("referralProgress", () => {
  it("fills across the first lap toward ten", () => {
    expect(referralProgress(0)).toEqual({ goal: 10, pct: 4 });
    expect(referralProgress(3)).toEqual({ goal: 10, pct: 30 });
    expect(referralProgress(9)).toEqual({ goal: 10, pct: 90 });
  });

  it("never caps: past a milestone the count keeps its real total and a new lap begins", () => {
    expect(referralProgress(10)).toEqual({ goal: 20, pct: 4 });
    expect(referralProgress(12)).toEqual({ goal: 20, pct: 20 });
    expect(referralProgress(19)).toEqual({ goal: 20, pct: 90 });
    expect(referralProgress(25)).toEqual({ goal: 30, pct: 50 });
  });
});

describe("links", () => {
  it("builds the /r path from the origin", () => {
    expect(inviteLink("https://tsionark.com", "mark")).toBe("https://tsionark.com/r/mark");
  });

  it("displays without the protocol", () => {
    expect(displayLink("https://tsionark.com/r/mark")).toBe("tsionark.com/r/mark");
  });
});

describe("readRefCode", () => {
  it("finds the code among other cookies", () => {
    expect(readRefCode("a=1; ark_ref=mark_08; b=2")).toBe("mark_08");
  });

  it("returns null when the cookie is absent", () => {
    expect(readRefCode("a=1; b=2")).toBeNull();
  });

  it("refuses a value that is not a valid username", () => {
    expect(readRefCode("ark_ref=Not%20A%20Name")).toBeNull();
    expect(readRefCode("ark_ref=%E2%98%83")).toBeNull();
  });

  it("refuses a value that fails to decode", () => {
    expect(readRefCode("ark_ref=%zz")).toBeNull();
  });
});

describe("splitReferrals", () => {
  const counted: ReferralEntry = {
    username: "micahdi",
    wallet: "0xaaaa1111bbbb2222cccc3333dddd4444eeee5555",
    status: "counted",
  };
  const pending: ReferralEntry = {
    username: "jackol",
    wallet: "0xffff6666aaaa7777bbbb8888cccc9999dddd0000",
    status: "deposit_pending",
  };

  it("sends counted referrals to the active tab and the rest to inactive", () => {
    expect(splitReferrals([counted, pending])).toEqual({
      active: [counted],
      inactive: [pending],
    });
  });

  it("returns two empty lists when the engine sends no referrals", () => {
    expect(splitReferrals(undefined)).toEqual({ active: [], inactive: [] });
  });

  it("keeps an unrecognised status out of the active tab", () => {
    // The active tab is the one that claims a referral has paid out, so a
    // status we do not know must never land there.
    const unknown = {
      username: "newcomer",
      wallet: "0x9999888877776666555544443333222211110000",
      status: "queued",
    } as unknown as ReferralEntry;
    const { active, inactive } = splitReferrals([counted, unknown]);
    expect(active).toEqual([counted]);
    expect(inactive).toEqual([unknown]);
  });

  it("preserves the order the engine sent within each tab", () => {
    const second: ReferralEntry = {
      username: "tonyareos",
      wallet: "0x1111222233334444555566667777888899990000",
      status: "counted",
    };
    expect(splitReferrals([counted, pending, second]).active).toEqual([counted, second]);
  });
});

describe("referralHandle", () => {
  it("prefixes a claimed username with @", () => {
    expect(referralHandle({ username: "jackol", wallet: "0xabc", status: "counted" })).toBe(
      "@jackol"
    );
  });

  it("falls back to the truncated wallet when the invitee never claimed a name", () => {
    expect(
      referralHandle({
        username: null,
        wallet: "0x1234567890abcdef1234567890abcdefabcd",
        status: "deposit_pending",
      })
    ).toBe("0x1234…abcd");
  });
});
