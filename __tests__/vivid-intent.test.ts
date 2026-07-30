import { describe, expect, it } from "vitest";
import { vividToIntent, type TerminalFrame } from "@/lib/voice/vivid-intent";

// The bridge from Vivid backend frames to the app's typed Intent. These assert
// the mapping the dispatcher relies on: navigation, buy/sell → navigate+prefill
// (never auto-execute), reads → speak, and safe fallbacks.
describe("vividToIntent", () => {
  it("maps a navigate frame to a section navigate", () => {
    const frame: TerminalFrame = { type: "navigate", data: { page: "trade", speech: "" } };
    expect(vividToIntent(frame)).toEqual({ action: "navigate", target: "trade" });
  });

  it("maps an unknown page to unknown (safe no-op)", () => {
    const frame: TerminalFrame = { type: "navigate", data: { page: "casino-royale" } };
    expect(vividToIntent(frame)).toEqual({ action: "unknown", transcript: "casino-royale" });
  });

  it("maps an rwa.buy confirm to navigate rwa + buy prefill (no execute)", () => {
    const frame: TerminalFrame = {
      type: "confirm",
      data: {
        token: "t1",
        action: "rwa.buy",
        parameters: { asset: "USDY", amount: "10" },
        speech: "Buying $10 of Ondo Finance (USDY).",
      },
    };
    expect(vividToIntent(frame)).toEqual({
      action: "navigate",
      target: "rwa",
      prefill: { symbol: "USDY", amount: "10", mode: "buy" },
    });
  });

  it("maps an rwa.sell confirm to a sell prefill", () => {
    const frame: TerminalFrame = {
      type: "confirm",
      data: { token: "t2", action: "rwa.sell", parameters: { asset: "TSLAx" } },
    };
    expect(vividToIntent(frame)).toEqual({
      action: "navigate",
      target: "rwa",
      prefill: { symbol: "TSLAx", amount: undefined, mode: "sell" },
    });
  });

  it("maps a non-prefillable command to unsupported", () => {
    const frame: TerminalFrame = {
      type: "confirm",
      data: { token: "t3", action: "trade.buy", parameters: { asset: "ETH", amount: "100" } },
    };
    expect(vividToIntent(frame)).toEqual({ action: "unsupported", what: "trade buy" });
  });

  it("maps a deposit frame to a deposit prefill (chain + token)", () => {
    const frame: TerminalFrame = {
      type: "deposit",
      data: { chain: "solana", token: "USDC", speech: "Opening your Solana USDC address." },
    };
    expect(vividToIntent(frame)).toEqual({
      action: "deposit",
      prefill: { chain: "solana", token: "USDC" },
    });
  });

  it("maps a deposit frame with no token to a chain-only prefill", () => {
    const frame: TerminalFrame = { type: "deposit", data: { chain: "base" } };
    expect(vividToIntent(frame)).toEqual({
      action: "deposit",
      prefill: { chain: "base", token: undefined },
    });
  });

  it("passes any spoken chain through as free text (frontend resolves it)", () => {
    // Chains are not a fixed set: Dextopus offers a large dynamic list, so the
    // bridge forwards whatever was said and the deposit screen matches it.
    const frame: TerminalFrame = { type: "deposit", data: { chain: "arbitrum", token: "USDT" } };
    expect(vividToIntent(frame)).toEqual({
      action: "deposit",
      prefill: { chain: "arbitrum", token: "USDT" },
    });
  });

  it("maps result/clarify/reject/error to a spoken message", () => {
    expect(vividToIntent({ type: "result", data: { speech: "USDY is $1.08." } })).toEqual({
      action: "speak",
      message: "USDY is $1.08.",
    });
    expect(vividToIntent({ type: "clarify", data: { speech: "How much?" } })).toEqual({
      action: "speak",
      message: "How much?",
    });
    expect(vividToIntent({ type: "error", data: {} })).toEqual({
      action: "speak",
      message: "Sorry, I couldn't do that.",
    });
  });
});
