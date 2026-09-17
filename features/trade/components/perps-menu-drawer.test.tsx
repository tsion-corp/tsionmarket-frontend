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
  usePrivy: () => ({ user: null }),
  useLogout: () => ({ logout: vi.fn() }),
  useLinkWithPasskey: () => ({ linkWithPasskey: vi.fn() }),
  getAccessToken: vi.fn(),
  getIdentityToken: vi.fn(),
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

  // sectionForPathname derives the highlight from /perps, and Perpetuals is
  // in HIDDEN_NAV_SECTIONS on this branch, so the section the reader is in
  // has no entry to light. The desk is still reachable and its drawer still
  // works; it just does not point back at itself.
  it("lights no entry when the page's own section is not offered", () => {
    render(<PerpsScreen />);
    fireEvent.click(hamburger());
    const rail = document.getElementById("app-sidebar") as HTMLElement;
    const lit = Array.from(rail.querySelectorAll("button")).filter((b) =>
      b.className.includes("bg-accent/14")
    );
    expect(lit).toHaveLength(0);
  });

  // buildNav is the single reader of the nav switches, so the drawer offers
  // exactly what the rail offers: Real assets since they returned on
  // 2026-09-09, and neither Perpetuals nor Prediction. Prediction was offered
  // on 2026-09-16 and withdrawn again on 2026-09-17 until it relaunches.
  it("offers the same sections as the rail", () => {
    render(<PerpsScreen />);
    fireEvent.click(hamburger());
    expect(screen.getByRole("button", { name: "Real assets" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perpetuals" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prediction" })).toBeNull();
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
