import { describe, expect, it } from "vitest";
import { settlementAddress } from "@/lib/buy";

const WSOL = "So11111111111111111111111111111111111111112";
const NATIVE_SOL = "11111111111111111111111111111111";

describe("settlementAddress", () => {
  it("re-addresses SOL to the form the quote endpoint accepts", () => {
    // The catalog advertises SOL under the wSOL mint, which the quote endpoint
    // rejects with "Destination asset is not supported on chain". SOL was
    // dropped from the whole buy list over this.
    expect(settlementAddress(WSOL)).toBe(NATIVE_SOL);
    expect(settlementAddress(WSOL.toLowerCase())).toBe(NATIVE_SOL);
  });

  it("leaves every other asset exactly as the catalog gives it", () => {
    const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
    expect(settlementAddress(usdc)).toBe(usdc);
    expect(settlementAddress("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf")).toBe(
      "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"
    );
  });
});
