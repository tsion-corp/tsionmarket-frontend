import { describe, expect, it } from "vitest";
import { decaneRpcUrls } from "@/lib/trade/decane-rpc-urls";

describe("decaneRpcUrls", () => {
  const urls = decaneRpcUrls();

  it("covers the chains the kit does not know about, so HYPE, APE and MON can be sent", () => {
    expect(urls["evm:999"]).toBe("https://rpc.hyperliquid.xyz/evm");
    expect(urls["evm:143"]).toBe("https://rpc.monad.xyz");
    expect(urls["evm:33139"]).toMatch(/^https:\/\//);
  });

  it("still names the majors, and only absolute endpoints", () => {
    expect(urls["evm:8453"]).toMatch(/^https:\/\//);
    for (const url of Object.values(urls)) expect(url).toMatch(/^https?:\/\//);
  });

  it("keys every entry the way the kit reads it", () => {
    for (const key of Object.keys(urls)) expect(key).toMatch(/^evm:\d+$/);
  });
});
