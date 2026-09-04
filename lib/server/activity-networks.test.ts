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
    fetchPortfolio.mockResolvedValue({ totalUsd: 0, tokens: [] });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    // The whole point: not 28 networks.
    expect(networksSwept()).toEqual(["base-mainnet", "eth-mainnet"]);
  });

  it("adds the networks the wallet actually holds assets on", async () => {
    fetchPortfolio.mockResolvedValue({
      totalUsd: 10,
      tokens: [
        { network: "arb-mainnet", symbol: "USDC" },
        { network: "polygon-mainnet", symbol: "USDT" },
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
        { network: "base-mainnet", symbol: "USDC" },
        { network: "base-mainnet", symbol: "DAI" },
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
      tokens: [{ network: "solana-mainnet", symbol: "SOL" }],
    });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);

    expect(networksSwept()).toEqual(["base-mainnet", "eth-mainnet"]);
  });

  it("serves a second read from the snapshot without sweeping again", async () => {
    fetchPortfolio.mockResolvedValue({ totalUsd: 0, tokens: [] });
    const { fetchActivity } = await import("@/lib/server/activity");
    await fetchActivity(WALLET);
    const afterFirst = swept.length;
    await fetchActivity(WALLET);

    expect(swept.length).toBe(afterFirst);
  });
});
