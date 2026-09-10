import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HorizontalNavRail } from "./horizontal-nav-rail";

describe("HorizontalNavRail", () => {
  it("shows responsive edge controls and scrolls in both directions", () => {
    render(
      <HorizontalNavRail ariaLabel="Market topics" itemCount={3}>
        <button type="button">One</button>
        <button type="button">Two</button>
        <button type="button">Three</button>
      </HorizontalNavRail>
    );

    const viewport = screen.getByLabelText("Market topics");
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 600 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    const scrollBy = vi.fn();
    viewport.scrollBy = scrollBy;

    fireEvent(window, new Event("resize"));
    const next = screen.getByRole("button", { name: "Scroll Market topics right" });
    expect(next).not.toHaveClass("hidden");
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 180, behavior: "smooth" });

    viewport.scrollLeft = 250;
    fireEvent.scroll(viewport);
    const previous = screen.getByRole("button", { name: "Scroll Market topics left" });
    expect(previous).not.toHaveClass("hidden");
    fireEvent.click(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -180, behavior: "smooth" });
  });
});
