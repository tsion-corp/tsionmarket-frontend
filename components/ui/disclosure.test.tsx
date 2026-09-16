import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Disclosure } from "@/components/ui/disclosure";

describe("Disclosure", () => {
  it("keeps its content mounted while closed, so the collapse can animate", () => {
    // The bug this primitive exists to fix: `{open ? <body/> : null}` unmounts
    // instantly, so the panel snaps shut while the chevron above it rotates
    // smoothly. Animating the collapse requires the content to still be there.
    render(
      <Disclosure open={false}>
        <p>Allocation ring</p>
      </Disclosure>
    );
    expect(screen.getByText("Allocation ring")).toBeInTheDocument();
  });

  it("animates between 0fr and 1fr rather than a hardcoded height", () => {
    // `height` cannot transition to `auto`. Anything that names a pixel height
    // goes stale when the content changes, so the row template is what moves.
    const { container, rerender } = render(
      <Disclosure open={false}>
        <p>Body</p>
      </Disclosure>
    );
    const panel = container.firstElementChild as HTMLElement;

    expect(panel.className).toContain("[grid-template-rows:0fr]");
    expect(panel.className).toContain("opacity-0");
    expect(panel.className).toContain("transition-[grid-template-rows,opacity]");

    rerender(
      <Disclosure open>
        <p>Body</p>
      </Disclosure>
    );
    expect(panel.className).toContain("[grid-template-rows:1fr]");
    expect(panel.className).toContain("opacity-100");
  });

  it("clips its content and allows the row to collapse below its content size", () => {
    // Without `min-h-0` a grid item keeps an automatic minimum size, so a
    // closed panel would leave its first line visible.
    const { container } = render(
      <Disclosure open={false}>
        <p>Body</p>
      </Disclosure>
    );
    const clip = container.querySelector(".overflow-hidden");
    expect(clip).not.toBeNull();
    expect(clip!.className).toContain("min-h-0");
  });

  it("takes closed content out of the tab order and away from screen readers", () => {
    // Mounted-but-hidden content must not be readable or tabbable, or the
    // animation would come at the cost of the accessibility an unmounted
    // panel had for free.
    const { container, rerender } = render(
      <Disclosure open={false}>
        <button type="button">Focus me</button>
      </Disclosure>
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.hasAttribute("inert")).toBe(true);

    rerender(
      <Disclosure open>
        <button type="button">Focus me</button>
      </Disclosure>
    );
    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("honours prefers-reduced-motion without removing the open and close", () => {
    // Reduced motion means no animation, not a panel that stops working.
    const { container } = render(
      <Disclosure open>
        <p>Body</p>
      </Disclosure>
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "motion-reduce:transition-none"
    );
  });

  it("warns when outer spacing is put on className, where it cannot collapse", () => {
    // `className` lands on the clip, which is the grid item. A grid item's own
    // margin or padding still counts towards the `0fr` track, so a closed panel
    // stands that many pixels tall instead of collapsing — measured live at
    // `grid-template-rows: 16px` for an `mt-4`. Silent 16px of dead space is
    // exactly the kind of bug that survives review, so the primitive shouts.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Disclosure open={false} className="mt-4">
        <p>Body</p>
      </Disclosure>
    );

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("mt-4");
    spy.mockRestore();
  });

  it("says nothing about classes that are safe on the clip", () => {
    // Layout classes that do not add outer spacing are fine there, and a false
    // positive would train people to ignore the warning.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Disclosure open className="flex flex-col gap-2 rounded-xl">
        <p>Body</p>
      </Disclosure>
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("holds a gated body through the close so the fold has something to animate", async () => {
    // The defect this render prop fixes: a body gated on `open` unmounts in the
    // same commit as the close, leaving a box already zero tall. There is then
    // nothing to interpolate and the panel folds instantly — measured at 0
    // intermediate frames. `rendered` lags `open` on the way down only.
    vi.useFakeTimers();
    const { rerender } = render(
      <Disclosure open>{(rendered) => (rendered ? <p>Chart</p> : null)}</Disclosure>
    );
    expect(screen.getByText("Chart")).toBeInTheDocument();

    rerender(
      <Disclosure open={false}>{(rendered) => (rendered ? <p>Chart</p> : null)}</Disclosure>
    );
    // Still there while the collapse plays.
    expect(screen.getByText("Chart")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    // Gone once the fold is done, so the work behind it really stops.
    expect(screen.queryByText("Chart")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows a gated body on the very first frame of an open", () => {
    // Opening is handled during render, not in an effect: an effect would run a
    // frame late and the body would miss the start of its own animation.
    const { rerender } = render(
      <Disclosure open={false}>{(rendered) => (rendered ? <p>Chart</p> : null)}</Disclosure>
    );
    expect(screen.queryByText("Chart")).not.toBeInTheDocument();

    rerender(<Disclosure open>{(rendered) => (rendered ? <p>Chart</p> : null)}</Disclosure>);
    expect(screen.getByText("Chart")).toBeInTheDocument();
  });

  it("carries an id so a trigger's aria-controls can point at it", () => {
    const { container } = render(
      <Disclosure open id="allocation-panel">
        <p>Body</p>
      </Disclosure>
    );
    expect(container.querySelector("#allocation-panel")).not.toBeNull();
  });
});
