import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import {
  messageLabel,
  textLabel,
  toneFor,
  type ActivityFeedItem,
  type ActivityStatus,
} from "@/lib/activity/feed";
import { MISSING_FIGURE } from "@/lib/meme/format";

import { ActivityFeedRow } from "./activity-feed-row";

// The real catalogue, not an overlay. Every key this row looks up now ships in
// all five locale files, so the suite renders the copy that reaches a reader:
// a missing or renamed key fails here rather than passing against a fixture.
const messages = enMessages;

function feedItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  const status = overrides.status ?? "completed";
  return {
    id: "row-1",
    occurredAt: new Date(2026, 8, 9, 14, 32).getTime(),
    product: "predictions",
    title: textLabel("World Cup prediction"),
    status,
    tone: toneFor(status),
    icon: { symbol: "USDC", logo: null },
    amount: { value: "500", symbol: "USDC", signed: true },
    caption: { label: messageLabel("captions.amountReceived"), detail: "USD" },
    ...overrides,
  };
}

function renderRow(item: ActivityFeedItem, onOpen = vi.fn()) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivityFeedRow item={item} onOpen={onOpen} />
    </NextIntlClientProvider>
  );
  // Responsive mounts both trees and lets CSS pick one, so every query has to
  // say which breakpoint it means. jsdom applies no media queries, so both are
  // in the document at once.
  const phone = view.container.querySelector<HTMLElement>(".md\\:hidden");
  const desktop = view.container.querySelector<HTMLElement>(".md\\:contents");
  if (!phone || !desktop) throw new Error("both breakpoint trees should render");
  return { ...view, onOpen, phone, desktop };
}

// Which text colour the shared chip draws for each tone. Asserting the class
// rather than a computed colour keeps the row honest about the tone it passed
// without restating the chip's palette as a second source of truth.
const TONE_CLASS: Record<string, string> = {
  win: "text-up",
  loss: "text-down",
  live: "text-up",
  pending: "text-amber-200/80",
  done: "text-white/70",
  neutral: "text-white/50",
};

const STATUS_WORD: Record<ActivityStatus, string> = {
  won: "Won",
  lost: "Lost",
  live: "Live",
  processing: "Processing",
  completed: "Completed",
  earned: "Earned",
  failed: "Failed",
  awaitingResults: "Awaiting Results",
};

describe("ActivityFeedRow status", () => {
  it.each(Object.keys(STATUS_WORD) as ActivityStatus[])(
    "draws %s in the tone the model carries, at both breakpoints",
    (status) => {
      const { phone, desktop } = renderRow(feedItem({ status, tone: toneFor(status) }));
      const word = STATUS_WORD[status];
      for (const tree of [phone, desktop]) {
        const chip = within(tree).getByText(word);
        expect(chip).toHaveClass(TONE_CLASS[toneFor(status)]);
      }
    }
  );

  it("keeps Live green-tier rather than pending on this surface", () => {
    // All Activity reads Live alongside Won; the In Progress cards read it
    // alongside Processing. The model carries the tone per surface, so the row
    // renders what it is handed instead of deciding.
    const { desktop } = renderRow(feedItem({ status: "live", tone: "win" }));
    expect(within(desktop).getByText("Live")).toHaveClass("text-up");
  });
});

describe("ActivityFeedRow amount", () => {
  it("keeps the minus on a negative amount and tints it down", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "-250", symbol: "USDT", signed: true } })
    );
    const amount = within(desktop).getByText("-250 USDT");
    expect(amount).toHaveClass("text-down");
  });

  it("marks a gain with an explicit plus and tints it up", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "500", symbol: "USDC", signed: true } })
    );
    expect(within(desktop).getByText("+500 USDC")).toHaveClass("text-up");
  });

  it("leaves an unsigned quantity plain, because a stake is not a profit", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "150", symbol: "USDC", signed: false } })
    );
    const amount = within(desktop).getByText("150 USDC");
    expect(amount).toHaveClass("text-white");
    expect(amount).not.toHaveClass("text-up");
  });

  it("abbreviates from a million up and keeps the exact figure on the title", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "23500000", symbol: "PEPE", signed: true } })
    );
    const amount = within(desktop).getByText("+23.5M PEPE");
    expect(amount).toHaveAttribute("title", "23500000 PEPE");
  });

  it("prints a quantity below a million in full", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "999999", symbol: "PEPE", signed: true } })
    );
    expect(within(desktop).getByText("+999,999 PEPE")).toBeInTheDocument();
  });

  it("never rounds an abbreviation up past the figure it stands for", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "-999999999", symbol: "PEPE", signed: true } })
    );
    expect(within(desktop).getByText("-999.99M PEPE")).toBeInTheDocument();
  });

  it("renders dollars through the USD formatter, with no ticker", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "420", symbol: "USD", signed: true } })
    );
    expect(within(desktop).getByText("+$420.00")).toBeInTheDocument();
  });

  it("says a figure is missing rather than showing a zero it cannot vouch for", () => {
    const { desktop } = renderRow(
      feedItem({ amount: { value: "not a number", symbol: "PEPE", signed: true } })
    );
    expect(within(desktop).getByText(MISSING_FIGURE)).toBeInTheDocument();
  });
});

describe("ActivityFeedRow caption", () => {
  it("renders the caption and its currency detail", () => {
    const { desktop } = renderRow(feedItem());
    expect(within(desktop).getByText("Amount Received")).toBeInTheDocument();
    expect(within(desktop).getByText("USD")).toBeInTheDocument();
  });

  it("interpolates a caption that carries a value", () => {
    const { desktop } = renderRow(
      feedItem({ caption: { label: messageLabel("captions.paid", { amount: "750 USDC" }) } })
    );
    expect(within(desktop).getByText("Paid 750 USDC")).toBeInTheDocument();
  });

  it("drops the caption line entirely when there is no caption", () => {
    const { phone, desktop } = renderRow(feedItem({ caption: { label: textLabel("") } }));
    for (const tree of [phone, desktop]) {
      // The status still shows; only the caption beside it is gone, rather
      // than an empty box holding its width open.
      expect(within(tree).getByText("Completed")).toBeInTheDocument();
      expect(within(tree).queryByText("Amount Received")).not.toBeInTheDocument();
      expect(within(tree).queryByText("USD")).not.toBeInTheDocument();
    }
  });

  it("omits the subtitle when the item has none, and shows it when it does", () => {
    const { desktop } = renderRow(feedItem());
    expect(within(desktop).queryByText(/vs /u)).not.toBeInTheDocument();

    const withSubtitle = renderRow(
      feedItem({ subtitle: messageLabel("subtitles.versus", { opponent: "0xab…cd" }) })
    );
    expect(within(withSubtitle.desktop).getByText("vs 0xab…cd")).toBeInTheDocument();
  });
});

describe("ActivityFeedRow layout", () => {
  const LONG_TITLE =
    "Auszahlung an die Ethereum-Hauptkette fehlgeschlagen und nicht belastet worden";

  it("lets a long title grow at phone width instead of clipping it", () => {
    // The Figma pins this block to a fixed 72x191 box with the title at
    // left 55, which clips the first translated string that reaches it. jsdom
    // does no layout, so the proof is structural: the whole title is in the
    // tree, it wraps, and nothing on the way up to the row hides its overflow
    // or freezes its width.
    const { phone } = renderRow(feedItem({ title: textLabel(LONG_TITLE) }));
    const title = within(phone).getByText(LONG_TITLE);

    expect(title).toHaveClass("break-words");
    expect(title.className).not.toMatch(/truncate|overflow-hidden|whitespace-nowrap/u);

    for (let node = title; node !== phone && node.parentElement; node = node.parentElement) {
      expect(node.className).not.toMatch(/overflow-hidden|absolute|\bw-\[\d/u);
    }
  });

  it("renders the same item at both breakpoints", () => {
    const { phone, desktop } = renderRow(feedItem());
    for (const tree of [phone, desktop]) {
      expect(within(tree).getByText("World Cup prediction")).toBeInTheDocument();
      expect(within(tree).getByText("Predictions")).toBeInTheDocument();
      expect(within(tree).getByText("+500 USDC")).toBeInTheDocument();
      // A 24-hour clock, per the shared formatter. The separator is the
      // reader's, so the assertion is on the shape and not on a literal.
      expect(within(tree).getByText(/^\d{1,2}\D\d{2}$/u)).toBeInTheDocument();
    }
  });
});

describe("ActivityFeedRow interaction", () => {
  it("is one control for the whole row and opens the item's detail", () => {
    const onOpen = vi.fn();
    const item = feedItem();
    renderRow(item, onOpen);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);

    buttons[0].click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it("opts out of the global press lift, which a full width row should not do", () => {
    renderRow(feedItem());
    expect(screen.getByRole("button")).toHaveAttribute("data-no-ripple");
  });

  it("carries no share or explorer control: those belong to the detail", () => {
    renderRow(feedItem());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("ActivityFeedRow icon", () => {
  it("draws the feed's own logo for a token AssetIcon ships no mark for", () => {
    // Most of this feed is the long tail, where the supplied logo is the only
    // art there is. Without it every memecoin row falls back to a gradient.
    const { phone } = renderRow(
      feedItem({
        icon: { symbol: "WAGMI9", logo: "https://cdn.example/wagmi.png" },
        amount: { value: "23500", symbol: "WAGMI9", signed: true },
      })
    );
    const img = phone.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://cdn.example/wagmi.png");
  });

  it("draws the icon's own symbol, not the ticker on the amount", () => {
    // A KASH+ buy moves USDC and shows the KASH+ coin.
    const { phone } = renderRow(
      feedItem({
        icon: { symbol: "KASH+", logo: "/kash/kash-plus-coin.png" },
        amount: { value: "-25", symbol: "USDC", signed: true },
      })
    );
    expect(phone.querySelector("img")?.getAttribute("src")).toBe("/kash/kash-plus-coin.png");
  });
});
