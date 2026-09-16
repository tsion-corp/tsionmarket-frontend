import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTRY_USD,
  GAME_ASSET,
  defaultEntryUsd,
  formatEth,
  formatGameAmount,
  stakeToSend,
  unitsToUsd,
  usdToUnits,
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

// ---------------------------------------------------------------------------
// USDC, the asset the game is played in from v5 on
// ---------------------------------------------------------------------------

// A stake is a dollar figure already, so there is no price to convert through.
// That is the point: the ETH helpers above took a price and could quote a
// stake that had moved by the time the player signed it.
describe("USDC stakes", () => {
  it("converts dollars to base units at the asset's own six decimals", () => {
    expect(usdToUnits(0.1)).toBe(100_000n);
    expect(usdToUnits(1)).toBe(1_000_000n);
    expect(usdToUnits(20)).toBe(20_000_000n);
  });

  // A fractional cent is representable in USDC and must not be silently
  // dropped: 0.123456 is six decimals exactly.
  it("keeps every decimal the asset can hold", () => {
    expect(usdToUnits(0.123456)).toBe(123_456n);
  });

  // Floating point cannot hold 0.07 exactly. Rounding at the base unit is the
  // only place that is allowed to happen, and it lands on the nearest unit
  // rather than truncating toward zero.
  it("rounds to the nearest base unit rather than truncating", () => {
    expect(usdToUnits(0.07)).toBe(70_000n);
    expect(usdToUnits(0.0000005)).toBe(1n);
  });

  it("treats a nonsense amount as nothing to send", () => {
    expect(usdToUnits(0)).toBe(0n);
    expect(usdToUnits(-1)).toBe(0n);
    expect(usdToUnits(Number.NaN)).toBe(0n);
    expect(usdToUnits(Number.POSITIVE_INFINITY)).toBe(0n);
  });

  it("reads base units back as dollars", () => {
    expect(unitsToUsd(100_000n)).toBeCloseTo(0.1, 10);
    expect(unitsToUsd(20_000_000n)).toBeCloseTo(20, 10);
  });

  it("names the asset the game is played in", () => {
    expect(GAME_ASSET).toMatchObject({
      symbol: "USDC",
      decimals: 6,
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    });
  });

  // Display never invents precision the amount does not have, and never drops
  // a digit it does.
  it("formats an amount for reading", () => {
    expect(formatGameAmount(20_000_000n)).toBe("20");
    expect(formatGameAmount(100_000n)).toBe("0.1");
    expect(formatGameAmount(123_456n)).toBe("0.123456");
    expect(formatGameAmount(0n)).toBe("0");
  });
});
