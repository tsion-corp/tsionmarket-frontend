import { describe, expect, it } from "vitest";
import { chainIdOf, isHexChainId } from "@/lib/balance/chain";
import { BASE_CHAIN_ID } from "@/lib/meme/chain";

describe("isHexChainId", () => {
  it("accepts the hex form the balance service writes", () => {
    expect(isHexChainId("0x2105")).toBe(true);
    expect(isHexChainId("0X2105")).toBe(true);
    expect(isHexChainId("0xA4B1")).toBe(true);
  });

  it("refuses a decimal chain id, an empty body and a non-string", () => {
    expect(isHexChainId("8453")).toBe(false);
    expect(isHexChainId("0x")).toBe(false);
    expect(isHexChainId("0xzz")).toBe(false);
    expect(isHexChainId(8453)).toBe(false);
    expect(isHexChainId(null)).toBe(false);
  });
});

describe("chainIdOf", () => {
  it("converts the service's chain to the id the rest of the app uses", () => {
    expect(chainIdOf("0x2105")).toBe(8453);
    // The conversion the whole hex/decimal split exists to make explicit.
    expect(chainIdOf("0x2105")).toBe(BASE_CHAIN_ID);
  });

  it("returns null rather than NaN for something that is not a chain id", () => {
    expect(chainIdOf("8453")).toBeNull();
    expect(chainIdOf("")).toBeNull();
  });

  it("refuses a chain id too large to be exact", () => {
    expect(chainIdOf(`0x${"f".repeat(16)}`)).toBeNull();
  });
});
