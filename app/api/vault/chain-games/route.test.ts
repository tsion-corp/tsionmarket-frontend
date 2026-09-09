import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest, readChainGames } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  readChainGames: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));
vi.mock("@/lib/server/vault-chain", () => ({ readChainGames }));

const req = {} as NextRequest;

describe("GET /api/vault/chain-games", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: "user" });
    readChainGames.mockResolvedValue([
      {
        gameId: 416,
        starter: "0xa",
        king: "0xa",
        potWei: "200683125358721",
        minWagerWei: "200683125358721",
        endTime: 1788948057,
      },
    ]);
  });
  afterEach(() => vi.clearAllMocks());

  it("answers the contract's live games in wire form, shareable for a few seconds", async () => {
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      games: [expect.objectContaining({ gameId: 416, potWei: "200683125358721" })],
    });
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=8");
  });

  it("refuses an unauthenticated caller before reading", async () => {
    verifyRequest.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    expect((await GET(req)).status).toBe(401);
    expect(readChainGames).not.toHaveBeenCalled();
  });

  it("answers 502 when the chain cannot be read, never an empty list", async () => {
    readChainGames.mockRejectedValueOnce(new Error("provider down"));
    const { GET } = await import("./route");
    expect((await GET(req)).status).toBe(502);
  });
});
