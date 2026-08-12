import { describe, expect, it } from "vitest";
import {
  buildKashPermitTypedData,
  kashToWei,
  permitDeadline,
  splitPermitSignature,
} from "./kash-permit";

const CHAIN = {
  chainId: 8453,
  tokenAddress: "0x668484EBE0eefcfEE3d8960Ee1D36EECD18C625F",
  controllerAddress: "0xB0F63F6aEA82227a357246DFb953d3c0CCE153F2",
};

describe("kashToWei", () => {
  it("converts whole and fractional amounts exactly", () => {
    expect(kashToWei("1")).toBe(10n ** 18n);
    expect(kashToWei("2000")).toBe(2000n * 10n ** 18n);
    expect(kashToWei("0.000001")).toBe(10n ** 12n);
    expect(kashToWei("1.5")).toBe(15n * 10n ** 17n);
  });

  it("stays exact past float precision", () => {
    // 10 billion KSH in wei is 1e28, far beyond 2^53.
    expect(kashToWei("10000000000")).toBe(10n ** 28n);
  });

  it("rejects malformed amounts", () => {
    expect(() => kashToWei("1.0000001")).toThrow();
    expect(() => kashToWei("-5")).toThrow();
    expect(() => kashToWei("abc")).toThrow();
  });
});

describe("buildKashPermitTypedData", () => {
  it("targets the token as domain and the controller as spender", () => {
    const typed = buildKashPermitTypedData({
      chain: CHAIN,
      owner: "0x1111111111111111111111111111111111111111",
      kashAmount: "2000",
      nonce: 3n,
      deadline: 1_800_000_000,
    });
    expect(typed.domain).toEqual({
      name: "Kash",
      version: "1",
      chainId: 8453,
      verifyingContract: CHAIN.tokenAddress,
    });
    expect(typed.message.spender).toBe(CHAIN.controllerAddress);
    expect(typed.message.value).toBe((2000n * 10n ** 18n).toString());
    expect(typed.message.nonce).toBe("3");
    expect(typed.primaryType).toBe("Permit");
  });
});

describe("splitPermitSignature", () => {
  const r = "a".repeat(64);
  const s = "b".repeat(64);

  it("splits r, s, v and keeps the deadline", () => {
    const sig = splitPermitSignature(`0x${r}${s}1c`, 123);
    expect(sig).toEqual({ deadline: 123, v: 28, r: `0x${r}`, s: `0x${s}` });
  });

  it("normalizes a 0/1 recovery bit to 27/28", () => {
    expect(splitPermitSignature(`0x${r}${s}01`, 1).v).toBe(28);
    expect(splitPermitSignature(`0x${r}${s}00`, 1).v).toBe(27);
  });

  it("rejects a truncated signature", () => {
    expect(() => splitPermitSignature(`0x${r}`, 1)).toThrow();
  });
});

describe("permitDeadline", () => {
  it("is a future unix-seconds timestamp", () => {
    expect(permitDeadline(1_700_000_000_000)).toBe(1_700_000_000 + 30 * 60);
  });
});
