import { describe, expect, it } from "vitest";
import {
  isSupportedOrigin,
  orderChains,
  originFamily,
  refundChainType,
  POPULAR_CHAIN_IDS,
} from "@/lib/deposit-catalog";

describe("originFamily", () => {
  it("treats standard EVM chain ids as evm", () => {
    expect(originFamily(1)).toBe("evm"); // Ethereum
    expect(originFamily(8453)).toBe("evm"); // Base
    expect(originFamily(137)).toBe("evm"); // Polygon
    expect(originFamily(56)).toBe("evm"); // BNB
  });

  it("classifies Solana, Eclipse and Soon as svm", () => {
    expect(originFamily(792703809)).toBe("svm"); // Solana
    expect(originFamily(9286185)).toBe("svm"); // Eclipse
    expect(originFamily(9286186)).toBe("svm"); // Soon
  });

  it("classifies Bitcoin and Tron distinctly", () => {
    expect(originFamily(8253038)).toBe("bitcoin");
    expect(originFamily(728126428)).toBe("tron");
  });
});

describe("refundChainType", () => {
  it("maps refundable families to an embedded wallet type", () => {
    expect(refundChainType("evm")).toBe("ethereum");
    expect(refundChainType("svm")).toBe("solana");
  });

  it("returns null for families we hold no wallet on", () => {
    expect(refundChainType("bitcoin")).toBeNull();
    expect(refundChainType("tron")).toBeNull();
  });
});

describe("isSupportedOrigin", () => {
  it("supports EVM and SVM origins", () => {
    expect(isSupportedOrigin(1)).toBe(true);
    expect(isSupportedOrigin(792703809)).toBe(true);
    expect(isSupportedOrigin(9286185)).toBe(true);
  });

  it("gates out Bitcoin and Tron", () => {
    expect(isSupportedOrigin(8253038)).toBe(false);
    expect(isSupportedOrigin(728126428)).toBe(false);
  });
});

describe("orderChains", () => {
  it("puts popular chains first in the configured order, rest alphabetical", () => {
    const chains = [
      { chainId: 999999, name: "Zeta" },
      { chainId: 137, name: "Polygon" },
      { chainId: 8453, name: "Base" },
      { chainId: 100000, name: "Alpha" },
      { chainId: 1, name: "Ethereum" },
    ];
    const ordered = orderChains(chains).map((c) => c.chainId);
    // Ethereum(1) and Base(8453) both rank above Polygon(137) per POPULAR order.
    expect(ordered.indexOf(1)).toBeLessThan(ordered.indexOf(8453));
    expect(ordered.indexOf(8453)).toBeLessThan(ordered.indexOf(137));
    // Non-popular chains follow, alphabetically: Alpha before Zeta.
    expect(ordered.indexOf(100000)).toBeLessThan(ordered.indexOf(999999));
    // And every popular chain precedes every non-popular one.
    expect(ordered.indexOf(137)).toBeLessThan(ordered.indexOf(100000));
  });

  it("does not mutate its input", () => {
    const chains = [
      { chainId: 137, name: "Polygon" },
      { chainId: 1, name: "Ethereum" },
    ];
    const copy = [...chains];
    orderChains(chains);
    expect(chains).toEqual(copy);
  });

  it("keeps Tron out of the promoted list", () => {
    expect(POPULAR_CHAIN_IDS).not.toContain(728126428);
  });
});
