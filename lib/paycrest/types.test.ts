import { describe, expect, it } from "vitest";
import { isTerminalProgress, paycrestProgress } from "./types";
import { isAdult } from "./kyc";

describe("paycrestProgress", () => {
  it("counts an offramp paid once the provider validates the payout", () => {
    expect(paycrestProgress("validated", "offramp")).toBe("paid");
    expect(paycrestProgress("settled", "offramp")).toBe("paid");
  });

  it("counts an onramp paid only once the tokens settle", () => {
    expect(paycrestProgress("validated", "onramp")).toBe("processing");
    expect(paycrestProgress("settled", "onramp")).toBe("paid");
  });

  it("maps the waiting and end states", () => {
    expect(paycrestProgress("initiated", "onramp")).toBe("awaiting");
    expect(paycrestProgress("deposited", "offramp")).toBe("processing");
    expect(paycrestProgress("refunding", "offramp")).toBe("refunded");
    expect(paycrestProgress("expired", "onramp")).toBe("expired");
    expect(paycrestProgress("cancelled", "offramp")).toBe("failed");
  });

  it("stops polling only at an end state", () => {
    expect(isTerminalProgress("processing")).toBe(false);
    expect(isTerminalProgress("awaiting")).toBe(false);
    expect(isTerminalProgress("paid")).toBe(true);
    expect(isTerminalProgress("refunded")).toBe(true);
  });
});

describe("isAdult", () => {
  const today = new Date(2026, 10, 24);
  it("accepts someone 18 today and refuses someone 18 tomorrow", () => {
    expect(isAdult("2008-11-24", today)).toBe(true);
    expect(isAdult("2008-11-25", today)).toBe(false);
  });
  it("refuses malformed dates", () => {
    expect(isAdult("24/11/1990", today)).toBe(false);
    expect(isAdult("", today)).toBe(false);
  });
});
