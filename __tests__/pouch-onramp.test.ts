import { describe, expect, it } from "vitest";
import {
  estimatedNgn,
  estimatedUsd,
  isTerminalOnrampStatus,
  isValidOnrampAmount,
  isValidOnrampNgn,
  normalizeOnrampCreation,
  normalizeOnrampStatus,
  normalizeOnrampStatusResult,
  normalizePouchRate,
  ONRAMP_MIN_NGN,
  ONRAMP_MIN_USD,
  ONRAMP_SETTLEMENT,
} from "@/lib/pouch/onramp";

// Fixture captured verbatim from the live Shared KYC ramp response.
const CREATE_RESPONSE = {
  sessionId: "29bff03ccb915b128dd1e4a3514d1ba9",
  providerRef: "67df6b69-09f7-5ddc-8dea-c897278ff177",
  paymentInstruction: {
    accountNumber: "8239462020",
    accountName: "John Doe",
    bankName: "Globus Bank",
    amountUsd: 20,
    amountLocal: 28060,
    localCurrency: "NGN",
    fxRate: 1403,
    cryptoAmount: 19.66999996,
    cryptoCurrency: "USDC",
    cryptoNetwork: "BASE",
    fees: { networkFee: 0, serviceFee: 280.6, totalFees: 280.6 },
    reference: "LQF2849350",
    expiresAt: "2026-08-03T03:40:37.526Z",
  },
};

describe("onramp status normalization", () => {
  it("maps the Shared KYC session and transaction statuses", () => {
    expect(normalizeOnrampStatus("PAYMENT_PENDING")).toBe("awaiting_payment");
    expect(normalizeOnrampStatus("PENDING_IDENTITY")).toBe("awaiting_payment");
    expect(normalizeOnrampStatus("PENDING")).toBe("awaiting_payment");
    expect(normalizeOnrampStatus("PROCESSING")).toBe("processing");
    expect(normalizeOnrampStatus("PROVIDER_INITIATED")).toBe("processing");
    expect(normalizeOnrampStatus("COMPLETED")).toBe("completed");
    expect(normalizeOnrampStatus("SETTLED")).toBe("completed");
    expect(normalizeOnrampStatus("FAILED")).toBe("failed");
    expect(normalizeOnrampStatus("EXPIRED")).toBe("expired");
    expect(normalizeOnrampStatus("")).toBe("awaiting_payment");
    expect(normalizeOnrampStatus("SOMETHING_ELSE")).toBe("processing");
  });

  it("classifies terminal states", () => {
    expect(isTerminalOnrampStatus("completed")).toBe(true);
    expect(isTerminalOnrampStatus("failed")).toBe(true);
    expect(isTerminalOnrampStatus("expired")).toBe(true);
    expect(isTerminalOnrampStatus("awaiting_payment")).toBe(false);
    expect(isTerminalOnrampStatus("processing")).toBe(false);
  });
});

describe("create-onramp normalization", () => {
  it("reads the live Shared KYC response: amountLocal, crypto amount, account", () => {
    const result = normalizeOnrampCreation(CREATE_RESPONSE);
    expect(result).toMatchObject({
      sessionId: "29bff03ccb915b128dd1e4a3514d1ba9",
      providerRef: "67df6b69-09f7-5ddc-8dea-c897278ff177",
      status: "awaiting_payment",
      cryptoAmount: 19.66999996,
      cryptoCurrency: "USDC",
    });
    expect(result.bank).toEqual({
      bankName: "Globus Bank",
      accountNumber: "8239462020",
      accountName: "John Doe",
      amountNgn: 28060,
      reference: "LQF2849350",
      expiresAt: "2026-08-03T03:40:37.526Z",
    });
  });

  it("still reads the older plural shape with a top-level amount", () => {
    const result = normalizeOnrampCreation({
      status: "PENDING_PAYMENT",
      amount: 50000,
      cryptoAmount: 49.1,
      paymentInstructions: { bankName: "Kuda", accountNumber: "1111111111", accountName: "Escrow" },
    });
    expect(result.bank?.accountNumber).toBe("1111111111");
    expect(result.bank?.amountNgn).toBe(50000);
    expect(result.cryptoAmount).toBe(49.1);
  });

  it("drops the bank block without an account number, and survives junk", () => {
    expect(normalizeOnrampCreation({ paymentInstruction: { bankName: "X" } }).bank).toBeNull();
    const empty = normalizeOnrampCreation(null);
    expect(empty.bank).toBeNull();
    expect(empty.status).toBe("awaiting_payment");
    expect(empty.cryptoCurrency).toBe(ONRAMP_SETTLEMENT.cryptoCurrency);
  });
});

describe("status-result normalization", () => {
  it("awaits payment while the session and transaction are pending", () => {
    const result = normalizeOnrampStatusResult({
      status: "PAYMENT_PENDING",
      transaction: { status: "PENDING", cryptoAmount: 19.67, settledAt: null },
    });
    expect(result.status).toBe("awaiting_payment");
    expect(result.cryptoAmount).toBe(19.67);
    expect(result.transactionHash).toBeNull();
  });

  it("completes when the transaction settles, exposing the hash", () => {
    const result = normalizeOnrampStatusResult({
      status: "PROCESSING",
      transaction: {
        status: "COMPLETED",
        cryptoAmount: 19.67,
        settledAt: "2026-08-03T03:45:00Z",
        transactionHash: "0xdead",
      },
    });
    expect(result.status).toBe("completed");
    expect(result.transactionHash).toBe("0xdead");
  });

  it("surfaces a failed transaction and an expired session", () => {
    expect(
      normalizeOnrampStatusResult({ status: "PROCESSING", transaction: { status: "FAILED" } })
        .status
    ).toBe("failed");
    expect(normalizeOnrampStatusResult({ status: "EXPIRED" }).status).toBe("expired");
  });
});

describe("amount validation and estimate", () => {
  it("enforces the minimum USD amount", () => {
    expect(isValidOnrampAmount(ONRAMP_MIN_USD)).toBe(true);
    expect(isValidOnrampAmount(ONRAMP_MIN_USD - 0.01)).toBe(false);
    expect(isValidOnrampAmount(Number.NaN)).toBe(false);
    expect(isValidOnrampAmount(100)).toBe(true);
  });

  it("enforces the minimum Naira deposit", () => {
    expect(ONRAMP_MIN_NGN).toBe(5000);
    expect(isValidOnrampNgn(5000)).toBe(true);
    expect(isValidOnrampNgn(4999)).toBe(false);
    expect(isValidOnrampNgn(10000)).toBe(true);
    expect(isValidOnrampNgn(Number.NaN)).toBe(false);
  });

  it("estimates naira from a USD amount and a rate, guarding bad inputs", () => {
    expect(estimatedNgn(20, 1403)).toBe(28060);
    expect(estimatedNgn(0, 1403)).toBeNull();
    expect(estimatedNgn(-5, 1403)).toBeNull();
    expect(estimatedNgn(100, 0)).toBeNull();
  });

  it("estimates the USD equivalent of a naira amount, guarding bad inputs", () => {
    expect(estimatedUsd(28060, 1403)).toBe(20);
    expect(estimatedUsd(0, 1600)).toBeNull();
    expect(estimatedUsd(-100, 1600)).toBeNull();
    expect(estimatedUsd(10000, 0)).toBeNull();
  });

  it("reads Pouch's rate from the crypto/rate response, rejecting bad values", () => {
    expect(normalizePouchRate({ rate: 1399, type: "BUY" })).toBe(1399);
    expect(normalizePouchRate({ rate: "1399" })).toBe(1399);
    expect(normalizePouchRate({ rate: 0 })).toBeNull();
    expect(normalizePouchRate({ rate: -5 })).toBeNull();
    expect(normalizePouchRate({})).toBeNull();
    expect(normalizePouchRate(null)).toBeNull();
  });
});
