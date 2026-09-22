import { describe, expect, it } from "vitest";
import { authUrlFor, isSafeReturnPath, returnPathFrom } from "@/lib/return-to";

describe("isSafeReturnPath", () => {
  it("accepts an ordinary in-app path", () => {
    expect(isSafeReturnPath("/casino/last-standing/150")).toBe(true);
    expect(isSafeReturnPath("/portfolio?tab=coins")).toBe(true);
  });

  // The whole reason this is a function and not a string pass-through: a
  // login link that lands somewhere else is an open redirect.
  it("refuses anything that could leave this origin", () => {
    expect(isSafeReturnPath("https://evil.test/steal")).toBe(false);
    expect(isSafeReturnPath("//evil.test/steal")).toBe(false);
    expect(isSafeReturnPath("/\\evil.test")).toBe(false);
    expect(isSafeReturnPath("javascript:alert(1)")).toBe(false);
    expect(isSafeReturnPath("/javascript:alert(1)")).toBe(false);
  });

  it("refuses a path that is not rooted", () => {
    expect(isSafeReturnPath("casino/last-standing/150")).toBe(false);
    expect(isSafeReturnPath("")).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
    expect(isSafeReturnPath(undefined)).toBe(false);
  });

  // Sending someone back to sign-in after signing in is a loop.
  it("refuses the auth screens themselves", () => {
    expect(isSafeReturnPath("/auth")).toBe(false);
    expect(isSafeReturnPath("/auth?next=/x")).toBe(false);
    expect(isSafeReturnPath("/auth/callback")).toBe(false);
  });
});

describe("authUrlFor", () => {
  it("carries the path it was given", () => {
    expect(authUrlFor("/casino/last-standing/150")).toBe(
      "/auth?next=%2Fcasino%2Flast-standing%2F150"
    );
  });

  it("carries a query string intact", () => {
    expect(authUrlFor("/casino/last-standing/150?ref=qr")).toBe(
      "/auth?next=%2Fcasino%2Flast-standing%2F150%3Fref%3Dqr"
    );
  });

  it("drops a destination it would not honour anyway", () => {
    expect(authUrlFor("https://evil.test")).toBe("/auth");
  });
});

describe("returnPathFrom", () => {
  it("reads back what authUrlFor wrote", () => {
    const url = authUrlFor("/casino/last-standing/150?ref=qr");
    expect(returnPathFrom(url.split("?")[1])).toBe("/casino/last-standing/150?ref=qr");
  });

  it("is null with no destination", () => {
    expect(returnPathFrom("")).toBeNull();
  });

  // A hand-edited address bar is the realistic attack here, so the read side
  // validates too rather than trusting that we wrote it.
  it("refuses an off-origin destination someone pasted in", () => {
    expect(returnPathFrom("next=https%3A%2F%2Fevil.test")).toBeNull();
    expect(returnPathFrom("next=%2F%2Fevil.test")).toBeNull();
  });
});
