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
  error: null as unknown,
  received: null as { amount: string; symbol: string } | null,
  swapId: null as string | null,
  requestId: null as string | null,
  trade: vi.fn(async (): Promise<unknown> => undefined),
  reset: vi.fn(),
  linkForPreview: vi.fn(async () => {}),
  quotedFee: null as string | null,
}));

// useMemePreview's shape since the expiry watch moved into it: the quote (null
// once lapsed), whether it lapsed, and the query's own state. `consented`
// records what each render told it about the risk consent.
const previewHook = vi.hoisted(() => ({
  quote: null as unknown,
  expired: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
  consented: [] as boolean[],
}));

vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({
    walletFor: () => tradeHook.wallet,
    phase: tradeHook.phase,
    error: tradeHook.error,
    received: tradeHook.received,
    swapId: tradeHook.swapId,
    requestId: tradeHook.requestId,
    trade: tradeHook.trade,
    reset: tradeHook.reset,
    linkForPreview: tradeHook.linkForPreview,
    quotedFee: tradeHook.quotedFee,
  }),
  useMemePreview: (_input: unknown, consented: boolean) => {
    previewHook.consented.push(consented);
    return previewHook;
  },
}));

const tokenHook = vi.hoisted(() => ({
  unavailable: null as "temporary" | "not-found" | null,
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeToken: (listed: MemeToken) => ({ token: listed, unavailable: tokenHook.unavailable }),
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
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: analytics.track }));
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
  const element = () => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeTradeSheet {...props} token={token} onClose={onClose} />
    </NextIntlClientProvider>
  );
  const view = render(element());
  // Re-renders against the hook double's current state.
  const rerender = () => view.rerender(element());
  return { onClose, token, view, rerender };
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
  tokenHook.unavailable = null;
  tradeHook.wallet = "0xwallet";
  tradeHook.phase = "idle";
  tradeHook.error = null;
  tradeHook.received = null;
  tradeHook.swapId = null;
  tradeHook.requestId = null;
  tradeHook.trade.mockReset();
  tradeHook.trade.mockResolvedValue(undefined);
  tradeHook.quotedFee = null;
  previewHook.quote = null;
  previewHook.expired = false;
  previewHook.isFetching = false;
  previewHook.error = null;
  previewHook.consented = [];
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
    // useMemePreview has watched expiresAt pass (pinned in use-meme-trade.test.tsx)
    // and hands back no quote, marked expired.
    previewHook.quote = null;
    previewHook.expired = true;
    renderSheet();
    await typeAmount("5");
    expect(screen.queryByText(/4\.0651/)).toBeNull();
    expect(screen.queryByText(/3\.9832/)).toBeNull();
    expect(cta()).toBeDisabled();
    expect(cta()).toHaveTextContent(messages.meme.quoteExpired);
    fireEvent.click(screen.getByRole("button", { name: messages.meme.retry }));
    expect(previewHook.refetch).toHaveBeenCalled();
  });

  it("does not show the previous amount's quote against a freshly typed one", async () => {
    previewHook.quote = swapPreview();
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

// The trade service's CONFIRMED is the only success. When the swap's own
// receipt proves delivery but the service has not (or will not) confirm it,
// the sheet says exactly that, with the reference support will ask for, and
// never "bought" or "sold". A poll that ran out of time is "pending": closable,
// and equally careful about what it claims.
describe("the outcome is the service's word, not the receipt's", () => {
  async function placeTrade(result: { outcome: string; swapId: string; requestId: string | null }) {
    previewHook.quote = swapPreview();
    tradeHook.trade.mockResolvedValue(result);
    const sheet = renderSheet();
    await typeAmount("5");
    fireEvent.click(cta());
    await waitFor(() => expect(tradeHook.trade).toHaveBeenCalled());
    return sheet;
  }

  it("says delivered, never bought, when the service has not confirmed", async () => {
    const { rerender } = await placeTrade({
      outcome: "delivered",
      swapId: "swap-1",
      requestId: "req-1",
    });
    await waitFor(() => expect(toastCalls.success).toHaveBeenCalled());
    const toast = String(toastCalls.success.mock.calls[0][0]);
    expect(toast).toMatch(/delivered on-chain/i);
    expect(toast).toContain("swap-1");
    expect(toast).toContain("req-1");
    expect(toast).not.toMatch(/bought/i);

    tradeHook.phase = "delivered";
    tradeHook.received = { amount: "4.0651", symbol: "PEPE" };
    tradeHook.swapId = "swap-1";
    tradeHook.requestId = "req-1";
    rerender();
    expect(screen.getByTestId("meme-phase-title")).toHaveTextContent("Delivered on-chain");
    expect(screen.getByRole("dialog")).toHaveTextContent(/still recording this trade/i);
    expect(screen.getByRole("dialog")).toHaveTextContent("swap-1 · req-1");
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/trade confirmed/i);
    expect(screen.getByRole("button", { name: messages.meme.done })).toBeEnabled();
  });

  it("says confirmed only when the service said CONFIRMED", async () => {
    const { rerender } = await placeTrade({
      outcome: "confirmed",
      swapId: "swap-1",
      requestId: null,
    });
    await waitFor(() =>
      expect(toastCalls.success).toHaveBeenCalledWith("Bought PEPE", expect.anything())
    );
    tradeHook.phase = "confirmed";
    rerender();
    expect(screen.getByTestId("meme-phase-title")).toHaveTextContent(messages.meme.confirmedTitle);
  });

  it("is pending and closable when the poll ran out of time", async () => {
    const { rerender, onClose } = await placeTrade({
      outcome: "pending",
      swapId: "swap-9",
      requestId: null,
    });
    await waitFor(() => expect(toastCalls.success).toHaveBeenCalled());
    expect(String(toastCalls.success.mock.calls[0][0])).not.toMatch(/bought|sold|confirmed/i);

    tradeHook.phase = "pending";
    tradeHook.swapId = "swap-9";
    rerender();
    expect(screen.getByTestId("meme-phase-title")).toHaveTextContent(messages.meme.pendingTitle);
    expect(screen.getByRole("dialog")).toHaveTextContent("swap-9");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call an on-chain receipt done while the service is still confirming", () => {
    tradeHook.phase = "confirming";
    tradeHook.received = { amount: "4.0651", symbol: "PEPE" };
    renderSheet();
    expect(screen.getByTestId("meme-phase-title")).toHaveTextContent("4.0651 PEPE received");
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("dialog")).not.toHaveTextContent(messages.meme.allDone);
  });
});

describe("a trade service failure reads as our copy with the reference", () => {
  it("shows the mapped copy and the requestId, never the upstream wording", () => {
    tradeHook.phase = "failed";
    tradeHook.error = Object.assign(new Error("route table miss in 0x"), {
      name: "TradeApiError",
      code: "NO_SWAP_ROUTE",
      status: 422,
      requestId: "req-x1",
    });
    renderSheet();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(messages.tradeErrors.noSwapRoute);
    expect(alert).toHaveTextContent("Ref: req-x1");
    expect(alert).not.toHaveTextContent("route table miss");
  });
});

// The contract: a null liquidityUsd is "unknown liquidity", shown as a neutral
// warning, with the quote left to decide whether a route exists. It is not
// low liquidity and it is not zero.
describe("unknown liquidity", () => {
  const LINE = "Liquidity unknown — the quote decides whether this trade can execute.";

  it("says liquidity is unknown when the service published none", () => {
    renderSheet({ token: memeToken({ symbol: "NEW", liquidityUsd: null }) });
    const line = screen.getByText(LINE);
    expect(line.className).not.toContain("text-down");
  });

  it("says nothing about liquidity it knows, zero included", () => {
    renderSheet({ token: memeToken({ symbol: "KNOWN", liquidityUsd: "0" }) });
    expect(screen.queryByText(LINE)).toBeNull();
  });
});

// A 502 on the detail read is temporary; a 404 is a confirmed absence. The
// sheet keeps the listed row either way and says which one it is.
describe("when the fresh token read fails", () => {
  it("says the token's details are temporarily unavailable on a provider outage", () => {
    tokenHook.unavailable = "temporary";
    renderSheet();
    const line = screen.getByText(
      "This token's details are temporarily unavailable. Trying again shortly."
    );
    expect(line).toHaveAttribute("role", "status");
  });

  it("says the token was not found when the service confirms it is absent", () => {
    tokenHook.unavailable = "not-found";
    renderSheet();
    expect(screen.getByText("This token wasn't found on its network.")).toBeInTheDocument();
  });

  it("says neither while the read is healthy", () => {
    renderSheet();
    expect(screen.queryByText(/temporarily unavailable/)).toBeNull();
    expect(screen.queryByText(/wasn't found/)).toBeNull();
  });
});

// The platform fee is the service's figure, in USDC: the preview's on the form,
// and, once a Solana quote is in hand, that quote's own fee while it executes.
describe("the platform fee", () => {
  function feeRow() {
    return screen.getByText("Platform fee").parentElement as HTMLElement;
  }

  it("shows the preview's formatted fee in USDC", async () => {
    previewHook.quote = swapPreview({ platformFeeAmountFormatted: "0.05" });
    renderSheet();
    await typeAmount("5");
    expect(feeRow()).toHaveTextContent("0.05 USDC");
  });

  it("shows the Solana quote's fee while the trade runs", () => {
    tradeHook.phase = "confirming";
    tradeHook.quotedFee = "123456789012345.678901";
    renderSheet();
    expect(feeRow()).toHaveTextContent("123456789012345.678901 USDC");
  });

  it("shows no fee row while a trade runs on a quote that stated none", () => {
    tradeHook.phase = "confirming";
    renderSheet();
    expect(screen.queryByText("Platform fee")).toBeNull();
  });
});

// LOW_LIQUIDITY is the contract's one consent flow: confirmed before a quote is
// asked for. The gate is the preview hook's `consented`; the sheet hosts the
// dialog that opens it.
describe("the low-liquidity consent", () => {
  const LOW = { code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." };

  it("asks before any preview, the first time an amount is entered, and continues on acceptance", async () => {
    renderSheet({ token: memeToken({ symbol: "THINSHEET", warnings: [LOW] }) });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await typeAmount("5");
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(LOW.message)).toBeInTheDocument();
    expect(previewHook.consented.every((c) => c === false)).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "I understand, continue" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(previewHook.consented.at(-1)).toBe(true);
  });

  it("cancels on Escape without closing the sheet beneath it, and sends nothing", async () => {
    const { onClose } = renderSheet({ token: memeToken({ symbol: "THINESC", warnings: [LOW] }) });
    await typeAmount("5");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("You pay") as HTMLInputElement).value).toBe("");
    expect(previewHook.consented.at(-1)).toBe(false);
  });

  it("never asks for a token without the warning", async () => {
    renderSheet();
    await typeAmount("5");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(previewHook.consented.every((c) => c === true)).toBe(true);
  });
});

// A sale reports what it is worth in dollars and how many tokens it moved.
// Sending the typed token count as amount_usd is what put $1.26M of phantom
// memecoin volume into Mixpanel.
describe("what a trade reports", () => {
  const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const sellQuote = () =>
    swapPreview({
      side: "SELL",
      sellToken: memeToken({ symbol: "PEPE", decimals: 18 }),
      buyToken: { address: BASE_USDC, symbol: "USDC", decimals: 6 },
      sellAmountAtomic: "1000000000000000000000000",
      expectedBuyAmountAtomic: "5000000",
    });
  const reported = (event: string) =>
    analytics.track.mock.calls.filter(([name]) => name === event).map(([, p]) => p);

  beforeEach(() => {
    analytics.track.mockClear();
    portfolio.tokens = [
      {
        network: "base-mainnet",
        symbol: "PEPE",
        address: "0xpepe",
        balance: 2_000_000,
        rawBalance: "2000000000000000000000000",
        decimals: 18,
      },
    ];
  });

  async function sell(result: unknown) {
    previewHook.quote = sellQuote();
    tradeHook.trade.mockResolvedValue(result);
    renderSheet({ defaultSide: "SELL" });
    fireEvent.change(screen.getByLabelText("You sell"), { target: { value: "1000000" } });
    await tick(700);
    fireEvent.click(cta());
    await waitFor(() => expect(tradeHook.trade).toHaveBeenCalled());
  }

  it("previews a sale in dollars, with the tokens as the quantity", async () => {
    await sell({
      outcome: "confirmed",
      swapId: "s1",
      requestId: null,
      amounts: null,
      txHash: null,
    });
    expect(reported("trade_previewed")).toEqual([
      {
        vertical: "memecoin",
        asset: "PEPE",
        side: "sell",
        amount_usd: 5,
        token_quantity: 1_000_000,
      },
    ]);
  });

  it("reports a sale at the USDC the swap proved, never the token count", async () => {
    await sell({
      outcome: "confirmed",
      swapId: "s1",
      requestId: null,
      amounts: { amount_usd: 4.97, token_quantity: 1_000_000, amount_source: "fill" },
      txHash: "0xswap",
    });
    await waitFor(() => expect(reported("trade_completed")).toHaveLength(1));
    expect(reported("trade_completed")[0]).toMatchObject({
      vertical: "memecoin",
      asset: "PEPE",
      side: "sell",
      amount_usd: 4.97,
      token_quantity: 1_000_000,
      amount_source: "fill",
      recorded: "confirmed",
      order_id: "s1",
      tx_hash: "0xswap",
    });
  });

  it("reports a dismissed wallet as a cancellation, with what the trade was worth", async () => {
    // A user saying no is not a failed trade; counted as one, it made the
    // memecoin failure rate look like an outage.
    previewHook.quote = sellQuote();
    tradeHook.trade.mockRejectedValue(Object.assign(new Error("User rejected"), { code: 4001 }));
    renderSheet({ defaultSide: "SELL" });
    fireEvent.change(screen.getByLabelText("You sell"), { target: { value: "1000000" } });
    await tick(700);
    fireEvent.click(cta());
    await waitFor(() => expect(reported("trade_failed")).toHaveLength(1));
    expect(reported("trade_failed")[0]).toEqual({
      vertical: "memecoin",
      asset: "PEPE",
      side: "sell",
      reason: "user_cancelled",
      amount_usd: 5,
    });
  });

  it("falls back to the quote's proceeds when the swap could not be priced", async () => {
    await sell({
      outcome: "delivered",
      swapId: "s2",
      requestId: null,
      amounts: null,
      txHash: null,
    });
    await waitFor(() => expect(reported("trade_completed")).toHaveLength(1));
    expect(reported("trade_completed")[0]).toMatchObject({
      side: "sell",
      amount_usd: 5,
      token_quantity: 1_000_000,
      amount_source: "quote",
      recorded: "delivered",
    });
  });
});
