import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "@/messages/en.json";
import type { ActivityEntry, ActivityKind } from "@/lib/activity/entries";
import type { ActivityFeedItem } from "@/lib/activity/feed";

const activity = vi.fn();
vi.mock("@/features/activity/hooks/use-activity", () => ({ useActivity: () => activity() }));

// The detail surface is built separately. Standing it in here keeps this suite
// about the screen's own job, which is deciding when a detail is open and for
// which row, not what the detail then draws.
const opened = vi.fn();
vi.mock("@/features/activity/components/activity-detail-sheet", () => ({
  ActivityDetailSheet: ({ item }: { item: ActivityFeedItem | null; onClose: () => void }) => {
    opened(item?.id ?? null);
    return item ? <div data-testid="detail">{item.id}</div> : null;
  },
}));

const { ActivityFeedView } = await import("./activity-feed-view");

// The copy this screen adds is not in messages/*.json yet, so the suite carries
// it. These key paths and this English are exactly what the five catalogues
// need: when they land, deleting the overlay must leave every assertion passing.
//
// `products`, `captions`, `subtitles` and `dayHeadings` belong to the row and
// the grouping module rather than to this screen, and are here because the
// screen renders what they produce.
const ACTIVITY_MESSAGES = {
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
  subtitles: {
    from: "From {address}",
    to: "To {address}",
    versus: "vs {opponent}",
  },
  dayHeadings: {
    today: "Today, {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month}",
    yesterday: "Yesterday, {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month}",
    date: "{day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month}",
    dateWithYear:
      "{day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} {month} {year, number, ::group-off}",
  },
};

const MESSAGES = { ...enMessages, activity: ACTIVITY_MESSAGES };

const DAY_MS = 24 * 60 * 60 * 1000;
// One clock for the whole file. `Date.now()` per entry drifts between calls, and
// two rows a millisecond apart sort differently from two rows built together,
// which is not something a test should have to think about.
const NOW = Date.now();

function entry(
  id: string,
  kind: ActivityKind,
  symbol: string,
  { ageMs = 0, direction = "in" as const }: { ageMs?: number; direction?: "in" | "out" } = {}
): ActivityEntry {
  return {
    id,
    hash: `0x${id}`,
    network: "base-mainnet",
    timestamp: NOW - ageMs,
    kind,
    symbol,
    amount: 25,
    direction,
    counterparty: null,
    logo: null,
  };
}

function feed(overrides: Partial<ReturnType<typeof restingFeed>> = {}) {
  activity.mockReturnValue({ ...restingFeed(), ...overrides });
}

function restingFeed() {
  return {
    items: [] as ActivityEntry[],
    loading: false,
    error: false,
    partial: false,
    refetch: vi.fn(),
  };
}

// PnlCards reads FX rates through react-query, so the tree needs a client.
// Retries off: nothing in this file wants a background refetch.
function renderView(gameEntries: ActivityEntry[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <ActivityFeedView gameEntries={gameEntries} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

// The row draws a phone tree and a desktop tree at once and CSS shows one, so
// every visible string is in the document twice. Counting rows means counting
// one of the two trees.
function rowTitles(): string[] {
  return Array.from(document.querySelectorAll("button.group")).map(
    (row) => row.querySelector("p")?.textContent ?? ""
  );
}

function openProductMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Filter by product/ }));
}

beforeEach(() => {
  activity.mockReset();
  opened.mockReset();
  feed();
});

describe("ActivityFeedView states", () => {
  it("says it is loading rather than showing an empty list", () => {
    feed({ loading: true });
    renderView();
    expect(screen.getByText(enMessages.activity.loading)).toBeInTheDocument();
    expect(rowTitles()).toHaveLength(0);
  });

  it("offers a retry when the read failed", () => {
    const refetch = vi.fn();
    feed({ error: true, refetch });
    renderView();
    expect(screen.getByText(enMessages.activity.errorBody)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: enMessages.activity.tryAgain }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("treats an incomplete read with no rows as unreadable, not as an empty history", () => {
    // "Nothing here yet" would tell the reader their account has no record when
    // the truth is that no record could be read.
    feed({ partial: true, items: [] });
    renderView();
    expect(screen.getByText(enMessages.activity.errorBody)).toBeInTheDocument();
    expect(screen.queryByText(enMessages.activity.emptyTitle)).not.toBeInTheDocument();
  });

  it("says the history is empty when the read succeeded and found nothing", () => {
    feed({ items: [] });
    renderView();
    expect(screen.getByText(enMessages.activity.emptyTitle)).toBeInTheDocument();
  });

  it("keeps the rows an incomplete read did return, under a banner saying so", () => {
    feed({ partial: true, items: [entry("a", "deposited", "AAA")] });
    renderView();
    expect(screen.getByText(enMessages.activity.partialBody)).toBeInTheDocument();
    expect(rowTitles()).toEqual(["Deposited AAA"]);
  });
});

describe("ActivityFeedView list", () => {
  it("merges the off-chain game plays the route passes in, newest first", () => {
    feed({ items: [entry("chain", "deposited", "AAA", { ageMs: 60_000 })] });
    renderView([entry("game", "won_chess", "USDC")]);
    expect(rowTitles()).toEqual(["Won chess", "Deposited AAA"]);
  });

  it("never lists the same event twice, whichever source sent it", () => {
    const shared = entry("same", "deposited", "AAA");
    feed({ items: [shared] });
    renderView([shared]);
    expect(rowTitles()).toEqual(["Deposited AAA"]);
  });

  it("heads each day with the rows it is actually drawing", () => {
    feed({
      items: [
        entry("a", "deposited", "AAA"),
        entry("b", "deposited", "BBB"),
        entry("c", "deposited", "CCC", { ageMs: DAY_MS }),
      ],
    });
    renderView();
    // Counted from what is rendered, not from the feed: the Figma's "5
    // Activities" over four rows is placeholder data, not a spec.
    expect(screen.getAllByText("2 Activities")).toHaveLength(1);
    expect(screen.getAllByText("1 Activity")).toHaveLength(1);
  });

  it("opens the detail for the row that was pressed", () => {
    feed({ items: [entry("a", "deposited", "AAA"), entry("b", "deposited", "BBB")] });
    renderView();
    const rows = Array.from(document.querySelectorAll("button.group"));
    fireEvent.click(rows[1]);
    expect(screen.getByTestId("detail")).toHaveTextContent("b");
  });

  it("opens no detail until a row is pressed", () => {
    feed({ items: [entry("a", "deposited", "AAA")] });
    renderView();
    expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
    expect(opened).toHaveBeenLastCalledWith(null);
  });
});

describe("ActivityFeedView filters", () => {
  it("narrows the list to one product", () => {
    feed({
      items: [
        entry("dep", "deposited", "AAA"),
        entry("wit", "withdrew", "BBB", { direction: "out" }),
      ],
    });
    renderView();
    expect(rowTitles()).toHaveLength(2);
    openProductMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Withdrawal" }));
    expect(rowTitles()).toEqual(["Withdrew BBB"]);
  });

  it("drops everything older than the range in force", () => {
    feed({
      items: [
        entry("recent", "deposited", "AAA", { ageMs: DAY_MS }),
        entry("old", "deposited", "BBB", { ageMs: 45 * DAY_MS }),
      ],
    });
    renderView();
    // The screen opens on Last 30 Days, the window the design's pill rests on.
    expect(rowTitles()).toEqual(["Deposited AAA"]);
    fireEvent.click(screen.getByRole("button", { name: /Filter by date/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "All Time" }));
    expect(rowTitles()).toEqual(["Deposited AAA", "Deposited BBB"]);
  });

  it("narrows the list as the search box is typed into", async () => {
    feed({ items: [entry("a", "deposited", "AAA"), entry("b", "deposited", "BBB")] });
    renderView();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bbb" } });
    // The view debounces, so the list is still whole for a moment. waitFor
    // rather than a fake clock: the debounce is the behaviour under test.
    await waitFor(() => expect(rowTitles()).toEqual(["Deposited BBB"]));
  });

  it("says so when the filters match nothing, and offers a way back", () => {
    feed({ items: [entry("dep", "deposited", "AAA")] });
    renderView();
    openProductMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Perps" }));
    expect(screen.getByText("No matching activity")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rowTitles()).toEqual(["Deposited AAA"]);
  });
});

describe("ActivityFeedView paging", () => {
  function manyOf(kind: ActivityKind, prefix: string, count: number): ActivityEntry[] {
    return Array.from({ length: count }, (_, i) =>
      entry(`${prefix}${i}`, kind, `${prefix}${String(i).padStart(2, "0")}`, { ageMs: i * 1000 })
    );
  }

  it("pages the feed at twelve rows and steps between pages", () => {
    feed({ items: manyOf("deposited", "D", 15) });
    renderView();
    expect(rowTitles()).toHaveLength(12);
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(rowTitles()).toEqual(["Deposited D12", "Deposited D13", "Deposited D14"]);
  });

  it("puts the reader back on page one when a filter changes the result", () => {
    // Both sets are long enough to page, so clamping alone would leave the
    // reader on page 3 of the narrowed list looking at its tail. Keying the
    // paged list on the filters is what moves them to the top of it.
    feed({ items: [...manyOf("deposited", "D", 26), ...manyOf("withdrew", "W", 26)] });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText(/Page 3 of 5/)).toBeInTheDocument();

    openProductMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Withdrawal" }));
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(rowTitles()[0]).toBe("Withdrew W00");
  });
});
