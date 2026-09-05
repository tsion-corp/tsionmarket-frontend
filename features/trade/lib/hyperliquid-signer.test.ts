import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// A syntactically valid 65-byte ECDSA signature (r=0x11..11, s=0x22..22, v=27)
// standing in for a real wallet signature — this test proves the SDK's real
// msgpack + keccak256 hashing and EIP-712 wrapping run correctly end to end;
// only the actual cryptographic signing (which needs a real private key) is
// faked, at the lowest possible point (Privy's own signTypedData call).
const FAKE_SIGNATURE = `0x${"1".repeat(64)}${"2".repeat(64)}1b`;

const signTypedData = vi.fn().mockResolvedValue({ signature: FAKE_SIGNATURE });

vi.mock("@privy-io/react-auth", () => ({
  useSignTypedData: () => ({ signTypedData }),
}));

import { useHyperliquidSigner } from "@/features/trade/lib/hyperliquid-signer";
import type {
  HlApproveBuilderFeeAction,
  HlL1Action,
  HlWithdraw3Action,
} from "@/features/trade/lib/hyperliquid-types";

const ADDRESS = "0x000000000000000000000000000000000000aA";

beforeEach(() => {
  signTypedData.mockClear();
});

describe("useHyperliquidSigner", () => {
  it("signL1 hashes a real L1 action and returns the signature split into r/s/v", async () => {
    const { result } = renderHook(() => useHyperliquidSigner(ADDRESS));
    const action: HlL1Action = { type: "cancel", cancels: [{ a: 0, o: 12345 }] };

    const signature = await result.current.signL1(action, 1_700_000_000_000);

    expect(signature).toEqual({ r: `0x${"1".repeat(64)}`, s: `0x${"2".repeat(64)}`, v: 27 });
    expect(signTypedData).toHaveBeenCalledTimes(1);
    const [params, options] = signTypedData.mock.calls[0] as [
      { domain: { name: string; chainId: number }; primaryType: string },
      { address: string },
    ];
    // Hyperliquid's phantom-agent wrapper: a fixed domain unrelated to any
    // real chain, and the message carries the real action's hash, not the
    // action itself.
    expect(params.domain).toMatchObject({ name: "Exchange", chainId: 1337 });
    expect(params.primaryType).toBe("Agent");
    expect(options).toEqual({ address: ADDRESS });
  });

  it("signWithdrawal signs a withdraw3 action against the HyperliquidSignTransaction domain", async () => {
    const { result } = renderHook(() => useHyperliquidSigner(ADDRESS));
    const action: HlWithdraw3Action = {
      type: "withdraw3",
      signatureChainId: "0x66eee",
      hyperliquidChain: "Mainnet",
      destination: ADDRESS,
      amount: "10",
      time: 1_700_000_000_000,
    };

    const signature = await result.current.signWithdrawal(action);

    expect(signature).toEqual({ r: `0x${"1".repeat(64)}`, s: `0x${"2".repeat(64)}`, v: 27 });
    const [params] = signTypedData.mock.calls[0] as [
      { domain: { name: string }; message: unknown },
    ];
    expect(params.domain.name).toBe("HyperliquidSignTransaction");
    // The SDK filters the message down to only the fields Withdraw3Types
    // declares — `type` and `signatureChainId` are metadata for our own API
    // call, not part of the signed EIP-712 struct.
    expect(params.message).toEqual({
      hyperliquidChain: action.hyperliquidChain,
      destination: action.destination,
      amount: action.amount,
      time: action.time,
    });
  });

  it("signBuilderFeeApproval signs an approveBuilderFee action against the HyperliquidSignTransaction domain", async () => {
    const { result } = renderHook(() => useHyperliquidSigner(ADDRESS));
    const action: HlApproveBuilderFeeAction = {
      type: "approveBuilderFee",
      signatureChainId: "0x66eee",
      hyperliquidChain: "Mainnet",
      maxFeeRate: "0.1%",
      builder: "0x36d819ba633d53a37D2ad2a7e1e426c4B6513a73",
      nonce: 1_700_000_000_000,
    };

    const signature = await result.current.signBuilderFeeApproval(action);

    expect(signature).toEqual({ r: `0x${"1".repeat(64)}`, s: `0x${"2".repeat(64)}`, v: 27 });
    const [params] = signTypedData.mock.calls[0] as [
      { domain: { name: string }; message: unknown },
    ];
    expect(params.domain.name).toBe("HyperliquidSignTransaction");
    expect(params.message).toEqual({
      hyperliquidChain: action.hyperliquidChain,
      maxFeeRate: action.maxFeeRate,
      builder: action.builder,
      nonce: action.nonce,
    });
  });

  it("throws before signing anything when no wallet address is connected", async () => {
    const { result } = renderHook(() => useHyperliquidSigner(undefined));

    await expect(result.current.signL1({ type: "cancel", cancels: [] }, 1)).rejects.toThrow(
      "Connect a wallet"
    );
    expect(signTypedData).not.toHaveBeenCalled();
  });
});
