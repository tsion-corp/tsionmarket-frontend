import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => auth);

function request(): NextRequest {
  return {
    headers: new Headers({ authorization: "Bearer access-token" }),
    cookies: { get: vi.fn(() => undefined) },
  } as unknown as NextRequest;
}

describe("authenticated user route", () => {
  beforeEach(() => {
    auth.verifyRequest.mockReset();
    auth.getRequestUser.mockReset();
  });

  it("uses verified access claims when resolving a bearer-only user", async () => {
    const claims = {
      userId: "did:privy:user-1",
      sessionId: "session-1",
      issuedAt: 1,
      expiration: 2,
    };
    const user = {
      id: claims.userId,
      created_at: new Date("2026-08-16T00:00:00.000Z"),
      linked_accounts: [
        {
          type: "wallet",
          address: "0x1111111111111111111111111111111111111111",
          chain_type: "ethereum",
        },
      ],
    };
    auth.verifyRequest.mockResolvedValue(claims);
    auth.getRequestUser.mockResolvedValue(user);
    const req = request();
    const { GET } = await import("@/app/api/auth/me/route");

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(auth.getRequestUser).toHaveBeenCalledWith(req, claims);
    await expect(response.json()).resolves.toMatchObject({
      userId: claims.userId,
      user: {
        id: claims.userId,
        wallets: [
          {
            address: "0x1111111111111111111111111111111111111111",
            chainType: "ethereum",
          },
        ],
      },
    });
  });

  it("rejects an invalid access token before loading the user", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { GET } = await import("@/app/api/auth/me/route");

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(auth.getRequestUser).not.toHaveBeenCalled();
  });
});
