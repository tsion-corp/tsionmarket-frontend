import { describe, expect, it } from "vitest";
import { pad, toHex } from "viem";
import type { Portfolio, TokenBalance } from "@/lib/server/alchemy";
import { applyNativeDelta, applyTransfers, walletDeltas } from "./apply-transfers";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
const WALLET = "0xabc0000000000000000000000000000000000001" as const;
const POOL = "0x00000000000000000000000000000000000000aa" as const;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
const COIN = "0xc0ffee00000000000000000000000000000000ee" as const;

function transfer(token: `0x${string}`, from: `0x${string}`, to: `0x${string}`, value: bigint) {
  return {
    address: token,
    topics: [TRANSFER, pad(from), pad(to)] as [`0x${string}`, ...`0x${string}`[]],
    data: pad(toHex(value)),
  };
}

function row(overrides: Partial<TokenBalance>): TokenBalance {
  return {
    symbol: "USDC",
    name: "USD Coin",
    network: "base-mainnet",
    address: USDC,
    decimals: 6,
    kind: "stablecoin",
    balance: 10,
    rawBalance: "10000000",
    priceUsd: 1,
    valueUsd: 10,
    logo: null,
    ...overrides,
  };
}

const portfolio: Portfolio = {
  totalUsd: 15,
  tokens: [
    row({}),
    row({
      symbol: "COIN",
      name: "Coin",
      address: COIN,
      decimals: 18,
      balance: 5,
      rawBalance: (5n * 10n ** 18n).toString(),
      priceUsd: 1,
      valueUsd: 5,
      kind: "token",
    }),
  ],
};

describe("walletDeltas", () => {
  it("nets the wallet's own credits and debits per token and ignores everyone else", () => {
    const deltas = walletDeltas(
      [
        transfer(USDC, WALLET, POOL, 3_000_000n),
        transfer(COIN, POOL, WALLET, 2n * 10n ** 18n),
        transfer(COIN, POOL, "0x00000000000000000000000000000000000000cc", 9n * 10n ** 18n),
        transfer(USDC, POOL, WALLET, 500_000n),
      ],
      WALLET.toUpperCase().replace("0X", "0x")
    );
    expect(deltas.get(USDC)).toBe(-2_500_000n);
    expect(deltas.get(COIN)).toBe(2n * 10n ** 18n);
    expect(deltas.size).toBe(2);
  });
});

describe("applyTransfers", () => {
  it("moves the rows a buy touched and re-sums the total", () => {
    const next = applyTransfers(portfolio, {
      network: "base-mainnet",
      wallet: WALLET,
      logs: [
        transfer(USDC, WALLET, POOL, 3_000_000n),
        transfer(COIN, POOL, WALLET, 2n * 10n ** 18n),
      ],
    });
    const usdc = next.tokens.find((t) => t.address === USDC)!;
    const coin = next.tokens.find((t) => t.address === COIN)!;
    expect(usdc.rawBalance).toBe("7000000");
    expect(usdc.balance).toBe(7);
    expect(usdc.valueUsd).toBe(7);
    expect(coin.rawBalance).toBe((7n * 10n ** 18n).toString());
    expect(coin.balance).toBe(7);
    expect(next.totalUsd).toBe(14);
  });

  it("leaves a coin the wallet did not hold to the read that follows", () => {
    const next = applyTransfers(portfolio, {
      network: "base-mainnet",
      wallet: WALLET,
      logs: [transfer("0x00000000000000000000000000000000000000dd", POOL, WALLET, 1n)],
    });
    expect(next).toBe(portfolio);
  });

  it("does not touch a row on another network with the same contract address", () => {
    const eth = { ...portfolio, tokens: [row({ network: "eth-mainnet" })] };
    const next = applyTransfers(eth, {
      network: "base-mainnet",
      wallet: WALLET,
      logs: [transfer(USDC, POOL, WALLET, 1_000_000n)],
    });
    expect(next).toBe(eth);
  });

  it("never drives a balance below zero", () => {
    const next = applyTransfers(portfolio, {
      network: "base-mainnet",
      wallet: WALLET,
      logs: [transfer(USDC, WALLET, POOL, 99_000_000n)],
    });
    expect(next.tokens.find((t) => t.address === USDC)!.rawBalance).toBe("0");
  });

  it("returns the same object when there is nothing to apply", () => {
    expect(applyTransfers(portfolio, { network: "base-mainnet", wallet: WALLET, logs: [] })).toBe(
      portfolio
    );
  });
});

// A Last Man stake is native ETH sent as the transaction's value. No log
// carries it, so the caller states the amount and the native row moves by it.
describe("applyNativeDelta", () => {
  const eth = row({
    symbol: "ETH",
    name: "Ether",
    address: null,
    decimals: 18,
    kind: "coin",
    balance: 0.0002,
    rawBalance: "200000000000000",
    priceUsd: 2750,
    valueUsd: 0.55,
  });
  const holding: Portfolio = { totalUsd: 10.55, tokens: [row({}), eth] };

  it("debits a stake from the native row and the total", () => {
    const after = applyNativeDelta(holding, "base-mainnet", -180_000_000_000_000n);
    expect(after.tokens[1].rawBalance).toBe("20000000000000");
    expect(after.tokens[1].valueUsd).toBeCloseTo(0.055, 6);
    expect(after.totalUsd).toBeCloseTo(10.055, 6);
    expect(after.tokens[0]).toBe(holding.tokens[0]);
  });

  it("credits a payout", () => {
    const after = applyNativeDelta(holding, "base-mainnet", 100_000_000_000_000n);
    expect(after.tokens[1].rawBalance).toBe("300000000000000");
  });

  it("leaves a portfolio without that network's native row alone", () => {
    expect(applyNativeDelta(holding, "arb-mainnet", -1n)).toBe(holding);
    expect(applyNativeDelta(holding, "base-mainnet", 0n)).toBe(holding);
  });
});
