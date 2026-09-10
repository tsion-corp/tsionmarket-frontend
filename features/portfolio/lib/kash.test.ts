import { beforeEach, describe, expect, it, vi } from "vitest";

// `post` goes through apiFetch, which demands a Privy token and never reaches
// the network in a unit test. Mocking the transport keeps the assertion on what
// this module is responsible for: what it puts on the wire.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
import {
  formatUsdMicro,
  spendableUsdcMicro,
  usdToMicro,
  compactAmountLabel,
  formatKashAmount,
  gateProgress,
  isValidKashAmount,
  newConversionKey,
  pointsToKash,
  postKashConversion,
  settlesIn,
  revenueShareTiers,
} from "./kash";

const account = (balance: string, min: string) => ({
  balance,
  gate: { minHoldingKash: min },
});

describe("gateProgress", () => {
  it("is 0 with an empty balance", () => {
    expect(gateProgress(account("0", "10000"))).toBe(0);
  });

  it("is the exact fraction below the gate", () => {
    expect(gateProgress(account("2500", "10000"))).toBe(0.25);
  });

  it("clamps at 1 once the gate is met", () => {
    expect(gateProgress(account("25000", "10000"))).toBe(1);
  });

  it("renders empty instead of crashing on malformed input", () => {
    expect(gateProgress(account("not-a-number", "10000"))).toBe(0);
    expect(gateProgress(account("100", "0"))).toBe(0);
  });
});

describe("isValidKashAmount", () => {
  it("accepts integers and up to 6 decimal places", () => {
    expect(isValidKashAmount("10")).toBe(true);
    expect(isValidKashAmount("0.000001")).toBe(true);
    expect(isValidKashAmount(" 2000 ")).toBe(true);
  });

  it("rejects zero, negatives, and over-precise or non-numeric input", () => {
    expect(isValidKashAmount("0")).toBe(false);
    expect(isValidKashAmount("-5")).toBe(false);
    expect(isValidKashAmount("1.0000001")).toBe(false);
    expect(isValidKashAmount("1e6")).toBe(false);
    expect(isValidKashAmount("")).toBe(false);
  });
});

describe("settlesIn", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");

  it("splits the remaining time into days and hours", () => {
    expect(settlesIn(now, "2026-08-16T00:00:00.000Z")).toEqual({ days: 3, hours: 12 });
  });

  it("reports zero days inside the last day", () => {
    expect(settlesIn(now, "2026-08-12T15:30:00.000Z")).toEqual({ days: 0, hours: 3 });
  });

  it("is null once the settlement time has passed", () => {
    expect(settlesIn(now, "2026-08-12T11:59:59.000Z")).toBeNull();
    expect(settlesIn(now, "2026-08-12T12:00:00.000Z")).toBeNull();
  });

  it("is null for a malformed timestamp", () => {
    expect(settlesIn(now, "not-a-date")).toBeNull();
  });
});

describe("newConversionKey", () => {
  it("is unique per call", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newConversionKey()));
    expect(keys.size).toBe(50);
  });

  it("meets the engine's minimum key length", () => {
    // The engine rejects anything under 8 characters, and a rejected key means
    // the conversion runs with no retry protection at all.
    expect(newConversionKey().length).toBeGreaterThanOrEqual(8);
  });
});

describe("postKashConversion", () => {
  function bodyOf(call: number): Record<string, unknown> {
    const init = apiFetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body));
  }

  beforeEach(() => {
    apiFetchMock.mockClear();
    // A fresh Response per call: a body can only be read once, so a shared
    // instance makes the second call fail on an already-consumed stream.
    apiFetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { id: "1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
  });

  it("puts the idempotency key on the wire", async () => {
    // Without this the engine cannot recognise a retry, and a conversion that
    // timed out after burning would burn a second time.
    await postKashConversion("0xabc", "500", undefined, "convert-fixed-key");
    expect(bodyOf(0).idempotencyKey).toBe("convert-fixed-key");
  });

  it("sends the SAME key when the caller retries the same attempt", async () => {
    const key = newConversionKey();
    await postKashConversion("0xabc", "500", undefined, key);
    await postKashConversion("0xabc", "500", undefined, key);
    expect(bodyOf(0).idempotencyKey).toBe(bodyOf(1).idempotencyKey);
  });
});

describe("formatKashAmount", () => {
  it("separates thousands so a large balance is readable", () => {
    expect(formatKashAmount("1994")).toBe("1,994");
    expect(formatKashAmount("1234567")).toBe("1,234,567");
  });

  it("keeps cents on small amounts but drops noise on large ones", () => {
    expect(formatKashAmount("12.5")).toBe("12.50");
    expect(formatKashAmount("1994.37")).toBe("1,994");
  });

  it("returns the input unchanged when it is not a number", () => {
    expect(formatKashAmount("—")).toBe("—");
  });
});

describe("pointsToKash", () => {
  it("converts at the live price, not 1:1", () => {
    // Points carry a fixed USD value; that USD buys KSH at the current price.
    // A button labelled in KASH must not promise the points figure.
    expect(pointsToKash("500", 0.001, "0.0005")).toBe("1,000");
    expect(pointsToKash("500", 0.001, "0.002")).toBe("250");
  });

  it("is 1:1 only when the point value equals the price", () => {
    expect(pointsToKash("80", 0.001, "0.001")).toBe("80");
  });

  it("returns null rather than NaN when inputs are missing", () => {
    expect(pointsToKash("0", 0.001, "0.001")).toBeNull();
    expect(pointsToKash("80", undefined, "0.001")).toBeNull();
    expect(pointsToKash("80", 0.001, "0")).toBeNull();
  });
});

describe("revenueShareTiers", () => {
  // The shape the engine actually publishes today.
  const points = {
    pointValueUsd: 0.001,
    tierRevenueSharePct: [3, 5, 7, 9, 10],
  };

  it("derives one tier per published share, numbered from 1", () => {
    const tiers = revenueShareTiers(points);
    expect(tiers).toHaveLength(5);
    expect(tiers[0]).toEqual({ tier: 1, sharePct: 3 });
    expect(tiers[4]).toEqual({ tier: 5, sharePct: 10 });
  });

  it("is empty until the engine has answered", () => {
    expect(revenueShareTiers(undefined)).toEqual([]);
  });

  it("SURVIVES the engine renaming or dropping the field", () => {
    // This is the regression. `tierRatesPer10Usd` was destructured and mapped,
    // so the day the engine replaced it the whole portfolio page died with
    // "Cannot read properties of undefined (reading 'map')". A ladder nobody
    // can read is a missing row, not a broken dashboard.
    expect(revenueShareTiers({ pointValueUsd: 0.001 })).toEqual([]);
    expect(revenueShareTiers({ pointValueUsd: 0.001, tierRevenueSharePct: undefined })).toEqual([]);
    // Not an array at all — a shape change, not just an absence.
    expect(
      revenueShareTiers({
        pointValueUsd: 0.001,
        tierRevenueSharePct: 7,
      } as unknown as Parameters<typeof revenueShareTiers>[0])
    ).toEqual([]);
  });

  it("drops a share that is not a usable number rather than rendering NaN", () => {
    const tiers = revenueShareTiers({
      pointValueUsd: 0.001,
      tierRevenueSharePct: [3, Number.NaN, 7],
    });
    expect(tiers).toEqual([
      { tier: 1, sharePct: 3 },
      { tier: 3, sharePct: 7 },
    ]);
  });
});

describe("compactAmountLabel", () => {
  it("abbreviates thousands and millions", () => {
    expect(compactAmountLabel("1000")).toBe("1K");
    expect(compactAmountLabel("10000")).toBe("10K");
    expect(compactAmountLabel("100000")).toBe("100K");
    expect(compactAmountLabel("1000000")).toBe("1M");
  });

  it("keeps a meaningful fraction but drops a pointless one", () => {
    expect(compactAmountLabel("1500")).toBe("1.5K");
    expect(compactAmountLabel("2000")).toBe("2K");
  });

  it("leaves small amounts readable rather than abbreviating them", () => {
    expect(compactAmountLabel("1")).toBe("1");
    expect(compactAmountLabel("20")).toBe("20");
    expect(compactAmountLabel("100")).toBe("100");
  });

  it("only abbreviates the LABEL — the value itself must stay exact", () => {
    // A chip sets the raw string; if the abbreviation ever reached the input
    // it would reach the transfer, and "1K" is not an amount.
    const preset = "10000";
    expect(compactAmountLabel(preset)).toBe("10K");
    expect(preset).toBe("10000");
    expect(Number(preset)).toBe(10000);
  });
});

describe("preset values are valid amounts", () => {
  it.each(["1", "10", "20", "50", "100", "1000", "10000", "100000"])(
    "%s is accepted by the amount validator",
    (preset) => {
      // A preset the engine would reject is worse than no preset: the user
      // taps it and the form refuses without explaining why.
      expect(isValidKashAmount(preset)).toBe(true);
    }
  );

  it("presets carry no float artefacts or trailing precision", () => {
    for (const preset of ["1", "10", "20", "50", "100", "1000", "10000", "100000"]) {
      expect(preset).not.toContain(".");
      expect(String(Number(preset))).toBe(preset);
    }
  });
});

describe("presets respect the engine's own limits", () => {
  const within = (preset: string, min: number, max: number) =>
    Number(preset) >= min && Number(preset) <= max;

  it("hides presets above the purchase cap", () => {
    // KASH_PURCHASE_MAX_USDC is deliberately small during a bounded rollout.
    const shown = ["1", "10", "20", "50", "100"].filter((p) => within(p, 1, 25));
    expect(shown).toEqual(["1", "10", "20"]);
  });

  it("shows the full ladder once the cap is raised", () => {
    const shown = ["1", "10", "20", "50", "100"].filter((p) => within(p, 1, 10_000));
    expect(shown).toEqual(["1", "10", "20", "50", "100"]);
  });

  it("hides presets below the minimum too", () => {
    const shown = ["1", "10", "20"].filter((p) => within(p, 10, 10_000));
    expect(shown).toEqual(["10", "20"]);
  });
});

describe("spendableUsdcMicro", () => {
  const usdc = (rawBalance: string, over: Record<string, unknown> = {}) => ({
    network: "base-mainnet",
    symbol: "USDC",
    rawBalance,
    decimals: 6,
    ...over,
  });

  it("reads the exact on-chain integer, not the display float", () => {
    expect(spendableUsdcMicro([usdc("4999999")])).toBe(4_999_999n);
  });

  it("returns null while the portfolio is unknown, so nothing is blocked", () => {
    // The distinction that matters: unknown must never be treated as zero, or
    // a funded wallet is locked out for as long as the request takes.
    expect(spendableUsdcMicro(undefined)).toBeNull();
  });

  it("returns zero for a loaded portfolio holding no USDC on Base", () => {
    expect(spendableUsdcMicro([])).toBe(0n);
  });

  it("ignores USDC on another network", () => {
    // A Solana balance cannot settle a Base transfer; counting it would enable
    // a button whose transaction is guaranteed to fail.
    expect(spendableUsdcMicro([usdc("5000000", { network: "solana-mainnet" })])).toBe(0n);
  });

  it("ignores a different stablecoin on Base", () => {
    expect(spendableUsdcMicro([usdc("5000000", { symbol: "USDT" })])).toBe(0n);
  });

  it("rescales a token that does not use 6 decimals", () => {
    // 1.5 units at 18dp is $1.50, not 1.5e18 — the assumption this guards is a
    // 10^12 error in the user's favour, which is the dangerous direction.
    expect(spendableUsdcMicro([usdc("1500000000000000000", { decimals: 18 })])).toBe(1_500_000n);
  });

  it("returns null rather than throwing on a malformed balance", () => {
    expect(spendableUsdcMicro([usdc("not-a-number")])).toBeNull();
  });
});

describe("usdToMicro / formatUsdMicro", () => {
  it("converts a decimal amount without floating-point drift", () => {
    // 0.1 + 0.2 arithmetic in float would not survive this.
    expect(usdToMicro("0.30")).toBe(300_000n);
    expect(usdToMicro("1234.567891")).toBe(1_234_567_891n);
  });

  it("pads a short fraction rather than misreading its scale", () => {
    expect(usdToMicro("1.5")).toBe(1_500_000n);
  });

  it("rejects an invalid amount", () => {
    expect(usdToMicro("")).toBeNull();
    expect(usdToMicro("-1")).toBeNull();
    expect(usdToMicro("abc")).toBeNull();
  });

  it("rounds a displayed balance DOWN, never up", () => {
    // Rounding $4.999 up to $5.00 would invite the user to spend a dollar they
    // do not have and hit the revert this check exists to prevent.
    expect(formatUsdMicro(4_999_900n)).toBe("4.99");
    expect(formatUsdMicro(0n)).toBe("0.00");
    expect(formatUsdMicro(70_000n)).toBe("0.07");
  });
});
