import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseMessages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import type { MemeToken } from "@/lib/meme/api";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";

// The chrome's six keys ship in the `markets` namespace now, so the suite reads
// the real catalogue rather than a local stand-in. That is the point: a stub
// here would keep passing if a key were ever dropped from messages/*.json.
const messages = baseMessages;

const spot = vi.hoisted(() => ({
  markets: [] as SpotMarket[],
  loading: false,
  error: null as unknown,
}));
vi.mock("@/features/trade/hooks/use-spot-markets", () => ({
  useSpotMarkets: () => spot,
}));

const memes = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  isLoading: false,
  error: null as unknown,
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useTrendingMemes: () => memes,
}));

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));
// This suite mounts the phone view directly, so it always renders as mobile; the
// md handoff to /spot etc. is exercised by the route pages, not here.
vi.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => true }));

// The hosted panels are other agents' components. They are stubbed so this
// suite tests the chrome, and so a change inside them cannot fail it.
// The mobile Memecoins tab drives TradeTicket directly (its own trade
// state lives in mobile-market-view.tsx), so this suite mocks the hooks that
// state is built from, the same way meme-board.test.tsx does for the same
// wiring. TradeTicket itself has its own suite (meme-trade-ticket.test.tsx),
// so it is stubbed here too: this suite tests the hosting, not the ticket.
const memeTrade = vi.hoisted(() => vi.fn());
vi.mock("@/features/trade/hooks/use-meme-trade", () => ({
  useMemeTrade: () => ({
    walletFor: () => "0xwallet",
    phase: "idle",
    error: null,
    trade: memeTrade,
  }),
  useMemePreview: () => ({ data: null, isFetching: false, error: null }),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [],
    refetchUntilChanged: vi.fn(),
    refetchFresh: vi.fn(),
  }),
}));

type MockTicketProps = {
  token: { symbol: string; address: string; chainId: number };
  side: "BUY" | "SELL";
  onSubmit: (input: {
    side: "BUY" | "SELL";
    tokenAddress: string;
    amount: string;
    chainId: number;
  }) => void;
};
const memeTicketProps = vi.hoisted(() => ({ last: null as MockTicketProps | null }));
vi.mock("@/features/trade/components/meme-trade-ticket", () => ({
  TradeTicket: (props: MockTicketProps) => {
    memeTicketProps.last = props;
    return (
      <div data-testid="meme-trade-ticket">
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              side: props.side,
              tokenAddress: props.token.address,
              amount: "1",
              chainId: props.token.chainId,
            })
          }
        >
          submit trade
        </button>
      </div>
    );
  },
  USD_DECIMALS: 6,
}));

// The sheet is only ever handed a Solana order from submitMemeTrade's own
// chain check, so this stub also proves which token and side it was handed.
const memeSheetProps = vi.hoisted(() => ({
  last: null as { token: { symbol: string }; defaultSide?: string } | null,
}));
vi.mock("@/features/trade/components/meme-trade-sheet", () => ({
  MemeTradeSheet: (props: {
    token: { symbol: string };
    defaultSide?: string;
    onClose: () => void;
  }) => {
    memeSheetProps.last = props;
    return (
      <div data-testid="meme-sheet">
        <button type="button" onClick={props.onClose}>
          close sheet
        </button>
      </div>
    );
  },
}));

// The spot ticket is its own component with its own suite. Stubbed here so this
// suite tests the hosting: which market it is handed, and the way back.
const ticketProps = vi.hoisted(() => ({ last: null as { market: { symbol: string } } | null }));
vi.mock("@/features/trade/components/spot-ticket", () => ({
  SpotTicket: (props: { market: { symbol: string }; onChangeMarket: () => void }) => {
    ticketProps.last = props;
    return (
      <div data-testid="spot-ticket">
        <button type="button" onClick={props.onChangeMarket}>
          change market
        </button>
      </div>
    );
  },
}));

import { MobileMarketView } from "@/features/trade/components/mobile-market-view";

function market(over: Partial<SpotMarket> = {}): SpotMarket {
  return {
    symbol: "BTC",
    name: "Bitcoin",
    priceUsd: 64072.55,
    change24h: 2.2,
    marketCap: 1e12,
    logo: null,
    coingeckoId: "bitcoin",
    ...over,
  } as SpotMarket;
}

function renderView() {
  const onOpenDetail = vi.fn();
  const onOpenBuy = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileMarketView
        onOpenDetail={onOpenDetail}
        onOpenBuy={onOpenBuy}
        predictionSlot={<div data-testid="prediction-panel" />}
        rwaSlot={(query) => <div data-testid="rwa-panel" data-query={query} />}
      />
    </NextIntlClientProvider>
  );
  return { onOpenDetail, onOpenBuy };
}

const tabNames = ["Spot", "Memecoins", "Real assets", "Prediction"];

function tabs() {
  return within(screen.getByRole("tablist")).getAllByRole("tab");
}

function marketList(): HTMLElement {
  return screen.getByTestId("spot-market-list");
}

function memeMarketList(): HTMLElement {
  return screen.getByTestId("meme-market-list");
}

// n markets, distinct symbols, so a pagination test can tell page 1 from
// page 2 by which symbols are on screen.
function markets(n: number): SpotMarket[] {
  return Array.from({ length: n }, (_, i) => market({ symbol: `SYM${i}`, name: `Symbol ${i}` }));
}

function memeTokens(n: number): MemeToken[] {
  return Array.from({ length: n }, (_, i) =>
    memeToken({ symbol: `MEME${i}`, name: `Meme ${i}`, address: `0xmeme${i}` })
  );
}

beforeEach(() => {
  spot.markets = [market()];
  spot.loading = false;
  spot.error = null;
  memes.tokens = [];
  memes.isLoading = false;
  memes.error = null;
  router.push.mockClear();
  router.back.mockClear();
  memeTrade.mockClear();
  memeTicketProps.last = null;
  memeSheetProps.last = null;
});

describe("MobileMarketView chrome", () => {
  // Gap 3: the strip is a real tab control, not a row of buttons.
  it("renders a labelled tablist of the four market categories", () => {
    renderView();
    const strip = screen.getByRole("tablist", { name: "Market categories" });
    const found = within(strip)
      .getAllByRole("tab")
      .map((t) => t.textContent?.trim());
    expect(found).toEqual(tabNames);
  });

  it("marks only the active tab selected and keeps it the sole tab stop", () => {
    renderView();
    const [spotTab, memeTab] = tabs();
    expect(spotTab).toHaveAttribute("aria-selected", "true");
    expect(spotTab).toHaveAttribute("tabindex", "0");
    expect(memeTab).toHaveAttribute("aria-selected", "false");
    expect(memeTab).toHaveAttribute("tabindex", "-1");

    fireEvent.click(memeTab);
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs()[1]).toHaveAttribute("tabindex", "0");
    expect(tabs()[0]).toHaveAttribute("tabindex", "-1");
  });

  it("exposes the active panel as a tabpanel named by its tab", () => {
    renderView();
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName("Spot");

    fireEvent.click(tabs()[3]);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Prediction");
    expect(screen.getByTestId("prediction-panel")).toBeInTheDocument();
  });

  it("moves selection with arrow keys and Home/End, not with Tab", () => {
    renderView();
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs()[1], { key: "End" });
    expect(tabs()[3]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs()[3], { key: "Home" });
    expect(tabs()[0]).toHaveAttribute("aria-selected", "true");

    // Wraps backwards from the first tab to the last.
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
  });

  // Gap 5: the strip scrolls, so a selected tab off-screen must be brought in.
  it("scrolls the newly selected tab into view", () => {
    renderView();
    const scrollIntoView = vi.fn();
    const target = tabs()[3];
    target.scrollIntoView = scrollIntoView;
    fireEvent.keyDown(tabs()[0], { key: "End" });
    expect(scrollIntoView).toHaveBeenCalled();
  });

  // Gap 1: the comp shows the search field on all four screens. Hiding it moved
  // the strip up by 51px between tabs.
  it("keeps the search field mounted on every tab", () => {
    renderView();
    for (let i = 0; i < tabNames.length; i++) {
      fireEvent.click(tabs()[i]);
      expect(
        screen.getByPlaceholderText("Search"),
        `search missing on the ${tabNames[i]} tab`
      ).toBeInTheDocument();
    }
  });

  // A field that cannot filter the panel under it must say so rather than
  // silently swallow what the user types.
  it("disables the search field on tabs whose panel owns its own selection", () => {
    renderView();
    expect(screen.getByPlaceholderText("Search")).toBeEnabled();

    fireEvent.click(tabs()[1]);
    expect(screen.getByPlaceholderText("Search")).toBeEnabled();

    fireEvent.click(tabs()[2]);
    expect(screen.getByPlaceholderText("Search")).toBeEnabled();

    fireEvent.click(tabs()[3]);
    expect(screen.getByPlaceholderText("Search")).toBeDisabled();
  });

  // Gap 6: no user-facing literals left in the file.
  it("takes its chrome copy from the catalogue", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Real assets" })).toBeInTheDocument();
  });

  it("shows the catalogue's empty and error copy for the spot list", () => {
    spot.markets = [];
    spot.error = new Error("down");
    renderView();
    expect(screen.getByText("Markets are unavailable right now.")).toBeInTheDocument();
  });

  it("shows the catalogue's empty and error copy for the memecoin list", () => {
    memes.error = new Error("down");
    renderView();
    fireEvent.click(tabs()[1]);
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
  });

  // Behaviour that already worked and must survive the rework.
  it("clears the query when the category changes", () => {
    spot.markets = [market({ symbol: "BTC" }), market({ symbol: "ETH", name: "Ether" })];
    renderView();
    const field = screen.getByPlaceholderText("Search");
    fireEvent.change(field, { target: { value: "eth" } });
    expect(screen.queryByText("BTC")).toBeNull();

    fireEvent.click(tabs()[1]);
    fireEvent.click(tabs()[0]);
    expect(screen.getByPlaceholderText("Search")).toHaveValue("");
    expect(screen.getByText("BTC")).toBeInTheDocument();
  });

  // The Spot tab keeps its token list; a row tap opens the ticket for that one
  // market, the way the Memecoins tab opens its trade sheet.
  it("opens the ticket for the tapped market and puts the list away", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));

    expect(screen.getByTestId("spot-ticket")).toBeInTheDocument();
    expect(ticketProps.last?.market.symbol).toBe("BTC");
    expect(marketList()).not.toBeVisible();
  });

  it("comes back to the list from the ticket without leaving the page", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByTestId("spot-ticket")).not.toBeInTheDocument();
    expect(marketList()).toBeVisible();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("comes back to the list from the ticket's own market pill", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(screen.getByRole("button", { name: "change market" }));

    expect(screen.queryByTestId("spot-ticket")).not.toBeInTheDocument();
    expect(marketList()).toBeVisible();
  });

  // The list is not thrown away and rebuilt: whoever was eighty rows down comes
  // back to where they were, not to the top.
  it("keeps the list's scroll position across a trip into the ticket", () => {
    renderView();
    const list = marketList();
    // jsdom does not lay anything out, so scrollTop is a no-op property on it.
    // Standing in a real one makes both the save and the restore observable,
    // and makes an unmounted list fail: the replacement node would not carry it.
    let scrollTop = 0;
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    list.scrollTop = 420;

    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(marketList()).toBe(list);
    expect(list.scrollTop).toBe(420);
  });

  // The field cannot filter what is under it once the ticket is open, and this
  // view already holds that rule for the real assets and prediction panels.
  it("disables the search field while the ticket is open", () => {
    renderView();
    expect(screen.getByPlaceholderText("Search")).toBeEnabled();

    fireEvent.click(screen.getByText("BTC"));
    expect(screen.getByPlaceholderText("Search")).toBeDisabled();
  });

  it("puts the ticket away when the category changes", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(tabs()[1]);
    fireEvent.click(tabs()[0]);

    expect(screen.queryByTestId("spot-ticket")).not.toBeInTheDocument();
    expect(marketList()).toBeVisible();
  });

  // The Real assets tab hosts the desk's own section, composed by the route,
  // and only while its tab is selected.
  it("mounts the real assets slot only on its own tab, in a scroll box", () => {
    renderView();
    expect(screen.queryByTestId("rwa-panel")).not.toBeInTheDocument();

    fireEvent.click(tabs()[2]);
    const panel = screen.getByTestId("rwa-panel-scroll");
    expect(panel).toContainElement(screen.getByTestId("rwa-panel"));

    // The page's search box filters the list, through the slot.
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "gold" } });
    expect(screen.getByTestId("rwa-panel").dataset.query).toBe("gold");

    fireEvent.click(tabs()[0]);
    expect(screen.queryByTestId("rwa-panel")).not.toBeInTheDocument();
  });
});

// The Prediction tab hosts the phone market list
// (features/prediction/components/prediction-market-list.tsx). Prediction is its
// own feature and features never import each other, so the route composes it
// into the slot and this view only has to host it correctly.
describe("MobileMarketView, hosting the prediction list", () => {
  it("mounts the prediction slot only while its own tab is selected", () => {
    renderView();
    expect(screen.queryByTestId("prediction-panel")).not.toBeInTheDocument();

    fireEvent.click(tabs()[3]);
    expect(screen.getByTestId("prediction-panel")).toBeInTheDocument();

    // Leaving the tab takes it back down, so a reader who never opens
    // Prediction never pays for its feed.
    fireEvent.click(tabs()[0]);
    expect(screen.queryByTestId("prediction-panel")).not.toBeInTheDocument();
  });

  // The list is a tall stack of cards inside a fixed, non-scrolling page shell.
  // Without a scroll container of its own everything past the first two cards is
  // unreachable.
  it("gives the prediction list a scroll container of its own", () => {
    renderView();
    fireEvent.click(tabs()[3]);

    const panel = screen.getByTestId("prediction-panel-scroll");
    expect(panel).toContainElement(screen.getByTestId("prediction-panel"));
    expect(panel.className).toMatch(/overflow-y-auto/);
    expect(panel.className).toMatch(/min-h-0/);
  });
});

// Both list tabs fill the device: usePaged shows as many rows as the list box
// measures (useFitRows), then the shared foot pager
// (components/ui/list-pagination.tsx) walks the rest, the shared control. jsdom runs no layout, so the box measures zero and the
// page size falls back to eight, which is the size these cases page through.
describe("MobileMarketView, list pagination", () => {
  // The page label shows in two places at once: the visible pager and an
  // sr-only region that announces a page change to a screen reader. This is the
  // live region, which is unique and always reflects the current page (the
  // visible pager hides itself when there is only one page, the live region
  // does not).
  const liveStatus = () => document.querySelector('[aria-live="polite"].sr-only');

  it("shows only the first page of the spot list, with Prev disabled and Next enabled", () => {
    spot.markets = markets(10);
    renderView();

    expect(screen.getByText("SYM0")).toBeInTheDocument();
    expect(screen.getByText("SYM7")).toBeInTheDocument();
    expect(screen.queryByText("SYM8")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });

  it("pages the spot list forward and back, and disables Next on the last page", () => {
    spot.markets = markets(10);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("SYM8")).toBeInTheDocument();
    expect(screen.getByText("SYM9")).toBeInTheDocument();
    expect(screen.queryByText("SYM0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(screen.getByText("SYM0")).toBeInTheDocument();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });

  // A screen reader on the Next button must hear the page change without
  // focus moving off it.
  it("announces the spot list's page change through an aria-live region", () => {
    spot.markets = markets(10);
    renderView();

    const status = liveStatus();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Page 1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");
  });

  // Spot pages with the same shared pill control, not a
  // one-off icon button.
  it("gives the spot list the shared foot pager", () => {
    spot.markets = markets(10);
    renderView();

    expect(screen.getByRole("button", { name: "Prev" }).className).toMatch(/rounded-full/);
    expect(screen.getByRole("button", { name: "Next" }).className).toMatch(/rounded-full/);
  });

  it("resets the spot list to page 1 when a search narrows it", () => {
    spot.markets = markets(10);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    // Narrow to a single match, then clear back to the full list: page 1
    // either way, not the page 2 the reader left. One match fits a single page,
    // so the visible pager hides and only the live region reports it.
    const field = screen.getByPlaceholderText("Search");
    fireEvent.change(field, { target: { value: "SYM0" } });
    expect(liveStatus()).toHaveTextContent("Page 1 of 1");
    expect(screen.getByText("SYM0")).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "" } });
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
    expect(screen.getByText("SYM0")).toBeInTheDocument();
  });

  it("shows only the first page of the memecoin list, and pages it the same way", () => {
    memes.tokens = memeTokens(9);
    renderView();
    fireEvent.click(tabs()[1]);

    expect(screen.getByText("MEME0")).toBeInTheDocument();
    expect(screen.queryByText("MEME8")).not.toBeInTheDocument();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("MEME8")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("resets the memecoin list to page 1 when a search narrows it", () => {
    memes.tokens = memeTokens(9);
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "MEME0" } });
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "" } });
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });
});

// The design replaces the Memecoins tab's tap-to-modal flow with the same
// tap-to-screen pattern the Spot tab uses: the list is hidden, not unmounted,
// and a full-screen ticket takes its place.
describe("MobileMarketView, the memecoin tap-to-screen ticket", () => {
  it("opens a full-screen ticket for the tapped memecoin and puts the list away", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("PEPE"));

    expect(screen.getByTestId("meme-trade-ticket")).toBeInTheDocument();
    expect(memeTicketProps.last?.token.symbol).toBe("PEPE");
    expect(memeMarketList()).not.toBeVisible();
  });

  it("comes back to the memecoin list from the ticket without leaving the page", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByTestId("meme-trade-ticket")).not.toBeInTheDocument();
    expect(memeMarketList()).toBeVisible();
    expect(router.back).not.toHaveBeenCalled();
  });

  // The list is not thrown away and rebuilt: whoever was scrolled down comes
  // back to where they were, not to the top. Same technique as the Spot tab's
  // own ticket, proven the same way: a real scrollTop, not jsdom's no-op.
  it("keeps the memecoin list's scroll position across a trip into the ticket", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[1]);
    const list = memeMarketList();
    let scrollTop = 0;
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    list.scrollTop = 260;

    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(memeMarketList()).toBe(list);
    expect(list.scrollTop).toBe(260);
  });

  // Tapping the row opens the full-screen ticket, not the old overlay: the
  // sheet only ever appears from a submit inside the ticket (see the tests
  // below), never from the tap that used to open it directly.
  it("does not open the trade sheet from the row tap alone", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("PEPE"));

    expect(screen.queryByTestId("meme-sheet")).not.toBeInTheDocument();
  });

  // Base executes inline through useMemeTrade().trade(), the same as before:
  // no sheet involved.
  it("executes a Base memecoin order inline on submit, without opening the sheet", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe", chainId: 8453 })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(screen.getByRole("button", { name: "submit trade" }));

    expect(memeTrade).toHaveBeenCalledWith(
      expect.objectContaining({ tokenAddress: "0xpepe", chainId: 8453 })
    );
    expect(screen.queryByTestId("meme-sheet")).not.toBeInTheDocument();
  });

  // A Solana order needs the sheet's own pre-buy funding move and sale
  // settlement handoff (meme-board.tsx makes the same split for the same
  // reason), so submitting one hands it off rather than running it here.
  it("hands a Solana memecoin order to the trade sheet on submit, instead of running it inline", () => {
    memes.tokens = [memeToken({ symbol: "WIF", name: "dogwifhat", chainId: SOLANA_CHAIN_ID })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("WIF"));
    fireEvent.click(screen.getByRole("button", { name: "submit trade" }));

    expect(memeTrade).not.toHaveBeenCalled();
    expect(screen.getByTestId("meme-sheet")).toBeInTheDocument();
    expect(memeSheetProps.last?.token.symbol).toBe("WIF");
    expect(memeSheetProps.last?.defaultSide).toBe("BUY");
  });

  // Closing the sheet clears the hand-off without also leaving the ticket:
  // the reader is still on the coin they were trading, not bounced to the list.
  it("closes the trade sheet back to the ticket, not out to the list", () => {
    memes.tokens = [memeToken({ symbol: "WIF", name: "dogwifhat", chainId: SOLANA_CHAIN_ID })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("WIF"));
    fireEvent.click(screen.getByRole("button", { name: "submit trade" }));
    fireEvent.click(screen.getByRole("button", { name: "close sheet" }));

    expect(screen.queryByTestId("meme-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("meme-trade-ticket")).toBeInTheDocument();
    expect(memeMarketList()).not.toBeVisible();
  });

  it("puts the memecoin ticket away when the category changes", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[1]);
    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(tabs()[0]);
    fireEvent.click(tabs()[1]);

    expect(screen.queryByTestId("meme-trade-ticket")).not.toBeInTheDocument();
    expect(memeMarketList()).toBeVisible();
  });

  it("disables the search field while the memecoin ticket is open", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[1]);
    expect(screen.getByPlaceholderText("Search")).toBeEnabled();

    fireEvent.click(screen.getByText("PEPE"));
    expect(screen.getByPlaceholderText("Search")).toBeDisabled();
  });
});
