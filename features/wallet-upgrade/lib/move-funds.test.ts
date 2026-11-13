import { describe, expect, it } from "vitest";
import type { TokenBalance } from "@/lib/server/alchemy";
import type { SettleOutcome } from "@/lib/migration/types";
import { toDecaneTransaction } from "./decane-tx";
import {
  assertMovable,
  destinationProblems,
  destinationsFromWallet,
  LOCKED_REASON,
  MOVABLE_NETWORKS,
  dryRunOutcomes,
  nothingToMove,
  planMove,
  sourcesMatchLink,
  summarizeMove,
} from "./move-funds";

const EVM_OLD = "0x1111111111111111111111111111111111111111";
const EVM_NEW = "0x412feF17cb2a2A64103c72Ba62aAa08c7fab57f8";
const SOL_OLD = "EBEgbXmCh2mztfyMh5jWcBQUyUBjJ8jBmAgbuT6uMVnX";
const SOL_NEW = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";

function token(over: Partial<TokenBalance>): TokenBalance {
  return {
    symbol: "USDC",
    name: "USD Coin",
    network: "eth-mainnet",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    kind: "token",
    balance: 25,
    rawBalance: "25000000",
    priceUsd: 1,
    valueUsd: 25,
    logo: null,
    ...over,
  } as TokenBalance;
}

describe("destinationProblems", () => {
  const sources = { evm: EVM_OLD, solana: SOL_OLD };

  it("accepts a different, valid pair", () => {
    expect(destinationProblems({ evm: EVM_NEW, solana: SOL_NEW }, sources)).toEqual([]);
  });

  it("refuses nothing, a malformed address, and sending to itself", () => {
    expect(destinationProblems({ evm: null, solana: null }, sources)).toHaveLength(1);
    expect(destinationProblems({ evm: "0x12", solana: null }, sources)[0]).toMatch(
      /Ethereum address isn't valid/
    );
    expect(destinationProblems({ evm: null, solana: "not-base58!!" }, sources)[0]).toMatch(
      /Solana address isn't valid/
    );
    expect(
      destinationProblems(
        { evm: EVM_OLD.toUpperCase().replace("0X", "0x"), solana: null },
        sources
      )[0]
    ).toMatch(/same as your old/);
    expect(destinationProblems({ evm: null, solana: SOL_OLD }, sources)[0]).toMatch(
      /same as your old/
    );
  });

  it("allows one side only: the other chain simply has nowhere to go", () => {
    expect(destinationProblems({ evm: EVM_NEW, solana: null }, sources)).toEqual([]);
  });
});

describe("sourcesMatchLink", () => {
  it("needs the signed-in account to be the linked one", () => {
    const linked = { evm: EVM_OLD, solana: SOL_OLD };
    expect(
      sourcesMatchLink({ evm: EVM_OLD.toUpperCase().replace("0X", "0x"), solana: SOL_OLD }, linked)
    ).toBe(true);
    expect(sourcesMatchLink({ evm: EVM_NEW, solana: SOL_OLD }, linked)).toBe(false);
    expect(sourcesMatchLink({ evm: EVM_OLD, solana: SOL_NEW }, linked)).toBe(false);
    expect(sourcesMatchLink({ evm: EVM_OLD, solana: SOL_OLD }, null)).toBe(false);
    expect(sourcesMatchLink({ evm: EVM_OLD, solana: SOL_OLD }, { evm: null, solana: null })).toBe(
      false
    );
  });
});

describe("planMove", () => {
  it("lists what moves per chain, marks who pays gas, and totals it", () => {
    const plan = planMove([
      token({}),
      token({
        symbol: "ETH",
        address: null,
        decimals: 18,
        balance: 0.5,
        rawBalance: "500000000000000000",
        priceUsd: 3000,
        valueUsd: 1500,
      }),
      token({
        symbol: "SOL",
        network: "solana-mainnet",
        address: null,
        decimals: 9,
        balance: 2,
        rawBalance: "2000000000",
        priceUsd: 150,
        valueUsd: 300,
      }),
    ]);
    expect(plan.view.map((c) => c.label)).toContain("Solana");
    const base = plan.view.find((c) => c.network === "eth-mainnet")!;
    expect(base.sponsored).toBe(true);
    expect(base.assets.map((a) => a.symbol)).toEqual(["USDC", "ETH"]);
    expect(base.assets[0]!.amountText).toBe("25");
    expect(plan.totalUsd).toBeCloseTo(1500 + 25 + 300, 5);
    expect(plan.stuck).toEqual([]);
    expect(nothingToMove(plan)).toBe(false);
  });

  it("drops dust and zero balances", () => {
    const plan = planMove([
      token({ balance: 0, rawBalance: "0", valueUsd: 0 }),
      token({
        symbol: "DUST",
        address: "0x00000000000000000000000000000000000000d5",
        balance: 1e-9,
        rawBalance: "1",
        valueUsd: 0,
      }),
    ]);
    expect(nothingToMove(plan)).toBe(true);
  });

  it("says why tokens on a chain we can't pay gas for, with no coin there, stay behind", () => {
    const plan = planMove(
      [
        token({
          network: "monad-mainnet",
          symbol: "USDC",
          address: "0x00000000000000000000000000000000000000aa",
        }),
      ],
      new Set(["monad-mainnet"])
    );
    expect(plan.chains).toHaveLength(0);
    expect(plan.stuck).toHaveLength(1);
    expect(plan.stuck[0]!.reason).toMatch(/no coin on this network/);
    expect(nothingToMove(plan)).toBe(true);
  });

  it("does move tokens and coin together on a user-paid chain, tokens first", () => {
    const plan = planMove(
      [
        token({
          network: "monad-mainnet",
          symbol: "MON",
          address: null,
          decimals: 18,
          balance: 3,
          rawBalance: "3000000000000000000",
          priceUsd: 1,
          valueUsd: 3,
        }),
        token({
          network: "monad-mainnet",
          symbol: "USDC",
          address: "0x00000000000000000000000000000000000000aa",
        }),
      ],
      new Set(["monad-mainnet"])
    );
    const chain = plan.chains[0]!;
    expect(chain.kind).toBe("evm-user-paid");
    expect(chain.assets.map((a) => a.symbol)).toEqual(["USDC", "MON"]);
    expect(plan.view[0]!.sponsored).toBe(false);
  });
});

describe("only Ethereum, Arbitrum, Base and Solana can move", () => {
  const everywhere = [
    "eth-mainnet",
    "arb-mainnet",
    "base-mainnet",
    "opt-mainnet",
    "polygon-mainnet",
    "bnb-mainnet",
    "monad-mainnet",
    "hyperliquid-mainnet",
  ].map((network) =>
    token({ network, symbol: "USDC", address: "0x00000000000000000000000000000000000000aa" })
  );

  it("names exactly those four", () => {
    expect([...MOVABLE_NETWORKS].sort()).toEqual([
      "arb-mainnet",
      "base-mainnet",
      "eth-mainnet",
      "solana-mainnet",
    ]);
  });

  it("plans only those, and lists every other chain greyed out with why", () => {
    const plan = planMove([
      ...everywhere,
      token({
        symbol: "SOL",
        network: "solana-mainnet",
        address: null,
        decimals: 9,
        balance: 1,
        rawBalance: "1000000000",
        priceUsd: 150,
        valueUsd: 150,
      }),
    ]);
    expect(plan.chains.map((c) => c.network).sort()).toEqual([
      "arb-mainnet",
      "base-mainnet",
      "eth-mainnet",
      "solana-mainnet",
    ]);
    expect(plan.locked.map((c) => c.network).sort()).toEqual([
      "bnb-mainnet",
      "hyperliquid-mainnet",
      "monad-mainnet",
      "opt-mainnet",
      "polygon-mainnet",
    ]);
    expect(plan.locked.every((c) => c.reason === LOCKED_REASON && c.assets.length > 0)).toBe(true);
    // What is locked is not counted as movable money.
    expect(plan.totalUsd).toBeCloseTo(25 + 25 + 25 + 150, 5);
  });

  it("moves nothing when the only holdings are on locked chains", () => {
    const plan = planMove(everywhere.slice(3));
    expect(nothingToMove(plan)).toBe(true);
    expect(plan.locked.length).toBeGreaterThan(0);
  });

  it("refuses to send a locked chain even if one reaches the sender", () => {
    const locked = planMove(everywhere.slice(3));
    expect(() =>
      assertMovable(planMove(everywhere.slice(3), new Set(["polygon-mainnet"])).chains)
    ).toThrow(/isn't switched on/);
    expect(() => assertMovable(planMove(everywhere).chains)).not.toThrow();
    expect(locked.chains).toEqual([]);
  });
});

describe("outcomes", () => {
  const plan = planMove([
    token({}),
    token({
      symbol: "SOL",
      network: "solana-mainnet",
      address: null,
      decimals: 9,
      balance: 2,
      rawBalance: "2000000000",
      priceUsd: 150,
      valueUsd: 300,
    }),
  ]);

  it("a rehearsal succeeds for everything and sends nothing", () => {
    const out = dryRunOutcomes(plan.chains);
    expect([...out.values()].every((o) => o.ok && o.txHashes[0] === "dry-run")).toBe(true);
    expect(summarizeMove(plan.chains, out)).toMatchObject({ moved: 2, failed: 0, usdMoved: 325 });
  });

  it("counts a failure, the first reason, and whether trying again could help", () => {
    const out = new Map<string, SettleOutcome>([
      ["eth-mainnet:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", { ok: true, txHashes: ["0xabc"] }],
      ["solana-mainnet:native", { ok: false, error: "Transfer failed", retryable: true }],
    ]);
    const s = summarizeMove(plan.chains, out);
    expect(s).toMatchObject({
      moved: 1,
      failed: 1,
      firstError: "Transfer failed",
      retryable: true,
      usdMoved: 25,
    });
    expect(s.failures[0]).toMatchObject({ symbol: "SOL", network: "solana-mainnet" });
  });

  it("treats an asset the run never reached as not moved", () => {
    const s = summarizeMove(plan.chains, new Map());
    expect(s).toMatchObject({ moved: 0, failed: 2, usdMoved: 0, retryable: true });
  });

  it("a permanent failure is not offered again", () => {
    const out = new Map<string, SettleOutcome>(
      plan.chains
        .flatMap((c) => c.assets)
        .map((a) => [a.id, { ok: false, error: "no", retryable: false }] as const)
    );
    expect(summarizeMove(plan.chains, out).retryable).toBe(false);
  });
});

describe("destinationsFromWallet", () => {
  it("reads each family's address, or null", () => {
    expect(destinationsFromWallet([{ family: "evm", address: EVM_NEW }])).toEqual({
      evm: EVM_NEW,
      solana: null,
    });
    expect(destinationsFromWallet([])).toEqual({ evm: null, solana: null });
  });
});

describe("toDecaneTransaction", () => {
  it("turns the sweep's hex fields into Decane's bigint ones, the fee cap as the gas price", () => {
    expect(
      toDecaneTransaction({
        chainId: 143,
        to: EVM_NEW,
        value: "0x10",
        gasLimit: "0x5208",
        maxFeePerGas: "0x3b9aca00",
        maxPriorityFeePerGas: "0x1",
      })
    ).toEqual({
      chain: "evm:143",
      to: EVM_NEW,
      value: 16n,
      gasLimit: 21000n,
      gasPrice: 1_000_000_000n,
    });
  });

  it("prefers an explicit gas price, and leaves unset fields out", () => {
    const tx = toDecaneTransaction({
      chainId: 1,
      to: EVM_NEW,
      data: "0xabcd",
      gasPrice: "0x2",
      maxFeePerGas: "0x9",
    });
    expect(tx).toEqual({ chain: "evm:1", to: EVM_NEW, data: "0xabcd", gasPrice: 2n });
    expect("value" in tx).toBe(false);
  });
});
