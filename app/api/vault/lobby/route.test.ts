import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({ readLobbyFromChain: vi.fn() }));
vi.mock("@/lib/server/vault-chain", () => chain);
vi.mock("server-only", () => ({}));

const CHAIN_GAME = {
  gameId: 9,
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  tokenSymbol: "USDC",
  tokenDecimals: 6,
  starter: "0x1111111111111111111111111111111111111111",
  king: "0x1111111111111111111111111111111111111111",
  pot: { amount: "20", raw: "20000000", decimals: 6 },
  minWager: { amount: "0.1", raw: "100000", decimals: 6 },
  timeRemaining: 41,
  settled: false,
  active: true,
};

function serviceReplies(games: unknown[]) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ success: true, data: { games, nextCursor: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  );
}

async function get() {
  vi.resetModules();
  const { GET } = await import("./route");
  const res = await GET();
  return { res, body: await res.json() };
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS", "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0");
  vi.stubEnv("NEXT_PUBLIC_VAULT_API_URL", "https://vault.test/v1/world-street-vault");
  const { resetResponseCache } = await import("@/lib/server/response-cache");
  resetResponseCache();
  chain.readLobbyFromChain.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/vault/lobby", () => {
  // The index is the source of truth whenever it has anything to say, and the
  // chain is not touched at all in that case.
  it("serves the service's rows and never reads the chain", async () => {
    vi.stubGlobal("fetch", serviceReplies([{ gameId: 4, active: true }]));

    const { body } = await get();

    expect(body.data.source).toBe("index");
    expect(body.data.games).toEqual([{ gameId: 4, active: true }]);
    expect(chain.readLobbyFromChain).not.toHaveBeenCalled();
  });

  // The service is believed when it says there is nothing. An empty lobby is
  // the normal state between games, and reading the chain to confirm it would
  // cost an RPC round trip on every poll for ever. The route did fall through
  // on empty while the service's index was returning nothing for games that
  // existed (2026-09-15); that is fixed, so only an unreachable service is
  // worth a chain read.
  it("believes an empty lobby from the service and never reads the chain", async () => {
    vi.stubGlobal("fetch", serviceReplies([]));
    chain.readLobbyFromChain.mockResolvedValue([CHAIN_GAME]);

    const { body } = await get();

    expect(chain.readLobbyFromChain).not.toHaveBeenCalled();
    expect(body.data.games).toEqual([]);
    expect(body.data.source).toBe("index");
  });

  it("falls through when the service itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("gateway down");
      })
    );
    chain.readLobbyFromChain.mockResolvedValue([CHAIN_GAME]);

    const { body } = await get();

    expect(body.data.source).toBe("chain");
    expect(body.data.games).toHaveLength(1);
  });

  // An empty index and a chain that cannot answer is not an empty lobby, and
  // must not be dressed up as one.
  it("reports an error rather than an empty lobby when neither can answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("gateway down");
      })
    );
    chain.readLobbyFromChain.mockRejectedValue(new Error("no provider"));

    const { res, body } = await get();

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
  });

  // An unreachable service and a chain with nothing on it is a real empty
  // lobby, not an error.
  it("serves an empty lobby when the service is down and the chain has no games", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("gateway down");
      })
    );
    chain.readLobbyFromChain.mockResolvedValue([]);

    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(body.data.games).toEqual([]);
    expect(body.data.source).toBe("chain");
  });

  it("does not read twice for two callers inside the cache window", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("gateway down");
    });
    vi.stubGlobal("fetch", fetchMock);
    chain.readLobbyFromChain.mockResolvedValue([CHAIN_GAME]);

    vi.resetModules();
    const { GET } = await import("./route");
    await Promise.all([GET(), GET()]);

    expect(chain.readLobbyFromChain).toHaveBeenCalledTimes(1);
  });
});
