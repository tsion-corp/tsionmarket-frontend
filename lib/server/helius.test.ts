import { afterEach, describe, expect, it } from "vitest";

import { heliusKeys, heliusSolanaRpcUrls } from "@/lib/server/helius";

afterEach(() => {
  delete process.env.HELIUS_API_KEY;
  delete process.env.HELIUS_API_KEY_FALLBACK;
});

describe("Helius RPC configuration", () => {
  it("keeps the primary first and removes duplicate keys", () => {
    process.env.HELIUS_API_KEY = " primary ";
    process.env.HELIUS_API_KEY_FALLBACK = "primary";

    expect(heliusKeys()).toEqual(["primary"]);
  });

  it("builds one server-side Solana endpoint per key", () => {
    process.env.HELIUS_API_KEY = "primary";
    process.env.HELIUS_API_KEY_FALLBACK = "fallback";

    expect(heliusSolanaRpcUrls()).toEqual([
      "https://mainnet.helius-rpc.com/?api-key=primary",
      "https://mainnet.helius-rpc.com/?api-key=fallback",
    ]);
  });
});
