import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import {
  MemeScreenerToolbar,
  SCREENER_TOOLBAR_DESK_HEIGHT,
  boundValueText,
} from "@/features/trade/components/meme-screener-toolbar";
import { EMPTY_FILTERS, type ScreenerFilters, type ScreenerPresetId } from "@/lib/meme/screener";
import type { MemeTimeframe } from "@/lib/meme/types";

// The screener toolbar (ADR-2026-09-15-meme-trending-screener §3): the
// timeframe pills, Sort, Filters, one chip per applied bound or sort, and the
// two hints. One fixed 36px row on the desk; wrapped under the controls on the
// phone. Sort and Filters each open a modal, on both surfaces.

function renderToolbar({
  variant = "desk",
  timeframe = "24h",
  filters = EMPTY_FILTERS,
  count = 0,
  preset = null,
  paused = false,
}: {
  variant?: "desk" | "phone";
  timeframe?: MemeTimeframe;
  filters?: ScreenerFilters;
  count?: number;
  preset?: ScreenerPresetId | null;
  paused?: boolean;
} = {}) {
  const handlers = {
    onTimeframeChange: vi.fn(),
    onApply: vi.fn(),
    onSortChange: vi.fn(),
    onPreset: vi.fn(),
    onClearBound: vi.fn(),
    onClearAll: vi.fn(),
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeScreenerToolbar
        variant={variant}
        timeframe={timeframe}
        filters={filters}
        count={count}
        preset={preset}
        paused={paused}
        {...handlers}
      />
    </NextIntlClientProvider>
  );
  return { ...handlers, container: view.container, unmount: view.unmount };
}

function root(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>('[data-region="screener-toolbar"]');
  if (el === null) throw new Error("no toolbar root");
  return el;
}

describe("MemeScreenerToolbar", () => {
  it("marks the timeframe in force and reports a new one", () => {
    const { onTimeframeChange } = renderToolbar({ timeframe: "6h" });
    const group = screen.getByRole("group", { name: "Time window" });
    const pills = within(group).getAllByRole("button");
    expect(pills.map((pill) => pill.textContent)).toEqual(["5m", "1h", "6h", "12h", "24h"]);
    expect(within(group).getByRole("button", { name: "6h" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group).getByRole("button", { name: "24h" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    fireEvent.click(within(group).getByRole("button", { name: "1h" }));
    expect(onTimeframeChange).toHaveBeenCalledWith("1h");
  });

  // The desk row is 36px tall while everything fits. It cannot be a fixed
  // height: the timeframe track and the two buttons are about 460px together,
  // and at 1024px the desk's left column is near 480px, so a row that could
  // not wrap put the controls on top of each other. It wraps instead, and the
  // 36px is its floor.
  it("is a 36px row on the desk that wraps rather than overlapping when narrow", () => {
    const { container } = renderToolbar({
      filters: {
        bounds: { marketCap: { max: "1000000" }, volume: { min: "50000" } },
        sort: { by: "volume", order: "desc" },
      },
      count: 3,
      timeframe: "5m",
      paused: true,
    });
    expect(SCREENER_TOOLBAR_DESK_HEIGHT).toBe(36);
    const el = root(container);
    expect(el.style.minHeight).toBe("36px");
    expect(el.style.height).toBe("");
    expect(el.className).toContain("flex-wrap");
    expect(el.className).not.toContain("flex-col");
    // Nothing in the row may refuse to give way: a track that cannot shrink
    // and buttons that cannot wrap are what collided.
    expect(el.querySelector('[role="group"]')?.className).not.toContain("shrink-0");
    const chips = el.querySelector<HTMLElement>('[data-region="screener-chips"]');
    expect(chips?.className).toContain("overflow-x-auto");
    expect(chips?.className).toContain("ws-no-scrollbar");
    // Both hints live inside the row rather than under it.
    expect(within(el).getByText(/Filters are paused while you search\./)).toBeInTheDocument();
    expect(within(el).getByText(/Coins without 5m data yet/)).toBeInTheDocument();
  });

  it("draws a chip for each bound, with money compact and counts grouped", () => {
    renderToolbar({
      filters: {
        bounds: {
          marketCap: { max: "1000000" },
          liquidity: { min: "10000", max: "500000" },
          transactions: { min: "1000" },
          age: { max: "60" },
        },
        sort: null,
      },
      count: 5,
    });
    expect(screen.getByText("Market cap ≤ $1M")).toBeInTheDocument();
    expect(screen.getByText("Liquidity $10K–$500K")).toBeInTheDocument();
    expect(screen.getByText("Transactions ≥ 1,000")).toBeInTheDocument();
    expect(screen.getByText("Age ≤ 1h")).toBeInTheDocument();
  });

  it("removes one side of a bound, or both for a range", () => {
    const { onClearBound } = renderToolbar({
      filters: {
        bounds: { marketCap: { max: "1000000" }, liquidity: { min: "10000", max: "500000" } },
        sort: null,
      },
      count: 3,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Market cap ≤ $1M" }));
    expect(onClearBound).toHaveBeenCalledWith("marketCap", "max");
    onClearBound.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Remove Liquidity $10K–$500K" }));
    expect(onClearBound).toHaveBeenCalledTimes(2);
    expect(onClearBound).toHaveBeenCalledWith("liquidity", "min");
    expect(onClearBound).toHaveBeenCalledWith("liquidity", "max");
  });

  it("draws the sort as a chip that clears it", () => {
    const { onSortChange } = renderToolbar({
      filters: { bounds: {}, sort: { by: "age", order: "asc" } },
      count: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Age, Newest first" }));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("offers Clear all only past one applied filter", () => {
    const one = renderToolbar({
      filters: { bounds: { price: { min: "1" } }, sort: null },
      count: 1,
    });
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    one.unmount();

    const { onClearAll } = renderToolbar({
      filters: { bounds: { price: { min: "1" } }, sort: { by: "price", order: "desc" } },
      count: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the next chip when one is removed, so it is not dropped on the page", () => {
    renderToolbar({
      filters: { bounds: { marketCap: { max: "1000000" }, price: { min: "1" } }, sort: null },
      count: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Market cap ≤ $1M" }));
    expect(screen.getByRole("button", { name: "Remove Price ≥ $1" })).toHaveFocus();
  });

  it("shows the window hint only for a bound that depends on the timeframe", () => {
    renderToolbar({
      filters: { bounds: { marketCap: { max: "1000000" } }, sort: { by: "volume", order: "desc" } },
      count: 2,
      timeframe: "1h",
    });
    expect(screen.queryByText(/data yet are left out/)).toBeNull();
  });

  it("names the window in the hint when a scoped bound is applied", () => {
    renderToolbar({
      filters: { bounds: { traders: { min: "50" } }, sort: null },
      count: 1,
      timeframe: "12h",
    });
    expect(
      screen.getByText("Coins without 12h data yet are left out of this filter.")
    ).toBeInTheDocument();
  });

  it("says filters are paused while a search is showing, and not otherwise", () => {
    renderToolbar({ paused: false });
    expect(screen.queryByText("Filters are paused while you search.")).toBeNull();
  });

  it("keeps the controls usable while paused", () => {
    const { onTimeframeChange } = renderToolbar({ paused: true });
    expect(screen.getByText("Filters are paused while you search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    expect(onTimeframeChange).toHaveBeenCalledWith("5m");
  });

  it("passes presets and applied bounds through from the filters panel", async () => {
    const { onPreset } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Deep liquidity" }));
    expect(onPreset).toHaveBeenCalledWith("deep");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("hands focus to Filters when the last chip goes, not to Sort", () => {
    renderToolbar({
      filters: { bounds: { price: { min: "1" } }, sort: { by: "price", order: "desc" } },
      count: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("button", { name: "Filters 2 active" })).toHaveFocus();
  });

  it("lets the phone's timeframe pills scroll, wraps the chips, and opens modals", async () => {
    const { container, onSortChange } = renderToolbar({
      variant: "phone",
      filters: { bounds: { volume: { min: "50000" } }, sort: null },
      count: 1,
      paused: true,
    });
    const el = root(container);
    expect(el.style.height).toBe("");
    const group = screen.getByRole("group", { name: "Time window" });
    expect(group.parentElement?.className).toContain("overflow-x-auto");
    const chips = el.querySelector<HTMLElement>('[data-region="screener-chips"]');
    expect(chips?.className).toContain("flex-wrap");
    expect(screen.getByText("Filters are paused while you search.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    const sortModal = screen.getByRole("dialog", { name: "Sort coins" });
    expect(el).not.toContainElement(sortModal);
    fireEvent.click(within(sortModal).getByRole("menuitemradio", { name: "Traders" }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "traders", order: "desc" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(el).not.toContainElement(screen.getByRole("dialog", { name: "Filter coins" }));
  });
});

describe("boundValueText", () => {
  const format = {
    number: (n: number) => new Intl.NumberFormat("en-US").format(n),
    age: (unit: "ageMinutes" | "ageHours" | "ageDays", count: string) =>
      `${count}${unit === "ageMinutes" ? "m" : unit === "ageHours" ? "h" : "d"}`,
  };

  it("keeps a tiny price exact where compact notation would round it to $0", () => {
    expect(boundValueText("price", "0.00001", format)).toBe("$0.00001");
    expect(boundValueText("price", "0.000000002988", format)).toBe("$0.000000002988");
    expect(boundValueText("price", "0", format)).toBe("$0");
    expect(boundValueText("price", "1.5", format)).toBe("$1.5");
  });

  it("goes compact for money from a thousand up", () => {
    expect(boundValueText("marketCap", "1000000", format)).toBe("$1M");
    expect(boundValueText("volume", "250000", format)).toBe("$250K");
    expect(boundValueText("price", "1500", format)).toBe("$1.5K");
    expect(boundValueText("liquidity", "999.99", format)).toBe("$999.99");
    expect(boundValueText("liquidity", "0.5", format)).toBe("$0.5");
  });

  it("groups counts", () => {
    expect(boundValueText("transactions", "12500", format)).toBe("12,500");
    expect(boundValueText("traders", "50", format)).toBe("50");
  });

  it("shortens age to the largest unit that divides it exactly", () => {
    expect(boundValueText("age", "0", format)).toBe("0m");
    expect(boundValueText("age", "45", format)).toBe("45m");
    expect(boundValueText("age", "60", format)).toBe("1h");
    expect(boundValueText("age", "90", format)).toBe("90m");
    expect(boundValueText("age", "2880", format)).toBe("2d");
    expect(boundValueText("age", "2.5", format)).toBe("2.5m");
  });
});
