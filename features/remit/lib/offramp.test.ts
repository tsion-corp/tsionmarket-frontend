import { describe, expect, it } from "vitest";
import {
  isTerminalRampStatus,
  liveCountryCodes,
  normalizePhone,
  payAmountUsd,
  receiveAmountFromUsd,
  splitName,
  unwrapEnvelope,
  type OfframpQuote,
} from "@/features/remit/lib/offramp";

describe("liveCountryCodes", () => {
  it("lowercases so the static catalogue's codes match", () => {
    expect(liveCountryCodes([{ country: "GH", currencies: ["GHS"] }]).has("gh")).toBe(true);
  });
});

describe("receiveAmountFromUsd", () => {
  it("derives the recipient's fiat from USD at our rate, two decimals", () => {
    expect(receiveAmountFromUsd("10", 15.5)).toBe("155.00");
    expect(receiveAmountFromUsd("2.5", 10.4)).toBe("26.00");
  });

  it("declines what cannot be quoted", () => {
    expect(receiveAmountFromUsd("0", 15)).toBeNull();
    expect(receiveAmountFromUsd("abc", 15)).toBeNull();
    expect(receiveAmountFromUsd("10", null)).toBeNull();
    expect(receiveAmountFromUsd("10", 0)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("produces dial-code-prefixed digits, no plus", () => {
    // The partner's own example shape: 233554235160.
    expect(normalizePhone("055 423 5160", "+233")).toBe("233554235160");
    expect(normalizePhone("0554235160", "+233")).toBe("233554235160");
  });

  it("leaves an already-international number alone", () => {
    expect(normalizePhone("+233 554 235 160", "+233")).toBe("233554235160");
    expect(normalizePhone("233554235160", "+233")).toBe("233554235160");
  });
});

describe("splitName", () => {
  it("first word is the name, the rest the surname", () => {
    expect(splitName("Ama Serwaa Mensah")).toEqual({ name: "Ama", surname: "Serwaa Mensah" });
  });

  it("a single word travels as the name alone", () => {
    expect(splitName("Ama")).toEqual({ name: "Ama" });
    expect(splitName("  Ama  ")).toEqual({ name: "Ama" });
  });
});

describe("payAmountUsd", () => {
  it("reads the quote's base units at its own decimals", () => {
    const quote = { pay: { amountIn: { amount: "10480000", decimals: 6 } } } as OfframpQuote;
    expect(payAmountUsd(quote)).toBeCloseTo(10.48);
  });
});

describe("isTerminalRampStatus", () => {
  it("only completed and needs_attention stop the poll", () => {
    expect(isTerminalRampStatus("completed")).toBe(true);
    expect(isTerminalRampStatus("needs_attention")).toBe(true);
    expect(isTerminalRampStatus("processing")).toBe(false);
    expect(isTerminalRampStatus("awaiting_deposit")).toBe(false);
  });
});

describe("unwrapEnvelope", () => {
  it("returns data from a success envelope", () => {
    expect(unwrapEnvelope({ success: true, data: { a: 1 } }, "x")).toEqual({ a: 1 });
  });

  it("throws the service's own message when present", () => {
    expect(() =>
      unwrapEnvelope({ success: false, error: { message: "crypto rail rejected" } }, "fallback")
    ).toThrow("crypto rail rejected");
    expect(() => unwrapEnvelope(null, "fallback")).toThrow("fallback");
  });
});

describe("pending remit store", async () => {
  const {
    PENDING_REMIT_TTL_MS,
    clearPendingRemit,
    isPendingRemitActive,
    pendingRemitSnapshot,
    savePendingRemit,
  } = await import("@/features/remit/lib/pending");

  it("round-trips a pending order through storage", () => {
    clearPendingRemit();
    expect(pendingRemitSnapshot()).toBeNull();
    savePendingRemit({ orderId: "order-1", createdAt: 1_000, funded: true });
    expect(pendingRemitSnapshot()).toEqual({ orderId: "order-1", createdAt: 1_000, funded: true });
    clearPendingRemit();
    expect(pendingRemitSnapshot()).toBeNull();
  });

  it("keeps snapshots referentially stable between reads", () => {
    savePendingRemit({ orderId: "order-2", createdAt: 2_000, funded: false });
    expect(pendingRemitSnapshot()).toBe(pendingRemitSnapshot());
    clearPendingRemit();
  });

  it("expires a pending order after the TTL", () => {
    const pending = { orderId: "order-3", createdAt: 10_000, funded: true };
    expect(isPendingRemitActive(pending, 10_000 + PENDING_REMIT_TTL_MS - 1)).toBe(true);
    expect(isPendingRemitActive(pending, 10_000 + PENDING_REMIT_TTL_MS)).toBe(false);
    expect(isPendingRemitActive(null, 0)).toBe(false);
  });
});
