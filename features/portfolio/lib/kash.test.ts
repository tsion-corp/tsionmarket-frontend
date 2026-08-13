import { beforeEach, describe, expect, it, vi } from "vitest";

// `post` goes through apiFetch, which demands a Privy token and never reaches
// the network in a unit test. Mocking the transport keeps the assertion on what
// this module is responsible for: what it puts on the wire.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
import {
  formatKashAmount,
  gateProgress,
  isValidKashAmount,
  newConversionKey,
  pointsToKash,
  postKashConversion,
  settlesIn,
} from "./kash";

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

describe("newConversionKey", () => {
  it("is unique per call", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newConversionKey()));
    expect(keys.size).toBe(50);
  });

  it("meets the engine's minimum key length", () => {
    // The engine rejects anything under 8 characters, and a rejected key means
    // the conversion runs with no retry protection at all.
    expect(newConversionKey().length).toBeGreaterThanOrEqual(8);
  });
});

describe("postKashConversion", () => {
  function bodyOf(call: number): Record<string, unknown> {
    const init = apiFetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body));
  }

  beforeEach(() => {
    apiFetchMock.mockClear();
    // A fresh Response per call: a body can only be read once, so a shared
    // instance makes the second call fail on an already-consumed stream.
    apiFetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { id: "1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
  });

  it("puts the idempotency key on the wire", async () => {
    // Without this the engine cannot recognise a retry, and a conversion that
    // timed out after burning would burn a second time.
    await postKashConversion("0xabc", "500", undefined, "convert-fixed-key");
    expect(bodyOf(0).idempotencyKey).toBe("convert-fixed-key");
  });

  it("sends the SAME key when the caller retries the same attempt", async () => {
    const key = newConversionKey();
    await postKashConversion("0xabc", "500", undefined, key);
    await postKashConversion("0xabc", "500", undefined, key);
    expect(bodyOf(0).idempotencyKey).toBe(bodyOf(1).idempotencyKey);
  });
});

describe("formatKashAmount", () => {
  it("separates thousands so a large balance is readable", () => {
    expect(formatKashAmount("1994")).toBe("1,994");
    expect(formatKashAmount("1234567")).toBe("1,234,567");
  });

  it("keeps cents on small amounts but drops noise on large ones", () => {
    expect(formatKashAmount("12.5")).toBe("12.50");
    expect(formatKashAmount("1994.37")).toBe("1,994");
  });

  it("returns the input unchanged when it is not a number", () => {
    expect(formatKashAmount("—")).toBe("—");
  });
});

describe("pointsToKash", () => {
  it("converts at the live price, not 1:1", () => {
    // Points carry a fixed USD value; that USD buys KSH at the current price.
    // A button labelled in KASH must not promise the points figure.
    expect(pointsToKash("500", 0.001, "0.0005")).toBe("1,000");
    expect(pointsToKash("500", 0.001, "0.002")).toBe("250");
  });

  it("is 1:1 only when the point value equals the price", () => {
    expect(pointsToKash("80", 0.001, "0.001")).toBe("80");
  });

  it("returns null rather than NaN when inputs are missing", () => {
    expect(pointsToKash("0", 0.001, "0.001")).toBeNull();
    expect(pointsToKash("80", undefined, "0.001")).toBeNull();
    expect(pointsToKash("80", 0.001, "0")).toBeNull();
  });
});
