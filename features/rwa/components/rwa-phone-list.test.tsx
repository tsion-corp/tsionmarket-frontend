import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";
import { RwaPhoneList } from "@/features/rwa/components/rwa-phone-list";
import type { TradePrefill } from "@/lib/voice/intent";

vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

// The real ticket drags the whole trade panel in with it: wallets, quotes and
// the settlement tracker. This tab's job is choosing an asset and getting out
// of the way, so the ticket stands in as a marker that names what it was given.
vi.mock("@/features/rwa/components/rwa-ticket", () => ({
  RwaTicket: ({
    asset,
    onChangeAsset,
    initialSide,
    initialAmount,
  }: {
    asset: RwaAssetView;
    onChangeAsset?: () => void;
    initialSide?: "buy" | "sell";
    initialAmount?: string;
  }) => (
    <div data-testid="rwa-ticket">
      <span>ticket:{asset.symbol}</span>
      {/* The staged leg and figure are echoed so a test can prove a spoken
          order reaches the ticket rather than only opening it. */}
      <span data-testid="ticket-side">{initialSide ?? "none"}</span>
      <span data-testid="ticket-amount">{initialAmount ?? "none"}</span>
      <button type="button" onClick={onChangeAsset}>
        change asset
      </button>
    </div>
  ),
}));

function asset(over: Partial<RwaAssetView> = {}): RwaAssetView {
  return {
    id: "solana:gldx",
    chain: "solana",
    address: "GLDx111",
    symbol: "GLDx",
    name: "Gold ETF xStock",
    issuer: "Backed (xStocks)",
    category: "commodity",
    decimals: 8,
    priceUsd: "403.83",
    market: { priceUsd: 403.83, change24h: 0.26 },
    ...over,
  } as RwaAssetView;
}

const ASSETS = [
  asset(),
  asset({
    id: "base:pro",
    chain: "base",
    symbol: "PRO",
    name: "Propy",
    priceUsd: "0.3722",
    market: { priceUsd: 0.3722, change24h: -3.68 },
  }),
];

function renderList(props: Partial<React.ComponentProps<typeof RwaPhoneList>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RwaPhoneList assets={ASSETS} loading={false} error={false} {...props} />
    </NextIntlClientProvider>
  );
}

function listBox() {
  return screen.getByTestId("rwa-market-list");
}

function searchBox() {
  return screen.getByRole("searchbox", { name: enMessages.rwa.searchPlaceholder });
}

describe("RwaPhoneList", () => {
  it("draws one row per asset with ticker, name, price and the day's move", () => {
    renderList();
    expect(screen.getByText("GLDx")).toBeInTheDocument();
    expect(screen.getByText("Gold ETF xStock")).toBeInTheDocument();
    expect(screen.getByText("$403.83")).toBeInTheDocument();
    expect(screen.getByText("+0.26%")).toBeInTheDocument();
  });

  it("lists Base assets first, as the desk does", () => {
    renderList();
    const tickers = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(tickers[0]).toContain("PRO");
  });

  it("renders its own search field as the first child of the scrolling list box", () => {
    renderList();
    const box = screen.getByTestId("rwa-market-list");
    // Inside the scroll box, so it scrolls away with the rows rather than
    // staying pinned above them.
    expect(within(box).getByRole("searchbox", { name: enMessages.rwa.searchPlaceholder })).toBe(
      searchBox()
    );
    expect(box.firstElementChild).toContainElement(searchBox());
  });

  it("filters the rows by what is typed into its own search field", () => {
    renderList();
    fireEvent.change(searchBox(), { target: { value: "gold" } });
    expect(screen.getByText("GLDx")).toBeInTheDocument();
    expect(screen.queryByText("PRO")).toBeNull();
  });

  it("swaps the list for the tapped asset's ticket, hiding the list rather than dropping it", () => {
    renderList();
    fireEvent.click(screen.getByText("GLDx"));
    expect(screen.getByText("ticket:GLDx")).toBeInTheDocument();
    // Hidden, not unmounted: the rows stay in the DOM so the scroll offset the
    // reader left behind has something to be put back on.
    expect(listBox()).toBeInTheDocument();
    expect(listBox()).not.toBeVisible();
  });

  it("puts the reader back on the list from the ticket's own asset pill", () => {
    renderList();
    fireEvent.click(screen.getByText("GLDx"));
    fireEvent.click(screen.getByRole("button", { name: "change asset" }));
    expect(screen.queryByTestId("rwa-ticket")).toBeNull();
    expect(listBox()).toBeVisible();
  });

  // Whoever was eighty rows down comes back to where they were, not to the top.
  it("keeps the list's scroll position across a trip into the ticket", () => {
    renderList();
    const box = listBox();
    // jsdom lays nothing out, so scrollTop there is not the browser's. Standing
    // in a real one makes both the save and the restore observable, and makes an
    // unmounted list fail: the replacement node would not carry the offset.
    let scrollTop = 0;
    Object.defineProperty(box, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    box.scrollTop = 420;

    fireEvent.click(screen.getByText("GLDx"));
    fireEvent.click(screen.getByRole("button", { name: "change asset" }));

    expect(listBox()).toBe(box);
    expect(box.scrollTop).toBe(420);
  });

  // A ticket has no list under it to filter, so the field goes with the list
  // rather than sitting there taking up the top of a phone screen.
  it("takes the search field away while the ticket is open", () => {
    renderList();
    expect(searchBox()).toBeEnabled();

    fireEvent.click(screen.getByText("GLDx"));
    expect(screen.queryByRole("searchbox", { name: enMessages.rwa.searchPlaceholder })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "change asset" }));
    expect(searchBox()).toBeEnabled();
  });

  it("re-opens the ticket for a SECOND spoken command while the page stays mounted", () => {
    const first: TradePrefill = { symbol: "GLDx", mode: "buy", amount: "10" };
    const { rerender } = renderList({ prefill: first });
    expect(screen.getByText("ticket:GLDx")).toBeInTheDocument();

    // Back to the list, as the reader would leave it.
    fireEvent.click(screen.getByRole("button", { name: "change asset" }));
    expect(screen.queryByTestId("rwa-ticket")).toBeNull();

    // A new spoken command is a NEW prefill object. A one-shot boolean latch
    // would swallow this one and every one after it.
    const second: TradePrefill = { symbol: "PRO", mode: "buy", amount: "25" };
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <RwaPhoneList assets={ASSETS} loading={false} error={false} prefill={second} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("ticket:PRO")).toBeInTheDocument();
  });

  it("says so when nothing matches, and keeps the field on screen to clear", () => {
    renderList();
    fireEvent.change(searchBox(), { target: { value: "zzz" } });
    expect(screen.getByText(enMessages.rwa.noSearchMatches)).toBeInTheDocument();
    expect(searchBox()).toBeInTheDocument();
  });
});

describe("RwaPhoneList voice prefill", () => {
  it("stages the spoken leg and figure in the ticket it opens", () => {
    renderList({ prefill: { symbol: "GLDx", mode: "sell", amount: "2.5" } });

    expect(screen.getByTestId("rwa-ticket")).toHaveTextContent("ticket:GLDx");
    expect(screen.getByTestId("ticket-side")).toHaveTextContent("sell");
    expect(screen.getByTestId("ticket-amount")).toHaveTextContent("2.5");
  });

  it("drops the staged figure once a different asset is opened", () => {
    // The spoken amount belongs to the asset that was named. Carrying "2.5"
    // into another asset's ticket would be a figure meaning something else.
    renderList({ prefill: { symbol: "GLDx", mode: "sell", amount: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "change asset" }));

    fireEvent.click(screen.getByRole("button", { name: /PRO/ }));

    expect(screen.getByTestId("ticket-side")).toHaveTextContent("none");
    expect(screen.getByTestId("ticket-amount")).toHaveTextContent("none");
  });
});
