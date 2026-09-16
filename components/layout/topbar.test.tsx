import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@privy-io/react-auth";

// Real English rather than echoed keys, so the accessible names asserted below
// are the ones a user reads. An unknown key still surfaces as its path.
const MESSAGES: Record<string, Record<string, string>> = {
  topbar: { account: "Account" },
  tour: { replayCta: "Take a tour" },
  // Kept so the "no holdings trigger here" assertion below looks for the real
  // accessible name rather than an unresolved key, which would pass whatever
  // the topbar renders.
  portfolio: { yourHoldings: "Your holdings" },
};
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    MESSAGES[namespace]?.[key] ?? `${namespace}.${key}`,
}));

let privyUser: User | null = null;
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: privyUser }),
  getAccessToken: vi.fn(),
  getIdentityToken: vi.fn(),
}));

let pathname = "/portfolio";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const tour = vi.hoisted(() => ({
  startDashboardTour: vi.fn(),
  requestTourReplay: vi.fn(),
}));
vi.mock("@/features/tour", () => tour);

// The bell runs its own activity poll and the language pill reads the locale
// cookie; neither is what the tour button is under test for.
vi.mock("@/components/layout/notification-bell", () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}));
vi.mock("@/components/ui/language-select", () => ({
  LanguageSelect: () => <button type="button">EN</button>,
}));

const portfolio = vi.hoisted(() => ({ usePortfolio: vi.fn() }));
vi.mock("@/hooks/use-portfolio", () => portfolio);

import { Topbar } from "@/components/layout/topbar";

// Two controls carry the walkthrough: the phone's labelled pill and the desktop
// circle. Each breakpoint shows exactly one of them, and CSS decides which, so
// the test picks them apart by the class that hides each.
function tourControls() {
  const all = screen.getAllByRole("button", { name: "Take a tour" });
  return {
    all,
    phonePill: all.find((b) => b.className.includes("md:hidden")) as HTMLElement,
    desktopCircle: all.find((b) => b.className.includes("md:size-[46px]")) as HTMLElement,
  };
}

describe("Topbar tour button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    privyUser = null;
    pathname = "/portfolio";
    render(<Topbar onOpenAccount={() => {}} />);
  });

  it("puts the desktop circle in the right-hand cluster wearing the bell treatment", () => {
    const { desktopCircle } = tourControls();
    // The notification bell's own classes: 38px on a phone, 46px and the
    // darker topbar fill from md up, inside the same hairline border. The three
    // circles share one centre line only while all three carry these.
    expect(desktopCircle.className).toContain("md:size-[46px]");
    expect(desktopCircle.className).toContain("md:bg-topbar-pill");
    expect(desktopCircle.className).toContain("border-hairline");
    expect(desktopCircle.className).toContain("rounded-full");
  });

  it("shows exactly one tour control per breakpoint", () => {
    const { all, phonePill, desktopCircle } = tourControls();
    expect(all).toHaveLength(2);
    // The pill is the phone's only route back to the walkthrough, so it stays.
    expect(phonePill.className).toContain("md:hidden");
    // The circle is desktop only, or the phone would carry both.
    expect(desktopCircle.className).toContain("hidden");
    expect(desktopCircle.className).toContain("md:grid");
  });

  it("starts the walkthrough from the portfolio", () => {
    fireEvent.click(tourControls().desktopCircle);
    expect(tour.startDashboardTour).toHaveBeenCalledTimes(1);
    expect(tour.requestTourReplay).not.toHaveBeenCalled();
  });

  it("parks a replay and routes home from any other page", () => {
    pathname = "/markets";
    render(<Topbar onOpenAccount={() => {}} />);
    // Both renders are in the document now; the second one's circle is last.
    const circles = screen
      .getAllByRole("button", { name: "Take a tour" })
      .filter((b) => b.className.includes("md:size-[46px]"));
    fireEvent.click(circles[circles.length - 1]);

    expect(tour.requestTourReplay).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/portfolio");
    expect(tour.startDashboardTour).not.toHaveBeenCalled();
  });

  it("no longer carries the holdings trigger", () => {
    // The coins button moved to the balance card, beside the currency pill.
    // Its modal, and the portfolio query behind it, went with it: the topbar
    // renders on every signed-in route and must not pull either.
    expect(screen.queryByRole("button", { name: "Your holdings" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(portfolio.usePortfolio).not.toHaveBeenCalled();
  });
});

describe("Topbar chrome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    privyUser = null;
    pathname = "/portfolio";
  });

  it("keeps the 79px band, the starburst, and the account button", () => {
    const { container } = render(<Topbar onOpenAccount={() => {}} />);
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.className).toContain("md:h-[79px]");
    expect(bar.className).toContain("bg-topbar");
    expect(bar.className).toContain("bg-[url('/rollout/chrome/topbar-starburst.svg')]");
    expect(bar.className).toContain("bg-cover");
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  });
});
