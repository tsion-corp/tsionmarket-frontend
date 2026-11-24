import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenBalance } from "@/hooks/use-portfolio";
import type { MemeToken } from "@/lib/meme/api";

// The modal reads copy from the portfolio catalog. The real English strings are
// returned rather than the key names, so the assertions below are the words a
// user actually reads; an unknown key still surfaces as its path and fails
// loudly. "searchHoldings" is the one string this feature adds.
const MESSAGES: Record<string, Record<string, string>> = {
  portfolio: {
    yourHoldings: "Your holdings",
    searchHoldings: "Search your holdings",
    searchPlaceholder: "Search",
    noSearchMatches: "No holdings match your search.",
    emptyTitle: "Your portfolio is empty",
    emptyBody: "Add funds to get started.",
    addFunds: "Add funds",
    errorTitle: "Couldn't load your portfolio",
    errorBody: "We couldn't reach your balances just now.",
    tryAgain: "Try again",
    holdings: "Holdings",
    marketPrice: "Market price",
    network: "Network",
    positionValue: "Position value",
    buyMore: "Buy more",
    managePrediction: "Manage in Prediction",
    sell: "Sell",
    kindCoin: "Coin",
    kindStablecoin: "Stablecoin",
    kindRwa: "RWA",
    kindToken: "Token",
    valuationUnavailable: "Valuation unavailable",
    holdingsViewsLabel: "What you hold",
    holdingsViewCoins: "Coins",
    holdingsViewMemecoins: "Memecoins",
  },
};
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// The currency layer is a store plus a live FX query; neither is what this
// modal is under test for, so it formats plain dollars here.
vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({
    format: (usd: number) => `$${usd.toFixed(2)}`,
    formatExact: (usd: number) => `$${usd.toFixed(2)}`,
  }),
}));

const portfolio = vi.hoisted(() => ({ usePortfolio: vi.fn() }));
vi.mock("@/hooks/use-portfolio", () => portfolio);

// The Memecoins view has its own suite (meme-positions.test.tsx). Here it is a
// stand-in that says it mounted and offers one sale, which is all the sheet is
// responsible for: when it mounts, and where that sale goes.
const memeView = vi.hoisted(() => ({
  mounts: 0,
  token: {
    chainId: 8453,
    address: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
    name: "Ethoswarm",
    symbol: "MENTE",
    decimals: 18,
    logoUrl: null,
    priceUsd: "1.5",
    liquidityUsd: "80000",
    volume24hUsd: "1000",
    priceChange24hPercent: "3",
    marketCapUsd: null,
    fdvUsd: null,
    pairAddress: "0xpair",
    dexName: "Uniswap",
    riskLevel: "LOW",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
  } satisfies MemeToken,
}));
vi.mock("@/features/portfolio/components/meme-positions", () => ({
  MemePositions: ({ onSell }: { onSell: (token: MemeToken) => void }) => {
    memeView.mounts += 1;
    return (
      <button type="button" onClick={() => onSell(memeView.token)}>
        Sell MENTE position
      </button>
    );
  },
}));

import { HoldingsModal } from "@/features/portfolio/components/holdings-modal";

function token(over: Partial<TokenBalance> = {}): TokenBalance {
  return {
    symbol: "LINK",
    name: "Chainlink",
    network: "eth-mainnet",
    address: "0x514910771af9ca656af840dff83e8264ecf986ca",
    decimals: 18,
    kind: "token",
    balance: 12,
    rawBalance: "12000000000000000000",
    priceUsd: 20,
    valueUsd: 240,
    logo: null,
    ...over,
  };
}

function setPortfolio(
  over: Partial<{
    tokens: TokenBalance[];
    loading: boolean;
    error: boolean;
    refetch: () => void;
  }> = {}
) {
  const refetch = vi.fn();
  portfolio.usePortfolio.mockReturnValue({
    tokens: [],
    loading: false,
    error: false,
    refetch,
    ...over,
  });
  return refetch;
}

const handlers = () => ({
  onClose: vi.fn(),
  onOpenDetail: vi.fn(),
  onOpenBuy: vi.fn(),
  onOpenSell: vi.fn(),
  onOpenRwaTrade: vi.fn(),
  onOpenMemeSell: vi.fn(),
  onAddFunds: vi.fn(),
});

function renderModal(props: Partial<ReturnType<typeof handlers>> = {}) {
  const all = { ...handlers(), ...props };
  render(<HoldingsModal {...all} />);
  return all;
}

/**
 * Dust, and the one holding that looks like dust but is not.
 *
 * A position worth less than a cent renders as "<$0.01", which tells the owner
 * nothing. Worse, it is what a wallet looks like straight after selling the
 * whole position: a remainder too small to round to a cent reads as though the
 * sale never happened.
 */
describe("HoldingsModal dust", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("hides a position worth less than a cent", () => {
    setPortfolio({
      tokens: [
        token({ symbol: "LINK", valueUsd: 240 }),
        token({
          symbol: "syrupUSDC",
          name: "Syrup USDC",
          balance: 0.0042,
          rawBalance: "4200",
          priceUsd: 1,
          valueUsd: 0.0042,
        }),
      ],
    });
    renderModal();
    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(screen.queryByText("syrupUSDC")).not.toBeInTheDocument();
  });

  /**
   * The carve-out that must survive. valueUsd is balance x price, so a real
   * balance we could not price is $0 through no fault of the owner. Hiding it
   * would tell them they do not hold something they do.
   */
  it("keeps a real balance we could not price", () => {
    setPortfolio({
      tokens: [
        token({
          symbol: "HYPE",
          name: "Hyperliquid",
          balance: 4,
          rawBalance: "4000000000000000000",
          priceUsd: 0,
          valueUsd: 0,
        }),
      ],
    });
    renderModal();
    expect(screen.getByText("HYPE")).toBeInTheDocument();
  });

  it("keeps a position worth exactly a cent", () => {
    setPortfolio({
      tokens: [token({ symbol: "USOR", name: "Usor", priceUsd: 1, valueUsd: 0.01 })],
    });
    renderModal();
    expect(screen.getByText("USOR")).toBeInTheDocument();
  });
});

describe("HoldingsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("lists only the assets the wallet actually holds", () => {
    setPortfolio({
      tokens: [
        token(),
        // A supported asset the user holds none of: the portfolio always
        // reports it, and it is not a holding.
        token({ symbol: "UNI", name: "Uniswap", balance: 0, rawBalance: "0", valueUsd: 0 }),
        // The USDC-on-Base deposit float is spendable cash, not a position.
        token({
          symbol: "USDC",
          name: "USD Coin",
          network: "base-mainnet",
          rawBalance: "500000",
          balance: 0.5,
          valueUsd: 0.5,
        }),
      ],
    });
    renderModal();

    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(screen.queryByText("UNI")).toBeNull();
    expect(screen.queryByText("USDC")).toBeNull();
  });

  it("counts a balance too small to show as a holding, because base units say it is one", () => {
    // One wei of ETH renders as a rounded quantity but is genuinely held, so a
    // float test would have dropped the row.
    setPortfolio({
      tokens: [
        token({
          symbol: "ETH",
          name: "Ethereum",
          address: null,
          balance: 1e-18,
          rawBalance: "1",
          valueUsd: 0,
        }),
      ],
    });
    renderModal();

    expect(screen.getByText("ETH")).toBeInTheDocument();
  });

  it("filters the list from the search field", () => {
    setPortfolio({
      tokens: [token(), token({ symbol: "AAVE", name: "Aave" })],
    });
    renderModal();

    const search = screen.getByRole("searchbox", { name: "Search your holdings" });
    fireEvent.change(search, { target: { value: "aav" } });

    expect(screen.getByText("AAVE")).toBeInTheDocument();
    expect(screen.queryByText("LINK")).toBeNull();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No holdings match your search.")).toBeInTheDocument();
  });

  it("shows the empty state, with a way to fund, when nothing is held", () => {
    setPortfolio({ tokens: [] });
    const { onAddFunds } = renderModal();

    expect(screen.getByText("Your portfolio is empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(onAddFunds).toHaveBeenCalled();
  });

  it("draws placeholder rows while the balances are loading", () => {
    setPortfolio({ loading: true });
    renderModal();

    expect(screen.queryByText("Your portfolio is empty")).toBeNull();
    expect(screen.queryByText("Couldn't load your portfolio")).toBeNull();
  });

  it("offers a retry when the balances could not be loaded", () => {
    const refetch = setPortfolio({ error: true, tokens: [] });
    renderModal();

    expect(screen.getByText("Couldn't load your portfolio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("keeps showing cached balances when a refresh failed", () => {
    setPortfolio({ error: true, tokens: [token()] });
    renderModal();

    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your portfolio")).toBeNull();
  });

  it("opens the asset sheet for a held token, carrying both buy and sell", () => {
    setPortfolio({ tokens: [token()] });
    const { onClose, onOpenDetail, onOpenBuy, onOpenSell } = renderModal();

    fireEvent.click(screen.getByText("LINK"));

    expect(onClose).toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    const detail = onOpenDetail.mock.calls[0][0];
    expect(detail.sym).toBe("LINK");

    detail.onCta();
    expect(onOpenBuy).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "LINK", priceUsd: 20 })
    );

    detail.onCta2();
    // The exact on-chain amount travels with the sell, not the display float.
    expect(onOpenSell).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "LINK", rawBalance: "12000000000000000000" })
    );
  });

  it("routes a held RWA to the RWA panel rather than the swap sheets", () => {
    setPortfolio({
      tokens: [token({ symbol: "TSLAx", name: "Tesla", kind: "rwa", network: "base-mainnet" })],
    });
    const { onOpenDetail, onOpenRwaTrade, onOpenBuy } = renderModal();

    fireEvent.click(screen.getByText("TSLAx"));
    const detail = onOpenDetail.mock.calls[0][0];

    detail.onCta();
    detail.onCta2();
    expect(onOpenBuy).not.toHaveBeenCalled();
    expect(onOpenRwaTrade).toHaveBeenCalledWith(expect.objectContaining({ mode: "buy" }));
    expect(onOpenRwaTrade).toHaveBeenCalledWith(expect.objectContaining({ mode: "sell" }));
  });

  it("routes a held catalog memecoin to the meme trade sheet", () => {
    setPortfolio({
      tokens: [token({ symbol: "PEPE", name: "Pepe", network: "base-mainnet", meme: true })],
    });
    const { onOpenDetail, onOpenMemeSell, onOpenSell } = renderModal();

    fireEvent.click(screen.getByText("PEPE"));
    onOpenDetail.mock.calls[0][0].onCta2();

    expect(onOpenMemeSell).toHaveBeenCalledWith(expect.objectContaining({ symbol: "PEPE" }));
    expect(onOpenSell).not.toHaveBeenCalled();
  });

  // The catalogue could not price this coin. Its balance is real, so it is
  // listed, but its value is unknown, not "$0.00".
  it("says a held meme it cannot price is valuation unavailable, never $0.00", () => {
    setPortfolio({
      tokens: [
        token({
          symbol: "PEPE",
          name: "Pepe",
          network: "base-mainnet",
          address: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
          meme: true,
          priceUsd: 0,
          valueUsd: 0,
        }),
      ],
    });
    const { onOpenDetail } = renderModal();

    expect(screen.getByText("Valuation unavailable")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).toBeNull();

    fireEvent.click(screen.getByText("PEPE"));
    const detail = onOpenDetail.mock.calls[0][0];
    expect(detail.price).toBe("Valuation unavailable");
    expect(JSON.stringify(detail.stats)).not.toContain("$0.00");
  });

  // It opened every held meme on Base's 8453, so a Solana coin's sale was
  // quoted on the wrong chain.
  it("opens a held Solana meme's sale on Solana, with the mint as written", () => {
    const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    setPortfolio({
      tokens: [
        token({
          symbol: "BONK",
          name: "Bonk",
          network: "solana-mainnet",
          address: mint,
          meme: true,
        }),
      ],
    });
    const { onOpenDetail, onOpenMemeSell } = renderModal();

    fireEvent.click(screen.getByText("BONK"));
    onOpenDetail.mock.calls[0][0].onCta2();

    expect(onOpenMemeSell).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 101, address: mint })
    );
  });

  it("locks the page behind it and releases it again", () => {
    setPortfolio({ tokens: [token()] });
    const { unmount } = render(<HoldingsModal {...handlers()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

// The trigger, the modal, and the close path together: what the topbar's coins
// button actually does to focus.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Your holdings
      </button>
      {open ? <HoldingsModal {...handlers()} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe("HoldingsModal focus handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPortfolio({ tokens: [token()] });
  });

  // Focus lands on the dialog, not in the search field: on a phone, focusing
  // the field raises the keyboard over the very list the reader opened this to
  // look at. Typing is a choice they make by tapping the field.
  it("takes focus into the dialog without opening the keyboard, and hands it back on Escape", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Your holdings" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    const search = screen.getByRole("searchbox", { name: "Search your holdings" });
    expect(document.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(search);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Your holdings" }));

    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("input, button"));
    const last = focusable[focusable.length - 1];
    last.focus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("HoldingsModal sizing and hover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPortfolio({ tokens: [token()] });
  });

  it("lets the list use much more of the window", () => {
    renderModal();
    const list = screen.getByText("LINK").closest("button")?.parentElement as HTMLElement;
    // The old cap, min(52vh,420px), showed about five rows on a 900px screen.
    // The view switch above the search field costs about 55px, so the list's
    // budget grows by the same to keep the panel itself from scrolling.
    expect(list.className).toContain("max-h-[min(88vh_-_215px,660px)]");
    expect(list.className).toContain("overflow-y-auto");
  });

  it("opts an asset row out of the global button lift, keeping the colour hover", () => {
    renderModal();
    const row = screen.getByText("LINK").closest("button") as HTMLElement;
    // globals.css applies ws-pressable to every button through @layer base with
    // :where(...:not([data-no-ripple])). The row's hover scale lives there, not
    // here, so the attribute is the only way out of it.
    expect(row).toHaveAttribute("data-no-ripple");
    // The movement goes, the feedback stays, and it still cross-fades.
    expect(row.className).toContain("hover:bg-white/6");
    expect(row.className).toContain("transition-colors");
  });
});

describe("HoldingsModal views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memeView.mounts = 0;
    setPortfolio({ tokens: [token()] });
  });

  it("opens on Coins, and asks nothing of the memecoin service until Memecoins is picked", () => {
    renderModal();
    expect(screen.getByRole("tab", { name: "Coins" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("searchbox", { name: "Search your holdings" })).toBeInTheDocument();
    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(memeView.mounts).toBe(0);
  });

  it("swaps the coin list for the memecoin positions, and back", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Memecoins" }));

    expect(screen.getByRole("tab", { name: "Memecoins" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Memecoins");
    expect(screen.getByRole("button", { name: "Sell MENTE position" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("LINK")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Coins" }));
    expect(screen.getByText("LINK")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sell MENTE position" })).toBeNull();
  });

  it("closes the sheet and hands a memecoin position's sale to the meme trade sheet", () => {
    const { onClose, onOpenMemeSell } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Memecoins" }));
    fireEvent.click(screen.getByRole("button", { name: "Sell MENTE position" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenMemeSell).toHaveBeenCalledWith(memeView.token);
  });
});
