import { describe, expect, it } from "vitest";
import {
  betSlip,
  sellFloorPrice,
  isCashoutable,
  formatMoney,
  formatResolveDate,
  formatSignedMoney,
  isClaimable,
  priceCents,
  resolutionInfo,
} from "@/lib/prediction";

describe("betSlip", () => {
  it("reads the provider's own initial/current/pnl values", () => {
    const s = betSlip({
      title: "Will BTC close above $80k this quarter?",
      outcome: "Yes",
      size: "40",
      avgPrice: "0.25",
      curPrice: "0.30",
      initialValue: "10",
      currentValue: "12",
      cashPnl: "2",
      percentPnl: "20",
      redeemable: false,
      conditionId: "0xcond",
      endDate: "2026-09-30T00:00:00Z",
    });
    expect(s.market).toBe("Will BTC close above $80k this quarter?");
    expect(s.outcome).toBe("Yes");
    expect(s.shares).toBe(40);
    expect(s.staked).toBe(10);
    expect(s.currentValue).toBe(12);
    expect(s.payoutIfWins).toBe(40); // each winning share settles at $1
    expect(s.pnl).toBe(2);
    expect(s.pnlPct).toBe(20);
    expect(s.conditionId).toBe("0xcond");
    expect(s.resolvesAt).toBe("2026-09-30T00:00:00Z");
  });

  it("derives stake, value and pnl when the provider omits them", () => {
    const s = betSlip({ outcome: "No", size: 100, avgPrice: 0.4, curPrice: 0.5 });
    expect(s.staked).toBeCloseTo(40); // 100 * 0.40
    expect(s.currentValue).toBeCloseTo(50); // 100 * 0.50
    expect(s.pnl).toBeCloseTo(10); // 50 - 40
    expect(s.pnlPct).toBeCloseTo(25); // 10 / 40
    expect(s.payoutIfWins).toBe(100);
  });

  it("falls back to safe placeholders for a sparse position", () => {
    const s = betSlip({});
    expect(s.market).toBe("Market");
    expect(s.outcome).toBe("—");
    expect(s.shares).toBe(0);
    expect(s.staked).toBe(0);
    expect(s.pnlPct).toBe(0);
    expect(s.redeemable).toBe(false);
    expect(s.conditionId).toBeNull();
    expect(s.resolvesAt).toBeNull();
  });

  it("marks a redeemable position", () => {
    expect(betSlip({ redeemable: true, conditionId: "0x" }).redeemable).toBe(true);
  });
});

describe("isClaimable", () => {
  it("is true only for a resolved position that still has value (the winning side)", () => {
    expect(isClaimable(true, 8)).toBe(true);
  });

  it("is false for a resolved but worthless position (the losing side)", () => {
    expect(isClaimable(true, 0)).toBe(false);
    expect(isClaimable(true, 0.005)).toBe(false);
  });

  it("is false for an unresolved position and for missing flags", () => {
    expect(isClaimable(false, 10)).toBe(false);
    expect(isClaimable(null, 10)).toBe(false);
    expect(isClaimable(undefined, 10)).toBe(false);
  });
});

describe("priceCents", () => {
  it("shows a 0..1 price as whole cents", () => {
    expect(priceCents(0.68)).toBe("68¢");
    expect(priceCents(0.055)).toBe("6¢");
  });
  it("shows a dash for non-positive prices", () => {
    expect(priceCents(0)).toBe("—");
    expect(priceCents(NaN)).toBe("—");
  });
});

describe("formatMoney / formatSignedMoney", () => {
  it("formats to two decimals", () => {
    expect(formatMoney(12.5)).toBe("$12.50");
    expect(formatMoney(0)).toBe("$0.00");
  });
  it("keeps the sign outside the dollar sign", () => {
    expect(formatMoney(-3)).toBe("-$3.00");
  });
  it("always signs a P&L amount", () => {
    expect(formatSignedMoney(4.2)).toBe("+$4.20");
    expect(formatSignedMoney(-1.1)).toBe("-$1.10");
    expect(formatSignedMoney(0)).toBe("+$0.00");
  });
});

describe("formatResolveDate", () => {
  it("formats an ISO date to a short human date", () => {
    expect(formatResolveDate("2026-09-30T00:00:00Z")).toMatch(/2026/);
  });
  it("returns an empty string for missing or invalid input", () => {
    expect(formatResolveDate(null)).toBe("");
    expect(formatResolveDate("not-a-date")).toBe("");
  });
});

describe("resolutionInfo", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");

  it("distinguishes a won from a lost resolved position", () => {
    expect(resolutionInfo(true, "2026-07-25", now, true)).toEqual({
      k: "Status",
      v: "Resolved · you won",
    });
    expect(resolutionInfo(true, "2026-07-25", now, false)).toEqual({
      k: "Status",
      v: "Resolved · no win",
    });
  });

  it("says Awaiting result when the scheduled date passed but it isn't redeemable", () => {
    expect(resolutionInfo(false, "2026-07-25", now)).toEqual({
      k: "Status",
      v: "Awaiting result",
    });
  });

  it("shows the expected date when it is still ahead", () => {
    const info = resolutionInfo(false, "2026-08-15", now);
    expect(info?.k).toBe("Est. resolution");
    expect(info?.v).toMatch(/2026/);
  });

  it("shows nothing when there is no date and it isn't redeemable", () => {
    expect(resolutionInfo(false, null, now)).toBeNull();
    expect(resolutionInfo(false, "not-a-date", now)).toBeNull();
  });
});

describe("isCashoutable", () => {
  it("allows selling a live position with shares and a known token", () => {
    expect(isCashoutable(false, 20, "123")).toBe(true);
    expect(isCashoutable(null, 5, "9")).toBe(true);
  });

  it("refuses resolved, empty, or unidentifiable positions", () => {
    expect(isCashoutable(true, 20, "123")).toBe(false);
    expect(isCashoutable(false, 0, "123")).toBe(false);
    expect(isCashoutable(false, 20, null)).toBe(false);
    expect(isCashoutable(false, 20, "")).toBe(false);
  });
});

describe("sellFloorPrice", () => {
  it("floors a small tolerance under the estimate on whole cents", () => {
    expect(sellFloorPrice(0.5)).toBeCloseTo(0.48);
    expect(sellFloorPrice(0.25)).toBeCloseTo(0.24);
  });

  it("clamps to valid tick bounds", () => {
    expect(sellFloorPrice(0.01)).toBe(0.01);
    expect(sellFloorPrice(1.5)).toBe(0.99);
  });
});

describe("betSlip tokenId passthrough", () => {
  it("carries the CLOB token needed to sell", () => {
    expect(betSlip({ tokenId: "42", size: 3 }).tokenId).toBe("42");
    expect(betSlip({}).tokenId).toBeNull();
  });
});
