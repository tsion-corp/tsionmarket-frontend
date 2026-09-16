import { describe, expect, it } from "vitest";
import {
  PERPS_PLATFORM_WITHDRAWAL_FEE_USDC,
  PERPS_VENUE_WITHDRAWAL_FEE_USDC,
  planWithdrawal,
} from "@/features/trade/lib/perps-withdrawal";

// A perps withdrawal, per the Ark contract (llms.txt §6b): the typed amount is
// the TOTAL that leaves the perps wallet. The venue's withdraw3 carries that
// total less the $0.50 platform fee, the platform fee travels as its own
// signed sendAsset, and the venue takes a flat $1 in transit. All of it in
// exact USDC strings, because floats lose cents.

describe("the fee constants", () => {
  it("are the contract's $1 venue fee and $0.50 platform fee", () => {
    expect(PERPS_VENUE_WITHDRAWAL_FEE_USDC).toBe("1");
    expect(PERPS_PLATFORM_WITHDRAWAL_FEE_USDC).toBe("0.5");
  });
});

describe("planWithdrawal", () => {
  it("splits a total into the withdraw3 amount, one combined fee and the net receive", () => {
    expect(planWithdrawal({ total: "100", withdrawable: "250.5" })).toEqual({
      kind: "ok",
      withdraw3Amount: "99.5",
      totalFee: "1.5",
      receive: "98.5",
    });
  });

  it("keeps every cent of an amount with six decimals", () => {
    expect(planWithdrawal({ total: "10.123456", withdrawable: "11" })).toEqual({
      kind: "ok",
      withdraw3Amount: "9.623456",
      totalFee: "1.5",
      receive: "8.623456",
    });
  });

  it("lets Max withdraw the whole free balance and never more", () => {
    expect(planWithdrawal({ total: "42.42", withdrawable: "42.42" }).kind).toBe("ok");
    expect(planWithdrawal({ total: "42.420001", withdrawable: "42.42" })).toEqual({
      kind: "exceedsBalance",
    });
  });

  it("refuses a total that would leave nothing to receive", () => {
    expect(planWithdrawal({ total: "1.5", withdrawable: "10" })).toEqual({
      kind: "belowMinimum",
      minimum: "1.5",
    });
    expect(planWithdrawal({ total: "1.500001", withdrawable: "10" }).kind).toBe("ok");
  });

  it("uses the platform fee the backend prepared, when it differs from the default", () => {
    expect(planWithdrawal({ total: "20", withdrawable: "20", platformFee: "0.75" })).toEqual({
      kind: "ok",
      withdraw3Amount: "19.25",
      totalFee: "1.75",
      receive: "18.25",
    });
  });

  it("charges no platform leg when the backend has no fee configured", () => {
    expect(planWithdrawal({ total: "5", withdrawable: "5", platformFee: "0" })).toEqual({
      kind: "ok",
      withdraw3Amount: "5",
      totalFee: "1",
      receive: "4",
    });
  });

  it("treats anything that is not an amount as no amount", () => {
    expect(planWithdrawal({ total: "", withdrawable: "10" })).toEqual({ kind: "empty" });
    expect(planWithdrawal({ total: "abc", withdrawable: "10" })).toEqual({ kind: "empty" });
    expect(planWithdrawal({ total: "0", withdrawable: "10" })).toEqual({ kind: "empty" });
  });
});
