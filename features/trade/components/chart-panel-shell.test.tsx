import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ChartPanelShell,
  ChartPanelToggle,
  type ChartPanelLabels,
} from "@/features/trade/components/chart-panel-shell";

// The shell never reads a catalog itself, so every test supplies the same
// already-translated strings the consuming screen would pass.
const labels: ChartPanelLabels = {
  loading: "Loading…",
  empty: "No chart for this token yet.",
  error: "Memecoin markets are unavailable right now.",
  retry: "Try again",
};

function region(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-region="${name}"]`);
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

describe("ChartPanelShell", () => {
  it("renders the chart it is given inside the framed panel", () => {
    const { container } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const frame = region(container, "chart-panel-frame");
    expect(frame).not.toBeNull();
    expect(within(frame as HTMLElement).getByText("chart-engine")).toBeInTheDocument();
  });

  it("shows the loading skeleton instead of the chart while loading", () => {
    const { container } = render(
      <ChartPanelShell labels={labels} state="loading">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(region(container, "chart-panel-skeleton")).not.toBeNull();
    expect(screen.queryByText("chart-engine")).not.toBeInTheDocument();
  });

  it("keeps the frame filled when there is no chart yet rather than leaving it blank", () => {
    const { container } = render(<ChartPanelShell labels={labels} />);

    expect(region(container, "chart-panel-frame")).not.toBeNull();
    expect(screen.getByText("No chart for this token yet.")).toBeInTheDocument();
  });

  it("shows the error message and retries through the callback", () => {
    const onRetry = vi.fn();
    render(
      <ChartPanelShell labels={labels} state="error" onRetry={onRetry}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByText("chart-engine")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reports the chosen timeframe through its callback without holding the selection", () => {
    const onTimeframeChange = vi.fn();
    const { rerender } = render(
      <ChartPanelShell
        labels={labels}
        timeframes={[
          { value: "1h", label: "1H" },
          { value: "1d", label: "1D" },
        ]}
        timeframe="1h"
        timeframeLabel="Chart timeframe"
        onTimeframeChange={onTimeframeChange}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const group = screen.getByRole("group", { name: "Chart timeframe" });
    expect(within(group).getByRole("button", { name: "1H" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(within(group).getByRole("button", { name: "1D" }));
    expect(onTimeframeChange).toHaveBeenCalledWith("1d");

    // Controlled: the shell holds no market state, so the selection only moves
    // when the caller sends a new one back down.
    expect(within(group).getByRole("button", { name: "1D" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    rerender(
      <ChartPanelShell
        labels={labels}
        timeframes={[
          { value: "1h", label: "1H" },
          { value: "1d", label: "1D" },
        ]}
        timeframe="1d"
        timeframeLabel="Chart timeframe"
        onTimeframeChange={onTimeframeChange}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(within(group).getByRole("button", { name: "1D" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("omits the timeframe control when the screen does not offer one", () => {
    const { container } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-timeframes")).toBeNull();
  });

  it("renders the market identity header from the values it is handed", () => {
    const { container } = render(
      <ChartPanelShell
        labels={labels}
        symbol="PEPE/SOL"
        price="$0.00001234"
        change="+14.25%"
        changeDirection="up"
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const header = region(container, "chart-panel-header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText("PEPE/SOL")).toBeInTheDocument();
    expect(within(header as HTMLElement).getByText("$0.00001234")).toBeInTheDocument();
    expect(within(header as HTMLElement).getByText("+14.25%")).toHaveClass("text-up");
  });

  it("leaves the header out entirely when the screen carries its own", () => {
    const { container } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-header")).toBeNull();
  });

  it("opens the market select through its callback rather than owning the picker", () => {
    const onSymbolClick = vi.fn();
    render(
      <ChartPanelShell
        labels={labels}
        symbol="BTC/USDT"
        symbolTriggerLabel="Change market"
        onSymbolClick={onSymbolClick}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Change market" }));
    expect(onSymbolClick).toHaveBeenCalledTimes(1);
  });

  it("folds the panel shut rather than dropping it, and keeps its toggle working", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <ChartPanelShell
        labels={labels}
        open={false}
        onOpenChange={onOpenChange}
        toggleLabel="View Chart"
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    // The reported defect: the chevron rotated smoothly and the panel under it
    // snapped, because the panel was swapped out of the tree. It stays in the
    // tree now, at a zero-height grid row, so the collapse can animate.
    const panel = container.querySelector("#chart-panel-shell-body");
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass("[grid-template-rows:0fr]");
    // Clipped content is out of the tab order and unread, the way an unmounted
    // panel was.
    expect(panel).toHaveAttribute("inert");
    // The frame folds on an empty box: the chart itself is still gated on the
    // open state, so a collapsed panel loads nothing.
    expect(screen.queryByText("chart-engine")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View Chart" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("opens the panel to its own content height, with no pixel figure to go stale", () => {
    const { container, rerender } = render(
      <ChartPanelShell labels={labels} open={false} onOpenChange={vi.fn()} toggleLabel="View Chart">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    rerender(
      <ChartPanelShell labels={labels} open onOpenChange={vi.fn()} toggleLabel="Close Chart">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const panel = container.querySelector("#chart-panel-shell-body");
    expect(panel).toHaveClass("[grid-template-rows:1fr]");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByText("chart-engine")).toBeInTheDocument();
  });

  it("unmounts the chart on close so a collapsed panel keeps no iframe loading", () => {
    // The whole reason the chart is gated inside the panel instead of simply
    // wrapped: the leverage screen's chart is a TradingView iframe, and a
    // panel that kept it mounted would leave one loading on every ticket.
    const { container, rerender } = render(
      <ChartPanelShell labels={labels} open onOpenChange={vi.fn()} toggleLabel="Close Chart">
        <iframe title="tradingview" src="about:blank" />
      </ChartPanelShell>
    );

    expect(container.querySelector("iframe")).not.toBeNull();

    rerender(
      <ChartPanelShell labels={labels} open={false} onOpenChange={vi.fn()} toggleLabel="View Chart">
        <iframe title="tradingview" src="about:blank" />
      </ChartPanelShell>
    );

    expect(container.querySelector("iframe")).toBeNull();
    // The box it folds on is still there, so there is something to animate.
    expect(region(container, "chart-panel-frame")).not.toBeNull();
  });

  it("keeps the frame a flex child of a flex box so the desk can still stretch it", () => {
    // LeverageDesktopLayout turns the frame's inline height into a flexed one
    // with `[&_[data-region=chart-panel-frame]]:flex-1`, and a flexed height is
    // only definite while every box above it is too. The animating panel sits
    // between the shell root and the frame now, so the chain runs through it.
    const { container } = render(
      <ChartPanelShell labels={labels} open onOpenChange={vi.fn()} toggleLabel="Close Chart">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const frame = region(container, "chart-panel-frame") as HTMLElement;
    const clip = frame.parentElement as HTMLElement;
    expect(clip).toHaveClass("flex", "flex-col", "min-h-0");

    const panel = clip.parentElement as HTMLElement;
    expect(panel).toHaveAttribute("id", "chart-panel-shell-body");

    const stretch = panel.parentElement as HTMLElement;
    expect(stretch).toHaveClass("flex", "flex-col", "min-h-0", "flex-1");
    // Reaches the animating root, which takes no classes of its own.
    expect(stretch).toHaveClass("[&>*]:flex-1", "[&>*]:min-h-0");
  });

  it("lets a shut panel reach zero rather than stopping at the frame's height", () => {
    // Measured in Chrome at 1440px before this was unconditional: the desk
    // panel collapsed to 232px and stayed there, because a flex item's
    // automatic minimum is its content's and the frame carries a real height.
    // The grown height goes when the panel shuts; the floor-remover must not.
    const { container } = render(
      <ChartPanelShell labels={labels} open={false} onOpenChange={vi.fn()} toggleLabel="View Chart">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const panel = container.querySelector("#chart-panel-shell-body") as HTMLElement;
    const stretch = panel.parentElement as HTMLElement;
    expect(stretch).toHaveClass("[&>*]:min-h-0");
    // A grown flex child with nothing in it would hold open the height a
    // definite-height column gave it.
    expect(stretch).not.toHaveClass("flex-1");
    expect(stretch).not.toHaveClass("[&>*]:flex-1");
  });

  it("leaves no gap under the toggle while the panel is shut", () => {
    // The panel's own spacing lives inside the clip, not in a flex gap on the
    // root: a gap would still be drawn between the toggle and a zero-height
    // panel, pushing everything under the shell down by 12px while collapsed.
    const { container } = render(
      <ChartPanelShell labels={labels} open={false} onOpenChange={vi.fn()} toggleLabel="View Chart">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(container.firstElementChild).not.toHaveClass("gap-3");

    // And it is a margin on the content, not padding on the clip: padding sits
    // outside the zero-height box a collapsed grid row makes, so `pt-3` there
    // left the shut panel resting at 12px instead of 0 in Chrome.
    const clip = container.querySelector("#chart-panel-shell-body")
      ?.firstElementChild as HTMLElement;
    expect(clip).not.toHaveClass("pt-3");
    expect(clip.firstElementChild).toHaveClass("mt-3");
  });

  it("gives the panel no lead margin when nothing is laid out above it", () => {
    const { container } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-frame")).not.toHaveClass("mt-3");
  });

  it("hangs the lead margin on the timeframe strip when the screen offers one", () => {
    const { container } = render(
      <ChartPanelShell
        labels={labels}
        open
        onOpenChange={vi.fn()}
        toggleLabel="Close Chart"
        timeframes={[{ value: "1h", label: "1H" }]}
        timeframe="1h"
        timeframeLabel="Chart timeframe"
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    // Whatever comes first inside the clip carries it, so the 12px is never
    // counted twice.
    expect(region(container, "chart-panel-timeframes")).toHaveClass("mt-3");
    expect(region(container, "chart-panel-frame")).not.toHaveClass("mt-3");
  });

  it("omits the toggle when the screen does not offer collapsing", () => {
    const { container } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-toggle")).toBeNull();
    expect(region(container, "chart-panel-frame")).not.toBeNull();
  });

  it("applies the caller's height to the frame and keeps the design default", () => {
    const { container, rerender } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-frame")).toHaveStyle({ height: "220px" });

    rerender(
      <ChartPanelShell labels={labels} height={180}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-frame")).toHaveStyle({ height: "180px" });
  });

  it("writes the frame height as a pixel number, never a percentage", () => {
    const { container } = render(
      <ChartPanelShell labels={labels} height={640}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    // The chart inside the frame sizes against this. A TradingView iframe or a
    // canvas asked to fill a percentage-height box resolves to its own default
    // instead, which is the sliver-of-candles bug the leverage screen shipped.
    const frame = region(container, "chart-panel-frame") as HTMLElement;
    expect(frame.style.height).toMatch(/^\d+px$/);
  });

  it("reports the fullscreen state to the screen rather than enlarging itself", () => {
    const onFullscreenChange = vi.fn();
    const { container, rerender } = render(
      <ChartPanelShell
        labels={{ ...labels, expand: "Expand chart", exitFullscreen: "Exit fullscreen" }}
        onFullscreenChange={onFullscreenChange}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const expand = screen.getByRole("button", { name: "Expand chart" });
    // The control sits in the header, top right, and the shell paints no
    // overlay of its own: the screen decides what fullscreen means.
    expect(region(container, "chart-panel-header")).toContainElement(expand);
    expect(expand).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(expand);
    expect(onFullscreenChange).toHaveBeenCalledWith(true);
    // Controlled: nothing moves until the caller sends the new state back.
    expect(screen.getByRole("button", { name: "Expand chart" })).toBeInTheDocument();

    rerender(
      <ChartPanelShell
        labels={{ ...labels, expand: "Expand chart", exitFullscreen: "Exit fullscreen" }}
        fullscreen
        onFullscreenChange={onFullscreenChange}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const collapse = screen.getByRole("button", { name: "Exit fullscreen" });
    expect(collapse).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(collapse);
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps a fullscreen-only header out of the flow so the chart starts at the top", () => {
    const { container } = render(
      <ChartPanelShell labels={{ ...labels, expand: "Expand chart" }} onFullscreenChange={vi.fn()}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const header = region(container, "chart-panel-header") as HTMLElement;
    // The reported gap. A whole row for one 28px button, plus the shell's gap
    // under it, put 40px of black between the screen's chart toggle and the
    // chart's own toolbar. With no identity to lay out, the header keeps the
    // control and stops taking height.
    expect(header).toHaveClass("absolute", "bottom-full", "right-0");
    expect(header).not.toHaveClass("w-full");
    // An absolute child needs a positioned ancestor, or it anchors to the
    // viewport instead of the shell.
    expect(container.firstElementChild).toHaveClass("relative");
    // The frame is then the shell's first laid-out child, directly under
    // whatever row the screen puts above it.
    expect(region(container, "chart-panel-frame")).not.toBeNull();

    // The control itself is untouched: still rendered, still named, still
    // pointing at the panel it enlarges.
    const expand = screen.getByRole("button", { name: "Expand chart" });
    expect(header).toContainElement(expand);
    expect(expand).toHaveAttribute("aria-controls", "chart-panel-shell-body");
  });

  it("gives the header a real row as soon as the screen hands it identity", () => {
    const { container } = render(
      <ChartPanelShell
        labels={{ ...labels, expand: "Expand chart" }}
        onFullscreenChange={vi.fn()}
        symbol="BTC/USDC"
        price="$100,000.00"
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    // This is the fullscreen arrangement: the market card is not on the
    // backdrop, so the shell carries the identity and the row is earned.
    const header = region(container, "chart-panel-header") as HTMLElement;
    expect(header).toHaveClass("flex", "w-full", "justify-between");
    expect(header).not.toHaveClass("absolute");
    // No `relative` on the root here. A fullscreen consumer passes `fixed` in
    // className, and which of the two won would come down to the order Tailwind
    // emitted them in.
    expect(container.firstElementChild).not.toHaveClass("relative");
    expect(header).toContainElement(screen.getByRole("button", { name: "Expand chart" }));
  });

  it("gives the identity slot to the screen's own market picker instead of the pill", () => {
    const { container } = render(
      <ChartPanelShell
        labels={{ ...labels, expand: "Expand chart", exitFullscreen: "Exit fullscreen" }}
        fullscreen
        onFullscreenChange={vi.fn()}
        marketPicker={<button type="button">BTC-USDC</button>}
        symbol="BTC/USDC"
        price="$100,000.00"
        change="+0.59%"
        changeDirection="up"
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const header = region(container, "chart-panel-header") as HTMLElement;
    // The picker carries the market name itself, so the shell drops its own
    // copy rather than printing the pair twice across one header row.
    expect(within(header).getByRole("button", { name: "BTC-USDC" })).toBeInTheDocument();
    expect(within(header).queryByText("BTC/USDC")).not.toBeInTheDocument();
    // Everything else the fullscreen header carries is untouched.
    expect(within(header).getByText("$100,000.00")).toBeInTheDocument();
    expect(within(header).getByText("+0.59%")).toHaveClass("text-up");
    expect(within(header).getByRole("button", { name: "Exit fullscreen" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("earns the header a real row for a market picker on its own", () => {
    const { container } = render(
      <ChartPanelShell
        labels={{ ...labels, expand: "Expand chart" }}
        onFullscreenChange={vi.fn()}
        marketPicker={<button type="button">BTC-USDC</button>}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    // A picker is identity: it names the market and it is the tallest thing in
    // the row. Pinned out of flow it would sit above the viewport's top edge on
    // a fullscreen overlay, taking the exit control with it.
    const header = region(container, "chart-panel-header") as HTMLElement;
    expect(header).toHaveClass("flex", "w-full", "justify-between");
    expect(header).not.toHaveClass("absolute");
    expect(container.firstElementChild).not.toHaveClass("relative");
  });

  it("names the fullscreen control from the copy it is handed, in both states", () => {
    const { rerender } = render(
      <ChartPanelShell labels={{ ...labels, expand: "Agrandir" }} onFullscreenChange={vi.fn()}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(screen.getByRole("button", { name: "Agrandir" })).toBeInTheDocument();

    // Without exit copy the one name it was given still stands, so the control
    // never falls back to an unnamed icon button.
    rerender(
      <ChartPanelShell
        labels={{ ...labels, expand: "Agrandir" }}
        fullscreen
        onFullscreenChange={vi.fn()}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(screen.getByRole("button", { name: "Agrandir" })).toBeInTheDocument();
  });

  it("offers no fullscreen control without both a callback and a name for it", () => {
    const { container, rerender } = render(
      <ChartPanelShell labels={labels} onFullscreenChange={vi.fn()}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-header")).toBeNull();

    rerender(
      <ChartPanelShell labels={{ ...labels, expand: "Expand chart" }}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(region(container, "chart-panel-header")).toBeNull();
  });

  it("hides the fullscreen control while the chart is collapsed", () => {
    render(
      <ChartPanelShell
        labels={{ ...labels, expand: "Expand chart" }}
        open={false}
        onOpenChange={vi.fn()}
        toggleLabel="View Chart"
        onFullscreenChange={vi.fn()}
      >
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    expect(screen.queryByRole("button", { name: "Expand chart" })).not.toBeInTheDocument();
  });

  it("appends a caller className to the root without dropping its own layout", () => {
    const { container } = render(
      <ChartPanelShell labels={labels} className="mt-6">
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("mt-6");
    expect(root).toHaveClass("flex");
  });

  it("drops the frame's border, radius and inset shadow below md, and keeps them from md up", () => {
    const { container } = render(
      <ChartPanelShell labels={labels}>
        <div>chart-engine</div>
      </ChartPanelShell>
    );

    const frame = region(container, "chart-panel-frame") as HTMLElement;
    // The phone ticket wants the chart edge to edge, borderless. There is one
    // render call site for this shell (the leverage desk and the phone ticket
    // share it), so the split is a bare CSS variant rather than a prop: base
    // classes keep the desktop frame exactly as it was, and max-md: undoes it
    // below the breakpoint.
    expect(frame).toHaveClass("max-md:border-0", "max-md:rounded-none", "max-md:shadow-none");
    // The base (desktop) classes stay untouched. md: and up must render
    // byte-identical to before this change.
    expect(frame).toHaveClass(
      "bg-surface",
      "border-hairline",
      "rounded-card",
      "w-full",
      "overflow-hidden",
      "border",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
    );
  });
});

describe("ChartPanelToggle", () => {
  it("reports the next open state so the screen keeps ownership of it", () => {
    const onOpenChange = vi.fn();
    render(<ChartPanelToggle open onOpenChange={onOpenChange} label="Close Chart" />);

    fireEvent.click(screen.getByRole("button", { name: "Close Chart" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("draws every glyph from the shared set, tintable and decorative", () => {
    const { container } = render(
      <ChartPanelToggle open onOpenChange={vi.fn()} label="Close Chart" />
    );
    expectIconsInheritColour(container);
  });

  it("accents its dot and glyph with the kash token the comp specifies", () => {
    const { container } = render(
      <ChartPanelToggle open onOpenChange={vi.fn()} label="Close Chart" />
    );

    // The comp paints both marks #FFD62F on every page, and --color-kash is
    // exactly that value. The label beside them stays white. Locked because
    // the tint is a class on each element rather than anything the glyph bakes
    // in, so it is easy to drop in passing and hard to spot in a diff.
    const dot = container.querySelector("span[aria-hidden].rounded-full");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("bg-kash");
    expect(dot).not.toHaveClass("bg-current");

    const glyph = container.querySelector("svg");
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveClass("text-kash");
  });

  it("marks itself expanded so assistive tech follows the chart region", () => {
    const { rerender } = render(
      <ChartPanelToggle open onOpenChange={vi.fn()} label="Close Chart" />
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");

    rerender(<ChartPanelToggle open={false} onOpenChange={vi.fn()} label="View Chart" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });
});
