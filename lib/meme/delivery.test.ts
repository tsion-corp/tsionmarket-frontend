import { describe, expect, it } from "vitest";
import { pad, toHex } from "viem";
import { formatReceived, receivedFromLogs } from "./delivery";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
const WALLET = "0xabc0000000000000000000000000000000000001" as const;
const POOL = "0x00000000000000000000000000000000000000aa" as const;

function transfer(token: `0x${string}`, from: `0x${string}`, to: `0x${string}`, value: bigint) {
  return {
    address: token,
    topics: [TRANSFER, pad(from), pad(to)] as [`0x${string}`, ...`0x${string}`[]],
    data: pad(toHex(value)),
  };
}

describe("receivedFromLogs", () => {
  it("sums the bought token's transfers into the wallet and nothing else", () => {
    const logs = [
      // The wallet paying the pool: not a credit.
      transfer("0xc0ffee00000000000000000000000000000000ee", WALLET, POOL, 4_230_106_143n),
      // Two legs of one route both landing in the wallet.
      transfer(USDC, POOL, WALLET, 1_000_000n),
      transfer(USDC, "0x00000000000000000000000000000000000000bb", WALLET, 960_000n),
      // Same token, somebody else's credit in another log.
      transfer(USDC, POOL, "0x00000000000000000000000000000000000000cc", 5_000_000n),
    ];
    expect(receivedFromLogs(logs, USDC, WALLET)).toBe(1_960_000n);
  });

  it("matches addresses regardless of case", () => {
    const logs = [transfer(USDC, POOL, WALLET, 7n)];
    expect(
      receivedFromLogs(logs, USDC.toUpperCase().replace("0X", "0x") as `0x${string}`, WALLET)
    ).toBe(7n);
  });

  it("answers zero when the receipt shows nothing arriving", () => {
    expect(receivedFromLogs([], USDC, WALLET)).toBe(0n);
  });

  it("answers null when there was no receipt to read", () => {
    expect(receivedFromLogs(null, USDC, WALLET)).toBeNull();
  });

  it("ignores a Transfer-shaped log with a malformed value", () => {
    const bad = { ...transfer(USDC, POOL, WALLET, 1n), data: "0x01" as `0x${string}` };
    expect(receivedFromLogs([bad], USDC, WALLET)).toBe(0n);
  });
});

describe("formatReceived", () => {
  it("shows up to four decimals without trailing zeros", () => {
    expect(formatReceived(1_960_000n, 6)).toBe("1.96");
    expect(formatReceived(1_000_000n, 6)).toBe("1");
    expect(formatReceived(123_456_789n, 6)).toBe("123.4567");
    expect(formatReceived(5n, 18)).toBe("0");
  });
});
