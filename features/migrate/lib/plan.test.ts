import { describe, expect, it } from "vitest";
import { buildSweepPlan, sweepAssetId } from "@/features/migrate/lib/plan";
import type { TokenBalance } from "@/lib/server/alchemy";

function token(partial: Partial<TokenBalance>): TokenBalance {
  return {
    symbol: "TKN",
    name: "Token",
    network: "base-mainnet",
    address: "0x1111111111111111111111111111111111111111",
    decimals: 6,
    kind: "token",
    balance: 1,
    rawBalance: "1000000",
    priceUsd: 1,
    valueUsd: 1,
    logo: null,
    ...partial,
  } as TokenBalance;
}

describe("buildSweepPlan", () => {
  it("drops zero balances and groups the rest by network", () => {
    const { chains, skipped } = buildSweepPlan([
      token({ symbol: "USDC", rawBalance: "5000000" }),
      token({ symbol: "DUST", rawBalance: "0" }),
      token({
        symbol: "SOL",
        network: "solana-mainnet",
        address: null,
        decimals: 9,
        rawBalance: "2000000000",
      }),
    ]);

    expect(chains.map((c) => c.network)).toEqual(["base-mainnet", "solana-mainnet"]);
    expect(chains[0].assets.map((a) => a.symbol)).toEqual(["USDC"]);
    expect(chains[1].assets.map((a) => a.symbol)).toEqual(["SOL"]);
    expect(skipped).toEqual([]);
  });

  it("keeps amounts exact through bigint parsing", () => {
    const raw = "123456789012345678901234567890";
    const { chains } = buildSweepPlan([token({ rawBalance: raw, decimals: 18 })]);

    expect(chains[0].assets[0].amount).toBe(BigInt(raw));
  });

  it("orders each chain's tokens before its native asset", () => {
    const { chains } = buildSweepPlan([
      token({ symbol: "ETH", address: null, decimals: 18, rawBalance: "1000000000000000000" }),
      token({ symbol: "USDC", rawBalance: "5000000" }),
      token({
        symbol: "WSWS",
        address: "0x2222222222222222222222222222222222222222",
        rawBalance: "7",
      }),
    ]);

    expect(chains[0].assets.map((a) => a.symbol)).toEqual(["USDC", "WSWS", "ETH"]);
  });

  it("marks EVM chains as batched and Solana as sequential", () => {
    const { chains } = buildSweepPlan([
      token({}),
      token({ network: "solana-mainnet", address: null, decimals: 9, rawBalance: "1" }),
    ]);

    expect(chains.find((c) => c.network === "base-mainnet")?.kind).toBe("evm-batch");
    expect(chains.find((c) => c.network === "solana-mainnet")?.kind).toBe("solana-sequential");
  });

  it("orders EVM chains richest first with Solana last", () => {
    const { chains } = buildSweepPlan([
      token({ network: "solana-mainnet", address: null, decimals: 9, rawBalance: "1" }),
      token({ network: "polygon-mainnet", valueUsd: 5 }),
      token({ network: "base-mainnet", valueUsd: 100 }),
      token({ network: "arb-mainnet", valueUsd: 40 }),
    ]);

    expect(chains.map((c) => c.network)).toEqual([
      "base-mainnet",
      "arb-mainnet",
      "polygon-mainnet",
      "solana-mainnet",
    ]);
  });

  it("skips holdings on unsponsored networks instead of failing the sweep", () => {
    const { chains, skipped } = buildSweepPlan([
      token({ symbol: "USDC", rawBalance: "5000000" }),
      token({ symbol: "AVAX", network: "avax-mainnet", address: null, decimals: 18 }),
    ]);

    expect(chains.map((c) => c.network)).toEqual(["base-mainnet"]);
    expect(skipped.map((a) => a.symbol)).toEqual(["AVAX"]);
  });

  it("returns an empty plan for an empty portfolio", () => {
    expect(buildSweepPlan([])).toEqual({ chains: [], skipped: [] });
  });
});

describe("sweepAssetId", () => {
  it("keys native assets apart from tokens on the same chain", () => {
    expect(sweepAssetId("base-mainnet", null)).toBe("base-mainnet:native");
    expect(sweepAssetId("base-mainnet", "0xabc")).toBe("base-mainnet:0xabc");
  });
});

describe("buildSweepPlan — dust", () => {
  it("drops a wei-sized balance, whatever the price says", () => {
    // A wei of a token priced like ETH is still worth nothing; the real
    // holding beside it moves.
    const plan = buildSweepPlan([
      token({
        symbol: "DUST",
        rawBalance: "1",
        decimals: 18,
        balance: 1e-18,
        priceUsd: 2450,
        valueUsd: 2.45e-15,
      }),
      token({
        symbol: "REAL",
        rawBalance: "716606",
        decimals: 6,
        balance: 0.716606,
        priceUsd: 1,
        valueUsd: 0.716606,
      }),
    ]);
    expect(plan.chains.flatMap((c) => c.assets).map((a) => a.symbol)).toEqual(["REAL"]);
    expect(plan.skipped).toEqual([]);
  });

  it("drops a priced-but-worthless token — the honeypot that reverts on transfer", () => {
    // AGAI-shaped: nine whole units, a real price, worth $0.000033.
    const plan = buildSweepPlan([
      token({
        symbol: "AGAI",
        rawBalance: "9000000000",
        decimals: 9,
        balance: 9,
        priceUsd: 3.6e-6,
        valueUsd: 0.000033,
      }),
      token({
        symbol: "DEGEN",
        rawBalance: "2651720099331936191769",
        decimals: 18,
        balance: 2651.72,
        priceUsd: 0.00096,
        valueUsd: 2.55,
      }),
    ]);
    expect(plan.chains.flatMap((c) => c.assets).map((a) => a.symbol)).toEqual(["DEGEN"]);
  });

  it("drops an unpriced TOKEN — $0.00 is nothing, whatever the balance says", () => {
    const plan = buildSweepPlan([
      token({
        symbol: "ZZZ",
        rawBalance: "5000000000000000000",
        decimals: 18,
        balance: 5,
        priceUsd: 0,
        valueUsd: 0,
      }),
    ]);
    expect([...plan.chains.flatMap((c) => c.assets), ...plan.skipped]).toEqual([]);
  });

  it("keeps an unpriced NATIVE coin — a feed gap, not a worthless balance", () => {
    // APE on apechain: priceUsd 0 but a genuine balance of the chain's gas coin.
    const plan = buildSweepPlan([
      token({
        symbol: "APE",
        address: null,
        network: "apechain-mainnet",
        rawBalance: "3245662857820410",
        decimals: 18,
        balance: 0.00324,
        priceUsd: 0,
        valueUsd: 0,
      }),
    ]);
    const all = [...plan.chains.flatMap((c) => c.assets), ...plan.skipped].map((a) => a.symbol);
    expect(all).toEqual(["APE"]);
  });

  // A cent or two is small, but it is the person's, and leaving it behind
  // read as "ignored". The floor is a tenth of a cent.
  it("sweeps from a tenth of a cent up, and not below", () => {
    const plan = buildSweepPlan([
      token({
        symbol: "CENT",
        rawBalance: "10000",
        decimals: 6,
        balance: 0.01,
        priceUsd: 1,
        valueUsd: 0.01,
      }),
      token({
        symbol: "MILLI",
        rawBalance: "1000",
        decimals: 6,
        balance: 0.001,
        priceUsd: 1,
        valueUsd: 0.001,
      }),
      token({
        symbol: "SUB",
        rawBalance: "900",
        decimals: 6,
        balance: 0.0009,
        priceUsd: 1,
        valueUsd: 0.0009,
      }),
    ]);
    expect(plan.chains.flatMap((c) => c.assets).map((a) => a.symbol)).toEqual(["CENT", "MILLI"]);
  });
});
