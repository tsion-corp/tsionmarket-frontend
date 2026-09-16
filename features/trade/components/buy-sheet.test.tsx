import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken } from "@/lib/meme/api";

// The spot buy sheet's swap path. A spot market Dextopus cannot route (DOGE,
// through cbDOGE on Base) settles through the memecoin trade engine, whose
// trade() asks the service for a quote straight away, with no preview in
// front of it. So the contract's LOW_LIQUIDITY consent has to hold the Buy
// action itself: nothing may be quoted until the warning is accepted.

const swapToken = vi.hoisted(() => ({ token: null as MemeToken | null }));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeToken: () => ({ token: swapToken.token, isLoading: false, unavailable: null }),
}));

const trade = vi.hoisted(() =>
  vi.fn(async () => ({ outcome: "confirmed", swapId: "swap-1", requestId: null }))
);
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({
    phase: "idle",
    error: null,
    received: null,
    settled: null,
    swapId: null,
    requestId: null,
    trade,
  }),
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [{ network: "base-mainnet", symbol: "USDC", balance: 500 }],
    loading: false,
    refetchUntilChanged: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-deposit", () => ({
  useDepositChains: () => ({ data: [] }),
  useDepositStatus: () => ({ data: undefined }),
}));
vi.mock("@/features/trade/hooks/use-buy-catalog", () => ({
  useBuyDestinations: () => ({ data: [] }),
}));
vi.mock("@/features/trade/hooks/use-buy", () => ({
  useBuy: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));
vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({ format: (usd: number) => `$${usd}` }),
}));
vi.mock("@/components/share/share-to-square", () => ({ ShareToSquare: () => null }));
vi.mock("@/features/trade/components/spot-mode", () => ({
  useSpotMode: () => ({ mode: "simple" }),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(() => "t1"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

import { BuySheet } from "@/features/trade/components/buy-sheet";

const LOW = { code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." };
const buyLabel = messages.buySell.buyToken.replace("{name}", "Dogecoin");

function renderSheet() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BuySheet payload={{ symbol: "DOGE", name: "Dogecoin", priceUsd: 0.1 }} onClose={() => {}} />
    </NextIntlClientProvider>
  );
}

function typeAmount(value: string) {
  fireEvent.change(screen.getByPlaceholderText("0"), { target: { value } });
}

beforeEach(() => {
  trade.mockClear();
});

describe("BuySheet swap path and the low-liquidity consent", () => {
  it("holds the buy for a LOW_LIQUIDITY token until the warning is accepted", () => {
    swapToken.token = memeToken({
      symbol: "cbDOGE",
      address: "0xcbd06e5a2b0c65597161de254aa074e489deb510",
      warnings: [LOW],
    });
    renderSheet();
    typeAmount("10");

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(LOW.message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: buyLabel })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "I understand, continue" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const buy = screen.getByRole("button", { name: buyLabel });
    expect(buy).toBeEnabled();
    fireEvent.click(buy);
    expect(trade).toHaveBeenCalledTimes(1);
  });

  it("cancels by clearing the amount, and quotes nothing", () => {
    swapToken.token = memeToken({
      symbol: "cbDOGE2",
      address: "0xcbd06e5a2b0c65597161de254aa074e489deb511",
      warnings: [LOW],
    });
    renderSheet();
    typeAmount("10");
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" })
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("");
    expect(trade).not.toHaveBeenCalled();
  });

  it("never asks for a token without the warning", () => {
    swapToken.token = memeToken({ symbol: "cbDOGE3", address: "0xcbdoge3", warnings: [] });
    renderSheet();
    typeAmount("10");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: buyLabel })).toBeEnabled();
  });
});
