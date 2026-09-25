// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// A syntactically valid 65-byte ECDSA signature (r=0x11..11, s=0x22..22, v=27)
// standing in for a real wallet signature — this test proves the SDK's real
// msgpack + keccak256 hashing and EIP-712 wrapping run correctly end to end;
// only the actual cryptographic signing (which needs a real private key) is
// faked, at the lowest possible point: the embedded wallet's EIP-1193
// `eth_signTypedData_v4` request, which is what the Decane-backed signer now
// drops to (replacing Privy's useSignTypedData).
const FAKE_SIGNATURE = `0x${"1".repeat(64)}${"2".repeat(64)}1b`;

const request = vi.fn().mockResolvedValue(FAKE_SIGNATURE);

vi.mock("decane-connect-kit", () => ({
  useSocialWallet: () => ({
    getEthereumProvider: async () => ({ request }),
  }),
}));

// The signer serialises the typed data for the provider; read it back so the
// assertions below keep speaking in terms of domain / primaryType / message.
function signedTypedData(call = 0) {
  const [address, json] = request.mock.calls[call]![0].params as [string, string];
  return { address, ...(JSON.parse(json) as Record<string, unknown>) } as {
    address: string;
    domain: { name: string; chainId?: number };
    primaryType: string;
    message: unknown;
  };
}

import { useHyperliquidSigner } from "@/features/trade/lib/hyperliquid-signer";
import type {
  HlApproveBuilderFeeAction,
  HlL1Action,
  HlWithdraw3Action,
} from "@/features/trade/lib/hyperliquid-types";

const ADDRESS = "0x000000000000000000000000000000000000aA";

beforeEach(() => {
  request.mockClear();
});

describe("useHyperliquidSigner", () => {
  it("signL1 hashes a real L1 action and returns the signature split into r/s/v", async () => {
    const { result } = renderHook(() => useHyperliquidSigner(ADDRESS));
    const action: HlL1Action = { type: "cancel", cancels: [{ a: 0, o: 12345 }] };

    const signature = await result.current.signL1(action, 1_700_000_000_000);

    expect(signature).toEqual({ r: `0x${"1".repeat(64)}`, s: `0x${"2".repeat(64)}`, v: 27 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0].method).toBe("eth_signTypedData_v4");
    const params = signedTypedData();
    // Hyperliquid's phantom-agent wrapper: a fixed domain unrelated to any
    // real chain, and the message carries the real action's hash, not the
    // action itself.
    expect(params.domain).toMatchObject({ name: "Exchange", chainId: 1337 });
    expect(params.primaryType).toBe("Agent");
    // Signed as the connected wallet, never anything else.
    expect(params.address).toBe(ADDRESS);
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
    const params = signedTypedData();
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
    const params = signedTypedData();
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
    expect(request).not.toHaveBeenCalled();
  });
});
