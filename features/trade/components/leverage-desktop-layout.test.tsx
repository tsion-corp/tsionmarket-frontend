import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LeverageDesktopLayout } from "@/features/trade/components/leverage-desktop-layout";

// Every region the shell can place, filled with a marker we can assert on.
const allSlots = {
  search: <div>search-slot</div>,
  marketList: <div>market-list-slot</div>,
  ticketHeader: <div>ticket-header-slot</div>,
  modeSwitch: <div>mode-switch-slot</div>,
  chartToggle: <div>chart-toggle-slot</div>,
  chart: <div>chart-slot</div>,
  orderEntry: <div>order-entry-slot</div>,
  orderSummary: <div>order-summary-slot</div>,
  directionActions: <div>direction-actions-slot</div>,
  ledger: <div>ledger-slot</div>,
};

function region(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-region="${name}"]`);
}

// The left column's single bordered surface. It carries no data-region of its
// own so that the column's region order stays exactly market list, toggle,
// chart; it is always the market column's only child.
function marketPanel(container: HTMLElement): HTMLElement | null {
  return region(container, "market-column")?.firstElementChild as HTMLElement | null;
}

describe("LeverageDesktopLayout", () => {
  it("renders every named slot", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    for (const name of Object.keys(allSlots)) {
      expect(screen.getByText(`${kebab(name)}-slot`)).toBeInTheDocument();
    }

    // Each slot lands in its own region, not merged into a sibling.
    expect(region(container, "search")).toHaveTextContent("search-slot");
    expect(region(container, "market-list")).toHaveTextContent("market-list-slot");
    expect(region(container, "ticket-header")).toHaveTextContent("ticket-header-slot");
    expect(region(container, "mode-switch")).toHaveTextContent("mode-switch-slot");
    expect(region(container, "chart-toggle")).toHaveTextContent("chart-toggle-slot");
    expect(region(container, "chart")).toHaveTextContent("chart-slot");
    expect(region(container, "order-entry")).toHaveTextContent("order-entry-slot");
    expect(region(container, "order-summary")).toHaveTextContent("order-summary-slot");
    expect(region(container, "direction-actions")).toHaveTextContent("direction-actions-slot");
    expect(region(container, "ledger")).toHaveTextContent("ledger-slot");
  });

  it("keeps the market list and the ticket in separate columns", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const list = region(container, "market-list");
    const ticket = region(container, "ticket");
    expect(list).not.toBeNull();
    expect(ticket).not.toBeNull();
    expect(ticket?.contains(list as Node)).toBe(false);
    expect(list?.contains(ticket as Node)).toBe(false);
  });

  it("puts the chart and its toggle in the left column, not the ticket", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const column = region(container, "market-column");
    const ticket = region(container, "ticket");
    const toggle = region(container, "chart-toggle");
    const chart = region(container, "chart");

    expect(column).not.toBeNull();
    expect(column?.contains(toggle as Node)).toBe(true);
    expect(column?.contains(chart as Node)).toBe(true);
    expect(ticket?.contains(toggle as Node)).toBe(false);
    expect(ticket?.contains(chart as Node)).toBe(false);
  });

  it("orders the left column as market list, then chart toggle, then chart", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const column = region(container, "market-column") as HTMLElement;
    const ordered = Array.from(column.querySelectorAll<HTMLElement>("[data-region]")).map(
      (node) => node.dataset.region
    );

    expect(ordered).toEqual(["market-list", "chart-toggle", "chart"]);
  });

  it("renders the left column for the chart alone when there is no market list", () => {
    const { container } = render(
      <LeverageDesktopLayout
        chartToggle={<button type="button">chart-toggle-slot</button>}
        chart={<div>chart-slot</div>}
      />
    );

    const column = region(container, "market-column");
    expect(column).not.toBeNull();
    expect(region(container, "market-list")).toBeNull();
    expect(column?.contains(region(container, "chart") as Node)).toBe(true);
    // Nothing in the ticket column wants to exist, so no empty ticket frame.
    expect(region(container, "ticket")).toBeNull();
  });

  it("drops the left column when neither the list nor the chart block is filled", () => {
    const { container } = render(
      <LeverageDesktopLayout orderEntry={<div>order-entry-slot</div>} />
    );

    expect(region(container, "market-column")).toBeNull();
  });

  it("splits the columns with a narrower list and a wider ticket", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const grid = (region(container, "market-column") as HTMLElement).parentElement;
    // The list floor and the ticket width, both of which Tailwind only emits
    // when the arbitrary value is a whole token in the source.
    expect(grid).toHaveClass("min-[1080px]:grid-cols-[minmax(560px,1fr)_470px]");
    // Below the breakpoint the two columns still stack.
    expect(grid).toHaveClass("grid-cols-1");
  });

  it("holds the market identity, the toggle and the chart in one bordered panel", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const panel = marketPanel(container) as HTMLElement;
    // One surface, not a card, a gap and a second card. Everything in the left
    // column lives inside it.
    expect(panel.tagName).toBe("SECTION");
    expect(panel).toHaveClass("border", "border-hairline", "rounded-card", "bg-surface");
    for (const name of ["market-list", "chart-toggle", "chart"]) {
      expect(panel.contains(region(container, name) as Node)).toBe(true);
    }
  });

  it("gives the chart the panel's leftover height and the market identity its own", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const list = region(container, "market-list");
    const chart = region(container, "chart");
    // No fixed panel height any more, and the market card no longer takes the
    // growth: it is what left the black area under it.
    expect(list?.className).not.toMatch(/h-\[682px\]/);
    expect(list).toHaveClass("shrink-0");
    expect(list).not.toHaveClass("min-[1080px]:flex-1");

    expect(chart).toHaveClass("min-[1080px]:flex-1");
    expect(marketPanel(container)).toHaveClass("min-[1080px]:flex-1");
    expect(region(container, "market-column")).toHaveClass("min-[1080px]:h-[924px]");
  });

  it("sizes the market column with a definite height, never a floor", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const column = region(container, "market-column") as HTMLElement;
    // This assertion is the chart bug. The column used to be min-h-[924px], and
    // a flexed height only counts as definite when the box it flexed inside had
    // a definite height. Under a floor, the panel, the chart block, the chart
    // region, the shell and its frame are all indefinite, so the TradingView
    // iframe's height: 100% resolves to an iframe's default 150px and the chart
    // is a sliver of candles above a black panel. Measured in headless Chrome at
    // 1440px: 150px tall under min-h-[924px], 719px under h-[924px].
    expect(column).toHaveClass("min-[1080px]:h-[924px]");
    expect(column).not.toHaveClass("min-[1080px]:min-h-[924px]");
    for (const name of column.className.split(" ").filter(Boolean)) {
      expect(name).not.toMatch(/min-h-/);
    }
  });

  it("keeps every link of the chart's height chain flexing", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    // The definite height on the column only reaches the chart if nothing
    // between them stops filling its parent. These are the links, top down.
    expect(marketPanel(container)).toHaveClass("min-[1080px]:flex-1");
    expect(region(container, "chart")?.parentElement).toHaveClass("min-[1080px]:flex-1");
    expect(region(container, "chart")).toHaveClass("min-[1080px]:flex-1");
    expect(region(container, "chart")).toHaveClass("min-[1080px]:[&>*]:flex-1");
    expect(region(container, "chart")).toHaveClass(
      "min-[1080px]:[&_[data-region=chart-panel-frame]]:flex-1"
    );
  });

  it("stretches ChartPanelShell's fixed frame to the height the panel leaves", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    const chart = region(container, "chart");
    // The chart arrives already built, so the shell's `height` prop is the
    // route's to pass. These four rules are how the column hands it the space
    // instead. Each is asserted as a whole token: Tailwind only emits an
    // arbitrary value it can read as one, and this file has twice shipped a
    // rule that silently did not exist.
    expect(chart).toHaveClass("min-[1080px]:[&>*]:flex-1");
    // Beats the shell's inline style={{ height }}. Nothing else can.
    expect(chart).toHaveClass("min-[1080px]:[&_[data-region=chart-panel-frame]]:h-auto!");
    expect(chart).toHaveClass("min-[1080px]:[&_[data-region=chart-panel-frame]]:flex-1");
    // CHART_PANEL_SHELL_HEIGHT, kept as the floor so an unstretched panel does
    // not resolve the frame to zero and blank the TradingView iframe.
    expect(chart).toHaveClass("min-[1080px]:[&_[data-region=chart-panel-frame]]:min-h-[220px]");
  });

  it("keeps the fill rules off the stacked layout below the two-column breakpoint", () => {
    const { container } = render(<LeverageDesktopLayout {...allSlots} />);

    // Every height rule the chart region carries is gated at min-[1080px]. Under
    // it the page stacks, no column floor applies, and the shell's own 220px is
    // the right height.
    const classes = (region(container, "chart")?.className ?? "").split(" ").filter(Boolean);
    for (const name of classes) {
      if (name === "flex" || name === "flex-col") continue;
      expect(name.startsWith("min-[1080px]:")).toBe(true);
    }
  });

  it("drops the column height when the column holds only the chart", () => {
    const { container } = render(<LeverageDesktopLayout chart={<div>chart-slot</div>} />);

    expect(region(container, "market-column")).not.toHaveClass("min-[1080px]:h-[924px]");
  });

  it("gives the chart region height rules only, never chrome of its own", () => {
    const { container } = render(<LeverageDesktopLayout chart={<div>chart-slot</div>} />);

    // ChartPanelShell paints the border, fill and radius. Anything drawn here
    // would double-wrap it, which shipped as a real defect once.
    const classes = (region(container, "chart")?.className ?? "").split(" ").filter(Boolean);
    expect(classes.length).toBeGreaterThan(0);
    for (const name of classes) {
      expect(name).not.toMatch(/(^|:)(border|bg-|rounded|shadow|ring|p[xytblr]?-)/);
    }
  });

  it("drops a region entirely when its optional slot is absent", () => {
    const { container } = render(
      <LeverageDesktopLayout orderEntry={<div>order-entry-slot</div>} />
    );

    // No empty framed boxes left behind for slots nobody filled.
    for (const name of [
      "search",
      "market-list",
      "ticket-header",
      "mode-switch",
      "chart-toggle",
      "chart",
      "order-summary",
      "direction-actions",
      "ledger",
    ]) {
      expect(region(container, name)).toBeNull();
    }

    // The one slot that was supplied still renders, inside the ticket column.
    expect(region(container, "order-entry")).toHaveTextContent("order-entry-slot");
    expect(region(container, "ticket")).not.toBeNull();
  });

  it("treats false and empty-string slots as absent", () => {
    const { container } = render(
      <LeverageDesktopLayout search={false} marketList="" orderEntry={<div>entry</div>} />
    );

    expect(region(container, "search")).toBeNull();
    expect(region(container, "market-list")).toBeNull();
  });

  it("shows the market list fallback when the list slot is empty", () => {
    const { container } = render(
      <LeverageDesktopLayout marketListFallback={<div>markets-unavailable</div>} />
    );

    const list = region(container, "market-list");
    expect(list).toHaveTextContent("markets-unavailable");
  });

  it("keeps the chart under the market list fallback while the list is unavailable", () => {
    const { container } = render(
      <LeverageDesktopLayout
        marketListFallback={<div>markets-unavailable</div>}
        chartToggle={<button type="button">chart-toggle-slot</button>}
        chart={<div>chart-slot</div>}
      />
    );

    const column = region(container, "market-column") as HTMLElement;
    const ordered = Array.from(column.querySelectorAll<HTMLElement>("[data-region]")).map(
      (node) => node.dataset.region
    );

    expect(ordered).toEqual(["market-list", "chart-toggle", "chart"]);
    expect(region(container, "market-list")).toHaveTextContent("markets-unavailable");
  });

  it("prefers the market list over its fallback once the list is populated", () => {
    render(
      <LeverageDesktopLayout
        marketList={<div>market-list-slot</div>}
        marketListFallback={<div>markets-unavailable</div>}
      />
    );

    expect(screen.getByText("market-list-slot")).toBeInTheDocument();
    expect(screen.queryByText("markets-unavailable")).not.toBeInTheDocument();
  });

  it("shows the ticket fallback when there is no order entry", () => {
    const { container } = render(
      <LeverageDesktopLayout ticketFallback={<div>ticket-unavailable</div>} />
    );

    expect(region(container, "ticket")).toHaveTextContent("ticket-unavailable");
    expect(region(container, "order-entry")).toBeNull();
  });

  it("prefers the order entry over the ticket fallback", () => {
    render(
      <LeverageDesktopLayout
        orderEntry={<div>order-entry-slot</div>}
        ticketFallback={<div>ticket-unavailable</div>}
      />
    );

    expect(screen.getByText("order-entry-slot")).toBeInTheDocument();
    expect(screen.queryByText("ticket-unavailable")).not.toBeInTheDocument();
  });

  it("hides the chart but keeps its toggle when the chart is collapsed", () => {
    const { container } = render(
      <LeverageDesktopLayout
        chartOpen={false}
        chartToggle={<button type="button">chart-toggle-slot</button>}
        chart={<div>chart-slot</div>}
      />
    );

    expect(region(container, "chart-toggle")).toHaveTextContent("chart-toggle-slot");
    expect(region(container, "chart")).toBeNull();
    expect(screen.queryByText("chart-slot")).not.toBeInTheDocument();
  });

  it("keeps the collapsed chart's toggle inside the panel, under the market identity", () => {
    const { container } = render(
      <LeverageDesktopLayout
        {...allSlots}
        chartOpen={false}
        chartToggle={<button type="button">chart-toggle-slot</button>}
      />
    );

    const panel = marketPanel(container) as HTMLElement;
    const toggle = region(container, "chart-toggle") as HTMLElement;
    // The row that brings the chart back stays where the chart was, inside the
    // same surface as the market card, not stranded as a bare control below it.
    expect(panel.contains(toggle)).toBe(true);
    const ordered = Array.from(panel.querySelectorAll<HTMLElement>("[data-region]")).map(
      (node) => node.dataset.region
    );
    expect(ordered).toEqual(["market-list", "chart-toggle"]);
  });

  it("drops the column height while the chart is closed rather than leaving a void", () => {
    const { container } = render(
      <LeverageDesktopLayout
        {...allSlots}
        chartOpen={false}
        chartToggle={<button type="button">chart-toggle-slot</button>}
      />
    );

    // With nothing left in the column that wants to grow, the 924px height is
    // exactly the reported defect: a market card and several hundred pixels of
    // black. The panel hugs the card and the reopen row instead.
    expect(region(container, "market-column")).not.toHaveClass("min-[1080px]:h-[924px]");
    // It still fills whatever the column gives it, so it never becomes a sliver
    // beside a taller ticket that a caller has pinned.
    expect(marketPanel(container)).toHaveClass("min-[1080px]:flex-1");
  });

  it("stops clipping the panel while the chart is closed", () => {
    const open = render(<LeverageDesktopLayout {...allSlots} />);
    // Open, the panel is held tall by the column floor, so clipping its rounded
    // corners costs nothing and a full-bleed market table needs it.
    expect(marketPanel(open.container)).toHaveClass("overflow-hidden");
    open.unmount();

    const closed = render(<LeverageDesktopLayout {...allSlots} chartOpen={false} />);
    // Closed, the panel is barely taller than the market card, and clipping
    // would cut the market picker's dropdown off under its own trigger.
    expect(marketPanel(closed.container)).toHaveClass("overflow-visible");
    expect(marketPanel(closed.container)).not.toHaveClass("overflow-hidden");
  });

  it("pads the chart block off the panel border, and only tops it up with no market card", () => {
    const withCard = render(<LeverageDesktopLayout {...allSlots} />);
    const block = region(withCard.container, "chart")?.parentElement;
    expect(block).toHaveClass("px-3", "pb-3");
    // The market card's own bottom padding is the gap. A second one would
    // double it.
    expect(block).not.toHaveClass("pt-3");
    withCard.unmount();

    const alone = render(<LeverageDesktopLayout chart={<div>chart-slot</div>} />);
    expect(region(alone.container, "chart")?.parentElement).toHaveClass("pt-3");
  });

  it("appends marketListClassName to the panel without dropping its own classes", () => {
    const { container } = render(
      <LeverageDesktopLayout {...allSlots} marketListClassName="min-[1080px]:min-h-[600px]" />
    );

    const panel = marketPanel(container);
    expect(panel).toHaveClass("min-[1080px]:min-h-[600px]");
    expect(panel).toHaveClass("min-[1080px]:flex-1", "rounded-card", "border");
  });

  it("renders nothing at all rather than an empty frame when no slot is filled", () => {
    const { container } = render(<LeverageDesktopLayout />);

    expect(region(container, "market-list")).toBeNull();
    expect(region(container, "ticket")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("appends a caller className to the root without dropping the layout classes", () => {
    const { container } = render(
      <LeverageDesktopLayout className="mt-10" orderEntry={<div>entry</div>} />
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("mt-10");
    expect(root).toHaveClass("flex");
  });
});

// "marketList" -> "market-list", matching the data-region names.
function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
