import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken, SwapDetail } from "@/lib/meme/api";

// The phone memecoin screen: the coin being traded, both sides of the ticket,
// the two disclosures and the transactions feed under them.
//
// The suite reads the shipped catalogue rather than a local stand-in, so a key
// dropped from messages/*.json fails here instead of passing against a stub.
const messages = enMessages;

const catalog = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  pageCount: 1,
  isLoading: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const search = vi.hoisted(() => ({
  results: [] as MemeToken[],
  searching: false,
  active: false,
  error: null as unknown,
}));
const trending = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeCatalog: () => catalog,
  useMemeSearch: () => search,
  useTrendingMemes: () => trending,
}));

const trade = vi.hoisted(() => vi.fn());
vi.mock("@/features/trade/hooks/use-meme-trade", () => ({
  useMemeTrade: () => ({
    walletFor: () => "0xwallet",
    phase: "idle",
    error: null,
    trade,
  }),
  useMemePreview: () => ({ data: null, isFetching: false, error: null }),
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [
      {
        network: "base-mainnet",
        symbol: "USDC",
        address: "0xusdc",
        balance: 250,
        rawBalance: "250000000",
        decimals: 6,
      },
      {
        network: "base-mainnet",
        symbol: "AAA",
        address: "0xaaa",
        // Past 2^53 base units on purpose: the sell side must read the string.
        balance: 12345.6789,
        rawBalance: "12345678900000000000000",
        decimals: 18,
      },
    ],
    refetchUntilChanged: vi.fn(),
    refetchFresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-coingecko-id", () => ({
  useCoingeckoId: () => ({ id: null, loading: false }),
}));
vi.mock("@/features/trade/components/meme-trade-sheet", () => ({
  MemeTradeSheet: () => <div>trade sheet</div>,
}));

const swaps = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchSwapHistory: (...args: unknown[]) => swaps.fetch(...args),
}));

import { MemeBoard } from "@/features/trade/components/meme-board";

function swap(over: Partial<SwapDetail> = {}): SwapDetail {
  return {
    id: "swap-1",
    walletAddress: "0xwallet",
    chainId: 8453,
    side: "BUY",
    status: "CONFIRMED",
    sellTokenAddress: "0xusdc",
    buyTokenAddress: "0xaaa",
    sellTokenDecimals: 6,
    buyTokenDecimals: 18,
    sellAmountAtomic: "500000000",
    quotedBuyAmountAtomic: "4500000000000000000000000",
    actualSellAmountAtomic: null,
    actualBuyAmountAtomic: "4500000000000000000000000",
    failureCode: null,
    failureReason: null,
    createdAt: new Date(Date.now() - 2_000).toISOString(),
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function renderBoard() {
  return render(<MemeBoard />, { wrapper });
}

const aaa = memeToken({ symbol: "AAA", priceUsd: "0.00001234", priceChange24hPercent: "14.25" });

beforeEach(() => {
  vi.clearAllMocks();
  catalog.tokens = [aaa];
  catalog.isLoading = false;
  catalog.error = null;
  search.active = false;
  search.results = [];
  trending.tokens = [aaa];
  swaps.fetch.mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });
});

describe("the coin the phone screen is trading", () => {
  it("heads the screen with the pair, the move and the price", async () => {
    renderBoard();
    const header = await screen.findByRole("button", { name: /AAA\/USDC/ });
    expect(header).toBeInTheDocument();
    expect(screen.getByText("+14.25%")).toBeInTheDocument();
  });

  it("draws a sub-cent price with counted zeros rather than a run of them", async () => {
    renderBoard();
    // 0.00001234 is four leading zeros: the price label counts them.
    expect(await screen.findByText("$0.0₄1234")).toBeInTheDocument();
  });

  it("opens the catalogue from the pair control and trades what is picked", async () => {
    catalog.tokens = [aaa, memeToken({ symbol: "BBB" })];
    trending.tokens = [];
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /AAA\/USDC/ }));
    fireEvent.click(await screen.findByRole("button", { name: /BBB coin/ }));
    expect(await screen.findByRole("button", { name: /BBB\/USDC/ })).toBeInTheDocument();
  });
});

describe("figures the service does not publish", () => {
  it("says Unavailable rather than showing a zero market cap", async () => {
    catalog.tokens = [
      memeToken({ symbol: "AAA", marketCapUsd: null, volume24hUsd: null, liquidityUsd: "0" }),
    ];
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /Market Metrics/ }));
    const panel = screen.getByRole("group", { name: "Market metrics" });
    // Market cap, volume, liquidity, age and the trader split: none of them are
    // published for this coin, and none of them render as a figure.
    expect(within(panel).getAllByText("Unavailable").length).toBe(5);
    expect(within(panel).queryByText("$0")).toBeNull();
  });
});

describe("the two sides of the ticket", () => {
  it("names the action after the coin and the side, and marks the side pressed", async () => {
    renderBoard();
    const sell = await screen.findByRole("button", { name: "Sell", pressed: false });
    fireEvent.click(sell);
    expect(await screen.findByRole("button", { name: "Sell", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell AAA" })).toBeInTheDocument();
  });

  it("refuses an amount over the spendable balance", async () => {
    renderBoard();
    fireEvent.change(await screen.findByLabelText("Quantity"), { target: { value: "400" } });
    expect(await screen.findByRole("button", { name: "Not enough balance" })).toBeInTheDocument();
  });

  it("sells the exact holding rather than a rounded float of it", async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: "Sell", pressed: false }));
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(screen.getByLabelText("Quantity")).toHaveValue("12345.6789");
  });
});

describe("the transactions feed", () => {
  it("says it is loading before the first answer", async () => {
    let release: (value: unknown) => void = () => {};
    swaps.fetch.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderBoard();
    expect(await screen.findByRole("status", { name: "Live transactions" })).toBeInTheDocument();
    release({ items: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it("offers a retry when the feed fails", async () => {
    swaps.fetch.mockRejectedValue(new Error("nope"));
    renderBoard();
    expect(await screen.findByText("Transactions couldn't be loaded.")).toBeInTheDocument();
    swaps.fetch.mockResolvedValue({ items: [swap()], meta: { page: 1, limit: 20, total: 1 } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("meme-tx-row")).toBeInTheDocument());
  });

  it("says the feed is empty rather than drawing an empty card", async () => {
    renderBoard();
    expect(await screen.findByText("No transactions in this coin yet.")).toBeInTheDocument();
  });

  it("renders a row with its side, its exact amount and how long ago it landed", async () => {
    swaps.fetch.mockResolvedValue({ items: [swap()], meta: { page: 1, limit: 20, total: 1 } });
    renderBoard();
    const row = await screen.findByTestId("meme-tx-row");
    expect(within(row).getByText("Buy")).toBeInTheDocument();
    expect(row).toHaveTextContent("4,500,000 AAA");
    expect(row).toHaveTextContent(/\d+s ago/);
  });

  it("leaves out a swap in another coin and one that never landed", async () => {
    swaps.fetch.mockResolvedValue({
      items: [
        swap({ id: "other-coin", buyTokenAddress: "0xzzz" }),
        swap({ id: "failed", status: "FAILED" }),
      ],
      meta: { page: 1, limit: 20, total: 2 },
    });
    renderBoard();
    expect(await screen.findByText("No transactions in this coin yet.")).toBeInTheDocument();
  });
});
