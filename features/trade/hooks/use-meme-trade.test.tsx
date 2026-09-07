// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  quoteSwap: vi.fn(),
  registerSubmission: vi.fn(),
  fetchSwapStatus: vi.fn(),
  createWalletChallenge: vi.fn(),
  verifyWallet: vi.fn(),
}));
const chain = vi.hoisted(() => ({
  evmSend: vi.fn(),
  readBaseTokenBalance: vi.fn(),
}));

vi.mock("@privy-io/react-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@privy-io/react-auth")>()),
  getAccessToken: vi.fn(async () => "token"),
  usePrivy: () => ({
    user: {
      id: "did:privy:u1",
      linkedAccounts: [
        {
          type: "wallet",
          chainType: "ethereum",
          walletClientType: "privy",
          connectorType: "embedded",
          address: "0xabc0000000000000000000000000000000000001",
        },
      ],
    },
  }),
  useSignMessage: () => ({ signMessage: vi.fn(async () => ({ signature: "0xsig" })) }),
}));
vi.mock("@privy-io/react-auth/solana", () => ({
  useSignMessage: () => ({ signMessage: vi.fn() }),
  useWallets: () => ({ wallets: [] }),
}));
vi.mock("@/hooks/use-evm-send", () => ({ useEvmSend: () => chain.evmSend }));
vi.mock("@/hooks/use-sponsored-solana", () => ({ useSponsoredSolanaSend: () => vi.fn() }));
vi.mock("@/hooks/use-base-block", () => ({
  readBaseTokenBalance: chain.readBaseTokenBalance,
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meme/api")>();
  return { ...actual, ...api };
});

import { useMemeTrade } from "@/features/trade/hooks/use-meme-trade";

const WALLET = "0xabc0000000000000000000000000000000000001";
const quote = {
  swapId: "swap-1",
  chainId: 8453,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  buyToken: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 },
  sellToken: { address: "0xc0ffee", symbol: "WKC", decimals: 18 },
  calls: [{ type: "SWAP", to: "0xdef1", data: "0x00", value: "0" }],
};

// A sale that verifiably executed on-chain (the wallet received USDC) must
// read as done, whatever the trade service's own verification records: its
// check compares a sponsored user operation's bundle transaction with the
// prepared call and fails, which is its bug, not the user's trade.
describe("useMemeTrade on Base when the service records a delivered trade as failed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:${WALLET.toLowerCase()}`])
    );
    api.quoteSwap.mockResolvedValue(quote);
    api.registerSubmission.mockResolvedValue({ swapId: "swap-1", status: "SUBMITTED" });
    chain.evmSend.mockResolvedValue("0xhash");
    chain.readBaseTokenBalance.mockResolvedValueOnce(0n).mockResolvedValueOnce(1_960_000n);
    api.fetchSwapStatus.mockResolvedValue({
      swapId: "swap-1",
      status: "FAILED",
      updatedAt: "",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("settles on the on-chain proof instead of throwing", async () => {
    const { result } = renderHook(() => useMemeTrade());
    let outcome: Promise<void>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "4230.106143",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toBeUndefined();
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.received).toEqual({ amount: "1.96", symbol: "USDC" });
    expect(result.current.error).toBeNull();
  });
});
