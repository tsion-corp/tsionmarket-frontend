import { describe, expect, it } from "vitest";
import { WALLET_CHAINS } from "@/lib/trade/wallet-chains";
import { NETWORK_TO_CHAIN } from "@/lib/sell";

describe("wallet chains", () => {
  // The reported failure: a HyperEVM sell read testnet.rpc.zora.energy, because
  // three viem chains claim id 999 and the wallet, given only the number,
  // resolved it to Zora Goerli.
  it("resolves 999 to HyperEVM, not Zora Goerli", () => {
    const nines = WALLET_CHAINS.filter((c) => c.id === 999);
    expect(nines).toHaveLength(1);
    expect(nines[0]!.name).toBe("HyperEVM");
    expect(nines[0]!.rpcUrls.default.http[0]).toContain("hyperliquid");
  });

  it("names each chain id exactly once, so none is ambiguous", () => {
    const ids = WALLET_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A chain the send path can reach but the wallet has never heard of is the
  // same failure with a different id.
  it("covers every EVM network a holding can be sold on", () => {
    const known = new Set(WALLET_CHAINS.map((c) => c.id));
    const missing = Object.entries(NETWORK_TO_CHAIN)
      .filter(([network]) => network !== "solana-mainnet")
      .filter(([, chainId]) => !known.has(chainId))
      .map(([network]) => network);
    expect(missing).toEqual([]);
  });
});
