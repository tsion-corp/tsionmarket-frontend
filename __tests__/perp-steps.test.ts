import { describe, expect, it } from "vitest";
// Hardening added after the reliability audit: approve steps must target the
// real USDC contract, calldata must be hex, and per-step native value is
// capped near the keeper fee.
import { stepsTotalValueWei, toSignableCalls } from "@/lib/perp/steps";
import type { BuildResult } from "@/lib/perp/types";

const TO = "0x8a311D7048c35985aa31C131B9A13e03a5f7422d";

function build(steps: Array<{ value: string; to?: string }>): BuildResult {
  return {
    chainId: 8453,
    steps: steps.map((s, i) => ({
      to: s.to ?? TO,
      data: "0xdeadbeef",
      value: s.value,
      label: `step ${i}`,
    })),
  };
}

describe("toSignableCalls", () => {
  it("flattens multiple build results in order with exact wei values", () => {
    const calls = toSignableCalls([build([{ value: "0" }]), build([{ value: "350000000000000" }])]);
    expect(calls).toHaveLength(2);
    expect(calls[0].value).toBe(0n);
    expect(calls[1].value).toBe(350_000_000_000_000n);
  });

  it("rejects a build for the wrong chain", () => {
    const wrong = { ...build([{ value: "0" }]), chainId: 1 as unknown as 8453 };
    expect(() => toSignableCalls([wrong])).toThrow("wrong network");
  });

  it("rejects a malformed step value before it can be signed", () => {
    expect(() => toSignableCalls([build([{ value: "1.5" }])])).toThrow();
    expect(() => toSignableCalls([build([{ value: "-1" }])])).toThrow();
    expect(() => toSignableCalls([build([{ value: "0x10" }])])).toThrow();
  });

  it("rejects a step with an invalid target address", () => {
    expect(() => toSignableCalls([build([{ value: "0", to: "not-an-address" }])])).toThrow(
      "invalid target"
    );
  });

  it("rejects an approve step that targets anything but the real USDC", () => {
    const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    // approve(spender, amount): selector + padded TradingStorage + amount word.
    const spenderWord = `${"0".repeat(24)}${TO.slice(2).toLowerCase()}`;
    const approveData = `0x095ea7b3${spenderWord}${"0".repeat(64)}`;
    const lookalike: BuildResult = {
      chainId: 8453,
      steps: [{ to: TO, data: approveData, value: "0", label: "approve" }],
    };
    expect(() => toSignableCalls([lookalike])).toThrow("unexpected token");
    const genuine: BuildResult = {
      chainId: 8453,
      steps: [{ to: usdc, data: approveData, value: "0", label: "approve" }],
    };
    expect(toSignableCalls([genuine])).toHaveLength(1);
  });

  it("rejects an approve whose spender is not the TradingStorage contract", () => {
    const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const attacker = "1111111111111111111111111111111111111111";
    const badSpender: BuildResult = {
      chainId: 8453,
      steps: [
        {
          to: usdc,
          data: `0x095ea7b3${"0".repeat(24)}${attacker}${"0".repeat(64)}`,
          value: "0",
          label: "approve",
        },
      ],
    };
    expect(() => toSignableCalls([badSpender])).toThrow("unexpected spender");
  });

  it("rejects non-hex calldata", () => {
    const bad: BuildResult = {
      chainId: 8453,
      steps: [{ to: TO, data: "javascript:alert(1)", value: "0", label: "x" }],
    };
    expect(() => toSignableCalls([bad])).toThrow("invalid calldata");
  });

  it("caps per-step native value near the keeper fee", () => {
    // 0.00035 ETH keeper fee passes; 0.1 ETH is not a perp trade.
    expect(toSignableCalls([build([{ value: "350000000000000" }])])).toHaveLength(1);
    expect(() => toSignableCalls([build([{ value: "100000000000000000" }])])).toThrow(
      "unexpected amount of ETH"
    );
  });
});

describe("stepsTotalValueWei", () => {
  it("sums the native value across all steps exactly", () => {
    const total = stepsTotalValueWei([
      build([{ value: "0" }, { value: "350000000000000" }]),
      build([{ value: "350000000000000" }]),
    ]);
    expect(total).toBe(700_000_000_000_000n);
  });
});
