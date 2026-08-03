import { describe, expect, it } from "vitest";
import { priceLabel } from "@/components/dashboard/meme/meme-bits";

describe("priceLabel", () => {
  it("keeps ordinary prices plain", () => {
    expect(priceLabel("1234.5678")).toBe("$1,234.57");
    expect(priceLabel("0.9992")).toBe("$0.9992");
    expect(priceLabel("0.06967")).toBe("$0.06967");
    expect(priceLabel("0.001459")).toBe("$0.001459");
  });

  it("subscripts the zero run below a thousandth", () => {
    // The card that overflowed: $0.000000002988 is fourteen characters and
    // pushed the risk badge outside the card.
    expect(priceLabel("0.000000002988")).toBe("$0.0₈2988");
    expect(priceLabel("0.000004066")).toBe("$0.0₅4066");
    expect(priceLabel("0.00000134")).toBe("$0.0₅134");
    expect(priceLabel("0.0002991")).toBe("$0.0₃2991");
  });

  it("stays short enough to sit beside the badge", () => {
    // Ten characters at most, against fourteen before.
    for (const p of ["0.000000002988", "0.0000000000001234", "0.000004066"]) {
      expect(priceLabel(p).length).toBeLessThanOrEqual(10);
    }
  });

  it("round-trips back to the value it was given", () => {
    for (const p of ["0.000000002988", "0.000004066", "0.00000134", "0.0002991"]) {
      const label = priceLabel(p);
      const zeros = [..."₀₁₂₃₄₅₆₇₈₉"].indexOf(label[4]);
      const digits = label.slice(5);
      const restored = Number(`0.${"0".repeat(zeros)}${digits}`);
      expect(restored).toBeCloseTo(Number(p), 15);
    }
  });

  it("shows a dash for a missing or non-positive price", () => {
    expect(priceLabel(null)).toBe("—");
    expect(priceLabel("0")).toBe("—");
    expect(priceLabel("not a number")).toBe("—");
  });
});
