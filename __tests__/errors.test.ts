import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/errors";

describe("friendlyError", () => {
  it("maps wallet rejections", () => {
    expect(friendlyError(new Error("User rejected the request"))).toMatch(/cancelled/i);
    expect(friendlyError("MetaMask Tx Signature: User denied transaction")).toMatch(/cancelled/i);
  });

  it("maps an ERC-20 balance revert (the real DAI error)", () => {
    expect(
      friendlyError(new Error("Execution reverted with reason: Dai/insufficient-balance."))
    ).toMatch(/enough of this asset/i);
    expect(friendlyError("transfer amount exceeds balance")).toMatch(/enough of this asset/i);
  });

  it("maps native-fee shortfalls to the network-fee message", () => {
    expect(friendlyError(new Error("insufficient funds for gas * price + value"))).toMatch(
      /network's coin/i
    );
    expect(friendlyError("cannot estimate gas")).toMatch(/network's coin/i);
  });

  it("maps rate limits", () => {
    expect(friendlyError("Request failed with status 429: Too Many Requests")).toMatch(/busy/i);
  });

  it("maps connectivity errors", () => {
    expect(friendlyError(new Error("Failed to fetch"))).toMatch(/connection/i);
    expect(friendlyError("The operation timed out")).toMatch(/connection/i);
  });

  it("maps unsupported / no-route / quote errors", () => {
    expect(friendlyError("Origin asset 0x0000 is not supported on chain 137")).toMatch(
      /couldn't complete this/i
    );
    expect(friendlyError("No deposit quote available")).toMatch(/couldn't complete this/i);
    expect(friendlyError("Unsupported network")).toMatch(/couldn't complete this/i);
  });

  it("uses the caller's fallback for unknown errors", () => {
    expect(friendlyError(new Error("weird internal thing"), "Couldn't buy right now.")).toBe(
      "Couldn't buy right now."
    );
  });

  it("uses the fallback for empty/nullish errors", () => {
    expect(friendlyError(null, "Try again.")).toBe("Try again.");
    expect(friendlyError(undefined, "Try again.")).toBe("Try again.");
    expect(friendlyError({}, "Try again.")).toBe("Try again.");
  });

  it("has a sensible default fallback", () => {
    expect(friendlyError(new Error("nope"))).toBe("Something went wrong. Please try again.");
  });
});
