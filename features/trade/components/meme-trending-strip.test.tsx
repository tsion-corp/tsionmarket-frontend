import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/lib/meme/fixture";
import { catalogKey } from "@/lib/meme/catalog";

// The real motion library runs in jsdom; only the reduced-motion reading is
// steered, so both the staggered entry and its reduced path are exercised.
const motionPrefs = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => motionPrefs.reduce };
});

const {
  MemeTrendingStrip,
  TRENDING_DESK_HEIGHT,
  TRENDING_MIN_CARD_PX,
  TRENDING_ROW_MIN_PX,
  TRENDING_DESK_PAGE_SIZE,
  TRENDING_PHONE_PAGE_SIZE,
  reloadPage,
} = await import("@/features/trade/components/meme-trending-strip");
type StripProps = Parameters<typeof MemeTrendingStrip>[0];

const pepe = memeToken({
  symbol: "PEPE",
  name: "Pepe coin",
  priceUsd: "1.5",
  activity: {
    "1h": { volumeUsd: "900", transactions: 10, traders: 4, priceChangePercent: "12.34" },
  },
});
const wif = memeToken({
  symbol: "WIF",
  name: "Wif coin",
  activity: {
    "1h": { volumeUsd: null, transactions: null, traders: null, priceChangePercent: "-35" },
  },
});
const bonk = memeToken({
  symbol: "BONK",
  name: "Bonk coin",
  activity: {
    "1h": { volumeUsd: "10", transactions: null, traders: null, priceChangePercent: null },
  },
});

function renderStrip(overrides: Partial<StripProps> = {}) {
  const props: StripProps = {
    variant: "desk",
    tokens: [pepe, wif, bonk],
    rankOffset: 0,
    heat: new Map([
      [catalogKey(pepe), 100],
      [catalogKey(wif), null],
      [catalogKey(bonk), 1],
    ]),
    timeframe: "1h",
    page: 1,
    pages: 3,
    onPageChange: vi.fn(),
    filtered: false,
    isLoading: false,
    error: null,
    onRetry: vi.fn(),
    selectedKey: null,
    onSelect: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeTrendingStrip {...props} />
    </NextIntlClientProvider>
  );
  return { props, ...view };
}

function card(symbol: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${symbol},`) });
}

function root(container: HTMLElement): HTMLElement {
  const section = container.querySelector<HTMLElement>('[data-region="trending"]');
  if (section === null) throw new Error("no trending section rendered");
  return section;
}

beforeEach(() => {
  motionPrefs.reduce = false;
});

describe("MemeTrendingStrip sizes", () => {
  it("pages three cards on both surfaces, over a 172px floor", () => {
    expect(TRENDING_DESK_PAGE_SIZE).toBe(3);
    expect(TRENDING_PHONE_PAGE_SIZE).toBe(3);
    expect(TRENDING_DESK_HEIGHT).toBe(172);
  });

  it("holds a page to one row once the box fits three cards at their floor", () => {
    // Three 156px cards and the two 8px gaps between them.
    expect(TRENDING_ROW_MIN_PX).toBe(484);
    expect(TRENDING_ROW_MIN_PX).toBe(TRENDING_MIN_CARD_PX * 3 + 16);
  });
});

describe("MemeTrendingStrip cards", () => {
  it("shows each coin's rank, symbol, price and exact change for the window", () => {
    renderStrip();
    const pepeCard = card("PEPE");
    expect(within(pepeCard).getByText("#1")).toBeInTheDocument();
    expect(pepeCard).toHaveTextContent("PEPE");
    expect(pepeCard).toHaveTextContent("$1.5");
    const change = within(pepeCard).getByText("+12.34%");
    expect(change).toHaveClass("ws-display", "tnum", "text-up");
    expect(within(card("WIF")).getByText("-35.00%")).toHaveClass("text-down");
  });

  it("shows the what-if line and the momentum tag from the change", () => {
    renderStrip();
    expect(within(card("PEPE")).getByText("$100 → $112.34")).toBeInTheDocument();
    expect(within(card("PEPE")).getByText("Pumping")).toBeInTheDocument();
    expect(within(card("WIF")).getByText("Dumping")).toBeInTheDocument();
    expect(within(card("WIF")).getByText("$100 → $65.00")).toBeInTheDocument();
  });

  it("renders a dash and no what-if or momentum when the change is missing", () => {
    renderStrip();
    const bonkCard = card("BONK");
    expect(within(bonkCard).getByText("—")).toBeInTheDocument();
    expect(within(bonkCard).queryByText(/\$100 →/)).toBeNull();
    expect(bonkCard.querySelector("[data-momentum]")).toBeNull();
    expect(bonkCard).toHaveAccessibleName("BONK, rank 3, Data pending over 1h");
  });

  it("fills each heat bar from the shares it is given", () => {
    renderStrip();
    const width = (el: HTMLElement) =>
      el.querySelector<HTMLElement>("[data-heat] .rounded-full > .rounded-full")?.style.width;
    expect(width(card("PEPE"))).toBe("100%");
    expect(width(card("BONK"))).toBe("1%");
    expect(width(card("WIF"))).toBe("0%");
    expect(within(card("WIF")).getByText("No volume data")).toBeInTheDocument();
  });

  it("continues the ranks across pages from the offset", () => {
    // The offset a surface hands down for page two of a three-a-page strip.
    renderStrip({ rankOffset: TRENDING_DESK_PAGE_SIZE, page: 2 });
    expect(within(card("PEPE")).getByText("#4")).toBeInTheDocument();
    expect(card("BONK")).toHaveAccessibleName(/rank 6/);
  });

  it("names a card by symbol, rank, signed change and window, never by the coin's name", () => {
    renderStrip();
    expect(card("PEPE")).toHaveAccessibleName("PEPE, rank 1, +12.34% over 1h");
    expect(screen.queryByRole("button", { name: /coin/ })).toBeNull();
  });

  it("marks the selected coin and hands a picked coin back", () => {
    const { props } = renderStrip({ selectedKey: catalogKey(wif) });
    expect(card("WIF")).toHaveAttribute("aria-current", "true");
    expect(card("WIF")).toHaveClass("bg-white/6");
    expect(card("PEPE")).not.toHaveAttribute("aria-current");
    fireEvent.click(card("PEPE"));
    expect(props.onSelect).toHaveBeenCalledWith(pepe);
  });
});

describe("MemeTrendingStrip header and pager", () => {
  it("titles the strip with the window, or with the filters when filtered", () => {
    const { unmount } = renderStrip();
    expect(screen.getByRole("heading", { name: "Trending now" })).toBeInTheDocument();
    expect(screen.getByText("Hottest coins over 1h")).toBeInTheDocument();
    unmount();
    renderStrip({ filtered: true });
    expect(screen.getByText("Hottest coins matching your filters")).toBeInTheDocument();
  });

  it("moves between pages and disables the ends", () => {
    const first = renderStrip({ page: 1, pages: 3 });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    const prev = screen.getByRole("button", { name: "Previous trending page" });
    const next = screen.getByRole("button", { name: "Next trending page" });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(first.props.onPageChange).toHaveBeenCalledWith(2);
    first.unmount();

    const last = renderStrip({ page: 3, pages: 3 });
    expect(screen.getByRole("button", { name: "Next trending page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous trending page" }));
    expect(last.props.onPageChange).toHaveBeenCalledWith(2);
  });

  // ~100 trending coins three a page is about 34 pages. The pager steps rather
  // than numbering, so the count it carries costs it nothing: two buttons and a
  // label, at 3 pages or at 34.
  it("stays two buttons and a label over a hundred coins' worth of pages", () => {
    const { container } = renderStrip({ page: 17, pages: 34 });
    expect(screen.getByText("17 / 34")).toBeInTheDocument();
    const header = container.querySelector<HTMLElement>('[data-region="trending"] .h-7');
    const buttons = within(header as HTMLElement).getAllByRole("button");
    // Refresh, Prev, Next, and no numbered page button behind them.
    expect(buttons).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /^Page \d/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Previous trending page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next trending page" })).toBeEnabled();
  });

  it("hides the pager when everything fits on one page", () => {
    renderStrip({ pages: 1 });
    expect(screen.queryByRole("button", { name: "Next trending page" })).toBeNull();
    expect(screen.queryByText("1 / 1")).toBeNull();
  });
});

describe("MemeTrendingStrip states", () => {
  it("shows hidden skeleton cards while loading, without the Loading label", () => {
    const { container } = renderStrip({ tokens: [], isLoading: true });
    const skeletons = container.querySelectorAll('[data-skeleton="trending-card"]');
    expect(skeletons).toHaveLength(TRENDING_DESK_PAGE_SIZE);
    skeletons.forEach((s) => expect(s.closest('[aria-hidden="true"]')).not.toBeNull());
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.queryByLabelText("Loading…")).toBeNull();
  });

  it("says trending is unavailable and retries on request", () => {
    const { props } = renderStrip({ tokens: [], error: new Error("502") });
    expect(screen.getByText("Trending is unavailable right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the cards it holds when a refresh fails", () => {
    renderStrip({ error: new Error("502") });
    expect(card("PEPE")).toBeInTheDocument();
    expect(screen.queryByText("Trending is unavailable right now.")).toBeNull();
  });

  it("says nothing is trending, in the view or under the filters", () => {
    const { unmount } = renderStrip({ tokens: [], pages: 1 });
    expect(screen.getByText("Nothing trending in this view yet.")).toBeInTheDocument();
    unmount();
    renderStrip({ tokens: [], pages: 1, filtered: true });
    expect(screen.getByText("No trending coins match your filters.")).toBeInTheDocument();
  });

  it.each<[string, Partial<StripProps>]>([
    ["data", {}],
    ["loading", { tokens: [], isLoading: true }],
    ["error", { tokens: [], error: new Error("502") }],
    ["empty", { tokens: [], pages: 1 }],
  ])("holds the desk card to one height in the %s state", (_state, overrides) => {
    const { container } = renderStrip(overrides);
    expect(root(container).style.minHeight).toBe(`${TRENDING_DESK_HEIGHT}px`);
    expect(root(container).style.height).toBe("");
  });

  // A page is three cards, and the box they sit in is not the same width on
  // the two surfaces at the same viewport: a desk's left column is about 480px
  // at 1024px, a phone's list about 360px. So the arrangement is chosen from
  // the box's own width. Three across once three fit at their 156px floor,
  // two with the third across the foot below that, and one a row under 320px,
  // where two no longer fit. No arrangement leaves a hole in a row.
  // Tailwind only generates a class it can read in the source, so these are
  // written out in the components. If a constant moves and the class does not,
  // the strip silently loses its sizing in the browser while jsdom sees a class
  // that was never built. These tests fail instead.
  it("keeps the written-out grid classes in step with the card and row widths", () => {
    const { container } = renderStrip();
    const scroller = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    expect(TRENDING_MIN_CARD_PX).toBe(156);
    expect(scroller?.className).toContain(`@min-[${TRENDING_ROW_MIN_PX}px]:grid-cols-3`);
    expect(scroller?.className).toContain(`@min-[${TRENDING_MIN_CARD_PX * 2 + 8}px]:grid-cols-2`);
  });

  it("draws three across at width, and never four", () => {
    const { container } = renderStrip();
    const scroller = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    expect(scroller).toHaveClass("grid");
    expect(scroller).not.toHaveClass("grid-cols-4");
    expect(scroller?.className).toContain("@min-[484px]:grid-cols-3");
  });

  it("lays the third card across the foot where only two fit, so no row has a hole", () => {
    const { container } = renderStrip();
    const scroller = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    expect(scroller?.className).toContain(
      "@min-[320px]:@max-[484px]:[&>*:nth-child(3)]:col-span-2"
    );
    // One card a row under 320px instead, where the span would push a card
    // past the box's edge.
    expect(scroller).toHaveClass("grid-cols-1");
  });

  it("measures the box the cards sit in, not the window", () => {
    const { container } = renderStrip();
    const scroller = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    // Without a container on an ancestor the queries would answer against the
    // viewport, and a phone would draw the desk's three across.
    expect(scroller?.parentElement).toHaveClass("@container");
  });

  it("lays the loading cards out on the same grid as the real ones", () => {
    const { container } = renderStrip({ tokens: [], isLoading: true });
    const skeletons = container.querySelector<HTMLElement>('[data-skeleton="trending-row"]');
    expect(skeletons?.className).toContain(`@min-[${TRENDING_ROW_MIN_PX}px]:grid-cols-3`);
    expect(skeletons?.parentElement).toHaveClass("@container");
  });
});

// Trending and the catalogue are both read once per page load and then held
// for the tab, so refreshing one query would leave the other stale under the
// same reader. Refresh reloads the page instead: one press, everything on
// screen read again.
describe("MemeTrendingStrip refresh", () => {
  it("reloads the page on a press", () => {
    const reload = vi.fn();
    renderStrip({ reload });
    fireEvent.click(screen.getByRole("button", { name: "Refresh trending" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("holds the control down after the press so a second reload cannot fire", () => {
    const reload = vi.fn();
    renderStrip({ reload });
    fireEvent.click(screen.getByRole("button", { name: "Refresh trending" }));
    // The page is on its way out, so the name, the spin and the held-down
    // state all stay put rather than snapping back to idle.
    const button = screen.getByRole("button", { name: "Refreshing trending" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
    fireEvent.click(button);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // The default the strip uses when no surface injects one. jsdom refuses to
  // let window.location.reload be replaced, which is why the strip takes the
  // reload as a prop at all; this covers the one line behind that default.
  it("reloads through the browser by default", () => {
    const target = { reload: vi.fn() };
    reloadPage(target);
    expect(target.reload).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<StripProps>]>([
    ["data", {}],
    ["loading", { tokens: [], isLoading: true }],
    ["error", { tokens: [], error: new Error("502") }],
    ["empty", { tokens: [], pages: 1 }],
  ])("offers refresh in the %s state", (_state, overrides) => {
    renderStrip(overrides);
    expect(screen.getByRole("button", { name: "Refresh trending" })).toBeEnabled();
  });

  it("keeps refresh in the header on a phone, above the cards and their pager", () => {
    const { container } = renderStrip({ variant: "phone" });
    const grid = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    const button = screen.getByRole("button", { name: "Refresh trending" });
    expect(grid?.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    // Beside the title rather than after it, so a long subtitle truncates
    // against the button instead of pushing it off the screen.
    expect(button.parentElement).toHaveClass("shrink-0");
  });
});

describe("MemeTrendingStrip motion", () => {
  it("staggers the cards in", () => {
    renderStrip();
    expect(card("PEPE").style.opacity).toBe("0");
  });

  it("draws the cards in place under reduced motion", () => {
    motionPrefs.reduce = true;
    renderStrip();
    expect(card("PEPE").style.opacity).not.toBe("0");
    expect(card("BONK").style.transform).not.toContain("translateY");
  });
});

// A phone showed the cards in a side-scroller, which cut the card at the
// screen's edge: a reader saw two whole cards and a third sliced down the
// middle, and read that as broken rather than as an invitation to swipe. The
// phone now uses the same grid the desk does, two by two, so every card on the
// page is whole and the pager moves between pages.
describe("MemeTrendingStrip on a phone", () => {
  it("lays whole cards on a grid, never a sliced one, with the pager under them", () => {
    const { container } = renderStrip({ variant: "phone" });
    const grid = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    expect(grid?.className).toContain(`@min-[${TRENDING_ROW_MIN_PX}px]:grid-cols-3`);
    expect(grid).not.toHaveClass("snap-x");
    expect(grid).not.toHaveClass("overflow-x-auto");
    expect(card("PEPE")).toHaveClass("min-w-0");
    expect(card("PEPE").className).not.toContain("w-[176px]");
    expect(root(container).style.height).toBe("");
    const pager = screen.getByRole("button", { name: "Next trending page" });
    expect(grid?.compareDocumentPosition(pager)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("pages three cards on a phone, so the narrow grid is two and one across the foot", () => {
    const { container } = renderStrip({ variant: "phone" });
    expect(TRENDING_PHONE_PAGE_SIZE).toBe(3);
    const grid = container.querySelector<HTMLElement>('[data-region="trending-scroller"]');
    expect(grid?.className).toContain("@min-[320px]:@max-[484px]:[&>*:nth-child(3)]:col-span-2");
  });

  it("shows a skeleton for every card of the page, on the same grid", () => {
    const { container } = renderStrip({ variant: "phone", tokens: [], isLoading: true });
    expect(container.querySelectorAll('[data-skeleton="trending-card"]')).toHaveLength(
      TRENDING_PHONE_PAGE_SIZE
    );
    const skeletons = container.querySelector<HTMLElement>('[data-skeleton="trending-row"]');
    expect(skeletons?.className).toContain(`@min-[${TRENDING_ROW_MIN_PX}px]:grid-cols-3`);
    // As tall as a real card, so the list under it does not jump when
    // trending lands.
    const skeleton = container.querySelector<HTMLElement>('[data-skeleton="trending-card"]');
    expect(skeleton).toHaveClass("h-[var(--trending-card-h)]");
  });
});
