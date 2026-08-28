import { describe, expect, it } from "vitest";
import { apiError } from "@/lib/api/envelope";
import { shareErrorMessage } from "@/lib/square/share-error";

describe("shareErrorMessage", () => {
  // The commonest real cause, and the one the old catch-all hid completely:
  // Market Square is a separate deployment with its own sign-in.
  it("tells a signed-out reader to sign into Market Square", () => {
    const message = shareErrorMessage(apiError("UNAUTHORIZED", "Sign in to continue.", 401));
    expect(message).toContain("sign in there once");
  });

  // A validation refusal names the field. Hiding it is how an empty
  // deep-link ref survived unnoticed.
  it("surfaces what the service said when it refused the body", () => {
    const message = shareErrorMessage(apiError("VALIDATION_ERROR", "deepLink.ref: too small", 400));
    expect(message).toContain("deepLink.ref: too small");
  });

  it("separates an unreachable square from a refused one", () => {
    expect(shareErrorMessage(apiError("UPSTREAM_ERROR", "unreachable", 502))).toContain(
      "unreachable"
    );
    expect(shareErrorMessage(apiError("NOT_FOUND", "Not found", 404))).toContain("cannot accept");
  });

  // Every branch must promise the same thing about state: the post did not
  // happen. A message that leaves that open invites a duplicate.
  it("always says nothing was posted", () => {
    for (const status of [401, 403, 404, 429, 400, 502, 500]) {
      expect(shareErrorMessage(apiError("X", "boom", status)).toLowerCase()).toMatch(
        /nothing was posted|try again/
      );
    }
  });
});
