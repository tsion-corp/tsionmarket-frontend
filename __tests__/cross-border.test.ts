import { describe, expect, it } from "vitest";
import {
  countryCurrency,
  defaultMethod,
  feeUsd,
  findPayoutCountry,
  isValidAccount,
  isValidMobile,
  isValidName,
  maskNumber,
  PAYOUT_COUNTRIES,
  recipientReceives,
  searchPayoutCountries,
  supportsMethod,
  totalDebitUsd,
} from "@/lib/cross-border";

describe("cross-border corridors", () => {
  it("exposes valid ISO country codes so flags resolve", () => {
    for (const c of PAYOUT_COUNTRIES) {
      expect(c.code).toMatch(/^[a-z]{2}$/);
    }
  });

  it("every country lists at least one payout method", () => {
    for (const c of PAYOUT_COUNTRIES) {
      expect(c.methods.length).toBeGreaterThan(0);
    }
  });

  it("a mobile-money country carries at least one network", () => {
    for (const c of PAYOUT_COUNTRIES) {
      if (c.methods.includes("mobile_money")) {
        expect(c.networks.length).toBeGreaterThan(0);
      }
    }
  });

  it("finds Kenya and maps it to KES with M-Pesa", () => {
    const ke = findPayoutCountry("ke");
    expect(ke?.currency).toBe("KES");
    expect(ke?.networks.some((n) => n.id === "mpesa")).toBe(true);
    expect(supportsMethod(ke!, "mobile_money")).toBe(true);
  });

  it("defaults to the first listed method", () => {
    expect(defaultMethod(findPayoutCountry("ke")!)).toBe("mobile_money");
    expect(defaultMethod(findPayoutCountry("ng")!)).toBe("bank");
  });

  it("resolves a country's display currency", () => {
    expect(countryCurrency(findPayoutCountry("gh")!).code).toBe("GHS");
  });

  it("searches by name and currency", () => {
    expect(searchPayoutCountries("keny").map((c) => c.code)).toEqual(["ke"]);
    expect(searchPayoutCountries("ngn").map((c) => c.code)).toEqual(["ng"]);
    expect(searchPayoutCountries("").length).toBe(PAYOUT_COUNTRIES.length);
  });
});

describe("cross-border money math", () => {
  it("computes a 1% fee to the cent", () => {
    expect(feeUsd(100)).toBe(1);
    expect(feeUsd(49.99)).toBe(0.5);
    expect(feeUsd(0)).toBe(0);
    expect(feeUsd(-5)).toBe(0);
  });

  it("totals the debit as amount plus fee", () => {
    expect(totalDebitUsd(100)).toBe(101);
    expect(totalDebitUsd(49.99)).toBe(50.49);
    expect(totalDebitUsd(0)).toBe(0);
  });

  it("does not drift on repeated cent math", () => {
    // 0.1 + 0.2 style drift would surface here if plain floats were used.
    expect(feeUsd(0.3)).toBe(0);
    expect(totalDebitUsd(0.3)).toBe(0.3);
  });

  it("localizes the recipient amount and guards a missing rate", () => {
    const ke = findPayoutCountry("ke")!;
    // KES is not in the zero-decimal set, so it formats with cents.
    expect(recipientReceives(100, ke, 129)).toBe("KSh12,900.00");
    // UGX is zero-decimal, so no cents are shown.
    const ug = findPayoutCountry("ug")!;
    expect(recipientReceives(10, ug, 3800)).toBe("USh38,000");
    expect(recipientReceives(100, ke, null)).toBeNull();
    expect(recipientReceives(0, ke, 129)).toBeNull();
  });
});

describe("cross-border recipient validation", () => {
  it("accepts real names, rejects empty or numeric ones", () => {
    expect(isValidName("Wanjiru Kamau")).toBe(true);
    expect(isValidName("O'Brien")).toBe(true);
    expect(isValidName("A")).toBe(false);
    expect(isValidName("123")).toBe(false);
    expect(isValidName("  ")).toBe(false);
  });

  it("validates a mobile number by digit count, ignoring spaces and leading zero", () => {
    expect(isValidMobile("712 345 678")).toBe(true);
    expect(isValidMobile("0712345678")).toBe(true);
    expect(isValidMobile("12345")).toBe(false);
    expect(isValidMobile("")).toBe(false);
  });

  it("validates a bank account by digit count", () => {
    expect(isValidAccount("0123456789")).toBe(true);
    expect(isValidAccount("12345")).toBe(false);
    expect(isValidAccount("1234567890123456789")).toBe(false);
  });

  it("masks all but the last four digits", () => {
    expect(maskNumber("0712345678")).toBe("••••5678");
    expect(maskNumber("1234")).toBe("1234");
  });
});
