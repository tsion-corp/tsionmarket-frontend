import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest, fetchPortfolio } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  fetchPortfolio: vi.fn(async () => ({ totalUsd: 0, tokens: [] })),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));
vi.mock("@/lib/server/alchemy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/alchemy")>()),
  fetchPortfolio,
}));

function makeReq(query: string, authorization: string | null = null): NextRequest {
  return {
    nextUrl: new URL(`http://app.test/api/portfolio?${query}`),
    headers: new Headers(authorization ? { authorization } : {}),
  } as unknown as NextRequest;
}

const EVM = "0x1111111111111111111111111111111111111111";

// The scope a caller names is what the sweep is told; nothing else about the
// route changes. A caller cannot make up a network, and the legacy `fresh=1`
// still means everything.
describe("GET /api/portfolio fresh scope", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: "user" });
    fetchPortfolio.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("passes no scope for an ordinary poll", async () => {
    const { GET } = await import("./route");
    await GET(makeReq(`evm=${EVM}`));
    expect(fetchPortfolio).toHaveBeenCalledWith(EVM, undefined, null, null);
  });

  it("isolates the Base-only scope from Solana and other fresh networks", async () => {
    const { GET } = await import("./route");
    await GET(
      makeReq(
        `evm=${EVM}&solana=So11111111111111111111111111111111111111112&scope=base&fresh=base-mainnet,solana-mainnet`
      )
    );
    expect(fetchPortfolio).toHaveBeenCalledWith(EVM, undefined, ["base-mainnet"], null, "base");
  });

  it("rejects an unknown portfolio scope", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeReq(`evm=${EVM}&scope=fast`));
    expect(res.status).toBe(400);
    expect(fetchPortfolio).not.toHaveBeenCalled();
  });

  it("passes the named networks for a scoped fresh read", async () => {
    const { GET } = await import("./route");
    await GET(makeReq(`evm=${EVM}&fresh=base-mainnet,solana-mainnet`));
    expect(fetchPortfolio).toHaveBeenCalledWith(
      EVM,
      undefined,
      ["base-mainnet", "solana-mainnet"],
      null
    );
  });

  it("drops a network it does not know and keeps the rest", async () => {
    const { GET } = await import("./route");
    await GET(makeReq(`evm=${EVM}&fresh=base-mainnet,made-up`));
    expect(fetchPortfolio).toHaveBeenCalledWith(EVM, undefined, ["base-mainnet"], null);
  });

  it("keeps fresh=1 as the full sweep", async () => {
    const { GET } = await import("./route");
    await GET(makeReq(`evm=${EVM}&fresh=1`));
    expect(fetchPortfolio).toHaveBeenCalledWith(EVM, undefined, "all", null);
  });

  it("refuses an unauthenticated caller before reading anything", async () => {
    verifyRequest.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeReq(`evm=${EVM}&fresh=1`));
    expect(res.status).toBe(401);
    expect(fetchPortfolio).not.toHaveBeenCalled();
  });
});

// The memecoins a user bought are recognised as holdings only because the
// trade service is asked, as that user, what they hold. The bearer is the only
// thing that makes that call theirs, so losing it here silently returns the
// portfolio to naming coins from the public catalogue's first page.
describe("GET /api/portfolio trade identity", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: "user" });
    fetchPortfolio.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("forwards the caller's bearer to the portfolio read", async () => {
    const { GET } = await import("./route");
    await GET(makeReq(`evm=${EVM}`, "Bearer privy-token"));
    expect(fetchPortfolio).toHaveBeenCalledWith(EVM, undefined, null, "Bearer privy-token");
  });
});
