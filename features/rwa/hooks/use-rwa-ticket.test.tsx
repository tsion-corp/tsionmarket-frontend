// @vitest-environment jsdom
import { act, renderHook, type RenderHookResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@privy-io/react-auth";
import type { TokenBalance } from "@/lib/server/alchemy";
import type { RwaAction, RwaApiAsset, RwaQuote, RwaQuoteResult } from "@/features/rwa/lib/api";
import type { PendingRwaSettlement } from "@/lib/trade/pending-settlement";

/**
 * Characterisation tests for the RWA order hook.
 *
 * This hook is the money path for real assets: it prices the order, gates it,
 * and owns the two Solana settlement legs that keep a closed ticket or a reload
 * from stranding funds. It was lifted out of rwa-trade-panel.tsx unchanged, and
 * these tests pin the behaviour that was there before the markup is reshaped.
 * They assert what the hook returns and what its collaborators are called with,
 * never how it is written inside.
 */

const portfolio = vi.hoisted(() => ({
  tokens: [] as TokenBalance[],
  loading: false,
  error: false,
  refetchFresh: vi.fn(async () => {}),
  refetchUntilChanged: vi.fn(async () => {}),
}));
vi.mock("@/hooks/use-portfolio", () => ({ usePortfolio: () => portfolio }));

const wallets = vi.hoisted(() => ({
  user: null as unknown,
}));
vi.mock("@privy-io/react-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@privy-io/react-auth")>()),
  usePrivy: () => ({ user: wallets.user }),
}));

const rwaApi = vi.hoisted(() => ({
  quoteAsync: vi.fn(),
  buildAsync: vi.fn(),
  execute: vi.fn(async () => {}),
}));
vi.mock("@/features/rwa/hooks/use-rwa-trade", () => ({
  useRwaQuote: () => ({ mutateAsync: rwaApi.quoteAsync }),
  useRwaBuild: () => ({ mutateAsync: rwaApi.buildAsync }),
}));
vi.mock("@/features/rwa/hooks/use-execute-rwa", () => ({ useExecuteRwa: () => rwaApi.execute }));

const route = vi.hoisted(() => ({
  withdraw: vi.fn(),
  quoting: false,
  sending: false,
}));
vi.mock("@/hooks/use-withdraw", () => ({
  useReroutedWithdraw: () => ({
    withdraw: route.withdraw,
    quoting: route.quoting,
    sending: route.sending,
  }),
}));

// No settlement is polling in these tests: the Dextopus status subscription is
// exercised through what the hook stages, not through a live poll.
vi.mock("@/hooks/use-deposit", () => ({ useDepositStatus: () => ({ data: undefined }) }));

vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

const settlements = vi.hoisted(() => ({
  save: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@/lib/trade/pending-settlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trade/pending-settlement")>()),
  savePendingRwaSettlement: settlements.save,
  clearPendingRwaSettlement: settlements.clear,
}));

const toasts = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

// Every chain the RWA desk lists is gas sponsored today, so the native-gas gate
// is unreachable against the real registry. This switch takes the sponsorship
// away for the one test that pins the gate.
const gas = vi.hoisted(() => ({ sponsored: true }));
vi.mock("@/lib/trade/sponsored-evm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trade/sponsored-evm")>()),
  hasGasPolicyForNetwork: () => gas.sponsored,
}));

import { SOLANA_CHAIN_ID } from "@/lib/deposit";
import { USDC_BY_CHAIN } from "@/lib/trade/usdc";
import { useRwaTicket, type UseRwaTicketResult } from "@/features/rwa/hooks/use-rwa-ticket";

const SOLANA_USDC_MINT = USDC_BY_CHAIN.solana.address;

const privyUser = {
  linkedAccounts: [
    {
      type: "wallet",
      walletClientType: "privy",
      chainType: "ethereum",
      address: "0xbaseWallet",
    },
    {
      type: "wallet",
      walletClientType: "privy",
      chainType: "solana",
      address: "SolanaWallet111",
    },
  ],
} as unknown as User;

function asset(over: Partial<RwaApiAsset> = {}): RwaApiAsset {
  return {
    id: "ondo-base",
    chain: "base",
    address: "0xONDO",
    symbol: "ONDO",
    name: "Ondo US Treasuries",
    issuer: "Ondo",
    category: "treasury",
    priceUsd: "2",
    freelyTradable: true,
    ...over,
  };
}

function token(
  over: Partial<TokenBalance> & Pick<TokenBalance, "symbol" | "network">
): TokenBalance {
  return {
    name: over.symbol,
    address: null,
    decimals: 6,
    kind: "token",
    balance: 0,
    rawBalance: "0",
    priceUsd: 1,
    valueUsd: 0,
    logo: null,
    ...over,
  };
}

function usdc(network: string, balance: number, address: string | null = null): TokenBalance {
  return token({
    symbol: "USDC",
    network,
    address,
    balance,
    rawBalance: String(Math.round(balance * 1e6)),
    valueUsd: balance,
  });
}

function quoteResult(amount: string, amountMin?: string): RwaQuoteResult {
  const best: RwaQuote = {
    provider: "test",
    input: { chain: "base", address: "0xIN", amount: "1" },
    output: { chain: "base", address: "0xOUT", amount, amountMin },
    priceImpactBps: 10,
  };
  return { best, all: [best], failed: [] };
}

function action(over: Partial<RwaAction> = {}): RwaAction {
  return {
    actionId: "action-1",
    chain: "base",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    steps: [
      {
        id: "step-1",
        kind: "sign-transaction",
        chain: over.chain ?? "base",
        description: "Swap",
        tx: { format: "evm", to: "0xrouter" },
      },
    ],
    ...over,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Ticket = RenderHookResult<UseRwaTicketResult, unknown>;

function mount(options: Parameters<typeof useRwaTicket>[0]): Ticket {
  return renderHook(() => useRwaTicket(options));
}

// Types an amount and lets the 700ms quote debounce fire.
async function type(view: Ticket, value: string): Promise<void> {
  await act(async () => {
    view.result.current.setAmount(value);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function lastSettlement(): PendingRwaSettlement {
  const call = settlements.save.mock.calls.at(-1);
  if (!call) throw new Error("No settlement was saved.");
  return call[0] as PendingRwaSettlement;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  gas.sponsored = true;
  route.quoting = false;
  route.sending = false;
  wallets.user = privyUser;
  portfolio.tokens = [usdc("base-mainnet", 500)];
  portfolio.loading = false;
  portfolio.error = false;
  rwaApi.quoteAsync.mockResolvedValue(quoteResult("1000000"));
  rwaApi.buildAsync.mockResolvedValue(action());
  rwaApi.execute.mockResolvedValue(undefined);
  toasts.loading.mockReturnValue("toast-1");
  // Deterministic sale handoff ids, so the record written and the record
  // cleared can be compared by value.
  vi.stubGlobal("crypto", {
    randomUUID: () => "uuid-1",
    getRandomValues: (array: ArrayBufferView) => array,
  } as unknown as Crypto);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("quoting", () => {
  it("discards a superseded quote response and keeps the newest request's result", async () => {
    const first = deferred<RwaQuoteResult>();
    const second = deferred<RwaQuoteResult>();
    rwaApi.quoteAsync
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const view = mount({ asset: asset() });
    await type(view, "10");
    await type(view, "20");
    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(2);

    // The older request answers first. It is for an amount the user has
    // already moved on from, so it must not become the live quote.
    await act(async () => {
      first.resolve(quoteResult("111"));
      await first.promise;
    });
    expect(view.result.current.quote).toBeNull();
    expect(view.result.current.phase).toBe("quoting");

    await act(async () => {
      second.resolve(quoteResult("222"));
      await second.promise;
    });
    expect(view.result.current.quote?.output.amount).toBe("222");
    expect(view.result.current.phase).toBe("quoted");
  });

  it("re-quotes instead of executing when the live quote is over 60s old", async () => {
    const view = mount({ asset: asset() });
    await type(view, "10");
    expect(view.result.current.canConfirm).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(rwaApi.buildAsync).not.toHaveBeenCalled();
    expect(rwaApi.execute).not.toHaveBeenCalled();
    // A second quote was fired, and the user is told to confirm again.
    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(2);
    expect(view.result.current.notice).toEqual({
      kind: "info",
      message: "The quote expired, we refreshed it. Review and confirm again.",
    });
  });

  it("does not re-quote when a background portfolio refetch hands back new objects", async () => {
    const view = mount({ asset: asset() });
    await type(view, "10");
    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(1);

    // Same balances, fresh object identities, which is what a poll returns.
    portfolio.tokens = [usdc("base-mainnet", 500)];
    await act(async () => {
      view.rerender();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited quote through the backoff rather than failing the user", async () => {
    rwaApi.quoteAsync
      .mockRejectedValueOnce(
        Object.assign(new Error("Too many requests"), { code: "RATE_LIMITED" })
      )
      .mockResolvedValueOnce(quoteResult("999"));

    const view = mount({ asset: asset() });
    await type(view, "10");
    expect(view.result.current.quote).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(view.result.current.quote?.output.amount).toBe("999");
    expect(view.result.current.notice).toBeNull();
  });

  it("never quotes a buy under the chain's minimum", async () => {
    const solana = asset({ chain: "solana", address: "SoLONDO", id: "ondo-solana" });
    portfolio.tokens = [usdc("solana-mainnet", 50, SOLANA_USDC_MINT)];

    const solanaView = mount({ asset: solana });
    await type(solanaView, "1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(rwaApi.quoteAsync).not.toHaveBeenCalled();
    expect(solanaView.result.current.belowMin).toBe(true);
    expect(solanaView.result.current.phase).toBe("idle");

    // Two dollars clears the Solana floor.
    await type(solanaView, "2");
    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(1);

    // Everywhere else the floor is one dollar.
    portfolio.tokens = [usdc("base-mainnet", 500)];
    const baseView = mount({ asset: asset() });
    await type(baseView, "0.5");
    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(1);
    expect(baseView.result.current.belowMin).toBe(true);
    await type(baseView, "1");
    expect(rwaApi.quoteAsync).toHaveBeenCalledTimes(2);
  });
});

describe("the Solana funding leg", () => {
  const solana = () => asset({ chain: "solana", address: "SoLONDO", id: "ondo-solana" });

  it("opens a Base to Solana funding request and does not trade when on-chain USDC is short", async () => {
    // Every dollar is on Base. The Solana wallet holds no USDC at all.
    portfolio.tokens = [usdc("base-mainnet", 100)];
    route.withdraw.mockResolvedValue({
      depositRequestId: "dep-1",
      txHash: "0xsourcetransfer",
      amountOut: "9900000",
      minAmountOut: "9500000",
    });

    const view = mount({ asset: solana() });
    await type(view, "10");
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(view.result.current.needsBaseToSolanaFunding).toBe(true);
    expect(route.withdraw).toHaveBeenCalledTimes(1);
    expect(route.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({
        originNetwork: "base-mainnet",
        destinationChainId: SOLANA_CHAIN_ID,
        destinationAsset: SOLANA_USDC_MINT,
        to: "SolanaWallet111",
        refundTo: "0xbaseWallet",
        // Exactly ten dollars of USDC in base units, no float rounding.
        amount: 10_000_000n,
      })
    );

    const saved = lastSettlement();
    expect(saved.requestId).toBe("dep-1");
    expect(saved.direction).toBe("base-to-solana");
    expect(saved.purchase).toEqual({
      assetAddress: "SoLONDO",
      assetSymbol: "ONDO",
      amountInRaw: "10000000",
      startingUsdcRaw: "0",
      minimumDeliveryRaw: "9500000",
      slippageBps: 50,
    });
    expect(view.result.current.settlementRequest).toEqual({
      id: "dep-1",
      direction: "base-to-solana",
    });

    // The purchase itself is left to the page-scope tracker. Nothing was built
    // and nothing was signed here.
    expect(rwaApi.buildAsync).not.toHaveBeenCalled();
    expect(rwaApi.execute).not.toHaveBeenCalled();
  });

  it("snapshots the Solana USDC balance already held before funding", async () => {
    portfolio.tokens = [
      usdc("base-mainnet", 100),
      usdc("solana-mainnet", 3, SOLANA_USDC_MINT),
      token({
        symbol: "SOL",
        network: "solana-mainnet",
        decimals: 9,
        balance: 1,
        rawBalance: "1000000000",
      }),
    ];
    route.withdraw.mockResolvedValue({
      depositRequestId: "dep-2",
      txHash: "0xsourcetransfer",
      amountOut: "7000000",
      minAmountOut: "6900000",
    });

    const view = mount({ asset: solana() });
    await type(view, "10");
    await act(async () => {
      await view.result.current.confirm();
    });

    const saved = lastSettlement();
    // The order may only ever spend the increase above this figure.
    expect(saved.purchase?.startingUsdcRaw).toBe("3000000");
  });
});

describe("the Solana sale handoff", () => {
  const solanaAsset = asset({
    chain: "solana",
    address: "SoLONDO",
    id: "ondo-solana",
    priceUsd: "2",
  });

  function holdings(): TokenBalance[] {
    return [
      usdc("solana-mainnet", 1.5, SOLANA_USDC_MINT),
      token({
        symbol: "ONDO",
        network: "solana-mainnet",
        address: "solondo",
        decimals: 9,
        balance: 5,
        rawBalance: "5000000000",
        priceUsd: 2,
        valueUsd: 10,
      }),
    ];
  }

  beforeEach(() => {
    portfolio.tokens = holdings();
    rwaApi.quoteAsync.mockResolvedValue(quoteResult("12000000", "11400000"));
    rwaApi.buildAsync.mockResolvedValue(
      action({
        chain: "solana",
        quote: quoteResult("12000000", "11400000").best ?? undefined,
        steps: [
          {
            id: "step-1",
            kind: "sign-transaction",
            chain: "solana",
            description: "Swap",
            tx: { format: "solana", base64: "AAA=" },
          },
        ],
      })
    );
  });

  it("writes a sale handoff with the minimum proceeds and builds unsimulated", async () => {
    const view = mount({ asset: solanaAsset, initialSide: "sell" });
    await type(view, "5");
    await act(async () => {
      await view.result.current.confirm();
    });

    // A simulated Solana build produces a transaction that cannot be submitted.
    expect(rwaApi.buildAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: "solana",
        inputToken: "SoLONDO",
        outputToken: SOLANA_USDC_MINT,
        amountIn: "5000000000",
        taker: "SolanaWallet111",
        simulate: false,
      })
    );

    const saved = lastSettlement();
    expect(saved.requestId).toBe("rwa-sale:uuid-1");
    expect(saved.direction).toBe("solana-to-base");
    expect(saved.sale).toEqual({
      startingUsdcRaw: "1500000",
      minimumProceedsRaw: "11400000",
      expectedProceedsRaw: "12000000",
      slippageBps: 50,
    });
    expect(rwaApi.execute).toHaveBeenCalledTimes(1);
    expect(settlements.clear).not.toHaveBeenCalled();
  });

  it("clears the handoff record when the trade throws after it was written", async () => {
    rwaApi.execute.mockRejectedValue(
      Object.assign(new Error("wallet refused"), { code: "SIMULATION_FAILED" })
    );

    const view = mount({ asset: solanaAsset, initialSide: "sell" });
    await type(view, "5");
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(settlements.save).toHaveBeenCalledTimes(1);
    expect(settlements.clear).toHaveBeenCalledWith("rwa-sale:uuid-1");
    expect(view.result.current.notice?.kind).toBe("error");
    expect(view.result.current.phase).toBe("quoted");
  });

  it("writes no handoff record at all when the build throws", async () => {
    rwaApi.buildAsync.mockRejectedValue(
      Object.assign(new Error("no route"), { code: "SIMULATION_FAILED" })
    );

    const view = mount({ asset: solanaAsset, initialSide: "sell" });
    await type(view, "5");
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(settlements.save).not.toHaveBeenCalled();
    expect(settlements.clear).not.toHaveBeenCalled();
    expect(rwaApi.execute).not.toHaveBeenCalled();
  });

  it("refuses to sell when the built quote carries no proceeds", async () => {
    rwaApi.buildAsync.mockResolvedValue(action({ chain: "solana", quote: undefined, steps: [] }));
    rwaApi.quoteAsync.mockResolvedValue(quoteResult("0", "0"));

    const view = mount({ asset: solanaAsset, initialSide: "sell" });
    await type(view, "5");
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(settlements.save).not.toHaveBeenCalled();
    expect(rwaApi.execute).not.toHaveBeenCalled();
    expect(view.result.current.notice?.kind).toBe("error");
  });
});

describe("execution gates", () => {
  it("blocks the trade with an amber notice when the chain needs native gas and there is none", async () => {
    // Arbitrum without its gas policy: the wallet pays its own fee there, and
    // this wallet holds USDC but no ETH.
    gas.sponsored = false;
    portfolio.tokens = [usdc("arb-mainnet", 100)];

    const view = mount({
      asset: asset({ chain: "arbitrum", address: "0xARBONDO", id: "ondo-arbitrum" }),
    });
    await type(view, "10");
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(view.result.current.notice).toEqual({ kind: "gas", message: "gasNeeded" });
    expect(rwaApi.buildAsync).not.toHaveBeenCalled();
    expect(rwaApi.execute).not.toHaveBeenCalled();
  });

  it("builds and executes a sponsored EVM buy without a settlement record", async () => {
    const view = mount({ asset: asset() });
    await type(view, "10");
    await act(async () => {
      await view.result.current.confirm();
    });

    expect(rwaApi.buildAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: "base",
        inputToken: USDC_BY_CHAIN.base.address,
        outputToken: "0xONDO",
        amountIn: "10000000",
        taker: "0xbaseWallet",
        // Only Solana forces an unsimulated build.
        simulate: undefined,
      })
    );
    expect(rwaApi.execute).toHaveBeenCalledTimes(1);
    expect(settlements.save).not.toHaveBeenCalled();
    expect(view.result.current.phase).toBe("done");
  });
});

describe("sizing a sell", () => {
  it("stages exactly the raw balance for a 100% sell", async () => {
    const raw = "123456789012345678";
    portfolio.tokens = [
      token({
        symbol: "ONDO",
        network: "base-mainnet",
        address: "0xondo",
        decimals: 18,
        // The float balance is already lossy at this size; the base-unit
        // string is the only exact figure.
        balance: 0.12345678901234568,
        rawBalance: raw,
        priceUsd: 2,
        valueUsd: 0.25,
      }),
    ];

    const view = mount({ asset: asset(), initialSide: "sell" });
    await act(async () => {
      view.result.current.fillSellPct(1);
    });

    expect(view.result.current.amount).toBe("0.123456789012345678");
    expect(view.result.current.overBalance).toBe(false);

    // And the request that goes out carries the same base units the wallet
    // holds, not a rounded float.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(rwaApi.quoteAsync).toHaveBeenCalledWith(expect.objectContaining({ amountIn: raw }));
  });
});

describe("switching side", () => {
  it("clears the amount and the quote, because the legs are priced in different assets", async () => {
    portfolio.tokens = [
      usdc("base-mainnet", 500),
      token({
        symbol: "ONDO",
        network: "base-mainnet",
        address: "0xondo",
        decimals: 18,
        balance: 3,
        rawBalance: "3000000000000000000",
        priceUsd: 2,
        valueUsd: 6,
      }),
    ];

    const view = mount({ asset: asset() });
    await type(view, "10");
    expect(view.result.current.quote).not.toBeNull();

    await act(async () => {
      view.result.current.setSide("sell");
    });
    await flush();

    expect(view.result.current.side).toBe("sell");
    expect(view.result.current.amount).toBe("");
    expect(view.result.current.quote).toBeNull();
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.notice).toBeNull();
  });
});
