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
  applyReceipt: vi.fn(),
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
vi.mock("@/hooks/use-evm-send", () => ({
  useEvmSend: () => chain.evmSend,
  useEvmSendWithReceipt: () => chain.evmSend,
}));
vi.mock("@/hooks/use-sponsored-solana", () => ({ useSponsoredSolanaSend: () => vi.fn() }));
vi.mock("@/hooks/use-base-block", () => ({
  readBaseTokenBalance: chain.readBaseTokenBalance,
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ applyReceipt: chain.applyReceipt }),
}));
vi.mock("@/lib/meme/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meme/api")>();
  return { ...actual, ...api };
});

import { useMemeTrade } from "@/features/trade/hooks/use-meme-trade";
import { TradeApiError } from "@/lib/meme/api";

const WALLET = "0xabc0000000000000000000000000000000000001";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (hex: string) => `0x${hex.slice(2).padStart(64, "0")}`;
// The swap's receipt: USDC arriving in the wallet, the way a sale pays out.
const delivered = (token: string, value: bigint) => ({
  hash: "0xswap",
  logs: [
    {
      address: token,
      topics: [TRANSFER, pad("0xaa"), pad(WALLET)],
      data: pad(`0x${value.toString(16)}`),
    },
  ],
});
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
    chain.evmSend.mockResolvedValue(delivered(USDC, 1_960_000n));
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
    // The proof is the receipt the send already holds; no balance is read.
    expect(chain.readBaseTokenBalance).not.toHaveBeenCalled();
    // And the same receipt moves the cached portfolio before any re-read.
    expect(chain.applyReceipt).toHaveBeenCalledWith(
      "base-mainnet",
      WALLET,
      delivered(USDC, 1_960_000n).logs
    );
  });
});

// The production recording of 2026-09-09: a two-call quote (approval, then
// the swap). Call 0 registers 201. By the time call 1 registers, the service
// has verified the approval, failed its transaction-target check on the
// sponsored user operation, marked the swap FAILED, and answers 409 "Swap
// cannot accept another submission". The swap had already executed and the
// wallet held the coin, yet the sheet said the trade didn't complete: the
// throw happened inside the registration loop, before the delivery proof.
describe("useMemeTrade on Base when the service refuses the second registration", () => {
  const twoCalls = {
    ...quote,
    calls: [
      { type: "APPROVAL", to: "0xusdc", data: "0x01", value: "0" },
      { type: "SWAP", to: "0xdef1", data: "0x00", value: "0" },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:${WALLET.toLowerCase()}`])
    );
    api.quoteSwap.mockResolvedValue(twoCalls);
    api.registerSubmission
      .mockResolvedValueOnce({ swapId: "swap-1", status: "SUBMITTED", callIndex: 0 })
      .mockRejectedValueOnce(
        new TradeApiError("SWAP_ALREADY_SUBMITTED", "Swap cannot accept another submission.", 409)
      );
    chain.evmSend
      .mockResolvedValueOnce({ hash: "0xapprove", logs: [] })
      .mockResolvedValueOnce(delivered(USDC, 700_262n));
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "FAILED", updatedAt: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("finishes the trade on the on-chain proof and points at the swap hash", async () => {
    const { result } = renderHook(() => useMemeTrade());
    let outcome: Promise<void>;
    await act(async () => {
      outcome = result.current.trade({
        side: "BUY",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toBeUndefined();
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.error).toBeNull();
    expect(result.current.settled).toEqual({ txHash: "0xswap", chainId: 8453 });
    // Both calls were sent; the refused registration did not stop the swap.
    expect(chain.evmSend).toHaveBeenCalledTimes(2);
  });

  it("still fails when nothing was delivered", async () => {
    chain.evmSend.mockReset();
    chain.evmSend
      .mockResolvedValueOnce({ hash: "0xapprove", logs: [] })
      .mockResolvedValueOnce({ hash: "0xswap", logs: [] });
    const { result } = renderHook(() => useMemeTrade());
    let outcome: Promise<unknown>;
    await act(async () => {
      outcome = result.current
        .trade({ side: "BUY", tokenAddress: "0xc0ffee", amount: "1", chainId: 8453 })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toBeInstanceOf(TradeApiError);
    expect(result.current.phase).toBe("failed");
  });
});

// The service's verification usually lands within a few seconds of the
// receipt, so the first look comes early; a slow one is then asked less and
// less often instead of every four seconds for as long as it takes.
describe("useMemeTrade status polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:${WALLET.toLowerCase()}`])
    );
    api.quoteSwap.mockResolvedValue(quote);
    api.registerSubmission.mockResolvedValue({ swapId: "swap-1", status: "SUBMITTED" });
    chain.evmSend.mockResolvedValue({ hash: "0xhash", logs: [] });
    api.fetchSwapStatus
      .mockResolvedValueOnce({ swapId: "swap-1", status: "PENDING", updatedAt: "" })
      .mockResolvedValueOnce({ swapId: "swap-1", status: "PENDING", updatedAt: "" })
      .mockResolvedValueOnce({ swapId: "swap-1", status: "PENDING", updatedAt: "" })
      .mockResolvedValueOnce({ swapId: "swap-1", status: "PENDING", updatedAt: "" })
      .mockResolvedValue({ swapId: "swap-1", status: "CONFIRMED", updatedAt: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("asks at 2, 5, 10 and 18 seconds rather than every 4", async () => {
    const { result } = renderHook(() => useMemeTrade());
    let outcome: Promise<void>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      // Flush the quote, the send and the first status look.
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(1_999));
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(3);

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(4);

    await act(() => vi.advanceTimersByTimeAsync(8_000));
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(5);

    await expect(outcome!).resolves.toBeUndefined();
    expect(result.current.phase).toBe("confirmed");
  });
});
