import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DRPC_NETWORKS, drpcApiKey, drpcUrl } from "./drpc";

describe("drpcUrl", () => {
  beforeEach(() => vi.stubEnv("DRPC_API_KEY", "drpc-test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("maps our network ids to dRPC's paths with the configured key", () => {
    expect(drpcUrl("eth-mainnet")).toBe("https://lb.drpc.live/ethereum/drpc-test-key");
    expect(drpcUrl("base-mainnet")).toBe("https://lb.drpc.live/base/drpc-test-key");
    expect(drpcUrl("bnb-mainnet")).toBe("https://lb.drpc.live/bsc/drpc-test-key");
    expect(drpcUrl("solana-mainnet")).toBe("https://lb.drpc.live/solana/drpc-test-key");
  });

  it("returns null for a network dRPC does not serve, so callers fail loudly", () => {
    for (const network of ["shape-mainnet", "gensyn-mainnet", "polynomial-mainnet", "nope"]) {
      expect(drpcUrl(network)).toBeNull();
    }
  });

  it("returns null everywhere when DRPC_API_KEY is missing or blank", () => {
    vi.stubEnv("DRPC_API_KEY", "  ");
    expect(drpcApiKey()).toBeNull();
    expect(drpcUrl("eth-mainnet")).toBeNull();
    expect(drpcUrl("solana-mainnet")).toBeNull();
  });

  it("uses a lowercase dRPC path for every mapped network", () => {
    for (const path of Object.values(DRPC_NETWORKS)) expect(path).toMatch(/^[a-z0-9-]+$/);
  });
});
