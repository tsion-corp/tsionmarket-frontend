import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerpsSection } from "./perps-section";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// The desk itself pulls the whole Hyperliquid stack; this test is about the
// section's own gutter, so it stands in for it.
vi.mock("@/features/trade/components/perps-view", () => ({
  PerpsView: () => <div data-testid="perps-desk" />,
}));

/**
 * The phone Market view mounts this desk inside its own px-5 scroller. While
 * the section drew px-4 as well, the two gutters stacked to 36px a side before
 * the desk's own panel padding, and on a 390px screen the order ticket's
 * Market toggle was clipped off the edge. Reported 2026-09-15.
 */
describe("PerpsSection gutter", () => {
  function sectionOf(node: HTMLElement): HTMLElement {
    const section = node.closest("div.mx-auto");
    if (section === null) throw new Error("the section wrapper did not render");
    return section as HTMLElement;
  }

  it("draws its own side gutter by default, for the page that is only this desk", () => {
    render(<PerpsSection />);
    const section = sectionOf(screen.getByTestId("perps-desk"));
    expect(section.className).toContain("px-4");
    expect(section.className).not.toContain("px-0");
  });

  it("drops the side gutter where the page already provides one", () => {
    render(<PerpsSection gutter={false} />);
    const section = sectionOf(screen.getByTestId("perps-desk"));
    expect(section.className).toContain("px-0");
    expect(section.className).not.toContain("px-4");
  });

  it("keeps its vertical padding either way", () => {
    render(<PerpsSection gutter={false} />);
    expect(sectionOf(screen.getByTestId("perps-desk")).className).toContain("py-4");
  });
});
