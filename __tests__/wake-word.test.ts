import { describe, expect, it } from "vitest";
import { matchWakeWord } from "@/lib/voice/wake-word";

// The wake-word gate (Step 6). In a hands-free session the mic reopens every
// turn, so only utterances that ADDRESS Vivid may fire actions. These pin the
// prefix match, the command strip, and that ambient speech is rejected.
describe("matchWakeWord", () => {
  it("matches 'Vivid, <command>' and strips the wake word", () => {
    expect(matchWakeWord("Vivid, what's my balance?")).toEqual({
      matched: true,
      command: "what's my balance?",
    });
  });

  it("matches 'Hey Vivid <command>'", () => {
    expect(matchWakeWord("Hey Vivid open markets")).toEqual({
      matched: true,
      command: "open markets",
    });
  });

  it("matches the bare wake word with an empty command", () => {
    expect(matchWakeWord("Vivid")).toEqual({ matched: true, command: "" });
    expect(matchWakeWord("Vivid.")).toEqual({ matched: true, command: "" });
  });

  it("tolerates leading filler before the wake word", () => {
    expect(matchWakeWord("um, Vivid open my portfolio")).toEqual({
      matched: true,
      command: "open my portfolio",
    });
  });

  it("is case-insensitive", () => {
    expect(matchWakeWord("VIVID show me treasuries").matched).toBe(true);
    expect(matchWakeWord("vivid go to markets").matched).toBe(true);
  });

  it("rejects an utterance that does not address Vivid", () => {
    expect(matchWakeWord("what's my balance?")).toEqual({ matched: false, command: "" });
    expect(matchWakeWord("open markets")).toEqual({ matched: false, command: "" });
  });

  it("does not match Vivid appearing mid-sentence", () => {
    expect(matchWakeWord("I think Vivid is great").matched).toBe(false);
  });

  it("preserves the command's original casing (tickers, names)", () => {
    expect(matchWakeWord("Vivid buy ETH with USDC")).toEqual({
      matched: true,
      command: "buy ETH with USDC",
    });
  });

  it("exposes a stop command in the stripped remainder", () => {
    // The loop keys 'Vivid, stop' off the stripped command.
    expect(matchWakeWord("Vivid, stop")).toEqual({ matched: true, command: "stop" });
    expect(matchWakeWord("Vivid that's all")).toEqual({ matched: true, command: "that's all" });
  });
});
