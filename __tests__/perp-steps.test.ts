import { describe, expect, it } from "vitest";
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
