import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { User } from "@privy-io/react-auth";
import { Sidebar } from "./sidebar";
import { buildNav, type NavItem } from "./nav-items";
import type { DashboardSection } from "@/lib/modal-types";

// The rail's own markup is what is under test, so its neighbours are stubbed:
// labels come from a provider, the profile from Privy, Go Live from a
// broadcast session, and next/link from a router that no test mounts.
//
// The rail reads two message namespaces, and one of them supplies the square's
// visible label, so the stub returns the real English strings rather than
// echoing key names: the accessible names under test are then the ones a user
// reads. An unknown key still surfaces as its path, so a typo fails loudly.
const MESSAGES: Record<string, Record<string, string>> = {
  topbar: { menu: "Menu", closeMenu: "Close menu" },
  square: { title: "Market Square" },
};
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`,
}));
// The signed-in account the rail reads. Each test sets the shape it needs, so
// the mock hands back whatever this holds at render time.
let privyUser: User | null = null;
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: privyUser }),
  useLogout: () => ({ logout: vi.fn() }),
  useLinkWithPasskey: () => ({ linkWithPasskey: vi.fn() }),
  getAccessToken: vi.fn(),
  getIdentityToken: vi.fn(),
}));
vi.mock("@/components/broadcast/go-live-control", () => ({
  GoLiveControl: () => <button type="button">Go Live</button>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
// Both switches are stubbed even though the rail reads only the first: the
// factory replaces the whole module, so a missing export would read as false
// and quietly stand in for "shown" if the rail ever reached for it.
vi.mock("@/lib/market-square", () => ({
  MARKET_SQUARE_HIDDEN: true,
  SQUARE_SECTIONS_HIDDEN: true,
  marketSquareHref: () => "https://square.test",
}));

// Signed in with a wallet alone: no Google, no email, no Twitter, which is
// what an SMS or wallet sign-in looks like once Privy has minted the embedded
// wallet. The address truncates to the 0x759f…c61c the design shows.
const walletOnlyUser = {
  id: "did:privy:walletonly",
  linkedAccounts: [
    {
      type: "wallet",
      walletClientType: "privy",
      chainType: "ethereum",
      address: "0x759f3b2d9e41c7a05f68d4e9b17c3a2f0e5dc61c",
      delegated: true,
    },
  ],
} as unknown as User;

function renderSidebar() {
  return render(
    <Sidebar
      items={[{ id: "portfolio", label: "Portfolio", icon: () => null }]}
      activeSection="portfolio"
      onNavigate={() => {}}
      open={false}
      onClose={() => {}}
    />
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    privyUser = null;
  });

  /**
   * A deployment with no square to link to, which is what an unset
   * NEXT_PUBLIC_MARKET_SQUARE_URL and what an operator takedown both produce,
   * offers no way in from the rail rather than a link that goes nowhere. The
   * module reads its environment at import, and the test run loads no .env, so
   * this is also the state the suite sees by default.
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
        open={false}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("link", { name: /market square/i })).toHaveAttribute(
      "href",
      "https://square.test"
    );
  });

  /**
   * The shipped configuration: the square's deployment is configured and open,
   * so the rail links out to it, while the square's own sections inside the
   * app are off. The two are separate switches, and this asserts the rail
   * reads only the first. Gating the rail on the sections switch would take
   * the entry away with them, which is the state this replaced.
   */
  it("keeps the rail entry while the square's in-app sections are hidden", async () => {
    vi.resetModules();
    vi.doMock("@/lib/market-square", () => ({
      MARKET_SQUARE_HIDDEN: false,
      SQUARE_SECTIONS_HIDDEN: true,
      marketSquareHref: () => "https://square.test",
    }));
    const { Sidebar: Shown } = await import("./sidebar");
    render(
      <Shown
        items={[{ id: "portfolio", label: "Portfolio", icon: () => null }]}
        activeSection="portfolio"
        onNavigate={() => {}}
        open={false}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("link", { name: /market square/i })).toHaveAttribute(
      "href",
      "https://square.test"
    );
  });

  /**
   * The 2.0 rail seats the square between Prediction and Arkade rather than in
   * a promoted block of its own, so its position is part of the design and is
   * asserted against the rendered order, not against the markup that produces
   * it.
   */
  it("seats the square between Prediction and Arkade", async () => {
    vi.resetModules();
    vi.doMock("@/lib/market-square", () => ({
      MARKET_SQUARE_HIDDEN: false,
      marketSquareHref: () => "https://square.test",
    }));
    const { Sidebar: Shown } = await import("./sidebar");
    const { container } = render(
      <Shown
        items={[
          { id: "prediction", label: "Prediction", icon: () => null },
          { id: "casino", label: "Arkade", icon: () => null },
          { id: "activity", label: "Arktivity", icon: () => null },
        ]}
        activeSection="prediction"
        onNavigate={() => {}}
        open={false}
        onClose={() => {}}
      />
    );
    const rail = container.querySelector("nav");
    if (rail === null) throw new Error("the rail rendered no nav element");
    const rows = [...rail.children].map((el) => el.textContent);
    expect(rows).toEqual(["Prediction", "Market Square", "Arkade", "Arktivity"]);
  });

  // With no Arkade entry to sit above, the square must still appear rather
  // than fall out of the rail entirely.
  it("keeps the square in the rail when there is no Arkade entry", async () => {
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
        open={false}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("link", { name: /market square/i })).toBeInTheDocument();
  });

  /**
   * The account footer's second line is the wallet that holds the money, the
   * same line the topbar shows, truncated by the same helper. It used to be
   * the email, which disagreed with the head on screen and rendered empty for
   * anyone who signed in with a wallet or a phone number.
   */
  it("shows the truncated wallet address under the name in the account footer", () => {
    privyUser = walletOnlyUser;
    renderSidebar();
    expect(screen.getByText("0x759f…c61c")).toBeInTheDocument();
  });

  // A wallet-only sign-in has no email at all, so the old second line was a
  // blank row of dead space under the name. The address fills it instead.
  it("renders no blank second line for a wallet-only account with no email", () => {
    privyUser = walletOnlyUser;
    renderSidebar();
    const lines = screen.getByText("World Street user").parentElement;
    if (lines === null) throw new Error("the account footer rendered no name line");
    expect([...lines.children].map((el) => el.textContent)).toEqual([
      "World Street user",
      "0x759f…c61c",
    ]);
  });

  // No wallet, no second line: an empty element in its place is the same dead
  // space in a different disguise.
  it("drops the second line entirely for an account with no wallet", () => {
    privyUser = { id: "did:privy:nowallet", linkedAccounts: [] } as unknown as User;
    renderSidebar();
    const lines = screen.getByText("World Street user").parentElement;
    if (lines === null) throw new Error("the account footer rendered no name line");
    expect([...lines.children].map((el) => el.textContent)).toEqual(["World Street user"]);
  });

  /**
   * Below roughly 560px of viewport height the rail's own content is taller
   * than the screen, and with nothing scrolling, the account footer sits off
   * the bottom with no way to reach it. The nav list takes the overflow so the
   * logo and the footer stay pinned. jsdom does no layout, so what is asserted
   * here is the scroll container itself; the height was measured in Chrome at
   * 1440x500.
   */
  it("scrolls the nav list rather than clipping the account footer", () => {
    const { container } = renderSidebar();
    const nav = container.querySelector("nav");
    if (nav === null) throw new Error("the rail rendered no nav element");
    expect(nav.className).toContain("overflow-y-auto");
    // A vertical scroll container with a visible x axis scrolls sideways too.
    expect(nav.className).toContain("overflow-x-hidden");
    // Without this the nav refuses to shrink below its content and the
    // overflow moves back onto the rail.
    expect(nav.className).toContain("min-h-0");
  });

  // The footer is bottom-pinned by mt-auto at ordinary heights, which is what
  // keeps it against the bottom edge rather than trailing the last nav row.
  it("keeps the account footer pinned to the bottom of the rail", () => {
    privyUser = walletOnlyUser;
    renderSidebar();
    const footer = screen.getByText("World Street user").closest("div");
    if (footer === null) throw new Error("the account footer rendered no container");
    expect(footer.className).toContain("mt-auto");
  });
});

/**
 * Real assets returned to the navigation on 2026-09-09, once the gateway's rwa
 * and gas-sponsor services were confirmed live. The switch that hid them is
 * HIDDEN_NAV_SECTIONS in lib/sections.ts, read by buildNav, so the rail is
 * asserted against a real nav rather than a hand-written item list: what is
 * checked is the row a user would see, not the array a test wrote.
 */
describe("Real assets in the rail", () => {
  function renderRail(items: NavItem[], activeSection: DashboardSection = "portfolio") {
    return render(
      <Sidebar
        items={items}
        activeSection={activeSection}
        onNavigate={() => {}}
        open={false}
        onClose={() => {}}
      />
    );
  }

  it("offers the Real assets entry", () => {
    renderRail(buildNav(null));
    expect(screen.getByRole("button", { name: "Real assets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spot" })).toBeInTheDocument();
  });

  // An onboarding interest that leads with Real assets (stocks, gold, yield,
  // real estate, treasuries) brings the row forward through the reorder.
  it("offers the entry for the interests that point at it", () => {
    renderRail(buildNav("stocks"));
    expect(screen.getByRole("button", { name: "Real assets" })).toBeInTheDocument();
  });

  // The switch still works: listing the id takes the row out again without
  // touching the route, the order or the rest of the rail.
  async function renderHidden(activeSection: DashboardSection = "portfolio") {
    vi.resetModules();
    vi.doMock("@/lib/sections", async () => {
      const actual = await vi.importActual<typeof import("@/lib/sections")>("@/lib/sections");
      return { ...actual, HIDDEN_NAV_SECTIONS: ["rwa"] };
    });
    const { buildNav: buildHidden } = await import("./nav-items");
    const { Sidebar: Hidden } = await import("./sidebar");
    return render(
      <Hidden
        items={buildHidden(null)}
        activeSection={activeSection}
        onNavigate={() => {}}
        open={false}
        onClose={() => {}}
      />
    );
  }

  it("takes the entry out again when the switch lists it", async () => {
    await renderHidden();
    expect(screen.queryByRole("button", { name: "Real assets" })).toBeNull();
    expect(screen.getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
  });

  /**
   * A hidden section keeps its route, so someone can land on it by URL and the
   * shell still derives it as the active section. With no row to light, the
   * rail must simply light none of them rather than fall back onto Portfolio
   * or mark the row that happens to sit where the hidden one used to.
   */
  it("highlights no row when the active section has no entry", async () => {
    const { container } = await renderHidden("rwa");
    const rail = container.querySelector("nav");
    if (rail === null) throw new Error("the rail rendered no nav element");
    const highlighted = [...rail.children].filter((el) => el.className.includes("bg-accent/14"));
    expect(highlighted).toEqual([]);
  });
});
