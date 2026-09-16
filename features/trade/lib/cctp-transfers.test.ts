import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, type Address, type Hex } from "viem";
import {
  ERC20_ABI,
  MESSAGE_TRANSMITTER_ABI,
  TOKEN_MESSENGER_ABI,
  TOKEN_MESSENGER_HOOK_ABI,
  addressToBytes32,
} from "@/lib/cctp/cctp";
import { CCTP_DOMAIN, CCTP_V2, CHAIN_ID, HYPERCORE, USDC } from "@/lib/cctp/config";
import {
  CctpFeeUnavailableError,
  burnBaseUsdcToPerps,
  sendArbitrumUsdcToBase,
  type CctpTransferDeps,
} from "@/features/trade/lib/cctp-transfers";

// The two CCTP money moves the perps rail makes (llms.txt §6a, §6b), each
// checked at the calldata the wallet signs: which chain, which contract, how
// much, and the maxFee that decides whether Circle ever mints it.

const RECIPIENT = "0xE03a10eFc2980Cfb2C8153f80CB0e3992eB89a83" as Address;
const BURN_TX = `0x${"b1".repeat(32)}` as Hex;
const MINT_TX = `0x${"a1".repeat(32)}` as Hex;

const QUOTE = [
  { finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 90, medium: 110, high: 160 } },
  { finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 90, medium: 110, high: 160 } },
];

function deps(over: Partial<CctpTransferDeps> = {}): CctpTransferDeps {
  return {
    sendBatch: vi.fn(async () => BURN_TX),
    feeQuote: vi.fn(async () => QUOTE),
    lookupAttestation: vi.fn(async () => ({
      status: "complete",
      message: "0xdead" as Hex,
      attestation: "0xbeef" as Hex,
    })),
    ...over,
  };
}

describe("burnBaseUsdcToPerps", () => {
  it("approves and burns on Base in one sponsored batch, to the forwarder, for the perps dex", async () => {
    const d = deps();
    const txHash = await burnBaseUsdcToPerps(d, {
      amount: 100_000_000n,
      recipient: RECIPIENT,
      userPaysForward: false,
    });

    expect(txHash).toBe(BURN_TX);
    expect(d.feeQuote).toHaveBeenCalledWith(CCTP_DOMAIN.base, CCTP_DOMAIN.hyperevm, {
      forward: false,
      hyperCoreDeposit: false,
    });
    const [calls, chainId] = (d.sendBatch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(chainId).toBe(CHAIN_ID.base);
    expect(calls).toHaveLength(2);

    expect(calls[0].to).toBe(USDC.base);
    const approve = decodeFunctionData({ abi: ERC20_ABI, data: calls[0].data });
    expect(approve.args).toEqual([CCTP_V2.tokenMessenger, 100_000_000n]);

    expect(calls[1].to).toBe(CCTP_V2.tokenMessenger);
    const burn = decodeFunctionData({ abi: TOKEN_MESSENGER_HOOK_ABI, data: calls[1].data });
    expect(burn.functionName).toBe("depositForBurnWithHook");
    expect(burn.args[0]).toBe(100_000_000n);
    expect(burn.args[1]).toBe(CCTP_DOMAIN.hyperevm);
    expect((burn.args[2] as string).toLowerCase()).toBe(
      addressToBytes32(HYPERCORE.cctpForwarder).toLowerCase()
    );
    // Platform relays the mint: maxFee covers the protocol fee only (1 bps).
    expect(burn.args[5]).toBe(10_000n);
    expect((burn.args[7] as string).toLowerCase()).toContain(RECIPIENT.slice(2).toLowerCase());
  });

  it("adds Circle's forwarding fee to maxFee when the user pays for the forward", async () => {
    const d = deps();
    await burnBaseUsdcToPerps(d, {
      amount: 100_000_000n,
      recipient: RECIPIENT,
      userPaysForward: true,
    });
    expect(d.feeQuote).toHaveBeenCalledWith(CCTP_DOMAIN.base, CCTP_DOMAIN.hyperevm, {
      forward: true,
      hyperCoreDeposit: true,
    });
    const [calls] = (d.sendBatch as ReturnType<typeof vi.fn>).mock.calls[0];
    const burn = decodeFunctionData({ abi: TOKEN_MESSENGER_HOOK_ABI, data: calls[1].data });
    expect(burn.args[5]).toBe(10_160n);
  });

  it("burns nothing when the fee quote cannot price the transfer", async () => {
    const d = deps({ feeQuote: vi.fn(async () => [{ finalityThreshold: 2000, minimumFee: 0 }]) });
    await expect(
      burnBaseUsdcToPerps(d, { amount: 1_000_000n, recipient: RECIPIENT, userPaysForward: false })
    ).rejects.toBeInstanceOf(CctpFeeUnavailableError);
    expect(d.sendBatch).not.toHaveBeenCalled();
  });

  it("burns nothing when the fee quote itself fails", async () => {
    const d = deps({ feeQuote: vi.fn(async () => Promise.reject(new Error("502"))) });
    await expect(
      burnBaseUsdcToPerps(d, { amount: 1_000_000n, recipient: RECIPIENT, userPaysForward: false })
    ).rejects.toBeInstanceOf(CctpFeeUnavailableError);
    expect(d.sendBatch).not.toHaveBeenCalled();
  });
});

describe("sendArbitrumUsdcToBase", () => {
  it("burns on Arbitrum, waits for Circle's attestation, then mints on Base, reporting each step", async () => {
    const sendBatch = vi
      .fn()
      .mockResolvedValueOnce(BURN_TX) // the Arbitrum burn
      .mockResolvedValueOnce(MINT_TX); // the Base mint
    const d = deps({ sendBatch });
    const onStatus = vi.fn();

    await sendArbitrumUsdcToBase(d, {
      amount: 2_500_000n,
      recipient: RECIPIENT,
      onStatus,
      attestationTimeoutMs: 1000,
      attestationIntervalMs: 1,
    });

    expect(d.feeQuote).toHaveBeenCalledWith(CCTP_DOMAIN.arbitrum, CCTP_DOMAIN.base, {
      forward: false,
      hyperCoreDeposit: false,
    });

    const [burnCalls, burnChain] = sendBatch.mock.calls[0];
    expect(burnChain).toBe(CHAIN_ID.arbitrum);
    expect(burnCalls[0].to).toBe(USDC.arbitrum);
    expect(decodeFunctionData({ abi: ERC20_ABI, data: burnCalls[0].data }).args).toEqual([
      CCTP_V2.tokenMessenger,
      2_500_000n,
    ]);
    const burn = decodeFunctionData({ abi: TOKEN_MESSENGER_ABI, data: burnCalls[1].data });
    expect(burn.args[0]).toBe(2_500_000n);
    expect(burn.args[1]).toBe(CCTP_DOMAIN.base);
    expect((burn.args[2] as string).toLowerCase()).toBe(addressToBytes32(RECIPIENT).toLowerCase());
    // 2.5 USDC at 1 bps is 250 base units.
    expect(burn.args[5]).toBe(250n);

    expect(d.lookupAttestation).toHaveBeenCalledWith(CCTP_DOMAIN.arbitrum, BURN_TX);

    const [mintCalls, mintChain] = sendBatch.mock.calls[1];
    expect(mintChain).toBe(CHAIN_ID.base);
    expect(mintCalls[0].to).toBe(CCTP_V2.messageTransmitter);
    expect(
      decodeFunctionData({ abi: MESSAGE_TRANSMITTER_ABI, data: mintCalls[0].data }).args
    ).toEqual(["0xdead", "0xbeef"]);

    expect(onStatus.mock.calls.map((call) => call[0])).toEqual([
      "moving",
      "confirming",
      "finishing",
    ]);
  });

  it("does nothing for an empty amount", async () => {
    const d = deps();
    await sendArbitrumUsdcToBase(d, { amount: 0n, recipient: RECIPIENT });
    expect(d.sendBatch).not.toHaveBeenCalled();
    expect(d.feeQuote).not.toHaveBeenCalled();
  });

  it("mints nothing when the attestation never arrives", async () => {
    const sendBatch = vi.fn().mockResolvedValueOnce(BURN_TX);
    const d = deps({ sendBatch, lookupAttestation: vi.fn(async () => null) });
    await expect(
      sendArbitrumUsdcToBase(d, {
        amount: 1_000_000n,
        recipient: RECIPIENT,
        attestationTimeoutMs: 5,
        attestationIntervalMs: 1,
      })
    ).rejects.toThrow(/timed out/);
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });
});
