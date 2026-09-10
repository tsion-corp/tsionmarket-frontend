import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CoinBadge } from "@/components/ui/coin-badge";

describe("CoinBadge", () => {
  it("prints a short ticker whole", () => {
    const { container } = render(<CoinBadge sym="BTC" bg="#000" />);
    expect(container.textContent).toBe("BTC");
  });

  // A badge is 36px across and a ticker can be nine characters: "syrupUSDC"
  // ran out both sides of its disc and over the name beside it. The badge
  // keeps the first four letters and clips the rest, so it stays a disc.
  it("shortens a long ticker to four letters and clips its box", () => {
    const { container } = render(<CoinBadge sym="syrupUSDC" bg="#000" />);
    expect(container.textContent).toBe("SYRU");
    expect((container.firstChild as HTMLElement).className).toMatch(/overflow-hidden/);
  });

  it("keeps three letters at chip size", () => {
    const { container } = render(<CoinBadge sym="BASECAT" bg="#000" size={20} />);
    expect(container.textContent).toBe("BAS");
  });
});
