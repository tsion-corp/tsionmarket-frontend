import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ChartDisclosure,
  PairHeader,
  PairSelector,
  TokenBadge,
  type PairHeaderProps,
} from "@/components/ui/trade-pair-header";

// No NextIntlClientProvider anywhere in this file. These are primitives below
// the feature line, so every string arrives as a prop and a returning
// useTranslations call would throw on the first render here.
const LABELS = { change24h: "24h change", viewChart: "View Chart" };

function renderHeader(props: Partial<PairHeaderProps> = {}) {
  const onToggleChart = props.onToggleChart ?? vi.fn();
  const result = render(
    <PairHeader
      symbol="BTC"
      change24h="-2.20%"
      changeDirection="down"
      chartExpanded={false}
      chartPanelId="chart-panel"
      labels={LABELS}
      {...props}
      onToggleChart={onToggleChart}
    />
  );
  return { ...result, onToggleChart };
}

// Every mark these rows draw is decorative next to real text, and every one of
// them has to take its colour from the caller. A baked stroke is the defect
// this locks out.
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

// The pill's measurements are shared by the badge and the selector trigger, so
// both are held to them here.
function expectPillShape(pill: HTMLElement) {
  for (const shape of [
    // The design's measurements, which the pill keeps from sm up. Below that
    // it draws a step smaller so the perps ticket's top strip fits a phone.
    "sm:h-[40.5px]",
    "sm:px-[11px]",
    "sm:text-[15px]",
    "h-[34px]",
    "px-[9px]",
    "text-[13px]",
    "rounded-2xl",
    "gap-[5.5px]",
    "border-[1.686px]",
    "ws-discovery-title",
    "text-grey-100",
  ]) {
    expect(pill).toHaveClass(shape);
  }
}

describe("PairHeader labels", () => {
  it("names the change and the disclosure from the strings it is handed", () => {
    renderHeader();
    expect(screen.getByText("24h change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Chart/ })).toBeInTheDocument();
  });

  // Another desk's wording, in another language, with no catalogue mounted.
  it("takes another desk's wording", () => {
    renderHeader({ labels: { change24h: "24-Stunden-Änderung", viewChart: "Chart ansehen" } });
    expect(screen.getByText("24-Stunden-Änderung")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chart ansehen/ })).toBeInTheDocument();
    expect(screen.queryByText("24h change")).toBeNull();
  });
});

describe("PairHeader change", () => {
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

  // An exact zero and a market with no prior close are both flat, and neither
  // may be painted as a gain. The tone is the asset table's text-white/55: the
  // ticket used to carry a second copy of this union with text-grey-400 on it,
  // and ADR-2026-09-12 keeps the tone already on screen in the table.
  it("paints a flat change in the table's own flat tone", () => {
    renderHeader({ change24h: "0.00%", changeDirection: "flat" });
    const change = screen.getByText("0.00%");
    expect(change).toHaveClass("text-white/55");
    expect(change).not.toHaveClass("text-grey-400");
    expect(change).not.toHaveClass("text-up");
    expect(change).not.toHaveClass("text-down");
  });
});

// The spot desk changes market from the list beside the ticket, so the pill
// here names the selected token and does nothing else.
describe("TokenBadge", () => {
  it("prints the label it is handed and reads nothing into its shape", () => {
    const { unmount } = render(<TokenBadge symbol="BTC" />);
    expect(screen.getByText("BTC")).toBeInTheDocument();
    unmount();

    render(<TokenBadge symbol="BTC/USDT" />);
    expect(screen.getByText("BTC/USDT")).toBeInTheDocument();
  });

  // Dropping the chevron while leaving a click handler behind would hide an
  // affordance that still fires, so the element itself is not a control.
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
    render(<TokenBadge symbol="BTC" />);
    expectPillShape(screen.getByText("BTC"));
  });

  it("takes extra classes from whoever places it", () => {
    render(<TokenBadge symbol="BTC" className="w-full" />);
    expect(screen.getByText("BTC")).toHaveClass("w-full");
  });
});

// Perps composes this pill on its own ticket, where the market is changed from
// the ticket itself and the chevron names a real affordance.
describe("PairSelector", () => {
  it("is a trigger, not a list, and takes its hidden name as a prop", () => {
    const onSelectPair = vi.fn();
    render(<PairSelector pair="BTC-USDC" onSelectPair={onSelectPair} label="Change market" />);
    const trigger = screen.getByRole("button", { name: /BTC-USDC/ });

    // The hidden half of the name is what says the pill opens something. It is
    // its own element, so the accessible name runs the two together.
    expect(trigger).toHaveAccessibleName("BTC-USDCChange market");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);
    expect(onSelectPair).toHaveBeenCalledOnce();
  });

  it("reflects the open state the composer owns", () => {
    render(<PairSelector pair="BTC-USDC" onSelectPair={vi.fn()} label="Change market" menuOpen />);
    expect(screen.getByRole("button", { name: /BTC-USDC/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("draws the same pill as the badge, with its chevron and tintable glyph", () => {
    const { container } = render(
      <PairSelector pair="BTC-USDC" onSelectPair={vi.fn()} label="Change market" />
    );
    const trigger = screen.getByRole("button", { name: /BTC-USDC/ });
    expectPillShape(trigger);
    expect(trigger.querySelector("svg")).not.toBeNull();
    expectIconsInheritColour(container);
  });
});

describe("ChartDisclosure", () => {
  it("reports its toggle and wires aria to the panel it controls", () => {
    const onToggle = vi.fn();
    render(
      <ChartDisclosure
        expanded={false}
        onToggle={onToggle}
        panelId="rwa-chart-panel"
        label="View Chart"
      />
    );
    const disclosure = screen.getByRole("button", { name: /View Chart/ });

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("aria-controls", "rwa-chart-panel");

    fireEvent.click(disclosure);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows the expanded state when the panel is open", () => {
    renderHeader({ chartExpanded: true });
    expect(screen.getByRole("button", { name: /View Chart/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  // The chevron is the only sign the row gives that the panel below is open, so
  // the rotation is the state made visible and is pinned rather than left to a
  // passing class edit.
  it("turns the chevron box only while the panel is open", () => {
    const { rerender } = render(
      <ChartDisclosure expanded={false} onToggle={vi.fn()} panelId="p" label="View Chart" />
    );
    const chevronBox = () =>
      screen.getByRole("button", { name: /View Chart/ }).lastElementChild as HTMLElement;

    expect(chevronBox()).toHaveClass("rotate-0");
    expect(chevronBox()).not.toHaveClass("rotate-180");
    expect(chevronBox()).toHaveClass("transition-transform");

    rerender(<ChartDisclosure expanded onToggle={vi.fn()} panelId="p" label="View Chart" />);
    expect(chevronBox()).toHaveClass("rotate-180");
    expect(chevronBox()).not.toHaveClass("rotate-0");
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
  // mark spans 8.994px.
  it("sets the chevron apart from the label cluster at the design's gap and size", () => {
    renderHeader();
    const disclosure = screen.getByRole("button", { name: /View Chart/ });
    expect(disclosure).toHaveClass("gap-[8.994px]");

    const svgs = Array.from(disclosure.querySelectorAll("svg"));
    const chart = svgs[0]!;
    const chevron = svgs[svgs.length - 1]!;
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
