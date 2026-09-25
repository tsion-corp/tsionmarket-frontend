import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PctChange } from "@/features/trade/components/meme-bits";

// The change cell every memecoin surface draws, the desk table's included. It
// compacts what would not fit and keeps the exact figure for a screen reader.
describe("PctChange", () => {
  it("prints an ordinary change in full, as one node", () => {
    render(<PctChange value="-1" />);
    // getByText throws on a second match, so this also proves the sr-only twin
    // stays away when there is nothing to compact.
    expect(screen.getByText("-1.00%")).toBeInTheDocument();
  });

  it("keeps both decimals so a column of changes lines up", () => {
    render(<PctChange value="12.5" />);
    expect(screen.getByText("+12.50%")).toBeInTheDocument();
  });

  it("compacts a change too wide for the column", () => {
    // The move that overflowed: "+12345.68%" is ten characters in a 110px cell.
    const { container } = render(<PctChange value="12345.6789" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("+12.35K%");
  });

  it("leaves the exact figure for a screen reader when it compacts", () => {
    render(<PctChange value="12345.6789" />);
    expect(screen.getByText("+12345.68%")).toHaveClass("sr-only");
  });

  it("colours a gain up", () => {
    const { container } = render(<PctChange value="4.2" />);
    expect(container.firstChild).toHaveClass("text-up");
  });

  it("colours a loss down", () => {
    const { container } = render(<PctChange value="-4.2" />);
    expect(container.firstChild).toHaveClass("text-down");
  });

  it("draws a dash for a missing change rather than a flat 0%", () => {
    const { container } = render(<PctChange value={null} />);
    expect(container.firstChild).toHaveTextContent("—");
    expect(container.firstChild).not.toHaveClass("text-up");
  });

  it("draws a dash for an unreadable change", () => {
    const { container } = render(<PctChange value="n/a" />);
    expect(container.firstChild).toHaveTextContent("—");
  });
});
