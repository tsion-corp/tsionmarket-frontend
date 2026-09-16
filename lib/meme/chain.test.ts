import { describe, expect, it } from "vitest";
import {
  BASE_CHAIN_ID,
  SOLANA_CHAIN_ID,
  chainIdOfNetwork,
  chainSlug,
  explorerTxUrl,
  isSupportedChain,
  networkOf,
  usdcAddressOf,
} from "@/lib/meme/chain";

// The trade service identifies a token by chainId + address and never by
// address shape. Everything chain-specific on the client hangs off these.
describe("meme chain", () => {
  it("names the chain the way the trade service's ?chain= expects", () => {
    expect(chainSlug(BASE_CHAIN_ID)).toBe("base");
    expect(chainSlug(SOLANA_CHAIN_ID)).toBe("solana");
    expect(chainSlug(1)).toBeNull();
  });

  it("maps to the portfolio's network keys", () => {
    expect(networkOf(BASE_CHAIN_ID)).toBe("base-mainnet");
    expect(networkOf(SOLANA_CHAIN_ID)).toBe("solana-mainnet");
  });

  it("knows which chains this client can execute on", () => {
    expect(isSupportedChain(BASE_CHAIN_ID)).toBe(true);
    expect(isSupportedChain(SOLANA_CHAIN_ID)).toBe(true);
    expect(isSupportedChain(1)).toBe(false);
  });

  // USDC is the quote currency on both sides of every swap; a card for it
  // can only dead-end, so the catalog needs each chain's address.
  it("knows the quote currency on each chain, case preserved for Solana", () => {
    expect(usdcAddressOf(BASE_CHAIN_ID)).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(usdcAddressOf(SOLANA_CHAIN_ID)).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  });
});

// A held balance knows its network, not its chain id; a position knows its
// chain id. Selling either has to reach the trade sheet on the chain it lives
// on, so the portfolio no longer assumes Base for every meme.
describe("chainIdOfNetwork", () => {
  it("maps the portfolio's network keys back to the trade service's chain ids", () => {
    expect(chainIdOfNetwork("base-mainnet")).toBe(BASE_CHAIN_ID);
    expect(chainIdOfNetwork("solana-mainnet")).toBe(SOLANA_CHAIN_ID);
  });

  it("is null for a network the trade service does not execute on", () => {
    expect(chainIdOfNetwork("eth-mainnet")).toBeNull();
  });
});

// An activity row links to its transaction only when there is one to link to.
describe("explorerTxUrl", () => {
  it("links a Base hash to Basescan and a Solana signature to Solscan, as written", () => {
    expect(explorerTxUrl(BASE_CHAIN_ID, "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerTxUrl(SOLANA_CHAIN_ID, "5eYkCaseSensitive")).toBe(
      "https://solscan.io/tx/5eYkCaseSensitive"
    );
  });

  it("is null without a hash or on an unknown chain", () => {
    expect(explorerTxUrl(BASE_CHAIN_ID, null)).toBeNull();
    expect(explorerTxUrl(BASE_CHAIN_ID, "")).toBeNull();
    expect(explorerTxUrl(1, "0xabc")).toBeNull();
  });
});
