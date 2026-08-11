import { describe, expect, it } from "vitest";
import { sameChainDestination } from "@/features/funds/components/crypto-withdraw-screen";
import { SETTLE_CHAINS } from "@/lib/deposit";

describe("withdrawal source chains", () => {
  it("offers a same-chain USDC send on whichever chain the funds sit on", () => {
    const base = sameChainDestination(SETTLE_CHAINS.base);
    expect(base.destinationChainId).toBe(SETTLE_CHAINS.base.chainId);
    expect(base.currency).toBe(SETTLE_CHAINS.base.usdc);

    const solana = sameChainDestination(SETTLE_CHAINS.solana);
    expect(solana.destinationChainId).toBe(SETTLE_CHAINS.solana.chainId);
    expect(solana.currency).toBe(SETTLE_CHAINS.solana.usdc);
  });

  it("asks for the address family the origin actually uses", () => {
    // The address field validates against this. Offering "evm" on a Solana
    // origin would dead-end the user at an address no Solana wallet can match.
    expect(sameChainDestination(SETTLE_CHAINS.base).addressKind).toBe("evm");
    expect(sameChainDestination(SETTLE_CHAINS.solana).addressKind).toBe("solana");
  });

  it("keeps the two sources distinct", () => {
    // A shared refund/origin address between them is the failure Dextopus
    // rejects outright: "refundTo must be a valid solana address for origin
    // chain". The chainType drives which wallet the screen reads.
    expect(SETTLE_CHAINS.base.chainType).toBe("ethereum");
    expect(SETTLE_CHAINS.solana.chainType).toBe("solana");
    expect(SETTLE_CHAINS.solana.alchemyNetwork).toBe("solana-mainnet");
    expect(SETTLE_CHAINS.solana.nativeSymbol).toBe("SOL");
  });
});
