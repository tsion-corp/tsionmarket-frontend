import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DiscoveryCta, discoveryPillPadding } from "@/features/discovery/components/discovery-cta";

describe("DiscoveryCta", () => {
  it("renders a link when given a destination", () => {
    render(<DiscoveryCta href="/spot" label="Buy BTC" tone="dark" />);

    expect(screen.getByRole("link", { name: "Buy BTC" })).toHaveAttribute("href", "/spot");
    expect(screen.queryByRole("button")).toBeNull();
  });

  // A pill that opens a sheet must not be an anchor: middle click and "open in
  // new tab" would otherwise navigate to a page the reader never asked for.
  it("renders a button, not a link, when given an action", () => {
    render(<DiscoveryCta onClick={() => {}} label="Buy BTC" tone="dark" />);

    expect(screen.getByRole("button", { name: "Buy BTC" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("fires the action on click", () => {
    const onClick = vi.fn();
    render(<DiscoveryCta onClick={onClick} label="Buy BTC" tone="dark" />);

    fireEvent.click(screen.getByRole("button", { name: "Buy BTC" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  // Inside a card that sits in a form, an untyped button submits it.
  it("never submits a surrounding form", () => {
    render(<DiscoveryCta onClick={() => {}} label="Buy BTC" tone="dark" />);

    expect(screen.getByRole("button", { name: "Buy BTC" })).toHaveAttribute("type", "button");
  });

  it("gives both shapes the same pill gutters", () => {
    const { paddingInline, paddingBlock } = discoveryPillPadding(14);
    const { rerender } = render(<DiscoveryCta href="/spot" label="Buy" tone="dark" />);
    const asLink = screen.getByRole("link", { name: "Buy" }).getAttribute("style");

    rerender(<DiscoveryCta onClick={() => {}} label="Buy" tone="dark" />);
    const asButton = screen.getByRole("button", { name: "Buy" }).getAttribute("style");

    expect(asLink).toBe(asButton);
    expect(asLink).toContain(`padding-inline: ${paddingInline}px`);
    expect(asLink).toContain(`padding-block: ${paddingBlock}px`);
  });
});
