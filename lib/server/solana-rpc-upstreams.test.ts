import { beforeEach, describe, expect, it, vi } from "vitest";
import { solanaRpcUpstreams } from "./solana-rpc-upstreams";

describe("solanaRpcUpstreams", () => {
  beforeEach(() => {
    vi.stubEnv("SOLANA_RPC_URL", "");
    vi.stubEnv("HELIUS_API_KEY", "");
    vi.stubEnv("HELIUS_API_KEY_FALLBACK", "");
    vi.stubEnv("ALCHEMY_API_KEY", "");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
  });

  it("uses Helius before Alchemy and the public fallback", () => {
    vi.stubEnv("HELIUS_API_KEY", "helius-primary");
    vi.stubEnv("HELIUS_API_KEY_FALLBACK", "helius-fallback");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-existing");

    expect(solanaRpcUpstreams()).toEqual([
      "https://mainnet.helius-rpc.com/?api-key=helius-primary",
      "https://mainnet.helius-rpc.com/?api-key=helius-fallback",
      "https://solana-mainnet.g.alchemy.com/v2/alchemy-existing",
      "https://api.mainnet-beta.solana.com",
    ]);
  });

  it("demotes a legacy Alchemy override behind Helius", () => {
    vi.stubEnv("SOLANA_RPC_URL", "https://solana-mainnet.g.alchemy.com/v2/legacy-existing");
    vi.stubEnv("HELIUS_API_KEY", "helius-primary");

    expect(solanaRpcUpstreams()).toEqual([
      "https://mainnet.helius-rpc.com/?api-key=helius-primary",
      "https://solana-mainnet.g.alchemy.com/v2/legacy-existing",
      "https://api.mainnet-beta.solana.com",
    ]);
  });

  it("keeps a provider-neutral explicit override first", () => {
    vi.stubEnv("SOLANA_RPC_URL", "https://solana-rpc.internal");
    vi.stubEnv("HELIUS_API_KEY", "helius-primary");

    expect(solanaRpcUpstreams()).toEqual([
      "https://solana-rpc.internal",
      "https://mainnet.helius-rpc.com/?api-key=helius-primary",
      "https://api.mainnet-beta.solana.com",
    ]);
  });
});
