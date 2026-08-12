import { describe, expect, it } from "vitest";
import { gateProgress, isValidKashAmount, settlesIn } from "./kash";

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
