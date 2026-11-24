import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NavItem } from "@/components/layout/nav-items";
import type { SectionId } from "@/lib/sections";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { TabBar } = await import("./tab-bar");

// Stands in for buildNav's output: the bar reads each tab's localized name
// off these, except Market, which is always the bar's own "Market".
const NAV: NavItem[] = [
  { id: "portfolio", label: "Portfolio", icon: () => null },
  { id: "spot", label: "Spot", icon: () => null },
  { id: "casino", label: "Casino", icon: () => null },
  { id: "activity", label: "Activity", icon: () => null },
  { id: "meme", label: "Memecoins", icon: () => null },
];

function renderBar(onNavigate = vi.fn(), activeSection: SectionId = "portfolio") {
  const { container } = render(
    <TabBar items={NAV} activeSection={activeSection} onNavigate={onNavigate} />
  );
  return { onNavigate, container };
}

beforeEach(() => {
  router.push.mockClear();
});

describe("TabBar", () => {
  it("renders four fixed destinations", () => {
    renderBar();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("sends the Market tab to the phone Market page, not the section's route", () => {
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Market/ }));
    expect(router.push).toHaveBeenCalledWith("/market");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("routes every other tab through onNavigate", () => {
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Portfolio" }));
    fireEvent.click(screen.getByRole("button", { name: "Casino" }));
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(["portfolio", "casino", "activity"]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("marks the active section's tab current and no other", () => {
    renderBar(vi.fn(), "casino");
    expect(screen.getByRole("button", { name: "Casino" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Portfolio" })).not.toHaveAttribute("aria-current");
  });

  it("marks no tab current where no tab owns the page", () => {
    renderBar(vi.fn(), "meme");
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
  });

  it("uses each tab's localized label from items, except Market", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Casino" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Market" })).toBeInTheDocument();
  });
});
