import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { TradePhase } from "@/features/trade/hooks/use-meme-trade";
import type { MemeToken, SwapPreview } from "@/lib/meme/api";

// This sheet executes trades. Every assertion below is about a state a user
// can be left in with money in flight, so the doubles stand in for the wallet,
// the quote and the portfolio, and the sheet itself is the thing under test.

// Matches lib/meme/chain: the trade service keys Solana as 101, not the
// cluster id the settlement layer uses.
const SOLANA_CHAIN_ID = 101;

const tradeHook = vi.hoisted(() => ({
  wallet: "0xwallet" as string | null,
  phase: "idle" as TradePhase,
  error: null as string | null,
  received: null as { amount: string; symbol: string } | null,
  trade: vi.fn(async () => {}),
  reset: vi.fn(),
  linkForPreview: vi.fn(async () => {}),
}));

const previewHook = vi.hoisted(() => ({
  data: null as unknown,
  isFetching: false,
  error: null as unknown,
  dataUpdatedAt: 0,
  refetch: vi.fn(),
}));

vi.mock("@/features/trade/hooks/use-meme-trade", () => ({
  useMemeTrade: () => ({
    walletFor: () => tradeHook.wallet,
    phase: tradeHook.phase,
    error: tradeHook.error,
    received: tradeHook.received,
    trade: tradeHook.trade,
    reset: tradeHook.reset,
    linkForPreview: tradeHook.linkForPreview,
  }),
  useMemePreview: () => previewHook,
}));

vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeToken: (listed: MemeToken) => ({ token: listed }),
}));

const portfolio = vi.hoisted(() => ({
  tokens: [] as {
    network: string;
    symbol: string;
    address?: string | null;
    balance: number;
    rawBalance?: string;
    decimals?: number;
  }[],
  refetchUntilChanged: vi.fn(),
  refetchFresh: vi.fn(),
}));
vi.mock("@/hooks/use-portfolio", () => ({ usePortfolio: () => portfolio }));

const routeUsdc = vi.hoisted(() =>
  vi.fn(async () => ({ depositRequestId: "req-1", minAmountOut: "1" }))
);
vi.mock("@/hooks/use-withdraw", () => ({ useReroutedWithdraw: () => ({ withdraw: routeUsdc }) }));

vi.mock("@privy-io/react-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@privy-io/react-auth")>()),
  usePrivy: () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/user", () => ({ getWalletAddress: () => "0xwallet" }));

const toastCalls = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: toastCalls }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));
vi.mock("@/lib/trade/solana-balance", () => ({ fetchConfirmedSolanaBalance: async () => 0n }));
vi.mock("@/lib/trade/pending-settlement", () => ({
  savePendingRwaSettlement: vi.fn(),
  clearPendingRwaSettlement: vi.fn(),
}));

import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";

function swapPreview(overrides: Partial<SwapPreview> = {}): SwapPreview {
  return {
    side: "BUY",
    chainId: 8453,
    walletAddress: "0xwallet",
    sellToken: memeToken({ symbol: "USDC", decimals: 6 }),
    buyToken: memeToken({ symbol: "PEPE" }),
    sellAmountAtomic: "5000000",
    sellAmountFormatted: "5",
    expectedBuyAmountAtomic: "4000000000000000000",
    expectedBuyAmountFormatted: "4.0651",
    minimumBuyAmountAtomic: "3900000000000000000",
    minimumBuyAmountFormatted: "3.9832",
    priceImpactBps: 125,
    slippageBps: 100,
    platformFeeAmountAtomic: "0",
    platformFeeAmountFormatted: "0",
    liquidityAvailable: true,
    approvalRequired: false,
    riskLevel: "LOW",
    warnings: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

function renderSheet(props: Partial<React.ComponentProps<typeof MemeTradeSheet>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const token = props.token ?? memeToken({ symbol: "PEPE" });
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeTradeSheet {...props} token={token} onClose={onClose} />
    </NextIntlClientProvider>
  );
  return { onClose, token, view };
}

// Types an amount and lets the 600ms debounce through, which is what actually
// arms the quote and the submit button.
async function typeAmount(value: string) {
  fireEvent.change(screen.getByLabelText("You pay"), { target: { value } });
  await tick(700);
}

// Fake timers plus React 19: the state the timer sets has to be flushed inside
// act, or the render under test is the one from before the timer fired.
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function cta() {
  // The primary action is the last control inside the sheet itself. Scoped to
  // the dialog so the backdrop's own dismiss button is never mistaken for it.
  const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  tradeHook.wallet = "0xwallet";
  tradeHook.phase = "idle";
  tradeHook.error = null;
  tradeHook.received = null;
  tradeHook.trade.mockReset();
  tradeHook.trade.mockResolvedValue(undefined);
  previewHook.data = null;
  previewHook.isFetching = false;
  previewHook.error = null;
  previewHook.dataUpdatedAt = Date.now();
  routeUsdc.mockReset();
  routeUsdc.mockResolvedValue({ depositRequestId: "req-1", minAmountOut: "1" });
  toastCalls.loading.mockClear();
  toastCalls.success.mockClear();
  toastCalls.error.mockClear();
  portfolio.tokens = [
    {
      network: "base-mainnet",
      symbol: "USDC",
      balance: 1000,
      rawBalance: "1000000000",
      decimals: 6,
    },
  ];
  document.body.style.overflow = "";
});

describe("dismissal and focus", () => {
  it("is a modal dialog", () => {
    renderSheet();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close on Escape while a signature is in flight", () => {
    tradeHook.phase = "signing";
    const { onClose } = renderSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks the page behind it and restores the scroll on close", () => {
    const { view } = renderSheet();
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus into the sheet and returns it to the opener on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { view } = renderSheet();
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
    );
    view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("keeps Tab inside the sheet", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])"
    );
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it("clears the home indicator", () => {
    renderSheet();
    expect(screen.getByRole("dialog").className).toContain("env(safe-area-inset-bottom)");
  });
});

describe("the primary action always says why it cannot be used", () => {
  it("says the quote is still coming rather than sitting inert on Buy", async () => {
    previewHook.isFetching = true;
    renderSheet();
    await typeAmount("5");
    expect(cta()).toBeDisabled();
    expect(cta()).not.toHaveTextContent("Buy PEPE");
    expect(cta().textContent?.trim()).toBeTruthy();
  });

  it("says the wallet is missing rather than sitting inert on Buy", async () => {
    tradeHook.wallet = null;
    renderSheet();
    await typeAmount("5");
    expect(cta()).toBeDisabled();
    expect(cta()).toHaveTextContent(messages.meme.connectWallet);
  });
});

describe("a quote is never presented as current when it is not", () => {
  it("blanks the figures once the quote has expired and blocks the trade", async () => {
    previewHook.data = swapPreview({ expiresAt: new Date(Date.now() - 1_000).toISOString() });
    renderSheet();
    await typeAmount("5");
    expect(screen.queryByText(/4\.0651/)).toBeNull();
    expect(screen.queryByText(/3\.9832/)).toBeNull();
    expect(cta()).toBeDisabled();
  });

  it("does not show the previous amount's quote against a freshly typed one", async () => {
    previewHook.data = swapPreview();
    renderSheet();
    await typeAmount("5");
    expect(screen.getByText(/4\.0651/)).toBeInTheDocument();
    // Typed but not yet debounced: the numbers on screen belong to "5".
    fireEvent.change(screen.getByLabelText("You pay"), { target: { value: "50" } });
    expect(screen.queryByText(/4\.0651/)).toBeNull();
  });
});

describe("the Solana pre-move", () => {
  const solToken = () =>
    memeToken({
      symbol: "BONK",
      chainId: SOLANA_CHAIN_ID,
      address: "So11111111111111111111111111111111111111112",
    });

  beforeEach(() => {
    portfolio.tokens = [
      {
        network: "base-mainnet",
        symbol: "USDC",
        balance: 1000,
        rawBalance: "1000000000",
        decimals: 6,
      },
      { network: "solana-mainnet", symbol: "USDC", balance: 0, rawBalance: "0", decimals: 6 },
    ];
  });

  it("names the step it is on instead of an unlabelled zero-length bar", async () => {
    // Held open so the assertions land while the move is still in flight.
    const held: { release?: () => void } = {};
    routeUsdc.mockImplementation(
      () =>
        new Promise((resolve) => {
          held.release = () => resolve({ depositRequestId: "req-1", minAmountOut: "1" });
        })
    );
    renderSheet({ token: solToken() });
    await typeAmount("5");
    fireEvent.click(cta());
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("meme-phase-title").textContent?.trim()).toBeTruthy();
    held.release?.();
  });

  it("leaves a readable failure in the sheet, not only in a toast", async () => {
    routeUsdc.mockRejectedValue(new Error("route down"));
    renderSheet({ token: solToken() });
    await typeAmount("5");
    fireEvent.click(cta());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("confirms the order was queued instead of vanishing", async () => {
    const onClose = vi.fn();
    renderSheet({ token: solToken(), onClose });
    await typeAmount("5");
    fireEvent.click(cta());
    // 100%, and a Done the user has to press: the sheet does not evaporate on
    // a toast the user may never see.
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    );
    expect(screen.getByTestId("meme-phase-title").textContent?.trim()).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("a locked sheet is never a trap", () => {
  it("offers a way out once a signature has hung", async () => {
    tradeHook.phase = "signing";
    renderSheet();
    expect(screen.queryByTestId("meme-stuck")).toBeNull();
    await tick(61_000);
    expect(screen.getByTestId("meme-stuck")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.meme.closeAndNotify })).toBeEnabled();
  });
});

describe("amounts", () => {
  it("reads the sell balance off the base units, not the float", async () => {
    // 123.456789012345678901 PEPE: the last digits are the ones a float drops.
    portfolio.tokens = [
      {
        network: "base-mainnet",
        symbol: "PEPE",
        address: "0xpepe",
        balance: 123.45678901234568,
        rawBalance: "123456789012345678901",
        decimals: 18,
      },
    ];
    renderSheet({ defaultSide: "SELL" });
    expect(screen.getByText(/123\.4567/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect((screen.getByLabelText("You sell") as HTMLInputElement).value).toBe(
      "123.456789012345678901"
    );
  });
});
