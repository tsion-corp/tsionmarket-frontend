import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";

// The rail's own markup is what is under test, so its neighbours are stubbed:
// labels come from a provider, the profile from Privy, Go Live from a
// broadcast session, and next/link from a router that no test mounts.
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: null }) }));
vi.mock("@/components/broadcast/go-live-control", () => ({
  GoLiveControl: () => <button type="button">Go Live</button>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/market-square", () => ({
  MARKET_SQUARE_HIDDEN: true,
  marketSquareHref: () => "https://square.test",
}));

function renderSidebar() {
  return render(
    <Sidebar
      items={[{ id: "portfolio", label: "Portfolio", icon: () => null }]}
      activeSection="portfolio"
      onNavigate={() => {}}
      onOpenAccount={() => {}}
      open={false}
      onClose={() => {}}
    />
  );
}

describe("Sidebar", () => {
  /**
   * Market Square is hidden from the product for now. The switch is a
   * constant rather than an environment variable, so a deployment that has
   * the square's URL configured, which every real one does, must still show
   * no way in from the rail.
   */
  it("offers no Market Square entry while the square is hidden", () => {
    renderSidebar();
    expect(screen.queryByRole("link", { name: /market square/i })).toBeNull();
    // The rest of the rail is untouched by the hide.
    expect(screen.getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
  });

  it("puts the entry back above the sections when the square is shown again", async () => {
    vi.resetModules();
    vi.doMock("@/lib/market-square", () => ({
      MARKET_SQUARE_HIDDEN: false,
      marketSquareHref: () => "https://square.test",
    }));
    const { Sidebar: Shown } = await import("./sidebar");
    render(
      <Shown
        items={[{ id: "portfolio", label: "Portfolio", icon: () => null }]}
        activeSection="portfolio"
        onNavigate={() => {}}
        onOpenAccount={() => {}}
        open={false}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("link", { name: /market square/i })).toHaveAttribute(
      "href",
      "https://square.test"
    );
  });
});
