import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
}));

const privy = vi.hoisted(() => ({
  verify: vi.fn(),
  getById: vi.fn(),
  getByToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.values.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("@/lib/server/privy", () => ({
  getPrivyClient: () => ({
    utils: () => ({ auth: () => ({ verifyAccessToken: privy.verify }) }),
    users: () => ({ get: privy.getByToken, _get: privy.getById }),
  }),
}));

// React's cache() memoizes per request; outside a request each call is its
// own scope, so the tests below see fresh reads.
import { getSessionClaims, getSessionUser } from "@/lib/server/session";

const claims = {
  user_id: "user_cookie",
  session_id: "session_9",
  issued_at: 1,
  expiration: 2,
};

describe("getSessionClaims", () => {
  beforeEach(() => {
    jar.values.clear();
    privy.verify.mockReset();
    privy.getById.mockReset();
    privy.getByToken.mockReset();
  });

  it("is null without the cookie, and asks Privy nothing", async () => {
    expect(await getSessionClaims()).toBeNull();
    expect(privy.verify).not.toHaveBeenCalled();
  });

  it("verifies the access token cookie", async () => {
    jar.values.set("privy-token", "jwt");
    privy.verify.mockResolvedValue(claims);

    expect(await getSessionClaims()).toEqual({
      userId: "user_cookie",
      sessionId: "session_9",
      issuedAt: 1,
      expiration: 2,
    });
    expect(privy.verify).toHaveBeenCalledWith("jwt");
  });

  it("is null when the token fails verification", async () => {
    jar.values.set("privy-token", "forged");
    privy.verify.mockRejectedValue(new Error("bad signature"));

    expect(await getSessionClaims()).toBeNull();
  });

  it("resolves the user by the verified id, never by an identity token", async () => {
    jar.values.set("privy-token", "jwt");
    jar.values.set("privy-id-token", "someone-elses");
    privy.verify.mockResolvedValue(claims);
    privy.getById.mockResolvedValue({ id: "user_cookie" });

    expect(await getSessionUser()).toEqual({ id: "user_cookie" });
    expect(privy.getById).toHaveBeenCalledWith("user_cookie");
    expect(privy.getByToken).not.toHaveBeenCalled();
  });
});
