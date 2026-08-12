import { describe, expect, it } from "vitest";
import { isEvmAddress, kashTransferData } from "./kash-transfer";

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
