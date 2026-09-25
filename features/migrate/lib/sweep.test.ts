import { describe, expect, it, vi } from "vitest";
import { runSweep } from "@/features/migrate/lib/sweep";
import type { ChainSweep, SweepAsset } from "@/features/migrate/lib/plan";
import type { LegacySigner } from "@/lib/migration/types";

const NEW_EVM = "0x0000000000000000000000000000000000000002";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function asset(id: string, network: string, tokenAddress: string | null = null): SweepAsset {
  return { id, network, tokenAddress, symbol: "USDC", decimals: 6, amount: 1_000n, valueUsd: 1 };
}

function signer(): LegacySigner {
  return {
    addresses: { evm: "0x0000000000000000000000000000000000000009", solana: "SoLold" },
    sendBatch: vi.fn(async () => "0xhash" as `0x${string}`),
    sendToken: vi.fn(async () => "solsig"),
    getEthereumProvider: vi.fn(),
  } as unknown as LegacySigner;
}

const baseChain: ChainSweep = {
  network: "base-mainnet",
  kind: "evm-batch",
  assets: [asset("usdc-base", "base-mainnet", USDC_BASE)],
};
const solanaChain: ChainSweep = {
  network: "solana-mainnet",
  kind: "solana-sequential",
  assets: [asset("sol", "solana-mainnet")],
};

describe("runSweep when a destination address is missing", () => {
  // The whole sweep used to refuse unless BOTH addresses existed, so a session
  // with no Solana address could not move its Base USDC either — blocked on an
  // address nothing in that sweep was going to use.
  it("sweeps EVM assets when there is no Solana address", async () => {
    const s = signer();
    const out = await runSweep([baseChain], { evm: NEW_EVM, solana: null }, s);

    expect(out.get("usdc-base")).toEqual({ ok: true, txHashes: ["0xhash"] });
    expect(s.sendBatch).toHaveBeenCalledOnce();
  });

  it("sweeps Solana assets when there is no EVM address", async () => {
    const s = signer();
    const out = await runSweep([solanaChain], { evm: null, solana: "SoLnew" }, s);

    expect(out.get("sol")).toEqual({ ok: true, txHashes: ["solsig"] });
  });

  it("fails only the chain whose destination is missing", async () => {
    const s = signer();
    const out = await runSweep([baseChain, solanaChain], { evm: NEW_EVM, solana: null }, s);

    expect(out.get("usdc-base")?.ok).toBe(true);
    expect(out.get("sol")).toMatchObject({ ok: false, retryable: true });
    // Nothing is sent to an address that does not exist.
    expect(s.sendToken).not.toHaveBeenCalled();
  });

  it("does not sign anything when the needed destination is absent", async () => {
    const s = signer();
    const out = await runSweep([baseChain], { evm: null, solana: "SoLnew" }, s);

    expect(out.get("usdc-base")).toMatchObject({ ok: false, retryable: true });
    expect(s.sendBatch).not.toHaveBeenCalled();
  });
});

describe("when one token in the batch reverts", () => {
  // The batch is atomic, so a single hostile or stale token takes every other
  // transfer down with it. Seen in the wild: a wallet holding 1 USDC beside
  // eight dust meme tokens moved NOTHING, because one of them reverted.
  const usdc = asset("usdc", "base-mainnet", USDC_BASE);
  const dust = [1, 2, 3].map((i) => asset(`dust-${i}`, "base-mainnet", `0xdead${i}`));
  const chain: ChainSweep = {
    network: "base-mainnet",
    kind: "evm-batch",
    assets: [usdc, ...dust],
  };

  it("retries one at a time so the good assets still move", async () => {
    const sendBatch = vi.fn(async (calls: unknown[]) => {
      // The whole batch reverts; a single call for the real token succeeds.
      if (calls.length > 1) throw new Error("execution reverted");
      return "0xhash" as `0x${string}`;
    });
    const s = { ...signer(), sendBatch } as unknown as LegacySigner;

    const out = await runSweep([chain], { evm: NEW_EVM, solana: null }, s);

    expect(out.get("usdc")).toEqual({ ok: true, txHashes: ["0xhash"] });
    // One failed attempt, then one per asset.
    expect(sendBatch).toHaveBeenCalledTimes(1 + chain.assets.length);
  });

  it("fails only the asset that actually reverts", async () => {
    const sendBatch = vi.fn(async (calls: { to: string }[]) => {
      if (calls.length > 1) throw new Error("execution reverted");
      if (calls[0]?.to === "0xdead2") throw new Error("token is paused");
      return "0xhash" as `0x${string}`;
    });
    const s = { ...signer(), sendBatch } as unknown as LegacySigner;

    const out = await runSweep([chain], { evm: NEW_EVM, solana: null }, s);

    expect(out.get("usdc")?.ok).toBe(true);
    expect(out.get("dust-1")?.ok).toBe(true);
    expect(out.get("dust-3")?.ok).toBe(true);
    expect(out.get("dust-2")).toMatchObject({ ok: false, retryable: true });
  });

  it("reports every asset failed when they all do", async () => {
    const s = {
      ...signer(),
      sendBatch: vi.fn(async () => {
        throw new Error("execution reverted");
      }),
    } as unknown as LegacySigner;

    const out = await runSweep([chain], { evm: NEW_EVM, solana: null }, s);

    for (const a of chain.assets) expect(out.get(a.id)?.ok).toBe(false);
  });
});

// The bundler took the operation but no receipt arrived in 45s. The money is
// almost certainly on its way; sending it again is the one thing that must
// not happen.
class SubmittedError extends Error {
  readonly code = "EVM_OPERATION_SUBMITTED";
}

describe("when the batch was submitted but never confirmed", () => {
  it("does not re-send the transfers", async () => {
    const s = signer();
    s.sendBatch = vi.fn(async () => {
      throw new SubmittedError("submitted");
    });
    const chain: ChainSweep = {
      network: "base-mainnet",
      kind: "evm-batch",
      assets: [asset("a", "base-mainnet", USDC_BASE), asset("b", "base-mainnet")],
    };

    const out = await runSweep([chain], { evm: NEW_EVM, solana: null }, s);

    // One attempt only — no per-asset retry loop behind it.
    expect(s.sendBatch).toHaveBeenCalledTimes(1);
    for (const id of ["a", "b"]) {
      expect(out.get(id)).toEqual({
        ok: false,
        error: expect.stringContaining("hasn't confirmed"),
        retryable: true,
      });
    }
  });

  it("still retries individually when the batch genuinely reverted", async () => {
    const s = signer();
    let call = 0;
    s.sendBatch = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("execution reverted");
      return "0xhash" as `0x${string}`;
    });
    const chain: ChainSweep = {
      network: "base-mainnet",
      kind: "evm-batch",
      assets: [asset("a", "base-mainnet", USDC_BASE), asset("b", "base-mainnet")],
    };

    const out = await runSweep([chain], { evm: NEW_EVM, solana: null }, s);

    expect(s.sendBatch).toHaveBeenCalledTimes(3); // the batch, then each asset
    expect(out.get("a")?.ok).toBe(true);
    expect(out.get("b")?.ok).toBe(true);
  });

  it("treats a submitted-but-unconfirmed error the same way on the Solana path", async () => {
    const s = signer();
    s.sendToken = vi.fn(async () => {
      throw new SubmittedError("submitted");
    });

    const out = await runSweep([solanaChain], { evm: null, solana: "SoLnew" }, s);

    expect(s.sendToken).toHaveBeenCalledTimes(1);
    expect(out.get("sol")).toEqual({
      ok: false,
      error: expect.stringContaining("hasn't confirmed"),
      retryable: true,
    });
  });
});
