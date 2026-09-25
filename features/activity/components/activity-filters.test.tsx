import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import {
  ACTIVITY_PRODUCTS,
  ACTIVITY_RANGES,
  ActivityFilters,
  rangeFloor,
  type ActivityFilterState,
} from "./activity-filters";

// The copy this screen adds is not in messages/*.json yet, so the suite carries
// it. The keys and the English are exactly what the catalogues need, which is
// what makes this overlay the contract rather than a convenience: when the five
// catalogues land, deleting the overlay must leave every assertion passing.
const ACTIVITY_MESSAGES = {
  ...enMessages.activity,
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
};

const MESSAGES = { ...enMessages, activity: ACTIVITY_MESSAGES };

const RESTING: ActivityFilterState = { query: "", product: "all", range: "30d" };

function renderFilters(
  value: ActivityFilterState,
  onChange: (next: ActivityFilterState) => void = () => {}
) {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <ActivityFilters value={value} onChange={onChange} />
    </NextIntlClientProvider>
  );
}

/** Stands in for the view, which is where the filter state belongs. */
function ControlledHarness() {
  const [value, setValue] = useState<ActivityFilterState>(RESTING);
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <ActivityFilters value={value} onChange={setValue} />
      <span data-testid="state">{`${value.query}|${value.product}|${value.range}`}</span>
    </NextIntlClientProvider>
  );
}

function openMenu(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("ActivityFilters", () => {
  it("rests on the two labels the design draws", () => {
    renderFilters(RESTING);
    expect(screen.getByRole("button", { name: /All Products/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Last 30 Days/ })).toBeInTheDocument();
  });

  it("names the filter itself for a screen reader, not just its value", () => {
    // "Last 30 Days" on its own is a value with no subject, so the accessible
    // name has to carry the filter's own name as well as its selection.
    renderFilters(RESTING);
    expect(
      screen.getByRole("button", { name: "Filter by date: Last 30 Days" })
    ).toBeInTheDocument();
  });

  it("offers every product the view model can carry, plus the unfiltered default", () => {
    renderFilters(RESTING);
    openMenu(/Filter by product/);
    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(ACTIVITY_PRODUCTS.length + 1);
    // A product the feed files rows under but the menu never offers is invisible
    // from the screen, so this checks the whole union, not a sample.
    expect(items.map((item) => item.textContent)).toEqual([
      "All Products",
      "Predictions",
      "Withdrawal",
      "Memecoins",
      "Deposit",
      "Rewards",
      "Arkade",
      "Trade",
      "Perps",
      "Transfer",
    ]);
  });

  it("offers every date range", () => {
    renderFilters(RESTING);
    openMenu(/Filter by date/);
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Last 7 Days",
      "Last 30 Days",
      "Last 90 Days",
      "Last 12 Months",
      "All Time",
    ]);
  });

  it("marks the option in force as checked and as the focus target", () => {
    renderFilters(RESTING);
    openMenu(/Filter by date/);
    const current = screen.getByRole("menuitemradio", { name: "Last 30 Days" });
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(current).toHaveAttribute("data-current");
    expect(current).toHaveAttribute("tabindex", "0");
    const other = screen.getByRole("menuitemradio", { name: "All Time" });
    expect(other).toHaveAttribute("aria-checked", "false");
    expect(other).toHaveAttribute("tabindex", "-1");
  });

  it("reports a picked product and leaves the rest of the state alone", () => {
    const onChange = vi.fn();
    renderFilters({ query: "eth", product: "all", range: "90d" }, onChange);
    openMenu(/Filter by product/);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Arkade" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ query: "eth", product: "arkade", range: "90d" });
  });

  it("reports a picked range and leaves the rest of the state alone", () => {
    const onChange = vi.fn();
    renderFilters({ query: "eth", product: "arkade", range: "30d" }, onChange);
    openMenu(/Filter by date/);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "All Time" }));
    expect(onChange).toHaveBeenCalledWith({ query: "eth", product: "arkade", range: "all" });
  });

  it("does not report a pick that changes nothing", async () => {
    const onChange = vi.fn();
    renderFilters(RESTING, onChange);
    openMenu(/Filter by product/);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "All Products" }));
    expect(onChange).not.toHaveBeenCalled();
    // The menu still closes: picking what is already in force is a decision,
    // not a mis-tap, and leaving the sheet up would read as a failed press.
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("closes the menu once a pick lands", async () => {
    renderFilters(RESTING);
    openMenu(/Filter by product/);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Deposit" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("moves focus between options with the arrow keys", () => {
    renderFilters(RESTING);
    openMenu(/Filter by date/);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "All Time" }));
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "Last 7 Days" }));
  });

  it("names the search box from its label rather than its placeholder", () => {
    renderFilters(RESTING);
    expect(screen.getByRole("searchbox", { name: "Search activity" })).toBeInTheDocument();
  });

  it("reports every keystroke undebounced, so the view can decide when to act", () => {
    render(<ControlledHarness />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "us" } });
    fireEvent.change(input, { target: { value: "usd" } });
    expect(input).toHaveValue("usd");
    expect(screen.getByTestId("state")).toHaveTextContent("usd|all|30d");
  });
});

describe("rangeFloor", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;

  it("is unbounded for All Time", () => {
    expect(rangeFloor("all", now)).toBeNull();
  });

  it("reaches back exactly as far as each range says", () => {
    expect(rangeFloor("7d", now)).toBe(now - 7 * day);
    expect(rangeFloor("30d", now)).toBe(now - 30 * day);
    expect(rangeFloor("90d", now)).toBe(now - 90 * day);
    expect(rangeFloor("12m", now)).toBe(now - 365 * day);
  });

  it("has a floor for every range but All Time", () => {
    for (const range of ACTIVITY_RANGES) {
      const floor = rangeFloor(range, now);
      if (range === "all") expect(floor).toBeNull();
      else expect(floor).toBeLessThan(now);
    }
  });
});
