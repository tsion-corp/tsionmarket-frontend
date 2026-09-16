// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  quoteSwap: vi.fn(),
  registerSubmission: vi.fn(),
  fetchSwapStatus: vi.fn(),
  createWalletChallenge: vi.fn(),
  verifyWallet: vi.fn(),
  previewSwap: vi.fn(),
  quoteSolanaSwap: vi.fn(),
  registerSolanaSubmission: vi.fn(),
}));
const solana = vi.hoisted(() => ({
  wallets: [] as { address: string }[],
  send: vi.fn(),
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
        {
          type: "wallet",
          chainType: "solana",
          walletClientType: "privy",
          connectorType: "embedded",
          address: "So1WalletCaseSensitive11111111111111111111",
        },
      ],
    },
  }),
  useSignMessage: () => ({ signMessage: vi.fn(async () => ({ signature: "0xsig" })) }),
}));
vi.mock("@privy-io/react-auth/solana", () => ({
  useSignMessage: () => ({ signMessage: vi.fn() }),
  useWallets: () => ({ wallets: solana.wallets }),
}));
vi.mock("@/hooks/use-evm-send", () => ({
  useEvmSend: () => chain.evmSend,
  useEvmSendWithReceipt: () => chain.evmSend,
}));
vi.mock("@/hooks/use-sponsored-solana", () => ({ useSponsoredSolanaSend: () => solana.send }));
vi.mock("@/hooks/use-base-block", () => ({
  readBaseTokenBalance: chain.readBaseTokenBalance,
}));
const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  reportTradeRecordingMismatch: vi.fn(),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));
vi.mock("@/lib/analytics/watchtower", () => ({
  reportTradeRecordingMismatch: analytics.reportTradeRecordingMismatch,
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ applyReceipt: chain.applyReceipt }),
}));
vi.mock("@/lib/meme/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meme/api")>();
  return { ...actual, ...api };
});

import {
  useMemePreview,
  useMemeTrade,
  tradeRef,
  type TradeResult,
} from "@/features/trade/hooks/use-meme-trade";
import { useRiskConsent } from "@/features/trade/hooks/use-risk-consent";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import { TradeApiError } from "@/lib/meme/api";
import { SubmittedEvmOperationError } from "@/lib/trade/sponsor";
import { memePortfolioKeys } from "@/lib/meme/portfolio";

// useMemeTrade refreshes the service's portfolio when a swap is CONFIRMED, so
// it needs a query client. One per test, reachable here for the spy below.
let queryClient: QueryClient;
function tradeWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

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

// A sale that verifiably executed on-chain (the wallet received USDC) while
// the trade service records FAILED. Two rules meet here: the maintainers'
// "never tell someone their money did not move when it did", and the
// contract's "never say successful before CONFIRMED". So the phase is
// `delivered`, not `confirmed`, and not `failed`: the receipt is shown, the
// service's word is withheld, and the mismatch is reported for the trade team.
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

  it("ends in `delivered`, never `confirmed`, on the on-chain proof", async () => {
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "4230.106143",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toEqual({
      outcome: "delivered",
      swapId: "swap-1",
      requestId: null,
    });
    expect(result.current.phase).toBe("delivered");
    expect(result.current.received).toEqual({ amount: "1.96", symbol: "USDC" });
    expect(result.current.error).toBeNull();
    expect(result.current.swapId).toBe("swap-1");
    // The proof is the receipt the send already holds; no balance is read.
    expect(chain.readBaseTokenBalance).not.toHaveBeenCalled();
    // And the same receipt moves the cached portfolio before any re-read.
    expect(chain.applyReceipt).toHaveBeenCalledWith(
      "base-mainnet",
      WALLET,
      delivered(USDC, 1_960_000n).logs
    );
  });

  it("reports the mismatch to Watchtower and analytics with the swap and the hash", async () => {
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    await act(async () => {
      void result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    expect(analytics.reportTradeRecordingMismatch).toHaveBeenCalledWith({
      swapId: "swap-1",
      requestId: null,
      hash: "0xswap",
      recorded: "FAILED",
    });
    expect(analytics.track).toHaveBeenCalledWith(
      "trade_recording_mismatch",
      expect.objectContaining({ swap_id: "swap-1", recorded: "FAILED", hash: "0xswap" })
    );
  });

  it("is `confirmed` only when the service says CONFIRMED", async () => {
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "CONFIRMED", updatedAt: "" });
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toMatchObject({ outcome: "confirmed", swapId: "swap-1" });
    expect(result.current.phase).toBe("confirmed");
    expect(analytics.reportTradeRecordingMismatch).not.toHaveBeenCalled();
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
        new TradeApiError(
          "SWAP_ALREADY_SUBMITTED",
          "Swap cannot accept another submission.",
          409,
          "req-409"
        )
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

  it("ends in `delivered` on the on-chain proof, keeping the 409's requestId for the screen", async () => {
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "BUY",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toEqual({
      outcome: "delivered",
      swapId: "swap-1",
      requestId: "req-409",
    });
    expect(result.current.phase).toBe("delivered");
    expect(result.current.error).toBeNull();
    expect(result.current.settled).toEqual({ txHash: "0xswap", chainId: 8453 });
    expect(result.current.requestId).toBe("req-409");
    // Both calls were sent; the refused registration did not stop the swap.
    expect(chain.evmSend).toHaveBeenCalledTimes(2);
    // Polling would only repeat the verdict the 409 already gave.
    expect(api.fetchSwapStatus).not.toHaveBeenCalled();
    expect(analytics.reportTradeRecordingMismatch).toHaveBeenCalledWith({
      swapId: "swap-1",
      requestId: "req-409",
      hash: "0xswap",
      recorded: "SWAP_ALREADY_SUBMITTED",
    });
  });

  it("still fails when nothing was delivered", async () => {
    chain.evmSend.mockReset();
    chain.evmSend
      .mockResolvedValueOnce({ hash: "0xapprove", logs: [] })
      .mockResolvedValueOnce({ hash: "0xswap", logs: [] });
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<unknown>;
    await act(async () => {
      outcome = result.current
        .trade({ side: "BUY", tokenAddress: "0xc0ffee", amount: "1", chainId: 8453 })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toBeInstanceOf(TradeApiError);
    expect(result.current.phase).toBe("failed");
    // The error itself is kept, code and requestId included, so the screen
    // can choose its own copy and show the reference; not a flattened string.
    expect(result.current.error).toBeInstanceOf(TradeApiError);
    expect((result.current.error as TradeApiError).requestId).toBe("req-409");
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
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
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

    await expect(outcome!).resolves.toMatchObject({ outcome: "confirmed", swapId: "swap-1" });
    expect(result.current.phase).toBe("confirmed");
  });

  // The contract says to poll until a terminal state, and the service can
  // sit on CONFIRMING for as long as its verifier takes. A poll with no end
  // holds the sheet shut forever; past the ceiling the trade is `pending`:
  // the sheet may close, the swap stays in the transactions list, and the
  // service's status is still the only thing that will call it confirmed.
  it("gives up as `pending` after ten minutes without a terminal state", async () => {
    api.fetchSwapStatus.mockReset();
    api.fetchSwapStatus.mockResolvedValue({
      swapId: "swap-1",
      status: "CONFIRMING",
      updatedAt: "",
    });
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    // Nine minutes in: still asking, still honest about it.
    await act(() => vi.advanceTimersByTimeAsync(9 * 60_000));
    expect(result.current.phase).toBe("confirming");
    // The poll that crosses the ten-minute mark (the cadence lands at 602 s)
    // is the last one.
    await act(() => vi.advanceTimersByTimeAsync(70_000));
    await expect(outcome!).resolves.toEqual({
      outcome: "pending",
      swapId: "swap-1",
      requestId: null,
    });
    expect(result.current.phase).toBe("pending");
    expect(result.current.error).toBeNull();
    expect(result.current.swapId).toBe("swap-1");
    const polls = api.fetchSwapStatus.mock.calls.length;
    // And it really stopped: no poll lands after the ceiling.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(api.fetchSwapStatus).toHaveBeenCalledTimes(polls);
  });
});

// The bundler accepted the user operation but never produced a receipt
// (lib/trade/sponsor throws SubmittedEvmOperationError with the operation's
// hash). The contract accepts `{ userOperationHash }` for exactly this case,
// so the call is registered with it and the status poll decides the outcome,
// instead of the trade reading "failed" with nothing registered.
describe("useMemeTrade on Base when only a user-operation hash comes back", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:${WALLET.toLowerCase()}`])
    );
    api.quoteSwap.mockResolvedValue(quote);
    api.registerSubmission.mockResolvedValue({ swapId: "swap-1", status: "SUBMITTED" });
    chain.evmSend.mockRejectedValue(new SubmittedEvmOperationError("0xuop"));
    api.fetchSwapStatus
      .mockResolvedValueOnce({ swapId: "swap-1", status: "CONFIRMING", updatedAt: "" })
      .mockResolvedValue({ swapId: "swap-1", status: "CONFIRMED", updatedAt: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("registers the user-operation hash and continues to the poll", async () => {
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "BUY",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toMatchObject({ outcome: "confirmed", swapId: "swap-1" });
    expect(api.registerSubmission).toHaveBeenCalledTimes(1);
    const [swapId, callIndex, wallet, submission] = api.registerSubmission.mock.calls[0];
    expect(swapId).toBe("swap-1");
    expect(callIndex).toBe(0);
    expect(wallet).toBe(WALLET);
    expect(submission).toEqual({ userOperationHash: "0xuop" });
    expect(submission).not.toHaveProperty("transactionHash");
    expect(api.fetchSwapStatus).toHaveBeenCalled();
    expect(result.current.phase).toBe("confirmed");
    // A user-operation hash is not a transaction hash; nothing to share yet.
    expect(result.current.settled).toBeNull();
  });
});

// Quote failures and the Idempotency-Key. The contract: a new UUID per user
// action; reuse the same key ONLY when retrying the exact same request, which
// is what it asks for on QUOTE_PROVIDER_ERROR ("retry carefully with the same
// idempotency key").
describe("tradeRef", () => {
  it("joins the swap and request ids, and never renders an empty reference", () => {
    expect(tradeRef("swap-1", "req-1")).toBe("swap-1 · req-1");
    expect(tradeRef("swap-1", null)).toBe("swap-1");
    expect(tradeRef(null, null)).toBe("—");
  });
});

describe("useMemeTrade quote retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:${WALLET.toLowerCase()}`])
    );
    api.registerSubmission.mockResolvedValue({ swapId: "swap-1", status: "SUBMITTED" });
    chain.evmSend.mockResolvedValue({ hash: "0xhash", logs: [] });
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "CONFIRMED", updatedAt: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const keyOf = (call: unknown[]) => call[1] as string;

  it("retries QUOTE_PROVIDER_ERROR once, 1.5 s later, with the same key", async () => {
    api.quoteSwap
      .mockRejectedValueOnce(new TradeApiError("QUOTE_PROVIDER_ERROR", "0x down", 502, "req-q1"))
      .mockResolvedValueOnce(quote);
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.quoteSwap).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1_499));
    expect(api.quoteSwap).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.quoteSwap).toHaveBeenCalledTimes(2);
    expect(keyOf(api.quoteSwap.mock.calls[0])).toBe(keyOf(api.quoteSwap.mock.calls[1]));
    await act(() => vi.runAllTimersAsync());
    await expect(outcome!).resolves.toMatchObject({ outcome: "confirmed", swapId: "swap-1" });
  });

  it("gives up after the second provider failure", async () => {
    api.quoteSwap.mockRejectedValue(
      new TradeApiError("QUOTE_PROVIDER_ERROR", "0x down", 502, "req-q2")
    );
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<unknown>;
    await act(async () => {
      outcome = result.current
        .trade({ side: "SELL", tokenAddress: "0xc0ffee", amount: "1", chainId: 8453 })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toBeInstanceOf(TradeApiError);
    expect(api.quoteSwap).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe("failed");
  });

  it("does not retry any other quote failure", async () => {
    api.quoteSwap.mockRejectedValue(new TradeApiError("NO_SWAP_ROUTE", "no route", 422, "req-q3"));
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<unknown>;
    await act(async () => {
      outcome = result.current
        .trade({ side: "SELL", tokenAddress: "0xc0ffee", amount: "1", chainId: 8453 })
        .catch((e: unknown) => e);
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toBeInstanceOf(TradeApiError);
    expect(api.quoteSwap).toHaveBeenCalledTimes(1);
  });

  it("quotes again with a FRESH key after relinking on WALLET_OWNERSHIP_MISMATCH", async () => {
    api.createWalletChallenge.mockResolvedValue({ challengeId: "c1", message: "m", expiresAt: "" });
    api.verifyWallet.mockResolvedValue({});
    api.quoteSwap
      .mockRejectedValueOnce(new TradeApiError("WALLET_OWNERSHIP_MISMATCH", "not linked", 403))
      .mockResolvedValueOnce(quote);
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    let outcome: Promise<TradeResult>;
    await act(async () => {
      outcome = result.current.trade({
        side: "SELL",
        tokenAddress: "0xc0ffee",
        amount: "1",
        chainId: 8453,
      });
      await vi.runAllTimersAsync();
    });
    await expect(outcome!).resolves.toMatchObject({ outcome: "confirmed", swapId: "swap-1" });
    expect(api.quoteSwap).toHaveBeenCalledTimes(2);
    // A relink is a new user action as far as the service is concerned.
    expect(keyOf(api.quoteSwap.mock.calls[0])).not.toBe(keyOf(api.quoteSwap.mock.calls[1]));
  });
});

// The preview is the first request the trade service sees for an amount, so
// the consent gate sits on it: for a LOW_LIQUIDITY token no preview (and so no
// quote) leaves the client until the user has accepted the warning.
describe("useMemePreview", () => {
  const LOW = { code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." };
  const input = {
    side: "BUY" as const,
    tokenAddress: "0xthin",
    amount: "5",
    walletAddress: WALLET,
    chainId: 8453,
  };
  const previewBody = (expiresAt: string) => ({
    side: "BUY",
    sellToken: { address: USDC, symbol: "USDC" },
    buyToken: { address: "0xthin", symbol: "THIN" },
    sellAmountAtomic: "5000000",
    sellAmountFormatted: "5",
    expectedBuyAmountAtomic: "4000",
    expectedBuyAmountFormatted: "4000",
    minimumBuyAmountAtomic: "3900",
    minimumBuyAmountFormatted: "3900",
    priceImpactBps: 12,
    slippageBps: 100,
    platformFeeAmountAtomic: "25000",
    platformFeeAmountFormatted: "0.025",
    riskLevel: "HIGH",
    warnings: [LOW],
    expiresAt,
  });

  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sends no preview for a LOW_LIQUIDITY token until the warning is accepted", async () => {
    api.previewSwap.mockResolvedValue(previewBody(new Date(Date.now() + 60_000).toISOString()));
    const token = memeToken({ symbol: "THINA", address: "0xthina", warnings: [LOW] });
    const { result } = renderHook(
      () => {
        const consent = useRiskConsent(token, "5");
        const preview = useMemePreview(
          { ...input, tokenAddress: token.address },
          consent.consented
        );
        return { consent, preview };
      },
      { wrapper }
    );
    // Long enough for an enabled query to have fired.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(api.previewSwap).not.toHaveBeenCalled();
    expect(result.current.preview.quote).toBeNull();

    act(() => result.current.consent.accept());
    await waitFor(() => expect(api.previewSwap).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.preview.quote?.platformFeeAmountFormatted).toBe("0.025")
    );
  });

  it("previews a token without the warning on the amount it is given", async () => {
    api.previewSwap.mockResolvedValue(previewBody(new Date(Date.now() + 60_000).toISOString()));
    const token = memeToken({ symbol: "FINE", address: "0xfine", warnings: [] });
    renderHook(
      () =>
        useMemePreview(
          { ...input, tokenAddress: token.address },
          useRiskConsent(token, "5").consented
        ),
      { wrapper }
    );
    await waitFor(() => expect(api.previewSwap).toHaveBeenCalledTimes(1));
    expect(api.previewSwap).toHaveBeenCalledWith(
      { side: "BUY", tokenAddress: "0xfine", amount: "5", walletAddress: WALLET },
      8453
    );
  });

  it("marks the quote expired at its expiresAt and stops handing it out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.previewSwap.mockResolvedValue(previewBody(new Date(Date.now() + 5_000).toISOString()));
    const { result } = renderHook(() => useMemePreview(input, true), { wrapper });
    await waitFor(() => expect(result.current.quote).not.toBeNull());
    expect(result.current.expired).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(result.current.expired).toBe(true);
    expect(result.current.quote).toBeNull();
    expect(typeof result.current.refetch).toBe("function");
  });
});

// A Solana quote states its platform fee in USDC base units. Once that quote is
// in hand the trade hook carries the fee, read as a bigint at six decimals, so
// the sheet can show exactly what the service quoted.
describe("useMemeTrade on Solana", () => {
  const SOL_WALLET = "So1WalletCaseSensitive11111111111111111111";
  const solanaQuote = (fee?: string) => ({
    swapId: "sol-1",
    unsignedTransactionBase64: "AAAA",
    platformFeeTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    ...(fee === undefined ? {} : { platformFeeAmountAtomic: fee }),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:solana:${SOL_WALLET}`])
    );
    solana.wallets = [{ address: SOL_WALLET }];
    solana.send.mockResolvedValue("5igSignature");
    api.registerSolanaSubmission.mockResolvedValue({ swapId: "sol-1", status: "SUBMITTED" });
    api.fetchSwapStatus.mockResolvedValue({ swapId: "sol-1", status: "CONFIRMED", updatedAt: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    solana.wallets = [];
  });

  async function runSolanaBuy() {
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    await act(async () => {
      const done = result.current.trade({
        side: "BUY",
        tokenAddress: "BonkMint",
        amount: "5",
        chainId: 101,
      });
      await vi.runAllTimersAsync();
      await done;
    });
    return result;
  }

  it("carries the quote's platform fee in USDC, every base unit kept", async () => {
    api.quoteSolanaSwap.mockResolvedValue(solanaQuote("123456789012345678901"));
    const result = await runSolanaBuy();
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.quotedFee).toBe("123456789012345.678901");
  });

  it("has no fee to show when the quote states none", async () => {
    api.quoteSolanaSwap.mockResolvedValue(solanaQuote());
    const result = await runSolanaBuy();
    expect(result.current.quotedFee).toBeNull();
  });
});

// The contract: "refresh summary and open positions after a swap reaches
// CONFIRMED". The portfolio is built from confirmed swaps only, so a delivered
// or pending trade has nothing to show there yet. All four portfolio queries
// sit under one key prefix and are invalidated together, and only then.
describe("useMemeTrade refreshes the service portfolio", () => {
  const PORTFOLIO = { queryKey: [...memePortfolioKeys.all] };

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:${WALLET.toLowerCase()}`])
    );
    api.quoteSwap.mockResolvedValue(quote);
    api.registerSubmission.mockResolvedValue({ swapId: "swap-1", status: "SUBMITTED" });
    chain.evmSend.mockResolvedValue(delivered(USDC, 1_960_000n));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function sell(advance: () => Promise<unknown>) {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    await act(async () => {
      void result.current
        .trade({ side: "SELL", tokenAddress: "0xc0ffee", amount: "1", chainId: 8453 })
        .catch(() => undefined);
      await advance();
    });
    return { invalidate, result };
  }

  it("invalidates every portfolio query when the swap is CONFIRMED", async () => {
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "CONFIRMED", updatedAt: "" });
    const { invalidate, result } = await sell(() => vi.runAllTimersAsync());
    expect(result.current.phase).toBe("confirmed");
    expect(invalidate).toHaveBeenCalledWith(PORTFOLIO);
  });

  it("does not on a delivered trade the service recorded as FAILED", async () => {
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "FAILED", updatedAt: "" });
    const { invalidate, result } = await sell(() => vi.runAllTimersAsync());
    expect(result.current.phase).toBe("delivered");
    expect(invalidate).not.toHaveBeenCalledWith(PORTFOLIO);
  });

  it("does not on a trade still pending at the poll ceiling", async () => {
    api.fetchSwapStatus.mockResolvedValue({
      swapId: "swap-1",
      status: "CONFIRMING",
      updatedAt: "",
    });
    const { invalidate, result } = await sell(() => vi.advanceTimersByTimeAsync(11 * 60_000));
    expect(result.current.phase).toBe("pending");
    expect(invalidate).not.toHaveBeenCalledWith(PORTFOLIO);
  });

  it("invalidates on a CONFIRMED Solana swap too", async () => {
    const SOL_WALLET = "So1WalletCaseSensitive11111111111111111111";
    window.localStorage.setItem(
      "wsws.meme-linked.v1",
      JSON.stringify([`did:privy:u1:solana:${SOL_WALLET}`])
    );
    solana.wallets = [{ address: SOL_WALLET }];
    solana.send.mockResolvedValue("5igSignature");
    api.quoteSolanaSwap.mockResolvedValue({
      swapId: "sol-1",
      unsignedTransactionBase64: "AAAA",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    api.registerSolanaSubmission.mockResolvedValue({ swapId: "sol-1", status: "SUBMITTED" });
    api.fetchSwapStatus.mockResolvedValue({ swapId: "sol-1", status: "CONFIRMED", updatedAt: "" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMemeTrade(), { wrapper: tradeWrapper });
    await act(async () => {
      void result.current.trade({
        side: "BUY",
        tokenAddress: "BonkMint",
        amount: "5",
        chainId: 101,
      });
      await vi.runAllTimersAsync();
    });
    solana.wallets = [];
    expect(result.current.phase).toBe("confirmed");
    expect(invalidate).toHaveBeenCalledWith(PORTFOLIO);
  });
});
