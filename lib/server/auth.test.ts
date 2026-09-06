import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const privy = vi.hoisted(() => ({
  getByToken: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("@/lib/server/privy", () => ({
  getPrivyClient: () => ({
    users: () => ({
      get: privy.getByToken,
      _get: privy.getById,
    }),
  }),
}));

import { getRequestUser } from "@/lib/server/auth";

function makeReq(headers?: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
    cookies: { get: vi.fn(() => undefined) },
  } as unknown as NextRequest;
}

describe("server auth helpers", () => {
  beforeEach(() => {
    privy.getByToken.mockReset();
    privy.getById.mockReset();
  });

  it("prefers the identity token when it names the verified user", async () => {
    privy.getByToken.mockResolvedValue({ id: "user_claim" });

    const user = await getRequestUser(makeReq({ "privy-id-token": "id-token" }), {
      userId: "user_claim",
      sessionId: "session_1",
      issuedAt: 1,
      expiration: 2,
    });

    expect(privy.getByToken).toHaveBeenCalledWith({ id_token: "id-token" });
    expect(privy.getById).not.toHaveBeenCalled();
    expect(user).toEqual({ id: "user_claim" });
  });

  it("ignores an identity token that names a different user than the session", async () => {
    // The attack this guards: a valid session for user_claim paired with
    // someone else's identity token. The token must not win.
    privy.getByToken.mockResolvedValue({ id: "user_victim" });
    privy.getById.mockResolvedValue({ id: "user_claim" });

    const user = await getRequestUser(makeReq({ "privy-id-token": "stolen-token" }), {
      userId: "user_claim",
      sessionId: "session_mismatch",
      issuedAt: 1,
      expiration: 2,
    });

    expect(privy.getById).toHaveBeenCalledWith("user_claim");
    expect(user).toEqual({ id: "user_claim" });
  });

  it("does not let a mismatched token poison the session cache", async () => {
    privy.getByToken.mockResolvedValue({ id: "user_victim" });
    privy.getById.mockResolvedValue({ id: "user_claim" });
    const claims = {
      userId: "user_claim",
      sessionId: "session_poison",
      issuedAt: 1,
      expiration: 2,
    };

    await getRequestUser(makeReq({ "privy-id-token": "stolen-token" }), claims);
    const second = await getRequestUser(makeReq(), claims);

    expect(second).toEqual({ id: "user_claim" });
  });

  it("falls back to the verified user id when the identity token is missing", async () => {
    privy.getById.mockResolvedValue({ id: "user_claim" });

    const user = await getRequestUser(makeReq(), {
      userId: "user_claim",
      sessionId: "session_2",
      issuedAt: 1,
      expiration: 2,
    });

    expect(privy.getByToken).not.toHaveBeenCalled();
    expect(privy.getById).toHaveBeenCalledWith("user_claim");
    expect(user).toEqual({ id: "user_claim" });
  });

  it("reuses the resolved user for repeated requests in one verified session", async () => {
    privy.getByToken.mockResolvedValue({ id: "user_cached" });
    const claims = {
      userId: "user_cached",
      sessionId: "session_cached",
      issuedAt: 1,
      expiration: 2,
    };

    const first = await getRequestUser(makeReq({ "privy-id-token": "id-token" }), claims);
    const second = await getRequestUser(makeReq({ "privy-id-token": "id-token" }), claims);

    expect(first).toEqual({ id: "user_cached" });
    expect(second).toEqual({ id: "user_cached" });
    expect(privy.getByToken).toHaveBeenCalledTimes(1);
  });
});
