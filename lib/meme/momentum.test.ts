import { describe, expect, it } from "vitest";
import {
  changeBarPercent,
  changeFor,
  heatShares,
  momentumOf,
  topGainerKeys,
  volumeFor,
} from "@/lib/meme/momentum";
import type { MemeActivity, MemeTimeframe, MemeToken } from "@/lib/meme/types";

// The Trending card's gamified reads: a momentum word, a change bar, a heat
// bar and the top gainers. All of them judge decimal strings exactly, so a
// change of "49.99999999999999999" is never rounded into "Mooning".

let serial = 0;
function coin(
  overrides: Partial<MemeToken> = {},
  activity?: Partial<Record<MemeTimeframe, Partial<MemeActivity>>>
): MemeToken {
  serial += 1;
  const filled = activity
    ? Object.fromEntries(
        Object.entries(activity).map(([tf, window]) => [
          tf,
          {
            volumeUsd: null,
            transactions: null,
            traders: null,
            priceChangePercent: null,
            ...window,
          },
        ])
      )
    : undefined;
  return {
    chainId: 8453,
    address: `0x${serial.toString(16).padStart(40, "0")}`,
    name: `Coin ${serial}`,
    symbol: `C${serial}`,
    decimals: 18,
    logoUrl: null,
    priceUsd: "1",
    liquidityUsd: "1000",
    volume24hUsd: null,
    priceChange24hPercent: null,
    marketCapUsd: null,
    fdvUsd: null,
    pairAddress: null,
    dexName: null,
    riskLevel: "LOW",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
    ...(filled ? { activity: filled } : {}),
    ...overrides,
  };
}

const key = (token: MemeToken) => `8453:${token.address}`;

describe("changeFor and volumeFor", () => {
  const token = coin(
    { priceChange24hPercent: "-3", volume24hUsd: "900" },
    { "1h": { priceChangePercent: "12.5", volumeUsd: "40" }, "24h": {} }
  );

  it("reads the selected window", () => {
    expect(changeFor(token, "1h")).toBe("12.5");
    expect(volumeFor(token, "1h")).toBe("40");
  });

  it("falls back to the flat 24h fields for 24h only", () => {
    expect(changeFor(token, "24h")).toBe("-3");
    expect(volumeFor(token, "24h")).toBe("900");
    expect(changeFor(token, "6h")).toBeNull();
    expect(volumeFor(token, "5m")).toBeNull();
  });

  it("prefers the 24h window over the flat field when both are present", () => {
    const both = coin(
      { priceChange24hPercent: "-3", volume24hUsd: "900" },
      { "24h": { priceChangePercent: "7", volumeUsd: "800" } }
    );
    expect(changeFor(both, "24h")).toBe("7");
    expect(volumeFor(both, "24h")).toBe("800");
  });

  it("reads a search row, which has no activity, from the flat fields at 24h", () => {
    const bare = coin({ priceChange24hPercent: "2", volume24hUsd: "5" });
    expect(changeFor(bare, "24h")).toBe("2");
    expect(changeFor(bare, "1h")).toBeNull();
  });
});

describe("momentumOf", () => {
  it("applies the thresholds exactly, inclusive at each edge", () => {
    expect(momentumOf("50")).toBe("mooning");
    expect(momentumOf("50.0000")).toBe("mooning");
    expect(momentumOf("49.99999999999999999999")).toBe("pumping");
    expect(momentumOf("10")).toBe("pumping");
    expect(momentumOf("9.999999999999999999")).toBeNull();
    expect(momentumOf("0")).toBeNull();
    expect(momentumOf("-9.9999999999999999")).toBeNull();
    expect(momentumOf("-10")).toBe("cooling");
    expect(momentumOf("-29.99999999999999999")).toBe("cooling");
    expect(momentumOf("-30")).toBe("dumping");
    expect(momentumOf("-100")).toBe("dumping");
    expect(momentumOf("1250")).toBe("mooning");
  });

  it("reads float artifacts and exponent strings the service may send", () => {
    expect(momentumOf("12.340000000000002")).toBe("pumping");
    expect(momentumOf("5e1")).toBe("mooning");
    expect(momentumOf("-3.1e1")).toBe("dumping");
    expect(momentumOf("1.2e-7")).toBeNull();
  });

  it("is null for a missing or unreadable change", () => {
    expect(momentumOf(null)).toBeNull();
    expect(momentumOf("")).toBeNull();
    expect(momentumOf("n/a")).toBeNull();
    expect(momentumOf("NaN")).toBeNull();
  });
});

describe("changeBarPercent", () => {
  it("is the absolute change, floored and capped at 100", () => {
    expect(changeBarPercent("12.9")).toBe(12);
    expect(changeBarPercent("-4.5")).toBe(4);
    expect(changeBarPercent("0.4")).toBe(0);
    expect(changeBarPercent("99.99999999999999999")).toBe(99);
    expect(changeBarPercent("100")).toBe(100);
    expect(changeBarPercent("-250")).toBe(100);
    expect(changeBarPercent("123456789012345678901234567890")).toBe(100);
  });

  it("is null for a missing or unreadable change", () => {
    expect(changeBarPercent(null)).toBeNull();
    expect(changeBarPercent("abc")).toBeNull();
  });
});

describe("heatShares", () => {
  it("scales each volume against the busiest coin, floored", () => {
    const busy = coin({}, { "1h": { volumeUsd: "300.5" } });
    const half = coin({}, { "1h": { volumeUsd: "150.25" } });
    const third = coin({}, { "1h": { volumeUsd: "100" } });
    const none = coin({}, { "1h": {} });
    const shares = heatShares([busy, half, third, none], "1h");
    expect(shares.get(key(busy))).toBe(100);
    expect(shares.get(key(half))).toBe(50);
    expect(shares.get(key(third))).toBe(33);
    expect(shares.get(key(none))).toBeNull();
    expect(shares.size).toBe(4);
  });

  it("stays exact past a float's precision", () => {
    const max = coin({}, { "5m": { volumeUsd: "9007199254740993" } });
    const almost = coin({}, { "5m": { volumeUsd: "9007199254740992" } });
    const shares = heatShares([max, almost], "5m");
    expect(shares.get(key(max))).toBe(100);
    expect(shares.get(key(almost))).toBe(99);
  });

  it("maps every known volume to 0 when the busiest is 0", () => {
    const a = coin({}, { "6h": { volumeUsd: "0" } });
    const b = coin({}, { "6h": { volumeUsd: "0.000" } });
    const c = coin({}, { "6h": {} });
    const shares = heatShares([a, b, c], "6h");
    expect(shares.get(key(a))).toBe(0);
    expect(shares.get(key(b))).toBe(0);
    expect(shares.get(key(c))).toBeNull();
  });

  it("is null for every coin when no volume is known", () => {
    const a = coin();
    const shares = heatShares([a], "12h");
    expect(shares.get(key(a))).toBeNull();
  });

  it("uses the flat 24h volume at 24h", () => {
    const a = coin({ volume24hUsd: "50" });
    const b = coin({ volume24hUsd: "200" });
    const shares = heatShares([a, b], "24h");
    expect(shares.get(key(a))).toBe(25);
    expect(shares.get(key(b))).toBe(100);
  });

  it("treats an unreadable or negative volume as unknown", () => {
    const bad = coin({}, { "1h": { volumeUsd: "lots" } });
    const negative = coin({}, { "1h": { volumeUsd: "-5" } });
    const good = coin({}, { "1h": { volumeUsd: "10" } });
    const shares = heatShares([bad, negative, good], "1h");
    expect(shares.get(key(bad))).toBeNull();
    expect(shares.get(key(negative))).toBeNull();
    expect(shares.get(key(good))).toBe(100);
  });

  it("is empty for no tokens", () => {
    expect(heatShares([], "1h").size).toBe(0);
  });
});

describe("topGainerKeys", () => {
  it("returns the three highest positive changes, highest first", () => {
    const a = coin({}, { "1h": { priceChangePercent: "5" } });
    const b = coin({}, { "1h": { priceChangePercent: "120" } });
    const c = coin({}, { "1h": { priceChangePercent: "-40" } });
    const d = coin({}, { "1h": { priceChangePercent: "12.340000000000002" } });
    const e = coin({}, { "1h": { priceChangePercent: "12.34" } });
    expect([...topGainerKeys([a, b, c, d, e], "1h")]).toEqual([key(b), key(d), key(e)]);
  });

  it("leaves out zero, negative, missing and unreadable changes", () => {
    const zero = coin({}, { "5m": { priceChangePercent: "0" } });
    const down = coin({}, { "5m": { priceChangePercent: "-1" } });
    const none = coin({}, { "5m": {} });
    const bad = coin({}, { "5m": { priceChangePercent: "up" } });
    const up = coin({}, { "5m": { priceChangePercent: "0.0001" } });
    expect([...topGainerKeys([zero, down, none, bad, up], "5m")]).toEqual([key(up)]);
  });

  it("breaks ties by input order", () => {
    const first = coin({}, { "1h": { priceChangePercent: "20" } });
    const second = coin({}, { "1h": { priceChangePercent: "20.000" } });
    const third = coin({}, { "1h": { priceChangePercent: "20" } });
    expect([...topGainerKeys([first, second, third], "1h", 2)]).toEqual([key(first), key(second)]);
  });

  it("honours n, and returns nothing for n of 0", () => {
    const coins = ["1", "2", "3", "4", "5"].map((c) =>
      coin({}, { "1h": { priceChangePercent: c } })
    );
    expect(topGainerKeys(coins, "1h", 5).size).toBe(5);
    expect(topGainerKeys(coins, "1h", 0).size).toBe(0);
    expect(topGainerKeys(coins, "1h").size).toBe(3);
  });

  it("uses the flat 24h change at 24h", () => {
    const a = coin({ priceChange24hPercent: "3" });
    expect([...topGainerKeys([a], "24h")]).toEqual([key(a)]);
    expect(topGainerKeys([a], "1h").size).toBe(0);
  });

  it("keys a Solana mint exactly as written", () => {
    const mint = coin({ chainId: 101, address: "AbCdEf", priceChange24hPercent: "3" });
    expect([...topGainerKeys([mint], "24h")]).toEqual(["101:AbCdEf"]);
  });
});
