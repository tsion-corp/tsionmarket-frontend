import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { TokenSpot } from "@/features/discovery/types";
import { TokenMovesRow } from "./token-moves-row";

// The row rides the shared carousel, which asks the browser for the
// reduced-motion preference and watches its own frame for resizes. jsdom ships
// neither, so both are stubbed as "no preference" and "never resizes".
beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

// The figures the design comp was drawn with. They shipped as
// discovery.tokenFallbackPrice, tokenFallbackChange and tokenFallbackMove and
// were translated into all five locales, so the row printed an invented price
// and an invented percentage in whichever language the reader had chosen.
// Nothing the row draws may match any of them unless a token really carried it.
//
// Written out here rather than read from the catalogue: the row no longer uses
// those keys, and this suite must keep guarding the figures after they are
// deleted from the message files.
const COMP_PRICE = "$1,876,617";
const COMP_CHANGE = "+12.8%";
const COMP_MOVE = "12.8%";

function token(overrides: Partial<TokenSpot> = {}): TokenSpot {
  return {
    symbol: "BTC",
    name: "Bitcoin",
    price: "$64,000.00",
    change: "+12.8%",
    up: true,
    movePercent: "12.8%",
    logo: "/market/token-btc-coin.png",
    href: "/spot",
    ...overrides,
  };
}

function renderRow(
  props: {
    tokens?: readonly TokenSpot[];
    loading?: boolean;
    onBuy?: (token: TokenSpot) => void;
  } = {}
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TokenMovesRow {...props} />
    </NextIntlClientProvider>
  );
}

// The card is dealt into the carousel twice and the carousel clones its slides
// to loop, so every figure on it appears several times over. The assertions are
// about whether a string is on screen at all, not about how many copies of it
// the loop drew.
function shown(text: string | RegExp) {
  return screen.queryAllByText(text);
}

// The token call cards: every article on the shelf is one.
function callCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll("article"));
}

function callText(): string {
  return callCards()
    .map((card) => card.textContent ?? "")
    .join(" ");
}

describe("token moves row", () => {
  it("prints the token's own price and move, not the comp's", () => {
    renderRow({ tokens: [token()] });

    expect(shown("$64,000.00").length).toBeGreaterThan(0);
    expect(shown("+12.8%").length).toBeGreaterThan(0);
    expect(shown(COMP_PRICE)).toHaveLength(0);
  });

  it("states the move as a fact, with no recommendation and no invented period", () => {
    renderRow({ tokens: [token({ symbol: "BTC", movePercent: "12.8%" })] });

    expect(shown(/BTC is up 12\.8%/).length).toBeGreaterThan(0);
    expect(shown(/in the last 24 hours/).length).toBeGreaterThan(0);
    expect(shown(/recommend/i)).toHaveLength(0);
    expect(shown(/increas/i)).toHaveLength(0);
    expect(shown(/6 hours/)).toHaveLength(0);
  });

  it("says down for a loss rather than reading it out as a gain", () => {
    renderRow({
      tokens: [token({ symbol: "ETH", change: "-4.3%", up: false, movePercent: "4.3%" })],
    });

    expect(shown(/ETH is down 4\.3%/).length).toBeGreaterThan(0);
    expect(shown(/ETH is up/)).toHaveLength(0);
  });

  it("renders a dash and no fabricated number when the price is missing", () => {
    renderRow({ tokens: [token({ price: "" })] });

    expect(shown("—").length).toBeGreaterThan(0);
    expect(shown(COMP_PRICE)).toHaveLength(0);
    // Nothing that could be read as a price stands in for the one we lack.
    expect(callText()).not.toMatch(/\$[\d,]/);
    // The move it does have is still the move it has.
    expect(shown("+12.8%").length).toBeGreaterThan(0);
  });

  it("renders no percentage at all when the move is missing", () => {
    renderRow({ tokens: [token({ change: "", movePercent: "" })] });

    // Not the comp's figures, and not a zero standing in for the absent one.
    expect(shown(COMP_CHANGE)).toHaveLength(0);
    expect(shown(COMP_MOVE)).toHaveLength(0);
    expect(callText()).not.toMatch(/%/);
    // The sentence says it has no move rather than claiming one.
    expect(shown(/has no 24 hour move to show/).length).toBeGreaterThan(0);
    // The price is real, so it still shows.
    expect(shown("$64,000.00").length).toBeGreaterThan(0);
  });

  it("calls a genuine zero flat instead of announcing a 0.0% gain", () => {
    renderRow({
      tokens: [token({ symbol: "SOL", change: "+0.0%", up: true, movePercent: "0.0%" })],
    });

    expect(shown(/SOL is flat/).length).toBeGreaterThan(0);
    expect(shown(/SOL is up/)).toHaveLength(0);
    // The chip still reports the figure the feed gave, because it gave one.
    expect(shown("+0.0%").length).toBeGreaterThan(0);
  });

  it("shows an empty card, not a figure, while the route is still loading", () => {
    const { container } = renderRow({ loading: true });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(shown(COMP_PRICE)).toHaveLength(0);
    expect(shown(COMP_CHANGE)).toHaveLength(0);
    expect(callText()).not.toMatch(/%/);
    expect(callText()).not.toMatch(/\d/);
    // No token means no token to buy.
    expect(screen.queryAllByRole("link", { name: /^Buy BTC/ })).toHaveLength(0);
  });

  it("drops the token card entirely when the route settles with nothing to feature", () => {
    renderRow();

    expect(shown(COMP_PRICE)).toHaveLength(0);
    expect(shown(COMP_CHANGE)).toHaveLength(0);
    expect(shown(COMP_MOVE)).toHaveLength(0);
    // No call card at all, so nothing on the shelf is reporting a market, and
    // the row goes with it rather than standing over an empty carousel.
    expect(callCards()).toHaveLength(0);
    expect(shown(enMessages.discovery.tokenMovesTitle)).toHaveLength(0);
    // Nothing is left pretending to load either.
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("deals a different coin to each card, the featured one first", () => {
    renderRow({
      tokens: [
        token({ symbol: "BTC", href: "/spot?symbol=BTC" }),
        token({ symbol: "ETH", href: "/spot?symbol=ETH" }),
        token({ symbol: "SOL", href: "/spot?symbol=SOL" }),
        token({ symbol: "XRP", href: "/spot?symbol=XRP" }),
      ],
    });

    // Three cards, three coins, in ranking order; the fourth waits its turn.
    expect(screen.getAllByRole("link", { name: /Buy BTC/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Buy ETH/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Buy SOL/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link", { name: /Buy XRP/ })).toHaveLength(0);
  });

  it("takes the token's own symbol through to the buy link", () => {
    renderRow({ tokens: [token({ symbol: "SOL", href: "/spot?symbol=SOL" })] });

    const links = screen.getAllByRole("link", { name: /Buy SOL/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/spot?symbol=SOL");
    }
  });

  it("opens the buy sheet in place, with this card's own token, when a priced spot has a callback", () => {
    const onBuy = vi.fn();
    const priced = token({ symbol: "SOL", href: "/spot?symbol=SOL", priceUsd: 142.5 });
    renderRow({ tokens: [priced], onBuy });

    // The pill is a real button, not a link to the token page.
    const buttons = screen.getAllByRole("button", { name: /Buy SOL/ });
    expect(buttons.length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link", { name: /Buy SOL/ })).toHaveLength(0);

    fireEvent.click(buttons[0]);

    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onBuy).toHaveBeenCalledWith(priced);
  });

  it("keeps the buy pill a link to token.href when no callback is supplied", () => {
    renderRow({ tokens: [token({ symbol: "SOL", href: "/spot?symbol=SOL", priceUsd: 142.5 })] });

    const links = screen.getAllByRole("link", { name: /Buy SOL/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/spot?symbol=SOL");
    }
    expect(screen.queryAllByRole("button", { name: /Buy SOL/ })).toHaveLength(0);
  });

  it("keeps the buy pill a link when the spot has no priceUsd, even with a callback", () => {
    const onBuy = vi.fn();
    renderRow({
      tokens: [token({ symbol: "SOL", href: "/spot?symbol=SOL", priceUsd: undefined })],
      onBuy,
    });

    const links = screen.getAllByRole("link", { name: /Buy SOL/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/spot?symbol=SOL");
    }
    expect(screen.queryAllByRole("button", { name: /Buy SOL/ })).toHaveLength(0);
    expect(onBuy).not.toHaveBeenCalled();
  });
});
