import { describe, expect, it } from "vitest";
import {
  displayLink,
  inviteLink,
  referralGoal,
  sanitizeUsernameInput,
  usernameProblem,
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
