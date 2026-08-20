import { describe, expect, it } from "vitest";
import {
  idempotencyKey,
  isValidOnrampNgn,
  isTerminalProgress,
  ngnForUsdcExact,
  normalizeBanks,
  normalizeOfframpOrder,
  normalizeOnrampOrder,
  normalizeRates,
  offrampProgress,
  onrampProgress,
  usdcForNgnExact,
} from "@/lib/ramping/orders";

describe("exact money", () => {
  it("converts NGN to USDC with the rail's truncation", () => {
    // The rail's own worked example: ₦2,000 at 1650 → 1.212121, truncated.
    expect(usdcForNgnExact("2000", "1650")).toBe("1.212121");
    expect(usdcForNgnExact("2000.00", "1650.00")).toBe("1.212121");
    expect(usdcForNgnExact("5000", "1650")).toBe("3.030303");
  });

  it("converts USDC to NGN truncated to kobo", () => {
    expect(ngnForUsdcExact("2", "1600")).toBe("3200");
    expect(ngnForUsdcExact("1.971271", "1600")).toBe("3154.03");
  });

  it("refuses zero and garbage instead of guessing", () => {
    expect(usdcForNgnExact("2000", "0")).toBeNull();
    expect(usdcForNgnExact("", "1650")).toBeNull();
    expect(ngnForUsdcExact("abc", "1600")).toBeNull();
  });

  it("never passes through floating point", () => {
    // 0.1 + 0.2 territory: a float pipeline would wobble the 6th decimal.
    expect(usdcForNgnExact("1000.10", "1650.30")).toBe("0.606011");
  });
});

describe("status mapping", () => {
  it("maps every onramp lifecycle state", () => {
    expect(onrampProgress("awaiting_payment")).toBe("awaiting");
    expect(onrampProgress("paid")).toBe("processing");
    expect(onrampProgress("delivering")).toBe("processing");
    expect(onrampProgress("completed")).toBe("completed");
    expect(onrampProgress("failed")).toBe("failed");
    expect(onrampProgress("expired")).toBe("expired");
  });

  it("maps every offramp lifecycle state", () => {
    expect(offrampProgress("awaiting_deposit")).toBe("awaiting");
    expect(offrampProgress("funded")).toBe("processing");
    expect(offrampProgress("paying_out")).toBe("processing");
    expect(offrampProgress("completed")).toBe("completed");
  });

  it("treats the unknown as in-flight, not as success or failure", () => {
    expect(onrampProgress("some_new_state")).toBe("processing");
  });

  it("expired is not terminal for an onramp: the account still pays at the live rate", () => {
    expect(isTerminalProgress("expired")).toBe(false);
    expect(isTerminalProgress("completed")).toBe(true);
    expect(isTerminalProgress("failed")).toBe(true);
  });
});

describe("normalization", () => {
  it("normalizes an onramp order without inventing amounts", () => {
    const order = normalizeOnrampOrder({
      id: "cmt0e1",
      status: "awaiting_payment",
      rate: "1650",
      expected_ngn: null,
      payment_account: {
        account_number: "8881724103",
        account_name: "Onramp x",
        bank_name: "Rubies MFB",
      },
      amount_ngn: null,
      amount_usdc: null,
      error: null,
      expires_at: "2026-08-19T18:30:00Z",
    });
    expect(order.paymentAccount?.accountNumber).toBe("8881724103");
    expect(order.amountUsdc).toBeNull();
    expect(order.status).toBe("awaiting");
  });

  it("keeps settled amounts as the strings the rail sent", () => {
    const order = normalizeOnrampOrder({
      id: "x",
      status: "completed",
      rate: "1650",
      amount_ngn: "2000",
      amount_usdc: "1.212121",
    });
    expect(order.amountUsdc).toBe("1.212121");
    expect(order.status).toBe("completed");
  });

  it("normalizes offramp orders and banks", () => {
    const order = normalizeOfframpOrder({
      id: "y",
      status: "funded",
      rate: "1600",
      deposit_address: "0xabc",
      recipient_name: "AMA MENSAH",
    });
    expect(order.status).toBe("processing");
    expect(order.depositAddress).toBe("0xabc");
    expect(normalizeBanks([{ uuid: "u1", name: "Opay", extra: 1 }, { name: "no-uuid" }])).toEqual([
      { uuid: "u1", name: "Opay" },
    ]);
  });

  it("reads the rates envelope", () => {
    expect(normalizeRates({ onramp_rate: "1650", offramp_rate: "1600" })).toEqual({
      onrampRate: "1650",
      offrampRate: "1600",
    });
  });
});

describe("onramp floor", () => {
  it("accepts any typed amount from the floor up", () => {
    expect(isValidOnrampNgn(1000)).toBe(true);
    expect(isValidOnrampNgn(2500)).toBe(true);
    expect(isValidOnrampNgn(999)).toBe(false);
    expect(isValidOnrampNgn(NaN)).toBe(false);
  });
});

describe("idempotency keys", () => {
  it("is namespaced per wallet and unique per attempt", () => {
    const a = idempotencyKey("onramp", "0xD59a229641DD869e34888013D1C4c1868f62af59");
    const b = idempotencyKey("onramp", "0xD59a229641DD869e34888013D1C4c1868f62af59");
    expect(a).toMatch(/^onramp-d59a2296-/i);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(200);
  });
});
