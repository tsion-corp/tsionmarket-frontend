import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TradeOrderSummary,
  type TradeOrderSummaryProps,
} from "@/components/ui/trade-order-summary";

// No NextIntlClientProvider: the card reads no catalogue. Both legs' wording
// arrives as finished strings, and the card only picks which pair to draw.
const LABELS = {
  buy: { value: "Purchase Value", fee: "Fee" },
  sell: { value: "You receive", fee: "Est. fee" },
};

function renderSummary(props: Partial<TradeOrderSummaryProps> = {}) {
  return render(
    <TradeOrderSummary purchaseValue="5,000" fee="3.50" symbol="USDC" labels={LABELS} {...props} />
  );
}

// The card is the only thing standing between the amount field and the action
// button, so an empty one on the sell leg reads as a missing quote. Both legs
// draw the same two rows; only the wording changes.
describe("TradeOrderSummary wording", () => {
  it("defaults to the buy leg, so the callers that predate the sell leg are unchanged", () => {
    renderSummary();
    expect(screen.getByText("Purchase Value")).toBeInTheDocument();
    expect(screen.getByText("Fee")).toBeInTheDocument();
    expect(screen.queryByText("You receive")).not.toBeInTheDocument();
    expect(screen.queryByText("Est. fee")).not.toBeInTheDocument();
  });

  it("draws the buy pair on the buy leg", () => {
    renderSummary({ side: "buy" });
    expect(screen.getByText("Purchase Value")).toBeInTheDocument();
    expect(screen.getByText("Fee")).toBeInTheDocument();
  });

  it("draws the sell pair on the sell leg", () => {
    renderSummary({ side: "sell" });
    expect(screen.getByText("You receive")).toBeInTheDocument();
    expect(screen.getByText("Est. fee")).toBeInTheDocument();
    expect(screen.queryByText("Purchase Value")).not.toBeInTheDocument();
    expect(screen.queryByText("Fee")).not.toBeInTheDocument();
  });

  // Another desk's words, in another language, with no provider mounted. Side
  // still picks the pair; nothing in the card knows what the words mean.
  it("takes another desk's wording on either leg", () => {
    const other = {
      buy: { value: "Kaufwert", fee: "Gebühr" },
      sell: { value: "Du erhältst", fee: "Gesch. Gebühr" },
    };
    renderSummary({ labels: other, side: "sell" });
    expect(screen.getByText("Du erhältst")).toBeInTheDocument();
    expect(screen.getByText("Gesch. Gebühr")).toBeInTheDocument();
    cleanup();

    renderSummary({ labels: other, side: "buy" });
    expect(screen.getByText("Kaufwert")).toBeInTheDocument();
    expect(screen.getByText("Gebühr")).toBeInTheDocument();
  });
});

describe("TradeOrderSummary figures", () => {
  // This component moves money onto the screen, so the figure it is handed is
  // the figure it must print. The exact string, digit for digit, with the
  // symbol appended and nothing else done to it. Trailing zeros and grouping
  // separators are the caller's decision.
  it("prints the figures exactly as given, on either leg", () => {
    renderSummary({ side: "buy", purchaseValue: "5,000.00", fee: "3.50" });
    expect(screen.getByText("5,000.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("3.50 USDC")).toBeInTheDocument();
    cleanup();

    renderSummary({ side: "sell", purchaseValue: "0.00012345", fee: "0.000001" });
    expect(screen.getByText("0.00012345 USDC")).toBeInTheDocument();
    expect(screen.getByText("0.000001 USDC")).toBeInTheDocument();
  });

  // A sell is denominated in the token the proceeds land in, which is not the
  // token the buy leg pays with. The symbol is the caller's to choose and is
  // rendered as passed.
  it("quotes both rows in whatever symbol the caller passes", () => {
    renderSummary({ side: "sell", purchaseValue: "1,240", fee: "2.5", symbol: "USDT" });
    expect(screen.getByText("1,240 USDT")).toBeInTheDocument();
    expect(screen.getByText("2.5 USDT")).toBeInTheDocument();
  });
});

describe("TradeOrderSummary loading", () => {
  it("replaces a stale figure with a placeholder while a quote is loading, on either leg", () => {
    renderSummary({ side: "buy", loading: true });
    expect(screen.queryByText("5,000 USDC")).not.toBeInTheDocument();
    expect(screen.queryByText("3.50 USDC")).not.toBeInTheDocument();
    expect(screen.getByText("Purchase Value")).toBeInTheDocument();
    cleanup();

    renderSummary({ side: "sell", loading: true });
    expect(screen.queryByText("5,000 USDC")).not.toBeInTheDocument();
    expect(screen.getByText("You receive")).toBeInTheDocument();
  });

  // The loading rows are what hold the card's height while a quote is in
  // flight. Sized in em against the row's own font size, and the same two
  // widths on both legs, so neither a load nor a side switch resizes anything.
  it("keeps the em-sized placeholder widths on both legs", () => {
    for (const side of ["buy", "sell"] as const) {
      renderSummary({ side, loading: true });
      const placeholders = document.querySelectorAll('[aria-hidden="true"]');
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0]).toHaveClass("w-[5.5em]");
      expect(placeholders[1]).toHaveClass("w-[4.5em]");
      expect(placeholders[0]).toHaveClass("h-[0.7em]");
      cleanup();
    }
  });
});

describe("TradeOrderSummary box", () => {
  // The design's card is 74px: 16px of padding and a 2px edge either side, a
  // 10px gap, and two 14px rows. Tailwind's default leading of 1.5 makes each
  // row 21px and the card 88px. The leading sits on the card so both rows
  // inherit one line box. jsdom has no layout engine, so what is assertable is
  // the class list that sets the height, not the height itself.
  it("sets one line box for both rows, rather than the default leading", () => {
    renderSummary();
    const card = screen.getByText("Purchase Value").parentElement?.parentElement;
    expect(card).toHaveClass("leading-[14px]");
    expect(card).toHaveClass("whitespace-nowrap");
    expect(card?.className).not.toMatch(/(^|\s)h-/);
  });

  // The amber edge is what marks the card out from the panel behind it, and it
  // is drawn at 2px rather than the default 1px.
  it("keeps the amber border it is drawn with", () => {
    renderSummary();
    const card = screen.getByText("Purchase Value").parentElement?.parentElement;
    expect(card).toHaveClass("border-hairline-amber");
    expect(card).toHaveClass("border-2");
  });

  // The panel must not jump when the user flips side. Same card classes and the
  // same two rows on both legs means the same height, quoted and loading alike.
  it("draws the same card on both legs, so switching side does not move the button", () => {
    renderSummary({ side: "buy" });
    const buyCard = screen.getByText("Purchase Value").parentElement?.parentElement;
    const buyClasses = buyCard?.className;
    const buyRows = buyCard?.children.length;
    cleanup();

    renderSummary({ side: "sell" });
    const sellCard = screen.getByText("You receive").parentElement?.parentElement;
    expect(sellCard?.className).toBe(buyClasses);
    expect(sellCard?.children.length).toBe(buyRows);
  });
});
