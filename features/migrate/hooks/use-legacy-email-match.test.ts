import { describe, expect, it } from "vitest";
import {
  identitiesMismatch,
  identityLabel,
  type Identity,
} from "@/features/migrate/hooks/use-legacy-email-match";

const id = (partial: Partial<Identity>): Identity => ({
  email: "",
  xId: "",
  xHandle: "",
  ...partial,
});

describe("identitiesMismatch", () => {
  it("blocks a different old account by email", () => {
    expect(
      identitiesMismatch(id({ email: "korode@gmail.com" }), id({ email: "demitchy@gmail.com" }))
    ).toBe(true);
  });

  it("allows the same email whatever the casing or spacing", () => {
    expect(
      identitiesMismatch(id({ email: "Korode@Gmail.com" }), id({ email: "korode@gmail.com " }))
    ).toBe(false);
  });

  // X accounts have no email. The numeric user id is the identity — a handle
  // can be released and re-registered, an id cannot.
  it("blocks a different old account by X user id", () => {
    expect(
      identitiesMismatch(
        id({ xId: "1001", xHandle: "korex" }),
        id({ xId: "2002", xHandle: "korex" })
      )
    ).toBe(true);
  });

  it("allows the same X user id even if the handle changed since", () => {
    expect(
      identitiesMismatch(
        id({ xId: "1001", xHandle: "korex_old" }),
        id({ xId: "1001", xHandle: "korex" })
      )
    ).toBe(false);
  });

  it("falls back to the handle when an id is missing, ignoring @ and case", () => {
    expect(identitiesMismatch(id({ xHandle: "@Korex" }), id({ xHandle: "korex" }))).toBe(false);
    expect(identitiesMismatch(id({ xHandle: "korex" }), id({ xHandle: "someone" }))).toBe(true);
  });

  // Different providers on the two sides is legitimate — "the same Google, X,
  // email or passkey you used before" — and there is nothing to compare.
  // An old account reached by a different provider is somebody's, but nothing
  // says it is this person's: a Google sign-in here and an X sign-in there
  // have nothing in common to match on, so they are not let through.
  it("blocks an old account reached by a provider the new sign-in has nothing in common with", () => {
    expect(identitiesMismatch(id({ email: "korode@gmail.com" }), id({ xId: "1001" }))).toBe(true);
    expect(identitiesMismatch(id({ xId: "1001" }), id({ email: "demitchy@gmail.com" }))).toBe(true);
    expect(
      identitiesMismatch(id({ xHandle: "korex" }), id({ xId: "1001", xHandle: "someoneelse" }))
    ).toBe(true);
  });

  it("cannot judge before the old sign-in, or with no profile on the new side", () => {
    expect(identitiesMismatch(id({ email: "korode@gmail.com" }), id({}))).toBe(false);
    expect(identitiesMismatch(id({}), id({ xId: "1001" }))).toBe(false);
    expect(identitiesMismatch(id({}), id({}))).toBe(false);
  });

  // Email is the stronger match when both kinds are present on both sides.
  it("lets a matching email settle it even if X details differ", () => {
    expect(
      identitiesMismatch(
        id({ email: "korode@gmail.com", xId: "1001" }),
        id({ email: "korode@gmail.com", xId: "2002" })
      )
    ).toBe(false);
  });
});

describe("identityLabel", () => {
  it("names a side by email, else by handle", () => {
    expect(identityLabel(id({ email: "korode@gmail.com", xHandle: "korex" }))).toBe(
      "korode@gmail.com"
    );
    expect(identityLabel(id({ xHandle: "@Korex" }))).toBe("@korex");
    expect(identityLabel(id({}))).toBe("");
  });
});
