import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResponseCache } from "@/lib/server/response-cache";

// The registries are unrelated network reads; stub them so the only upstream
// traffic a case observes is the transfer sweep itself.
vi.mock("@/lib/server/rwa-registry", () => ({ fetchRwaRegistry: () => Promise.resolve({}) }));
vi.mock("@/lib/server/buyable-registry", () => ({
  fetchBuyableRegistry: () => Promise.resolve({ buyable: {}, meme: {} }),
}));
vi.mock("@/lib/server/action-registry", () => ({
  fetchActionRegistry: () => Promise.resolve({}),
  actionFor: () => null,
}));

const fetchPortfolio = vi.fn();
vi.mock("@/lib/server/alchemy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/alchemy")>();
  return { ...actual, fetchPortfolio: (...args: unknown[]) => fetchPortfolio(...args) };
});

/** Records the network of every transfer sweep the code makes. */
const swept: string[] = [];
vi.mock("@/lib/server/alchemy-keys", () => ({
  alchemyFetch: (buildUrl: (key: string) => string) => {
    const host = String(buildUrl("k")).split("//")[1]?.split(".")[0] ?? "unknown";
    swept.push(host);
    return Promise.resolve(new Response(JSON.stringify({ result: { transfers: [] } })));
  },
}));

const WALLET = "0x1111111111111111111111111111111111111111";

/**
 * What the portfolio really returns for a wallet holding nothing: a padded
 * zero-balance native row per tracked network. Any test that mocks an empty
 * token list is testing a shape the code never sees.
 */
const BASELINE_ROWS = [
  "base-mainnet",
  "eth-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
  "apechain-mainnet",
  "celo-mainnet",
].map((network) => ({ network, symbol: "NATIVE", balance: 0 }));

/** Distinct networks touched, since each is swept once per direction. */
function networksSwept(): string[] {
  return [...new Set(swept)].sort();
}

beforeEach(() => {
  swept.length = 0;
  resetResponseCache();
  fetchPortfolio.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("activity network scope", () => {
  it("sweeps only the core networks for a wallet holding nothing", async () => {
    // The real portfolio pads its rows with a zero-balance native entry for
    // every network it tracks, so an empty wallet still comes back with one
    // row per chain. The first version of this test mocked a bare empty list,
    // which is why it passed while the filter it was guarding did nothing.
    fetchPortfolio.mockResolvedValue({ totalUsd: 0, tokens: BASELINE_ROWS });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    // The whole point: not 28 networks.
    expect(networksSwept()).toEqual(["base-mainnet", "eth-mainnet"]);
  });

  it("adds the networks the wallet actually holds assets on", async () => {
    fetchPortfolio.mockResolvedValue({
      totalUsd: 10,
      tokens: [
        ...BASELINE_ROWS,
        { network: "arb-mainnet", symbol: "USDC", balance: 12 },
        { network: "polygon-mainnet", symbol: "USDT", balance: 3 },
      ],
    });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    expect(networksSwept()).toEqual([
      "arb-mainnet",
      "base-mainnet",
      "eth-mainnet",
      "polygon-mainnet",
    ]);
  });

  it("never sweeps a network twice when the wallet holds a core one", async () => {
    fetchPortfolio.mockResolvedValue({
      totalUsd: 10,
      tokens: [
        ...BASELINE_ROWS,
        { network: "base-mainnet", symbol: "USDC", balance: 5 },
        { network: "base-mainnet", symbol: "DAI", balance: 5 },
      ],
    });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    expect(networksSwept()).toEqual(["base-mainnet", "eth-mainnet"]);
  });

  it("falls back to the core set rather than a full sweep when balances fail", async () => {
    // A failing portfolio usually means a throttled provider. Answering that
    // with 28 networks is the worst available response.
    fetchPortfolio.mockRejectedValue(new Error("Alchemy request failed: 429"));
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    expect(networksSwept()).toEqual(["base-mainnet", "eth-mainnet"]);
  });

  it("ignores a Solana holding when choosing EVM networks", async () => {
    fetchPortfolio.mockResolvedValue({
      totalUsd: 5,
      tokens: [...BASELINE_ROWS, { network: "solana-mainnet", symbol: "SOL", balance: 2 }],
    });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    expect(networksSwept()).toEqual(["base-mainnet", "eth-mainnet"]);
  });

  it("serves a second read from the snapshot without sweeping again", async () => {
    fetchPortfolio.mockResolvedValue({ totalUsd: 0, tokens: BASELINE_ROWS });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);
    const afterFirst = swept.length;
    await fetchActivity(WALLET);

    expect(swept.length).toBe(afterFirst);
  });
});
