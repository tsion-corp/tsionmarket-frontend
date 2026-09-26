import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainSweep, SweepAsset } from "@/features/migrate/lib/plan";
import type { LegacyEvmTransaction, LegacySigner } from "@/lib/migration/types";

// The user-paid leg: a chain with no sponsorship (HyperEVM), the old wallet
// paying its own gas. The provider, the read client and the fee measurement
// are the seams; everything else is the real sweep.

const balance = { current: 20_301_433_165_367_182n }; // 0.0203 HYPE, as held live
const receipts = vi.fn(async () => ({ status: "success" }));
vi.mock("@/lib/trade/receipt", () => ({
  publicClientForChain: () => ({
    getBalance: async () => balance.current,
    waitForTransactionReceipt: receipts,
  }),
  awaitReceipt: async (_c: unknown, hash: string) => {
    await receipts();
    return { status: "success", transactionHash: hash };
  },
}));
const fee = {
  gas: 21_000n,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 1n,
  eip1559: true,
  feeWei: 21_000n * 1_000_000_000n,
};
vi.mock("@/lib/trade/native-gas", () => ({ nativeSendFeeParams: async () => fee }));

import { runSweep } from "@/features/migrate/lib/sweep";

const OLD = "0x9edfef746f6bf33822112d518b1243c27f902ef7";
const NEW = "0x57468a7dd02288971fb621bc9cc91f8ae37415eb";
const USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";

function asset(
  id: string,
  tokenAddress: string | null,
  symbol: string,
  amount: bigint
): SweepAsset {
  return {
    id,
    network: "hyperliquid-mainnet",
    tokenAddress,
    symbol,
    decimals: 18,
    amount,
    valueUsd: 1,
  };
}

type Send = (tx: LegacyEvmTransaction) => Promise<string>;

function signer(sendTransaction: Send, switchChain = vi.fn(async () => {})): LegacySigner {
  return {
    addresses: { evm: OLD, solana: null },
    switchChain,
    sendTransaction,
    sendBatch: vi.fn(async () => {
      throw new Error("must not be used on a user-paid chain");
    }),
    sendToken: vi.fn(),
    getEthereumProvider: vi.fn(),
  } as unknown as LegacySigner;
}

const chain: ChainSweep = {
  network: "hyperliquid-mainnet",
  kind: "evm-user-paid",
  assets: [
    asset("usdt0", USDT0, "USDT0", 3_000_000n),
    asset("hype", null, "HYPE", balance.current),
  ],
};

beforeEach(() => {
  balance.current = 20_301_433_165_367_182n;
  receipts.mockClear();
});

describe("runSweep on a user-paid chain", () => {
  it("switches the old wallet to the chain, sends each token, then the native coin minus the exact fee", async () => {
    const calls: LegacyEvmTransaction[] = [];
    const send: Send = async (tx) => {
      calls.push(tx);
      return `0xhash${calls.length}`;
    };
    const s = signer(send);

    const out = await runSweep([chain], { evm: NEW, solana: null }, s);

    expect(out.get("usdt0")).toEqual({ ok: true, txHashes: ["0xhash1"] });
    expect(out.get("hype")).toEqual({ ok: true, txHashes: ["0xhash2"] });
    expect(s.sendBatch).not.toHaveBeenCalled();

    expect(s.switchChain).toHaveBeenCalledWith(999);
    const [tokenCall, nativeCall] = calls;
    expect(tokenCall).toMatchObject({ chainId: 999, to: USDT0 });
    // Everything, minus gas * the cap the transaction itself carries.
    const expectedValue = balance.current - fee.feeWei;
    expect(nativeCall).toEqual({
      chainId: 999,
      to: NEW,
      value: `0x${expectedValue.toString(16)}`,
      gasLimit: "0x5208",
      maxFeePerGas: `0x${fee.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: "0x1",
    });
    // Each transfer was confirmed before the next.
    expect(receipts).toHaveBeenCalledTimes(2);
  });

  it("refuses the native send, retryably, when the balance cannot cover the fee — and still moves the tokens", async () => {
    balance.current = fee.feeWei - 1n;
    const sent: string[] = [];
    const send: Send = async (tx) => {
      sent.push(tx.to);
      return "0xtok";
    };

    const out = await runSweep([chain], { evm: NEW, solana: null }, signer(send));

    expect(out.get("usdt0")?.ok).toBe(true);
    expect(out.get("hype")).toMatchObject({
      ok: false,
      retryable: true,
      error: expect.stringMatching(/network fee/),
    });
    expect(sent).toHaveLength(1);
  });

  it("fails every asset on the chain, retryably, when the wallet cannot be switched to it", async () => {
    let sent = 0;
    const send: Send = async () => {
      sent++;
      return "0x";
    };

    const refuse = vi.fn(async () => {
      throw new Error("Unsupported chain");
    });
    const out = await runSweep([chain], { evm: NEW, solana: null }, signer(send, refuse));

    expect(out.get("usdt0")).toMatchObject({
      ok: false,
      retryable: true,
      error: "Unsupported chain",
    });
    expect(out.get("hype")).toMatchObject({ ok: false, retryable: true });
    expect(sent).toBe(0);
  });

  it("fails one token that reverts and carries on to the rest", async () => {
    const send: Send = async (tx) => {
      if (tx.to === USDT0) throw new Error("token is paused");
      return "0xnative";
    };

    const out = await runSweep([chain], { evm: NEW, solana: null }, signer(send));

    expect(out.get("usdt0")).toMatchObject({
      ok: false,
      retryable: true,
      error: "token is paused",
    });
    expect(out.get("hype")).toEqual({ ok: true, txHashes: ["0xnative"] });
  });
});
