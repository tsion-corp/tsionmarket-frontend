import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PerpsMenuDrawer } from "./perps-menu-drawer";

// The drawer is the real Sidebar mounted on the perps screen, so the rail's
// own neighbours are stubbed the way components/layout/sidebar.test.tsx stubs
// them: labels from a provider, the profile from Privy, Go Live from a
// broadcast session, next/link from a router no test mounts.
const MESSAGES: Record<string, Record<string, string>> = {
  topbar: { menu: "Menu", closeMenu: "Close menu" },
  square: { title: "Market Square" },
  sections: {
    portfolio: "Portfolio",
    spot: "Spot",
    perps: "Perpetuals",
    meme: "Memecoins",
    rwa: "Real assets",
    prediction: "Prediction",
    earn: "Earn",
    casino: "Arkade",
    activity: "Activity",
  },
};
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`,
}));
vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(),
  getIdentityToken: vi.fn(),
}));
// The rail reads the session through the Decane-backed seam; no account is
// signed in here, matching the `user: null` the Privy stub used to hand back.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: false,
    evmAddress: null,
    solanaAddress: null,
    profile: { name: "Account", email: "", avatarSeed: "worldstreet" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/broadcast/go-live-control", () => ({
  GoLiveControl: () => <button type="button">Go Live</button>,
}));
// The rail always mounts its account popover, which pulls in a react-query
// hook. The drawer is what is under test, so the popover is stubbed the way
// the rail's own suite stubs it.
vi.mock("@/components/layout/account-popover", () => ({
  AccountPopover: () => null,
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

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
  usePathname: () => "/perps",
}));

// The route owns the flag, so the harness stands in for it: the same
// controlled pair, plus the inert desk behind the overlay.
function PerpsScreen() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PerpsMenuDrawer open={open} onOpenChange={setOpen} />
      <div inert={open}>
        <button type="button">Buy</button>
      </div>
    </div>
  );
}

function hamburger() {
  return screen.getByRole("button", { name: "Menu" });
}

// The account face reads the player's square profile. These cover the rail
// and its chrome, not where the picture comes from, so the read is stubbed
// out: null is the ordinary answer and leaves the seeded artwork in place.
vi.mock("@/hooks/use-square-avatar", () => ({
  useSquareAvatar: () => null,
  useSquareSeed: () => "seed",
}));

describe("PerpsMenuDrawer", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("opens the rail as an overlay and moves focus into it", () => {
    render(<PerpsScreen />);
    const button = hamburger();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "app-sidebar");
    // Parked off-canvas and out of the tab order until asked for.
    const rail = document.getElementById("app-sidebar");
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain("-translate-x-full");
    expect(rail?.parentElement).toHaveAttribute("inert");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(rail?.className).toContain("translate-x-0");
    expect(rail?.parentElement).not.toHaveAttribute("inert");
    // Focus is inside the drawer, not left on the button behind the backdrop.
    expect(rail?.contains(document.activeElement)).toBe(true);
  });

  // The perps screen's own section is Perpetuals, and the build offers it
  // again, so the rail lights that entry and only that one.
  // sectionForPathname derives the section from /perps; buildNav now has an
  // entry to mark.
  it("lights the page's own section, and only that one", () => {
    render(<PerpsScreen />);
    fireEvent.click(hamburger());
    const rail = document.getElementById("app-sidebar") as HTMLElement;
    const lit = Array.from(rail.querySelectorAll("button")).filter((b) =>
      b.className.includes("bg-accent/14")
    );
    expect(lit).toHaveLength(1);
    expect(lit[0]).toHaveAccessibleName("Perpetuals");
  });

  // buildNav is the single reader of the nav switches, so the drawer offers
  // exactly what the rail offers. HIDDEN_NAV_SECTIONS is empty as of
  // 2026-09-25, so that is every section, Perpetuals included.
  it("offers the same sections as the rail", () => {
    render(<PerpsScreen />);
    fireEvent.click(hamburger());
    expect(screen.getByRole("button", { name: "Real assets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prediction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perpetuals" })).toBeInTheDocument();
  });

  it("closes and navigates when a section is chosen", () => {
    render(<PerpsScreen />);
    fireEvent.click(hamburger());

    fireEvent.click(screen.getByRole("button", { name: "Spot" }));

    expect(push).toHaveBeenCalledWith("/spot");
    expect(hamburger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on the backdrop without leaving the perps screen", () => {
    const { container } = render(<PerpsScreen />);
    fireEvent.click(hamburger());
    expect(hamburger()).toHaveAttribute("aria-expanded", "true");

    // The dimmed page behind the rail, not the hamburger's own icon: both
    // carry aria-hidden, and only this one is the way out.
    const backdrop = container.querySelector("div[aria-hidden]");
    expect(backdrop?.className).toContain("fixed inset-0");
    fireEvent.click(backdrop as Element);

    expect(hamburger()).toHaveAttribute("aria-expanded", "false");
    expect(push).not.toHaveBeenCalled();
  });

  it("closes on Escape and returns focus to the hamburger", () => {
    render(<PerpsScreen />);
    const button = hamburger();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(button);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the drawer while it is open", () => {
    render(<PerpsScreen />);
    fireEvent.click(hamburger());
    const rail = document.getElementById("app-sidebar") as HTMLElement;
    const stops = Array.from(rail.querySelectorAll<HTMLElement>("a[href], button"));
    const last = stops[stops.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });

    expect(rail.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
  });
});
