import { describe, expect, it } from "vitest";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { offrampQuoteSchema, paymentSchemaFor, walletsSchema } from "@/lib/api/schemas/payment";

const where = { service: "payment", path: "offramp/quote" };

// Captured from the live gateway.
const QUOTE = {
  provider: "dextopus+onafriq",
  direction: "offramp",
  fiat: {
    fxRate: "0.008362",
    receive: { amount: "10.00", currency: "GHS" },
    send: { amount: "1195.89", currency: "NGN" },
  },
  spreadBps: 200,
  settlement: { amount: "762382", chainId: 8453, asset: "0x8335", decimals: 6 },
  pay: { amountIn: { amount: "762382", chainId: 8453, asset: "0x8335", decimals: 6 } },
  fxNote: { pair: "NGN/USD", rate: "1600" },
};

const ok = (data: unknown) => ({ success: true, data });

describe("checkUpstream", () => {
  it("passes the live quote, including fields the schema does not model", () => {
    expect(checkUpstream(offrampQuoteSchema, ok(QUOTE), where).ok).toBe(true);
  });

  it("tolerates a field the backend adds later", () => {
    const withExtra = ok({ ...QUOTE, newThing: { nested: true } });
    expect(checkUpstream(offrampQuoteSchema, withExtra, where).ok).toBe(true);
  });

  it("accepts the quote after totalFee was dropped", () => {
    // The real change that shipped: fiat.totalFee stopped being returned.
    expect(checkUpstream(offrampQuoteSchema, ok(QUOTE), where).ok).toBe(true);
  });

  it("catches a field the flow depends on going missing", () => {
    const withoutPay = Object.fromEntries(Object.entries(QUOTE).filter(([k]) => k !== "pay"));
    const check = checkUpstream(offrampQuoteSchema, ok(withoutPay), where);
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("pay");
  });

  it("catches a type change under an existing key", () => {
    const numericAmount = ok({
      ...QUOTE,
      pay: { amountIn: { ...QUOTE.pay.amountIn, amount: 762382 } },
    });
    const check = checkUpstream(offrampQuoteSchema, numericAmount, where);
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("pay.amountIn.amount");
  });

  it("names the service and path so a log line is actionable", () => {
    const check = checkUpstream(offrampQuoteSchema, ok({}), where);
    expect(check.problem).toContain("payment offramp/quote");
  });

  it("leaves an upstream error envelope alone", () => {
    const failure = { success: false, error: { code: "VALIDATION_ERROR", message: "bad" } };
    expect(checkUpstream(offrampQuoteSchema, failure, where).ok).toBe(true);
  });

  it("passes anything through when no schema guards the path", () => {
    expect(checkUpstream(null, ok({ whatever: 1 }), where).ok).toBe(true);
  });
});

describe("paymentSchemaFor", () => {
  it("matches the allowlisted paths the route serves", () => {
    expect(paymentSchemaFor("corridors")).toBeTruthy();
    expect(paymentSchemaFor("corridors/GH/banks")).toBeTruthy();
    expect(paymentSchemaFor("corridors/GH/wallets")).toBe(walletsSchema);
    expect(paymentSchemaFor("offramp/quote")).toBe(offrampQuoteSchema);
    expect(paymentSchemaFor("offramp/orders")).toBeTruthy();
    expect(paymentSchemaFor("offramp/orders/abc-123")).toBeTruthy();
  });

  it("returns null for a path it does not know", () => {
    expect(paymentSchemaFor("offramp/secret")).toBeNull();
  });
});

describe("walletsSchema", () => {
  it("accepts the empty per-transaction limits Ghana returns", () => {
    const live = ok({ providers: [{ name: "MTN", country: "GH", minPerTx: "", maxPerTx: "" }] });
    expect(checkUpstream(walletsSchema, live, where).ok).toBe(true);
  });
});
