import { describe, expect, it } from "vitest";
import { isEvmAddress, kashTransferData, usdcToAtomic, usdcTransferData } from "./kash-transfer";

const TO = "0x1111111111111111111111111111111111111111";

describe("isEvmAddress", () => {
  it("accepts a 20-byte 0x address, with surrounding whitespace", () => {
    expect(isEvmAddress(TO)).toBe(true);
    expect(isEvmAddress(` ${TO} `)).toBe(true);
  });

  it("rejects short, unprefixed, and non-hex input", () => {
    expect(isEvmAddress("0x1234")).toBe(false);
    expect(isEvmAddress(TO.slice(2))).toBe(false);
    expect(isEvmAddress("0x" + "g".repeat(40))).toBe(false);
  });
});

describe("kashTransferData", () => {
  it("encodes transfer(to, amount) with the exact wei value", () => {
    const data = kashTransferData(TO, "2000");
    // 0xa9059cbb is the transfer(address,uint256) selector.
    expect(data.startsWith("0xa9059cbb")).toBe(true);
    // 2000 KSH = 2000e18 wei, hex 6c6b935b8bbd400000, right-aligned in word 2.
    expect(data).toBe(
      "0xa9059cbb" +
        "0000000000000000000000001111111111111111111111111111111111111111" +
        "00000000000000000000000000000000000000000000006c6b935b8bbd400000"
    );
  });

  it("rejects a bad recipient before encoding", () => {
    expect(() => kashTransferData("0x123", "1")).toThrow();
  });
});

describe("usdcToAtomic", () => {
  it("scales by 6 decimals, not 18", () => {
    // Reusing the KSH 18-decimal helper here would overpay by 10^12.
    expect(usdcToAtomic("1")).toBe(1_000_000n);
    expect(usdcToAtomic("10")).toBe(10_000_000n);
    expect(usdcToAtomic("0.5")).toBe(500_000n);
    expect(usdcToAtomic("1.234567")).toBe(1_234_567n);
  });

  it("rejects more precision than USDC can hold", () => {
    expect(() => usdcToAtomic("1.1234567")).toThrow(/6 decimals/);
  });

  it("rejects a non-decimal string", () => {
    expect(() => usdcToAtomic("1e6")).toThrow();
    expect(() => usdcToAtomic("")).toThrow();
  });
});

describe("usdcTransferData", () => {
  it("encodes a transfer to the payment address", () => {
    const data = usdcTransferData("0x289CF343dE1CeC91E144a6E34E0BBcbceBfFA879", "1");
    expect(data.startsWith("0xa9059cbb")).toBe(true);
    expect(data.toLowerCase()).toContain("289cf343de1cec91e144a6e34e0bbcbcebffa879");
  });

  it("refuses a malformed destination", () => {
    expect(() => usdcTransferData("not-an-address", "1")).toThrow(/EVM address/);
  });
});
