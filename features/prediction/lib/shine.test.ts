import { describe, expect, it } from "vitest";
import { predictionShineEvent, predictionSharePrice } from "@/features/prediction/lib/shine";

describe("the price per share a filled order paid", () => {
  it("divides what was committed by what was received, in base units", () => {
    // $5 bought 10 shares: 50c a share.
    expect(predictionSharePrice("5", "10")).toBe("$0.50");
  });

  it("renders a sub-cent price instead of rounding it to nothing", () => {
    expect(predictionSharePrice("1", "1000")).toBe("$0.001");
  });

  it("is null when nothing was received, which is not a fill", () => {
    expect(predictionSharePrice("5", "0")).toBeNull();
  });

  it("is null when nothing was committed", () => {
    expect(predictionSharePrice("0", "10")).toBeNull();
  });

  it("is null at or above a dollar, which a share of a market cannot cost", () => {
    // The guard against reading the maker and taker legs the wrong way round.
    expect(predictionSharePrice("10", "5")).toBeNull();
    expect(predictionSharePrice("1", "1")).toBeNull();
  });

  it("is null for a figure that is not a plain decimal", () => {
    expect(predictionSharePrice("five", "10")).toBeNull();
    expect(predictionSharePrice(null, "10")).toBeNull();
  });
});

describe("the event a filled prediction order warrants", () => {
  const filled = {
    orderId: "0xorder",
    question: "Will it rain in Lagos on Friday?",
    outcome: "Yes",
    makingAmount: "5",
    takingAmount: "10",
  };

  it("carries the order id, the market's own question and the outcome bought", () => {
    expect(predictionShineEvent(filled)).toEqual({
      service: "prediction",
      id: "0xorder",
      market: "Will it rain in Lagos on Friday?",
      outcome: "Yes",
      price: "$0.50",
    });
  });

  it("states no price rather than a guess when the fill reported no amounts", () => {
    expect(predictionShineEvent({ ...filled, makingAmount: "0", takingAmount: "0" })).toEqual({
      service: "prediction",
      id: "0xorder",
      market: "Will it rain in Lagos on Friday?",
      outcome: "Yes",
      price: null,
    });
  });

  it("reports nothing without an order id to dedupe by", () => {
    expect(predictionShineEvent({ ...filled, orderId: "" })).toBeNull();
  });

  it("reports nothing when the market has no question to name it by", () => {
    expect(predictionShineEvent({ ...filled, question: null })).toBeNull();
  });
});
