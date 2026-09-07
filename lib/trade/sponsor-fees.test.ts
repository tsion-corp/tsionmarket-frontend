import { describe, expect, it, vi } from "vitest";
import { paymasterFeesPerGas, PRIORITY_FEE_BUFFER_PERCENT } from "@/lib/trade/sponsor-fees";

// Sponsored sends on Arbitrum failed on 2026-09-07 with the bundler's
// "precheck failed: maxPriorityFeePerGas is 0 but must be at least 831187".
// On the paymaster path viem estimates fees from the chain, and Arbitrum's
// eth_maxPriorityFeePerGas answers 0; Alchemy's bundler enforces its own
// floor, which it publishes as rundler_maxPriorityFeePerGas.
describe("paymasterFeesPerGas", () => {
  it("takes the bundler's priority-fee floor, with headroom, even when the chain says zero", async () => {
    const bundler = vi.fn(async ({ method }: { method: string }) => {
      if (method === "rundler_maxPriorityFeePerGas") return "0x10d4e8"; // 1,103,080 wei
      throw new Error(`unexpected ${method}`);
    });
    const fees = await paymasterFeesPerGas({
      bundlerRequest: bundler,
      baseFeePerGas: 10_000_000n, // 0.01 gwei, Arbitrum-like
      chainPriorityFeePerGas: 0n,
    });
    const floor = 1_103_080n;
    expect(fees.maxPriorityFeePerGas).toBe(
      (floor * BigInt(100 + PRIORITY_FEE_BUFFER_PERCENT)) / 100n
    );
    expect(fees.maxPriorityFeePerGas).toBeGreaterThanOrEqual(floor);
    // Base fee doubled for inclusion under a rising fee, plus the tip.
    expect(fees.maxFeePerGas).toBe(20_000_000n + fees.maxPriorityFeePerGas);
  });

  it("keeps the chain's own tip when it is already above the floor", async () => {
    const bundler = vi.fn(async () => "0xf4240"); // 1,000,000
    const fees = await paymasterFeesPerGas({
      bundlerRequest: bundler,
      baseFeePerGas: 5n,
      chainPriorityFeePerGas: 30_000_000_000n, // Polygon-like 30 gwei
    });
    expect(fees.maxPriorityFeePerGas).toBe(30_000_000_000n);
  });

  it("falls back to the chain's tip when the bundler does not publish a floor", async () => {
    const bundler = vi.fn(async () => {
      throw new Error("Method not found");
    });
    const fees = await paymasterFeesPerGas({
      bundlerRequest: bundler,
      baseFeePerGas: 5n,
      chainPriorityFeePerGas: 7n,
    });
    expect(fees.maxPriorityFeePerGas).toBe(7n);
    expect(fees.maxFeePerGas).toBe(10n + 7n);
  });
});
