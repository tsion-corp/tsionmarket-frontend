import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { SpotOrderModeToggle } from "@/features/trade/components/spot-order-mode-toggle";
import {
  SpotPairHeader,
  SpotPairSelector,
  type SpotPairHeaderProps,
} from "@/features/trade/components/spot-pair-header";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

function renderHeader(props: Partial<SpotPairHeaderProps> = {}) {
  const onToggleChart = props.onToggleChart ?? vi.fn();
  const result = renderWithIntl(
    <SpotPairHeader
      symbol="BTC"
      change24h="-2.20%"
      changeDirection="down"
      chartExpanded={false}
      chartPanelId="spot-chart-panel"
      {...props}
      onToggleChart={onToggleChart}
    />
  );
  return { ...result, onToggleChart };
}

// Every mark these rows draw is decorative next to real text, and every one of
// them has to take its colour from the caller. A baked stroke is the defect
// this locks out: it is what forced a local copy of the chart glyph and the
// magnifier into feature files in the first place.
function expectIconsInheritColour(container: HTMLElement) {
  const svgs = Array.from(container.querySelectorAll("svg"));
  expect(svgs.length).toBeGreaterThan(0);
  for (const svg of svgs) {
    expect(svg).toHaveAttribute("aria-hidden");
    for (const shape of Array.from(svg.querySelectorAll("*"))) {
      for (const attr of ["stroke", "fill"]) {
        const value = shape.getAttribute(attr);
        if (value !== null) expect(["currentColor", "none"]).toContain(value);
      }
    }
  }
}

// The pill's measurements are shared by the spot badge and the perps trigger,
// so both are held to them here.
function expectPillShape(pill: HTMLElement) {
  for (const shape of [
    "h-[40.5px]",
    "rounded-2xl",
    "px-[11px]",
    "gap-[5.5px]",
    "border-[1.686px]",
    "ws-discovery-title",
    "text-[15px]",
    "text-grey-100",
  ]) {
    expect(pill).toHaveClass(shape);
  }
}

// The toggle left the spot strip, but perps still composes it from this module's
// sibling, so its behaviour stays locked here rather than being deleted with the
// spot usage.
describe("SpotOrderModeToggle", () => {
  it("reports the mode the user picks and marks the current one pressed", () => {
    const onModeChange = vi.fn();
    renderWithIntl(<SpotOrderModeToggle mode="market" onModeChange={onModeChange} />);

    const limit = screen.getByRole("button", { name: "Limit" });
    const market = screen.getByRole("button", { name: "Market" });
    expect(market).toHaveAttribute("aria-pressed", "true");
    expect(limit).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(limit);
    expect(onModeChange).toHaveBeenCalledWith("limit");
  });

  it("does not fire a change when the pressed option is clicked again", () => {
    const onModeChange = vi.fn();
    renderWithIntl(<SpotOrderModeToggle mode="market" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Market" }));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  // A segmented control built from divs would pass a click test and fail this
  // one: the options must be real buttons inside a labelled group, and the
  // arrow keys must move between them.
  it("is keyboard operable", () => {
    const onModeChange = vi.fn();
    renderWithIntl(<SpotOrderModeToggle mode="market" onModeChange={onModeChange} />);

    const group = screen.getByRole("group", { name: "Order type" });
    const limit = screen.getByRole("button", { name: "Limit" });
    const market = screen.getByRole("button", { name: "Market" });
    expect(group).toContainElement(limit);
    expect(limit.tagName).toBe("BUTTON");
    expect(market.tagName).toBe("BUTTON");
    expect(limit).not.toHaveAttribute("tabindex", "-1");

    market.focus();
    fireEvent.keyDown(market, { key: "ArrowLeft" });
    expect(onModeChange).toHaveBeenCalledWith("limit");
    expect(limit).toHaveFocus();
  });
});

describe("SpotPairHeader change", () => {
  it("paints a negative change with the down token", () => {
    renderHeader({ change24h: "-2.20%", changeDirection: "down" });
    const change = screen.getByText("-2.20%");
    expect(change).toHaveClass("text-down");
    expect(change).not.toHaveClass("text-up");
  });

  it("paints a positive change with the up token", () => {
    renderHeader({ change24h: "+2.52%", changeDirection: "up" });
    const change = screen.getByText("+2.52%");
    expect(change).toHaveClass("text-up");
    expect(change).not.toHaveClass("text-down");
  });

  it("names the change for a screen reader", () => {
    renderHeader({ change24h: "-2.20%", changeDirection: "down" });
    expect(screen.getByText("24h change")).toBeInTheDocument();
  });
});

// Replaces the old "pair selector" block on this surface. The spot desk changes
// market from the list beside the ticket, so the pill here names the selected
// token and does nothing else.
describe("SpotPairHeader token badge", () => {
  it("prints the label it is handed and reads nothing into its shape", () => {
    const { unmount } = renderHeader({ symbol: "BTC" });
    expect(screen.getByText("BTC")).toBeInTheDocument();
    unmount();

    renderHeader({ symbol: "SOL" });
    expect(screen.getByText("SOL")).toBeInTheDocument();
  });

  // The chevron went because the pill is not a dropdown. Dropping the mark
  // while leaving a click handler behind would hide an affordance that still
  // fires, so the element itself has to stop being a control.
  it("is a badge, not a control", () => {
    renderHeader({ symbol: "BTC" });
    const badge = screen.getByText("BTC");

    expect(badge.tagName).toBe("SPAN");
    expect(badge).not.toHaveAttribute("aria-haspopup");
    expect(badge).not.toHaveAttribute("aria-expanded");
    expect(badge.closest("button")).toBeNull();
    expect(badge.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("button", { name: /BTC/ })).toBeNull();
  });

  // Figma 173:42174. A plain `border` renders the edge at 1px.
  it("keeps the pill's geometry", () => {
    renderHeader({ symbol: "BTC" });
    expectPillShape(screen.getByText("BTC"));
  });
});

// Spot orders on this rail are market orders, so the strip offers no choice of
// order type. The control still exists for perps; it is only its use here that
// went.
describe("SpotPairHeader order type", () => {
  it("renders no Limit/Market control", () => {
    renderHeader();
    expect(screen.queryByRole("group", { name: "Order type" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Limit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Market" })).toBeNull();
  });
});

// Perps composes this pill on its own ticket, where the market is changed from
// the ticket itself and the chevron names a real affordance.
describe("SpotPairSelector", () => {
  it("is a trigger, not a list", () => {
    const onSelectPair = vi.fn();
    renderWithIntl(<SpotPairSelector pair="BTC-USDC" onSelectPair={onSelectPair} />);
    const trigger = screen.getByRole("button", { name: /BTC-USDC/ });

    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);
    expect(onSelectPair).toHaveBeenCalledOnce();
  });

  it("reflects the open state the composer owns", () => {
    renderWithIntl(<SpotPairSelector pair="BTC-USDC" onSelectPair={vi.fn()} menuOpen />);
    expect(screen.getByRole("button", { name: /BTC-USDC/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("draws the same pill as the badge, with its chevron and tintable glyph", () => {
    const { container } = renderWithIntl(
      <SpotPairSelector pair="BTC-USDC" onSelectPair={vi.fn()} />
    );
    const trigger = screen.getByRole("button", { name: /BTC-USDC/ });
    expectPillShape(trigger);
    expect(trigger.querySelector("svg")).not.toBeNull();
    expectIconsInheritColour(container);
  });
});

describe("SpotPairHeader chart disclosure", () => {
  it("reports its toggle and wires aria to the panel it controls", () => {
    const { onToggleChart } = renderHeader({ chartExpanded: false });
    const disclosure = screen.getByRole("button", { name: /View Chart/ });

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("aria-controls", "spot-chart-panel");

    fireEvent.click(disclosure);
    expect(onToggleChart).toHaveBeenCalledOnce();
  });

  it("shows the expanded state when the panel is open", () => {
    renderHeader({ chartExpanded: true });
    expect(screen.getByRole("button", { name: /View Chart/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("draws every glyph from the shared set, tintable and decorative", () => {
    const { container } = renderHeader();
    expectIconsInheritColour(container);
  });

  // The design accents both marks in Kash yellow, #FFD62F, which is exactly
  // --color-kash. The label stays white beside them. Locked because the tint
  // is a class on each mark rather than anything the glyph bakes in, so it is
  // easy to drop in passing and hard to spot in a diff.
  it("accents the dot and the chart glyph with the kash token", () => {
    renderHeader();
    const disclosure = screen.getByRole("button", { name: /View Chart/ });

    // The row's own text stays white; only the two marks carry the accent.
    expect(disclosure).toHaveClass("text-white");

    const dot = disclosure.querySelector("span[aria-hidden].rounded-full");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("bg-kash");
    expect(dot).not.toHaveClass("bg-current");

    const chart = disclosure.querySelector("svg");
    expect(chart).not.toBeNull();
    expect(chart).toHaveClass("text-kash");
  });

  // Figma 173:42181 sets the cluster of dot, glyph and label apart from the
  // chevron by 8.994px, and drops the chevron into a 17.988px box where the
  // mark spans 8.994px. One flat row at 4.5px throughout put the chevron half
  // that distance from the label and drew the mark half again too wide.
  //
  // This chevron is a disclosure, not a menu affordance, so it stayed when the
  // pill's chevron went.
  it("sets the chevron apart from the label cluster at the design's gap and size", () => {
    renderHeader();
    const disclosure = screen.getByRole("button", { name: /View Chart/ });
    expect(disclosure).toHaveClass("gap-[8.994px]");

    const svgs = Array.from(disclosure.querySelectorAll("svg"));
    const chart = svgs[0];
    const chevron = svgs[svgs.length - 1];
    expect(chevron).not.toBe(chart);

    // The dot, the chart glyph and the label ride together in the cluster, so
    // none of them is a direct child of the row that holds the wide gap.
    expect(chart.parentElement).not.toBe(disclosure);
    expect(chart.parentElement?.parentElement).toBe(disclosure);

    const chevronBox = chevron.parentElement;
    expect(chevronBox?.parentElement).toBe(disclosure);
    expect(chevronBox).toHaveClass("size-[17.988px]");
    // 11.2425 is the glyph's own box: its arms span 8.994px of that, with the
    // rest taken by the stroke the icon draws around them.
    expect(chevron).toHaveAttribute("width", "11.2425");
  });
});
