import { describe, expect, it } from "vitest";
import {
  AUTH_FAILURE,
  DEPOSIT_FAILURE,
  KASH_FAILURE,
  PERP_FAILURE,
  PREDICTION_FAILURE,
  TRADE_FAILURE,
  WITHDRAW_FAILURE,
  failureReasonForStage,
  reasonFor,
  statedReason,
} from "@/lib/analytics/failure-reason";

// A service error as lib/meme/api throws it: recognised by name and code.
function tradeError(code: string, message = "service wording") {
  return Object.assign(new Error(message), { name: "TradeApiError", code });
}

describe("reasonFor", () => {
  it("calls a wallet the user dismissed a cancellation, not a failed trade", () => {
    expect(reasonFor(TRADE_FAILURE, Object.assign(new Error("x"), { code: 4001 }))).toEqual({
      reason: "user_cancelled",
    });
    expect(reasonFor(TRADE_FAILURE, new Error("User rejected the request."))).toEqual({
      reason: "user_cancelled",
    });
  });

  it("maps the trade service's codes onto the agreed vocabulary", () => {
    expect(reasonFor(TRADE_FAILURE, tradeError("INSUFFICIENT_BALANCE"))).toEqual({
      reason: "insufficient_balance",
      reason_detail: "INSUFFICIENT_BALANCE",
    });
    expect(reasonFor(TRADE_FAILURE, tradeError("NO_SWAP_ROUTE")).reason).toBe("no_route");
    expect(reasonFor(TRADE_FAILURE, tradeError("SIMULATION_FAILED")).reason).toBe(
      "simulation_failed"
    );
    expect(reasonFor(TRADE_FAILURE, tradeError("HIGH_PRICE_IMPACT")).reason).toBe(
      "slippage_exceeded"
    );
    expect(reasonFor(TRADE_FAILURE, tradeError("SERVICE_UNAVAILABLE")).reason).toBe(
      "provider_timeout"
    );
  });

  it("reads the common failures out of a message when there is no code", () => {
    expect(
      reasonFor(TRADE_FAILURE, new Error("execution reverted: insufficient balance")).reason
    ).toBe("insufficient_balance");
    expect(reasonFor(TRADE_FAILURE, new Error("Too little received: slippage")).reason).toBe(
      "slippage_exceeded"
    );
    expect(reasonFor(TRADE_FAILURE, new TypeError("Failed to fetch")).reason).toBe(
      "provider_timeout"
    );
  });

  it("keeps a code it cannot place as the detail, and never the raw message", () => {
    // Provider text can quote back what the user typed.
    expect(reasonFor(TRADE_FAILURE, tradeError("WEIRD_CODE", "wallet 0xabc typed 12"))).toEqual({
      reason: "unknown",
      reason_detail: "WEIRD_CODE",
    });
    expect(reasonFor(TRADE_FAILURE, new Error("something odd about 0xabc"))).toEqual({
      reason: "unknown",
    });
  });
});

// The whole point of splitting the vocabulary per domain: a desk can only ever
// report a word its own section of the catalog defines.
describe("narrowing to a domain", () => {
  it("renames the same failure to the word each desk uses", () => {
    const short = new Error("insufficient balance");
    expect(reasonFor(TRADE_FAILURE, short).reason).toBe("insufficient_balance");
    // The perps desk calls the same missing money margin.
    expect(reasonFor(PERP_FAILURE, short).reason).toBe("insufficient_margin");
    // A route that cannot be filled is an empty pool to the Kash desk.
    expect(reasonFor(KASH_FAILURE, new Error("no route")).reason).toBe("insufficient_liquidity");
    // A stake under the minimum is the prediction desk's own wording.
    expect(reasonFor(PREDICTION_FAILURE, new Error("below the minimum")).reason).toBe(
      "stake_below_minimum"
    );
  });

  it("falls back to unknown, keeping the verdict, when a domain has no word for it", () => {
    // Deposits have no "insufficient_balance": the money is coming in.
    expect(reasonFor(DEPOSIT_FAILURE, new Error("insufficient balance"))).toEqual({
      reason: "unknown",
      reason_detail: "insufficient_balance",
    });
    // Trades have no "kyc_required".
    expect(reasonFor(TRADE_FAILURE, new Error("kyc required")).reason).toBe("unknown");
  });

  it("reports the failures each domain does have a word for", () => {
    expect(reasonFor(WITHDRAW_FAILURE, new Error("kyc required")).reason).toBe("kyc_required");
    expect(reasonFor(WITHDRAW_FAILURE, new Error("invalid address")).reason).toBe(
      "invalid_address"
    );
    expect(reasonFor(DEPOSIT_FAILURE, new Error("unsupported network")).reason).toBe(
      "wrong_network"
    );
    expect(reasonFor(AUTH_FAILURE, new Error("that email is already taken")).reason).toBe(
      "email_taken"
    );
    expect(reasonFor(AUTH_FAILURE, new Error("too many attempts")).reason).toBe("rate_limited");
  });

  it("every vocabulary can say unknown, which is what the fallback needs", () => {
    for (const vocab of [
      AUTH_FAILURE,
      DEPOSIT_FAILURE,
      WITHDRAW_FAILURE,
      KASH_FAILURE,
      TRADE_FAILURE,
      PREDICTION_FAILURE,
      PERP_FAILURE,
    ]) {
      expect(vocab.reasons).toContain("unknown");
    }
  });
});

describe("statedReason", () => {
  it("passes through a reason the screen knows outright", () => {
    expect(statedReason(PREDICTION_FAILURE, "below_minimum_legs")).toEqual({
      reason: "below_minimum_legs",
    });
  });
});

describe("failureReasonForStage", () => {
  it("names an order the venue refunded or failed", () => {
    expect(failureReasonForStage(TRADE_FAILURE, "refunded")).toEqual({
      reason: "unknown",
      reason_detail: "refunded",
    });
    expect(failureReasonForStage(TRADE_FAILURE, "failed")).toEqual({
      reason: "unknown",
      reason_detail: "failed",
    });
  });
});
