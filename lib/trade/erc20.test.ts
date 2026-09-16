import { describe, expect, it } from "vitest";
import {
  NATIVE_TOKEN_ADDRESS,
  encodeAllowanceCall,
  encodeApprove,
  encodeTransfer,
  isNativeToken,
  parseAllowance,
} from "@/lib/trade/erc20";

const SPENDER = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";

describe("encodeTransfer", () => {
  it("builds transfer(to, amount) calldata with 32-byte words", () => {
    // selector a9059cbb, recipient padded to 32 bytes, amount 1 padded to 32 bytes.
    expect(encodeTransfer(SPENDER, 1n)).toBe(
      "0xa9059cbb" +
        "0000000000000000000000001111111111111111111111111111111111111111" +
        "0000000000000000000000000000000000000000000000000000000000000001"
    );
  });

  it("encodes large amounts without losing precision", () => {
    const amount = 123456789012345678901234567890n;
    const data = encodeTransfer(SPENDER, amount);
    const encoded = BigInt(`0x${data.slice(10 + 64)}`);
    expect(encoded).toBe(amount);
  });

  it("rejects a negative amount", () => {
    expect(() => encodeTransfer(SPENDER, -1n)).toThrow();
  });

  it("rejects a malformed recipient", () => {
    expect(() => encodeTransfer("0x123", 1n)).toThrow();
  });
});

describe("encodeApprove", () => {
  it("builds approve(spender, amount) calldata with 32-byte words", () => {
    // selector 095ea7b3, spender padded to 32 bytes, amount 1 padded to 32 bytes.
    expect(encodeApprove(SPENDER, 1n)).toBe(
      "0x095ea7b3" +
        "0000000000000000000000001111111111111111111111111111111111111111" +
        "0000000000000000000000000000000000000000000000000000000000000001"
    );
  });

  it("encodes large amounts without losing precision", () => {
    const amount = 123456789012345678901234567890n;
    const data = encodeApprove(SPENDER, amount);
    const encoded = BigInt(`0x${data.slice(10 + 64)}`);
    expect(encoded).toBe(amount);
  });

  it("rejects a negative amount", () => {
    expect(() => encodeApprove(SPENDER, -1n)).toThrow();
  });

  it("rejects a malformed spender", () => {
    expect(() => encodeApprove("0x123", 1n)).toThrow();
  });
});

describe("encodeAllowanceCall", () => {
  it("builds allowance(owner, spender) calldata", () => {
    expect(encodeAllowanceCall(OWNER, SPENDER)).toBe(
      "0xdd62ed3e" +
        "0000000000000000000000002222222222222222222222222222222222222222" +
        "0000000000000000000000001111111111111111111111111111111111111111"
    );
  });
});

describe("parseAllowance", () => {
  it("parses a hex word into a bigint", () => {
    expect(
      parseAllowance("0x0000000000000000000000000000000000000000000000000000000000000064")
    ).toBe(100n);
  });

  it("treats empty and 0x results as zero", () => {
    expect(parseAllowance("")).toBe(0n);
    expect(parseAllowance("0x")).toBe(0n);
  });
});

describe("isNativeToken", () => {
  it("matches the native sentinel regardless of case", () => {
    expect(isNativeToken(NATIVE_TOKEN_ADDRESS)).toBe(true);
    expect(isNativeToken(NATIVE_TOKEN_ADDRESS.toLowerCase())).toBe(true);
  });

  it("returns false for an ERC-20 address", () => {
    expect(isNativeToken("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")).toBe(false);
  });
});
