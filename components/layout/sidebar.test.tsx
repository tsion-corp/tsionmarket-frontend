import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { User } from "@privy-io/react-auth";
import { Sidebar } from "./sidebar";
import { buildNav, type NavItem } from "./nav-items";
import type { DashboardSection } from "@/lib/modal-types";

// The rail's own markup is what is under test, so its neighbours are stubbed:
// labels come from a provider, the profile from Privy, and next/link from a
// router that no test mounts.
//
// The stub returns the real English strings rather than echoing key names, so
// the accessible names under test are the ones a user reads. An unknown key
// still surfaces as its path, so a typo fails loudly.
const MESSAGES: Record<string, Record<string, string>> = {
  auth: { signIn: "Sign in" },
  topbar: { menu: "Menu", closeMenu: "Close menu" },
};
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`,
}));
// The signed-in account the rail reads. Each test sets the shape it needs, so
// the mock hands back whatever this holds at render time.
let privyUser: User | null = null;
// The rail reads the session through the Decane-backed seam. The cases still
// describe the account as a Privy-shaped user, so derive the seam's profile
// and address from it with the same helpers the app used to.
vi.mock("@/hooks/use-auth-session", async () => {
  const { deriveProfile, getWalletAddress } = await import("@/lib/user");
  return {
    useAuthSession: () => ({
      ready: true,
      authenticated: privyUser !== null,
      evmAddress: privyUser ? getWalletAddress(privyUser, "ethereum") : null,
      solanaAddress: privyUser ? getWalletAddress(privyUser, "solana") : null,
      profile: deriveProfile(privyUser),
      logout: vi.fn(),
    }),
  };
});

// The name the shell shows is the Ark ID when the wallet has one. The lookup
// behind it needs a query client; these tests are about the chrome, so the
// answer is stubbed and one test flips it.
const arkName = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/hooks/use-ark-name", () => ({
  useArkName: () => arkName.value,
}));

// AccountPopover is now always mounted (it plays its own exit animation off
// its `open` prop), which pulls in InviteFriendsModal and its react-query
// hook. The rail's own markup is what is under test here, not the popover, so
// it is stubbed like the rail's other neighbours above.
vi.mock("@/components/layout/account-popover", () => ({
  AccountPopover: () => null,
}));
// The rail also mounts the Ark ID card and its modal, which read the
// reverse-name record through a react-query hook. The rail's own markup is
// what is under test, so they are stubbed like the popover above.
vi.mock("@/features/bns/components/ark-id-card", () => ({ ArkIdCard: () => null }));
vi.mock("@/features/bns/components/ark-id-modal", () => ({ ArkIdModal: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
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

  // The Ark ID is the identity people hand out, so the footer names the
  // person by it once the wallet holds one; without one, the profile name.
  it("names the account by its Ark ID when the wallet holds one", () => {
    arkName.value = "signor.ark";
    privyUser = walletOnlyUser;
    try {
      renderSidebar();
      expect(screen.getByText("signor.ark")).toBeInTheDocument();
      expect(screen.queryByText("World Street user")).toBeNull();
    } finally {
      arkName.value = null;
    }
  });

  it("offers Sign in in place of the account button while signed out", async () => {
    privyUser = null;
    const { useSignInOpen } = await import("@/hooks/use-sign-in");
    const { closeSignIn } = await import("@/hooks/use-sign-in");
    closeSignIn();
    renderSidebar();
    expect(screen.queryByText("World Street user")).toBeNull();
    const signIn = screen.getByRole("button", { name: "Sign in" });
    signIn.click();
    function Probe() {
      return <span data-testid="open">{String(useSignInOpen())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("open").textContent).toBe("true");
    closeSignIn();
  });

  it("renders the sections in the order it is given", () => {
    const { container } = render(
      <Sidebar
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
    expect(rows).toEqual(["Prediction", "Arkade", "Arktivity"]);
  });

  /**
   * The account footer names the person and nothing else. It carried the
   * wallet address under the name; an address is an identifier a reader can
   * be asked to hand over, and the chrome put it on screen on every page
   * whether or not it was wanted. The deposit screen is where an address is
   * shown now, because that is the one place it is needed.
   */
  it("shows no wallet address under the name in the account footer", () => {
    privyUser = walletOnlyUser;
    renderSidebar();
    expect(screen.queryByText("0x759f…c61c")).not.toBeInTheDocument();
  });

  // The name is the whole footer: nothing takes the second line's place, so
  // there is no blank row of dead space under it either.
  it("renders the name alone, with no second line", () => {
    privyUser = walletOnlyUser;
    renderSidebar();
    const lines = screen.getByText("World Street user").parentElement;
    if (lines === null) throw new Error("the account footer rendered no name line");
    expect([...lines.children].map((el) => el.textContent)).toEqual(["World Street user"]);
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
    renderRail(buildNav());
    expect(screen.getByRole("button", { name: "Real assets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spot" })).toBeInTheDocument();
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
        items={buildHidden()}
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
