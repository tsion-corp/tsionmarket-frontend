import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "@/messages/en.json";
import type { ActivityEntry, ActivityKind } from "@/lib/activity/entries";
import type { ActivityFeedItem } from "@/lib/activity/feed";

const chainFeed = vi.fn();
const gameFeed = vi.fn();
vi.mock("@/features/activity/hooks/use-activity", () => ({ useActivity: () => chainFeed() }));
vi.mock("@/features/casino/hooks/use-game-activity", () => ({
  useGameActivity: () => gameFeed(),
}));
// Built separately; the route's job is only to hand the two feeds to the view.
vi.mock("@/features/activity/components/activity-detail-sheet", () => ({
  ActivityDetailSheet: ({ item }: { item: ActivityFeedItem | null; onClose: () => void }) =>
    item ? <div>{item.id}</div> : null,
}));

const { default: ActivityPage } = await import("./page");

// The copy the Activity screens add, not yet in messages/*.json. Trimmed to
// what this route renders; the full set is in the view and filter suites.
const MESSAGES = {
  ...enMessages,
  activity: {
    ...enMessages.activity,
    groupCount: "{count, plural, one {# Activity} other {# Activities}}",
    products: {
      predictions: "Predictions",
      memecoins: "Memecoins",
      trade: "Trade",
      perps: "Perps",
      arkade: "Arkade",
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      transfer: "Transfer",
      rewards: "Rewards",
    },
    ranges: {
      "7d": "Last 7 Days",
      "30d": "Last 30 Days",
      "90d": "Last 90 Days",
      "12m": "Last 12 Months",
      all: "All Time",
    },
    filters: {
      allProducts: "All Products",
      productTitle: "Filter by product",
      rangeTitle: "Filter by date",
      searchLabel: "Search activity",
      searchPlaceholder: "Search activity",
      noMatchesTitle: "No matching activity",
      noMatchesBody: "Nothing here matches your search and filters. Try a wider date range.",
      clear: "Clear filters",
    },
    captions: {
      paid: "Paid {amount}",
      received: "Received {amount}",
      amountSent: "Amount Sent",
      amountReceived: "Amount Received",
      stakeCommitted: "Stake Committed",
      rewardPoints: "Reward Points",
    },
    subtitles: { from: "From {address}", to: "To {address}", versus: "vs {opponent}" },
    dayHeadings: {
      today: "Today, {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month}",
      yesterday:
        "Yesterday, {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month}",
      date: "{day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month}",
      dateWithYear:
        "{day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month} {year, number, ::group-off}",
    },
  },
};

const NOW = Date.now();

function entry(id: string, kind: ActivityKind, symbol: string, ageMs = 0): ActivityEntry {
  return {
    id,
    hash: `0x${id}`,
    network: "base-mainnet",
    timestamp: NOW - ageMs,
    kind,
    symbol,
    amount: 25,
    direction: "in",
    counterparty: null,
    logo: null,
  };
}

function rowTitles(): string[] {
  return Array.from(document.querySelectorAll("button.group")).map(
    (row) => row.querySelector("p")?.textContent ?? ""
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <ActivityPage />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("ActivityPage", () => {
  it("hands the casino feature's plays to the activity view", () => {
    // The route is the composition point: features never import each other, so
    // the off-chain arcade plays can only reach the feed through here. A page
    // that stopped passing them would still render, which is why this is a
    // route test and not a view test.
    chainFeed.mockReturnValue({
      items: [entry("chain", "deposited", "AAA", 60_000)],
      loading: false,
      error: false,
      partial: false,
      refetch: vi.fn(),
    });
    gameFeed.mockReturnValue({ items: [entry("game", "won_chess", "USDC")] });

    renderPage();

    expect(rowTitles()).toEqual(["Won chess", "Deposited AAA"]);
  });

  it("renders the on-chain feed on its own when no game has been played", () => {
    chainFeed.mockReturnValue({
      items: [entry("chain", "deposited", "AAA")],
      loading: false,
      error: false,
      partial: false,
      refetch: vi.fn(),
    });
    gameFeed.mockReturnValue({ items: [] });

    renderPage();

    expect(rowTitles()).toEqual(["Deposited AAA"]);
  });
});
