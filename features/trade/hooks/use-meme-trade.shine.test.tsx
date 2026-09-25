// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShineEvent } from "@/lib/shine";

/**
 * What a memecoin trade tells Shine, and what it must not.
 *
 * The whole risk of this feature is a public post that nobody approved and
 * nobody can retract. So the assertions here are about the event object rather
 * than about the queue behind it: which outcomes produce one, how many, and
 * what facts it carries. The queue, the gate and the dedup store are covered
 * by lib/shine's own tests.
 *
 * `delivered` and `pending` are the two outcomes that look like success and
 * are not. `delivered` means the wallet was paid while the trade service
 * recorded FAILED or REVERTED; `pending` means the status poll ran out of time
 * and nothing is claimed either way. Neither may reach the square.
 */

const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

const api = vi.hoisted(() => ({
  quoteSwap: vi.fn(),
  quoteSolanaSwap: vi.fn(),
  registerSubmission: vi.fn(),
  registerSolanaSubmission: vi.fn(),
  fetchSwapStatus: vi.fn(),
}));
const solana = vi.hoisted(() => ({ wallets: [] as { address: string }[], send: vi.fn() }));
const chain = vi.hoisted(() => ({
  evmSend: vi.fn(),
  applyReceipt: vi.fn(),
  readBaseTokenBalance: vi.fn(),
}));

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0xabc0000000000000000000000000000000000001",
    solanaAddress: "So1WalletCaseSensitive11111111111111111111",
  }),
}));
// One Decane wallet signs for both chains; the ownership proof is a message
// signature, so that is all this needs to stub. `uid` is the subject the
// trade service links a wallet to, and the linked cache is keyed on it.
const UID = "u-1111";
const TOKEN = `h.${btoa(JSON.stringify({ uid: UID })).replace(/=+$/, "")}.s`;
vi.mock("decane-connect-kit", () => ({
  useSocialWallet: () => ({
    isConnected: true,
    isUnlocked: true,
    unlock: vi.fn(async () => {}),
    signMessage: vi.fn(async () => "0xsig"),
    getAccessToken: () => TOKEN,
  }),
}));
vi.mock("@/lib/decane", () => ({ ensureUnlocked: vi.fn(async () => {}) }));
vi.mock("@/hooks/use-base-block", () => ({
  readBaseTokenBalance: chain.readBaseTokenBalance,
}));
vi.mock("@/hooks/use-evm-send", () => ({
  useEvmSend: () => chain.evmSend,
  useEvmSendWithReceipt: () => chain.evmSend,
}));
vi.mock("@/hooks/use-sponsored-solana", () => ({ useSponsoredSolanaSend: () => solana.send }));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ applyReceipt: chain.applyReceipt }),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/watchtower", () => ({ reportTradeRecordingMismatch: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meme/api")>();
  return { ...actual, ...api };
});

import { useMemeTrade } from "@/features/trade/hooks/use-meme-trade";

const WALLET = "0xabc0000000000000000000000000000000000001";
const SOL_WALLET = "So1WalletCaseSensitive11111111111111111111";
const USDC = { address: "0xusdc", symbol: "USDC", decimals: 6 };
const PEPE = { address: "0xc0ffee", symbol: "PEPE", decimals: 18 };

// $10 for 2,380,952.38… PEPE, which is $0.0000042 each.
const buyQuote = {
  swapId: "swap-1",
  chainId: 8453,
  side: "BUY" as const,
  sellToken: USDC,
  buyToken: PEPE,
  sellAmountAtomic: "10000000",
  expectedBuyAmountAtomic: "2380952380952380952380952",
  minimumBuyAmountAtomic: "0",
  calls: [{ type: "SWAP" as const, to: "0xdef1", data: "0x00", value: "0" }],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const sellQuote = {
  ...buyQuote,
  side: "SELL" as const,
  sellToken: PEPE,
  buyToken: USDC,
  sellAmountAtomic: "2380952380952380952380952",
  expectedBuyAmountAtomic: "10000000",
};

// The swap's own receipt, showing the wallet was paid. Only the `delivered`
// case needs one: it is the proof that the money moved while the service still
// recorded a failure.
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (hex: string) => `0x${hex.slice(2).padStart(64, "0")}`;
const receipt = {
  hash: "0xswap",
  logs: [
    {
      address: PEPE.address,
      topics: [TRANSFER, pad("0xaa"), pad(WALLET)],
      data: pad(`0x${(5n * 10n ** 18n).toString(16)}`),
    },
  ],
};

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function reported(): ShineEvent[] {
  return shine.reportShine.mock.calls.map((call) => call[0] as ShineEvent);
}

async function runBaseTrade(side: "BUY" | "SELL", extra: { shineService?: "memecoin" | "spot" }) {
  const { result } = renderHook(() => useMemeTrade(), { wrapper });
  await act(async () => {
    // The rejection is handled here, at creation, not after the timers run:
    // a failed trade is one of the cases under test, and its rejection has
    // nowhere else to go.
    const done = result.current
      .trade({
        side,
        tokenAddress: PEPE.address,
        amount: side === "BUY" ? "10" : "1",
        chainId: 8453,
        ...extra,
      })
      .catch(() => undefined);
    await vi.runAllTimersAsync();
    await done;
  });
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.localStorage.setItem(
    "wsws.meme-linked.v3",
    JSON.stringify([`${UID}:${WALLET.toLowerCase()}`, `${UID}:solana:${SOL_WALLET}`])
  );
  api.quoteSwap.mockResolvedValue(buyQuote);
  api.registerSubmission.mockResolvedValue({ swapId: "swap-1", status: "SUBMITTED" });
  chain.evmSend.mockResolvedValue({ hash: "0xhash", logs: [] });
  api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "CONFIRMED", updatedAt: "" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  solana.wallets = [];
  window.localStorage.clear();
});

describe("a confirmed memecoin trade", () => {
  it("reports one buy, keyed on the swap id, with the quote's ticker and price", async () => {
    const result = await runBaseTrade("BUY", {});

    expect(result.current.phase).toBe("confirmed");
    expect(reported()).toEqual([
      {
        service: "memecoin",
        id: "swap-1",
        kind: "buy",
        symbol: "PEPE",
        price: "$0.0000042",
      },
    ]);
  });

  it("reports a sell with no return, because no cost basis was read", async () => {
    api.quoteSwap.mockResolvedValue(sellQuote);

    await runBaseTrade("SELL", {});

    expect(reported()).toEqual([
      {
        service: "memecoin",
        id: "swap-1",
        kind: "sell",
        symbol: "PEPE",
        price: "$0.0000042",
        pnl: null,
      },
    ]);
  });

  // The swap engine also settles spot buys for a symbol Dextopus does not
  // offer. They are a different Shine setting and a different voice, and the
  // caller is what says so — so one confirmed swap still makes one post.
  it("reports under spot when the caller says the trade is a spot buy", async () => {
    await runBaseTrade("BUY", { shineService: "spot" });

    expect(reported()).toEqual([
      { service: "spot", id: "swap-1", kind: "buy", symbol: "PEPE", price: "$0.0000042" },
    ]);
  });

  it("says nothing when the quote names no ticker", async () => {
    api.quoteSwap.mockResolvedValue({ ...buyQuote, buyToken: { ...PEPE, symbol: null } });

    await runBaseTrade("BUY", {});

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

// The two outcomes that are not a confirmation. Both leave the wallet looking
// like something happened, and neither is the trade service saying so.
describe("a memecoin trade that is not confirmed", () => {
  it("says nothing when the trade is delivered but the service recorded FAILED", async () => {
    chain.evmSend.mockResolvedValue(receipt);
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "FAILED", updatedAt: "" });

    const result = await runBaseTrade("BUY", {});

    expect(result.current.phase).toBe("delivered");
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("says nothing when the status poll runs out of time", async () => {
    api.fetchSwapStatus.mockResolvedValue({
      swapId: "swap-1",
      status: "CONFIRMING",
      updatedAt: "",
    });

    const result = await runBaseTrade("BUY", {});

    expect(result.current.phase).toBe("pending");
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("says nothing when the trade fails outright", async () => {
    api.fetchSwapStatus.mockResolvedValue({ swapId: "swap-1", status: "REVERTED", updatedAt: "" });

    const result = await runBaseTrade("BUY", {});

    expect(result.current.phase).toBe("failed");
    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});

/**
 * Solana. The quote here names nothing at all — PreparedSolanaSwap is one
 * unsigned transaction, with no sellToken, no buyToken and no amounts — so the
 * ticker has to arrive with the order from the surface that knows the coin.
 * Without one there is no post, and nothing is ever derived from the mint
 * address.
 */
describe("a confirmed Solana memecoin trade", () => {
  beforeEach(() => {
    solana.wallets = [{ address: SOL_WALLET }];
    solana.send.mockResolvedValue("5igSignature");
    api.quoteSolanaSwap.mockResolvedValue({
      swapId: "sol-1",
      unsignedTransactionBase64: "AAAA",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    api.registerSolanaSubmission.mockResolvedValue({ swapId: "sol-1", status: "SUBMITTED" });
    api.fetchSwapStatus.mockResolvedValue({ swapId: "sol-1", status: "CONFIRMED", updatedAt: "" });
  });

  async function runSolanaTrade(input: { side: "BUY" | "SELL"; tokenSymbol?: string }) {
    const { result } = renderHook(() => useMemeTrade(), { wrapper });
    await act(async () => {
      const done = result.current
        .trade({
          side: input.side,
          tokenAddress: "BonkMint",
          amount: "5",
          chainId: 101,
          tokenSymbol: input.tokenSymbol,
        })
        .catch(() => undefined);
      await vi.runAllTimersAsync();
      await done;
    });
    return result;
  }

  it("reports a buy under the ticker the surface handed down", async () => {
    const result = await runSolanaTrade({ side: "BUY", tokenSymbol: "BONK" });

    expect(result.current.phase).toBe("confirmed");
    expect(reported()).toEqual([
      {
        service: "memecoin",
        id: "sol-1",
        kind: "buy",
        symbol: "BONK",
        // No legs on the quote means nothing to divide into a price, and the
        // amount typed is an amount. The post states the trade and no figure.
        price: null,
      },
    ]);
  });

  it("reports a sell, with no price and no return", async () => {
    await runSolanaTrade({ side: "SELL", tokenSymbol: "BONK" });

    expect(reported()).toEqual([
      { service: "memecoin", id: "sol-1", kind: "sell", symbol: "BONK", price: null, pnl: null },
    ]);
  });

  // The rule that has not changed: a ticker nobody supplied is not one to
  // invent. The mint address is right there and is never used.
  it("says nothing when no ticker came with the order", async () => {
    const result = await runSolanaTrade({ side: "BUY" });

    expect(result.current.phase).toBe("confirmed");
    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("says nothing for a blank ticker", async () => {
    await runSolanaTrade({ side: "BUY", tokenSymbol: "   " });

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("says nothing when the Solana swap is not confirmed", async () => {
    api.fetchSwapStatus.mockResolvedValue({ swapId: "sol-1", status: "CONFIRMING", updatedAt: "" });

    const result = await runSolanaTrade({ side: "BUY", tokenSymbol: "BONK" });

    expect(result.current.phase).toBe("pending");
    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});
