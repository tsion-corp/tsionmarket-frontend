import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { TokenMoves, type InsightToken } from "@/features/trade/components/token-moves";

// The card's copy lives under the `markets` namespace. Spread over the real
// catalogue so the suite keeps passing once the five locale files carry these
// keys, and keeps working before they do.
const messages = {
  ...en,
  markets: {
    ...en.markets,
    tokenMovesTitle: "Stay Ahead of Token Moves on Spot",
    tokenMovesRegion: "Trending token moves",
    tokenMoveUp: "<b>{symbol} is up {change}</b> in the last 24 hours.",
    tokenMoveDown: "<b>{symbol} is down {change}</b> in the last 24 hours.",
    tokenMoveFlat: "<b>{symbol} is flat</b> over the last 24 hours.",
    tokenMoveUnknown: "<b>{symbol}</b> has no 24 hour move to show right now.",
  },
};

function token(overrides: Partial<InsightToken> = {}): InsightToken {
  return {
    symbol: "BTC",
    name: "Bitcoin",
    logo: null,
    priceUsd: 64_000,
    change24h: 12.8,
    ...overrides,
  };
}

const five: InsightToken[] = [
  token({ symbol: "BTC", change24h: 12.8, priceUsd: 64_000 }),
  token({ symbol: "ETH", change24h: -4.25, priceUsd: 3_100 }),
  token({ symbol: "SOL", change24h: 7.1, priceUsd: 180 }),
  token({ symbol: "LINK", change24h: 2.4, priceUsd: 22 }),
  token({ symbol: "ARB", change24h: -1.9, priceUsd: 1.1 }),
];

function renderMoves(tokens: InsightToken[], onBuyToken = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TokenMoves tokens={tokens} onBuyToken={onBuyToken} />
    </NextIntlClientProvider>
  );
  return onBuyToken;
}

// The rotation runs on setInterval inside useRotatingIndex; advancing it has to
// happen inside act so React commits the new index before the assertion.
function tick(ms = 10_000) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// The second card carries a Buy button of its own for the next token, so every
// query about the rotating card is scoped to its region.
function insightCard(): HTMLElement {
  return screen.getByRole("region", { name: "Trending token moves" });
}

function shownSymbol(): string {
  return within(insightCard()).getByRole("button", { name: /^Buy / }).textContent ?? "";
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TokenMoves", () => {
  it("cycles the tokens every ten seconds and loops forever", () => {
    vi.useFakeTimers();
    renderMoves(five);

    expect(shownSymbol()).toBe("Buy BTC");
    tick();
    expect(shownSymbol()).toBe("Buy ETH");
    tick();
    expect(shownSymbol()).toBe("Buy SOL");
    tick();
    expect(shownSymbol()).toBe("Buy LINK");
    tick();
    expect(shownSymbol()).toBe("Buy ARB");
    // Fifth advance wraps rather than stopping at the end.
    tick();
    expect(shownSymbol()).toBe("Buy BTC");
    tick();
    expect(shownSymbol()).toBe("Buy ETH");
  });

  it("holds short of ten seconds", () => {
    vi.useFakeTimers();
    renderMoves(five);
    tick(9_999);
    expect(shownSymbol()).toBe("Buy BTC");
  });

  it("shows the real price and 24h change of the token on screen", () => {
    renderMoves([token({ symbol: "BTC", priceUsd: 64_000, change24h: 12.8 })]);
    expect(screen.getByText("$64,000.00")).toBeInTheDocument();
    expect(screen.getByText("+12.8%")).toBeInTheDocument();
  });

  it("states the move as a fact, with no recommendation and no invented period", () => {
    renderMoves([token({ symbol: "BTC", change24h: 12.8 })]);
    expect(screen.getByText(/BTC is up 12.8%/)).toBeInTheDocument();
    expect(screen.getByText(/in the last 24 hours/)).toBeInTheDocument();
    expect(screen.queryByText(/recommend/i)).toBeNull();
    expect(screen.queryByText(/6 hours/)).toBeNull();
  });

  it("says down for a negative move rather than flipping the sign into the sentence", () => {
    renderMoves([token({ symbol: "ETH", change24h: -4.25 })]);
    expect(screen.getByText("-4.3%")).toBeInTheDocument();
    expect(screen.getByText(/ETH is down 4.3%/)).toBeInTheDocument();
  });

  it("renders a dash, not a number, when the price has not arrived", () => {
    renderMoves([token({ symbol: "BTC", priceUsd: 0 })]);
    expect(screen.getByText("—")).toBeInTheDocument();
    // Nothing that looks like a price is printed anywhere on the card.
    expect(screen.queryByText(/\$[\d,]/)).toBeNull();
    expect(screen.queryByText("$1,876,617")).toBeNull();
  });

  it("prints no percentage at all when the 24h change is missing", () => {
    renderMoves([token({ symbol: "BTC", change24h: Number.NaN })]);
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByText(/no 24 hour move to show/)).toBeInTheDocument();
  });

  it("does not call a zero change a rise", () => {
    renderMoves([token({ symbol: "BTC", change24h: 0 })]);
    expect(screen.getByText(/BTC is flat/)).toBeInTheDocument();
  });

  it("renders no insight card when the feed is empty", () => {
    renderMoves([]);
    expect(screen.queryByRole("region", { name: "Trending token moves" })).toBeNull();
    expect(screen.queryByText(/is up|is down|is flat/)).toBeNull();
  });

  it("holds the rotation while a pointer rests on the card", () => {
    vi.useFakeTimers();
    renderMoves(five);
    const region = insightCard();

    fireEvent.pointerEnter(region);
    tick();
    tick();
    expect(shownSymbol()).toBe("Buy BTC");

    fireEvent.pointerLeave(region);
    tick();
    expect(shownSymbol()).toBe("Buy ETH");
  });

  it("holds the rotation while focus is inside the card", () => {
    vi.useFakeTimers();
    renderMoves(five);

    act(() => within(insightCard()).getByRole("button", { name: "Buy BTC" }).focus());
    tick();
    expect(shownSymbol()).toBe("Buy BTC");
  });

  it("stays silent while it turns and speaks only once held", () => {
    vi.useFakeTimers();
    renderMoves(five);
    const region = insightCard();
    expect(region).toHaveAttribute("aria-live", "off");

    fireEvent.pointerEnter(region);
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("buys the token currently on screen", () => {
    vi.useFakeTimers();
    const onBuyToken = renderMoves(five);
    tick();
    fireEvent.click(within(insightCard()).getByRole("button", { name: "Buy ETH" }));
    expect(onBuyToken).toHaveBeenCalledWith("ETH");
  });

  it("shows the token after the featured one on the second card", () => {
    vi.useFakeTimers();
    renderMoves([token({ symbol: "BTC" }), token({ symbol: "ETH" }), token({ symbol: "SOL" })]);
    expect(shownSymbol()).toMatch(/BTC/);
    const buys = screen.getAllByRole("button", { name: /^Buy / }).map((b) => b.textContent);
    expect(buys).toEqual([expect.stringMatching(/BTC/), expect.stringMatching(/ETH/)]);
    tick(10_000);
    expect(shownSymbol()).toMatch(/ETH/);
    expect(screen.getAllByRole("button", { name: /^Buy / })[1].textContent).toMatch(/SOL/);
  });

  it("cycles at most five tokens even when handed more", () => {
    vi.useFakeTimers();
    renderMoves([...five, token({ symbol: "SIXTH", change24h: 30 })]);
    for (let i = 0; i < 5; i++) tick();
    expect(shownSymbol()).toBe("Buy BTC");
  });
});
