import { describe, expect, it } from "vitest";
import {
  estimatedPayoutNgn,
  isValidAccountNumber,
  isValidOfframpAmount,
  normalizeBankNetworks,
  normalizeOfframpCreation,
  normalizeVerifiedBank,
  OFFRAMP_MIN_USDC,
} from "@/lib/pouch/offramp";

// Fixture captured verbatim from the live Shared KYC offramp response.
const CREATE_RESPONSE = {
  sessionId: "375d19dfe1b4a99de4fd4693c4c0fb85",
  cryptoInstruction: {
    walletAddress: "0xF2343Bf4cbE6398a17a3f6Ea1835418F3719c2D7",
    cryptoNetwork: "BASE",
    cryptoCurrency: "USDC",
    cryptoAmount: 10,
    amountUsd: 10,
    amountLocal: 13800,
    localCurrency: "NGN",
    fxRate: 1380,
    fees: { totalFees: 0 },
    expiresAt: "2026-08-03T15:59:39.117Z",
  },
  providerRef: "e60fb58a-dcfe-5338-8841-6a174f910464",
};

describe("bank networks normalization", () => {
  it("reads the { networks } wrapper and drops incomplete entries", () => {
    const list = normalizeBankNetworks({
      networks: [
        { id: "a1", name: "OPay", country: "NG" },
        { id: "", name: "No id" },
        { id: "b2", name: "" },
        { id: "c3", name: "GTBank" },
      ],
    });
    expect(list).toEqual([
      { id: "a1", name: "OPay" },
      { id: "c3", name: "GTBank" },
    ]);
  });

  it("accepts a bare array and survives junk", () => {
    expect(normalizeBankNetworks([{ id: "x", name: "Kuda" }])).toEqual([{ id: "x", name: "Kuda" }]);
    expect(normalizeBankNetworks(null)).toEqual([]);
  });
});

describe("verified bank normalization", () => {
  it("reads verified and the account name", () => {
    expect(
      normalizeVerifiedBank({ verified: true, accountName: "JOHN DOE", bankName: "100004" })
    ).toEqual({
      verified: true,
      accountName: "JOHN DOE",
    });
    expect(normalizeVerifiedBank({ error: "nope" })).toEqual({ verified: false, accountName: "" });
  });
});

describe("offramp creation normalization", () => {
  it("reads the deposit address, amounts, and payout from cryptoInstruction", () => {
    const result = normalizeOfframpCreation(CREATE_RESPONSE);
    expect(result).toEqual({
      sessionId: "375d19dfe1b4a99de4fd4693c4c0fb85",
      providerRef: "e60fb58a-dcfe-5338-8841-6a174f910464",
      status: "awaiting_payment",
      walletAddress: "0xF2343Bf4cbE6398a17a3f6Ea1835418F3719c2D7",
      cryptoAmount: 10,
      amountNgn: 13800,
      fxRate: 1380,
      expiresAt: "2026-08-03T15:59:39.117Z",
    });
  });

  it("survives a malformed payload", () => {
    const empty = normalizeOfframpCreation(null);
    expect(empty.walletAddress).toBeNull();
    expect(empty.status).toBe("awaiting_payment");
  });
});

describe("offramp validation and estimate", () => {
  it("requires the minimum and no more than the balance", () => {
    expect(isValidOfframpAmount(OFFRAMP_MIN_USDC, 100)).toBe(true);
    expect(isValidOfframpAmount(OFFRAMP_MIN_USDC - 0.01, 100)).toBe(false);
    expect(isValidOfframpAmount(50, 20)).toBe(false);
    expect(isValidOfframpAmount(Number.NaN, 100)).toBe(false);
  });

  it("validates a 10-digit Nigerian account number", () => {
    expect(isValidAccountNumber("0123456789")).toBe(true);
    expect(isValidAccountNumber("012345678")).toBe(false);
    expect(isValidAccountNumber("01234567890")).toBe(false);
    expect(isValidAccountNumber("01234a6789")).toBe(false);
  });

  it("estimates the naira payout, guarding bad inputs", () => {
    expect(estimatedPayoutNgn(10, 1380)).toBe(13800);
    expect(estimatedPayoutNgn(0, 1380)).toBeNull();
    expect(estimatedPayoutNgn(10, 0)).toBeNull();
  });
});
