import { describe, expect, it } from "vitest";
import { canPost, checkPost, POST_MAX_LENGTH, remaining } from "@/lib/square/compose";

describe("compose", () => {
  it("refuses an empty or whitespace-only post", () => {
    expect(checkPost("")).toBe("empty");
    expect(checkPost("   \n\t ")).toBe("empty");
    expect(canPost("")).toBe(false);
  });

  it("accepts ordinary text", () => {
    expect(checkPost("watching $BTC today")).toBeNull();
    expect(canPost("watching $BTC today")).toBe(true);
  });

  // Judged on the trimmed text, because that is what gets sent — otherwise a
  // trailing newline could fail a post the server would have taken.
  it("does not count surrounding whitespace toward the limit", () => {
    const atLimit = "x".repeat(POST_MAX_LENGTH);
    expect(checkPost(`  ${atLimit}  `)).toBeNull();
    expect(remaining(`  ${atLimit}  `)).toBe(0);
  });

  it("refuses one character past the service's own limit", () => {
    expect(checkPost("x".repeat(POST_MAX_LENGTH + 1))).toBe("too-long");
    expect(remaining("x".repeat(POST_MAX_LENGTH + 1))).toBe(-1);
  });
});
