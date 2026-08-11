import { describe, expect, it } from "vitest";
import {
  BASE_CHAIN_ID,
  SOLANA_CHAIN_ID,
  addressKindForChain,
  depositProgress,
  encodeErc20Transfer,
  formatCountdown,
  settlementFor,
  usdcBaseUnits,
} from "@/lib/deposit";

describe("encodeErc20Transfer", () => {
  it("builds transfer(address,uint256) calldata with the selector and padded args", () => {
    const to = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const data = encodeErc20Transfer(to, 1_000_000n);
    expect(data).toBe(
      "0xa9059cbb" +
        "000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913" +
        "00000000000000000000000000000000000000000000000000000000000f4240"
    );
  });

  it("encodes a zero amount", () => {
    const data = encodeErc20Transfer("0x0000000000000000000000000000000000000000", 0n);
    expect(data.endsWith("0".repeat(64))).toBe(true);
  });

  it("rejects a malformed address", () => {
    expect(() => encodeErc20Transfer("0x123", 1n)).toThrow("Invalid recipient address");
  });

  it("rejects a negative amount", () => {
    expect(() => encodeErc20Transfer("0x0000000000000000000000000000000000000000", -1n)).toThrow();
  });
});

describe("usdcBaseUnits", () => {
  it("scales by six decimals without floating point drift", () => {
    expect(usdcBaseUnits("1")).toBe(1_000_000n);
    expect(usdcBaseUnits("1.5")).toBe(1_500_000n);
    expect(usdcBaseUnits("0.000001")).toBe(1n);
  });

  it("truncates below the smallest USDC unit", () => {
    expect(usdcBaseUnits("0.0000009")).toBe(0n);
  });
});

describe("addressKindForChain", () => {
  it("maps the Solana chain id to solana and everything else to evm", () => {
    expect(addressKindForChain(SOLANA_CHAIN_ID)).toBe("solana");
    expect(addressKindForChain(BASE_CHAIN_ID)).toBe("evm");
    expect(addressKindForChain(1)).toBe("evm");
  });
});

describe("settlementFor", () => {
  it("settles the EVM wallet to USDC on Base and the Solana wallet to USDC on Solana", () => {
    expect(settlementFor("ethereum")).toMatchObject({
      chainId: BASE_CHAIN_ID,
      assetSymbol: "USDC",
    });
    expect(settlementFor("solana")).toMatchObject({
      chainId: SOLANA_CHAIN_ID,
      assetSymbol: "USDC",
    });
  });
});

describe("formatCountdown", () => {
  it("formats seconds as zero-padded mm:ss", () => {
    expect(formatCountdown(300)).toBe("05:00");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(9)).toBe("00:09");
  });

  it("clamps at zero and floors fractional seconds", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCountdown(59.9)).toBe("00:59");
  });

  it("carries minutes past ten", () => {
    expect(formatCountdown(600)).toBe("10:00");
  });
});

describe("depositProgress", () => {
  it("starts at waiting for an empty or pending status", () => {
    expect(depositProgress("").stage).toBe("waiting");
    expect(depositProgress("pending").stage).toBe("waiting");
  });

  it("advances through detected and processing to settled", () => {
    expect(depositProgress("detected").stage).toBe("detected");
    expect(depositProgress("processing").stage).toBe("processing");
    const settled = depositProgress("success");
    expect(settled.stage).toBe("settled");
    expect(settled.pct).toBe(100);
    expect(settled.terminal).toBe(true);
  });

  it("takes whichever of status or executionStatus is furthest along", () => {
    expect(depositProgress("pending", "processing").stage).toBe("processing");
    expect(depositProgress("detected", "").stage).toBe("detected");
  });

  it("maps refund and failure to terminal stages", () => {
    expect(depositProgress("refund").stage).toBe("refunded");
    expect(depositProgress("failed").stage).toBe("failed");
    expect(depositProgress("refund").terminal).toBe(true);
  });
});
