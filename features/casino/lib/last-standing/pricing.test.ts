import { describe, expect, it } from "vitest";
import {
  decimalsForToken,
  formatAtScale,
  priced,
  rawToTokenAmount,
  usdOf,
} from "@/features/casino/lib/last-standing/pricing";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ETH_PRICE = 2436;

const usdc = (amount: string) => ({
  amount,
  raw: "0",
  token: USDC,
  tokenSymbol: "USDC",
  decimals: 6,
  usdValue: 0,
  formattedUsd: "—",
});
const eth = (amount: string) => ({
  amount,
  tokenSymbol: "ETH",
  usdValue: 0,
  formattedUsd: "",
});

describe("pricing a game amount", () => {
  // The bug this exists for, measured on 2026-09-15: a 0.38 USDC pot priced at
  // the ETH price rendered as $925.68 on the game screen, and the winner was
  // congratulated with $555.41 for 23 cents.
  it("reads a USDC amount as dollars, with no price in the path", () => {
    expect(usdOf(usdc("0.38"), ETH_PRICE)).toBe(0.38);
    expect(priced(usdc("0.38"), ETH_PRICE).formattedUsd).toBe("$0.38");
  });

  // The same pot with no price at all rendered as $0.00 in the lobby, which
  // reads as an empty game rather than a wrong one.
  it("prices USDC even when no ETH price has loaded", () => {
    expect(usdOf(usdc("20"), 0)).toBe(20);
    expect(priced(usdc("20"), 0).usdValue).toBe(20);
  });

  // An ETH game can still exist on v5; we never start one, but we render one.
  it("still prices an ETH amount at the ETH price", () => {
    expect(usdOf(eth("0.0002"), ETH_PRICE)).toBeCloseTo(0.4872, 6);
  });

  it("recognises the game asset by symbol when the token address is absent", () => {
    expect(usdOf({ ...eth("5"), tokenSymbol: "USDC" }, 0)).toBe(5);
  });

  // An unpriceable amount shows a dash. Printing a number that is wrong by
  // three orders of magnitude is worse than printing no number.
  it("refuses to guess an ETH amount with no price", () => {
    expect(usdOf(eth("0.0002"), 0)).toBeNull();
    expect(priced(eth("0.0002"), 0)).toMatchObject({ usdValue: 0, formattedUsd: "—" });
  });

  it("refuses a malformed amount", () => {
    expect(usdOf(usdc("not a number"), ETH_PRICE)).toBeNull();
  });
});

describe("reading a raw on-chain amount", () => {
  // The lobby showed a 0.38 USDC pot as $0.00 because the socket's row was
  // formatted at 18 decimals: 380000 wei is 0.00000000000038 ETH, which prices
  // to nothing. The token decides the scale.
  it("reads a USDC amount at six decimals and prices it as dollars", () => {
    const amount = rawToTokenAmount(380_000n, USDC, ETH_PRICE);
    expect(amount.amount).toBe("0.38");
    expect(amount.tokenSymbol).toBe("USDC");
    expect(amount.decimals).toBe(6);
    expect(amount.usdValue).toBe(0.38);
    expect(amount.formattedUsd).toBe("$0.38");
  });

  it("reads a native amount at eighteen decimals, priced at the ETH price", () => {
    const amount = rawToTokenAmount(200_000_000_000_000n, null, ETH_PRICE);
    expect(amount.amount).toBe("0.0002");
    expect(amount.tokenSymbol).toBe("ETH");
    expect(amount.usdValue).toBeCloseTo(0.4872, 6);
  });

  it("treats an unknown token as native rather than guessing our own asset", () => {
    expect(decimalsForToken("0x00000000000000000000000000000000deadbeef")).toBe(18);
  });

  it("keeps every digit the asset can hold", () => {
    expect(formatAtScale(123_456n, 6)).toBe("0.123456");
    expect(formatAtScale(20_000_000n, 6)).toBe("20");
  });
});
