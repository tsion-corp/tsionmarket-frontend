import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTRY_USD,
  defaultEntryUsd,
  formatEth,
  stakeToSend,
  usdToWei,
  weiToUsd,
} from "./stake";

describe("usdToWei", () => {
  it("converts the default entry at a round price", () => {
    // $0.38 at $3,800/ETH is exactly 0.0001 ETH.
    expect(usdToWei(DEFAULT_ENTRY_USD, 3_800)).toBe(100_000_000_000_000n);
  });

  it("stays exact where a float would drift", () => {
    // 1/3 of an ETH. Done in floats this lands on ...333331 or ...333336
    // depending on the order of operations; integer maths gives the same
    // answer every time.
    expect(usdToWei(1_000, 3_000)).toBe(333_333_333_333_333_333n);
  });

  it("scales with the price, so a cheaper ETH costs more wei", () => {
    const atHigh = usdToWei(DEFAULT_ENTRY_USD, 4_000);
    const atLow = usdToWei(DEFAULT_ENTRY_USD, 2_000);
    expect(atLow).toBe(atHigh * 2n);
  });

  it("returns zero rather than a guess when the price is not known", () => {
    // A zero here has to read as "not ready": sending it would revert.
    expect(usdToWei(DEFAULT_ENTRY_USD, 0)).toBe(0n);
    expect(usdToWei(DEFAULT_ENTRY_USD, Number.NaN)).toBe(0n);
    expect(usdToWei(0, 3_800)).toBe(0n);
  });
});

describe("weiToUsd", () => {
  it("round-trips the default entry", () => {
    expect(weiToUsd(usdToWei(DEFAULT_ENTRY_USD, 3_800), 3_800)).toBeCloseTo(DEFAULT_ENTRY_USD, 6);
  });

  it("is zero when there is no price", () => {
    expect(weiToUsd(100_000_000_000_000n, 0)).toBe(0);
  });
});

describe("stakeToSend", () => {
  it("sends what we asked for when it clears the floor", () => {
    expect(stakeToSend(100n, 50n)).toBe(100n);
  });

  it("lifts to the contract floor rather than reverting", () => {
    // Below minStartStake the contract reverts StakeBelowMinimum, so the floor
    // is the only sendable number.
    expect(stakeToSend(50n, 100n)).toBe(100n);
  });

  it("sends the floor when they are equal", () => {
    expect(stakeToSend(100n, 100n)).toBe(100n);
  });
});

describe("formatEth", () => {
  it("trims trailing zeros", () => {
    expect(formatEth(100_000_000_000_000n)).toBe("0.0001");
  });

  it("keeps whole ETH readable", () => {
    expect(formatEth(1_000_000_000_000_000_000n)).toBe("1");
    expect(formatEth(2_500_000_000_000_000_000n)).toBe("2.5");
  });

  it("shows zero as zero, not an empty string", () => {
    expect(formatEth(0n)).toBe("0");
  });

  it("does not round a dust amount up to something spendable", () => {
    // Six decimals of ETH is far below the stake; it must not read as 0.000001.
    expect(formatEth(1n)).toBe("0");
  });
});

describe("defaultEntryUsd", () => {
  // 0.0002 ETH floor, the figure on the live contract.
  const floor = 200_000_000_000_000n;

  it("quotes the floor when ETH makes it dearer than the preferred entry", () => {
    // At $2,450 the floor is $0.49, above the $0.38 preference: the button
    // must say $0.49, the stake the chain will actually take.
    expect(defaultEntryUsd(floor, 2450)).toBeCloseTo(0.49, 2);
  });

  it("quotes the preferred entry when the floor is cheaper", () => {
    expect(defaultEntryUsd(floor, 1500)).toBe(DEFAULT_ENTRY_USD);
  });

  it("quotes nothing until both the floor and the price are known", () => {
    expect(defaultEntryUsd(null, 2450)).toBeNull();
    expect(defaultEntryUsd(floor, 0)).toBeNull();
  });
});
