import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NavItem } from "@/components/layout/nav-items";
import type { SectionId } from "@/lib/sections";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The dome animates each icon to its seat and cross-fades the label; the stub
// folds the animated values into the element's own style so a test can read
// where a seat landed, passes every motion tag straight through, and renders
// AnimatePresence as a plain fragment.
vi.mock("motion/react", () => {
  const strip = (props: Record<string, unknown>) => {
    const dom = { ...props };
    // Motion-only props; on a plain element React would flag them as unknown
    // attributes, so they are dropped rather than forwarded.
    delete dom.initial;
    delete dom.exit;
    delete dom.transition;
    return dom;
  };
  type MotionProps = {
    animate?: React.CSSProperties;
    style?: React.CSSProperties;
    [key: string]: unknown;
  };
  return {
    motion: {
      div: ({ animate, style, ...props }: MotionProps) => (
        <div {...strip(props)} style={{ ...style, ...animate }} />
      ),
      span: ({ animate, style, ...props }: MotionProps) => (
        <span {...strip(props)} style={{ ...style, ...animate }} />
      ),
      button: ({ animate, style, ...props }: MotionProps) => (
        <button {...strip(props)} style={{ ...style, ...animate }} />
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => true,
  };
});

vi.mock("@/lib/market-square", () => ({
  marketSquareHref: () => "https://square.example",
}));

const { CurvedTabBar } = await import("./curved-tab-bar");

// Stands in for buildNav's output: the dock reads the active section's localized
// name off these. The bar's own icon labels (Home, Market, Square, Arkade,
// Activity) are its own, and are what the tests click by.
const NAV: NavItem[] = [
  { id: "portfolio", label: "Portfolio", icon: () => null },
  { id: "spot", label: "Spot", icon: () => null },
  { id: "casino", label: "Casino", icon: () => null },
  { id: "activity", label: "Activity", icon: () => null },
  { id: "meme", label: "Memecoins", icon: () => null },
];

function renderBar(onNavigate = vi.fn(), activeSection: SectionId = "portfolio") {
  const { container } = render(
    <CurvedTabBar items={NAV} activeSection={activeSection} onNavigate={onNavigate} />
  );
  return { onNavigate, container };
}

beforeEach(() => {
  router.push.mockClear();
});

describe("CurvedTabBar", () => {
  it("draws five seats over the dome", () => {
    renderBar();
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("sends the Market seat to the phone Market page", () => {
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Market" }));
    expect(router.push).toHaveBeenCalledWith("/market");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("sends the Square seat to /square in this tab, as a full page load", () => {
    // /square is the Square's own app (lib/square-zone): a client push would
    // ask this build for a route it no longer has, and a new tab loses Ark.
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign },
    });
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Square" }));
    expect(assign).toHaveBeenCalledWith("/square");
    expect(router.push).not.toHaveBeenCalledWith("/square");
    expect(open).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    Object.defineProperty(window, "location", { configurable: true, value: original });
    open.mockRestore();
  });

  it("raises the Square seat to the centre while on /square", () => {
    renderBar(vi.fn(), "square");
    // The seat is marked current, as the active seat is on every other route.
    expect(screen.getByRole("button", { name: "Square" })).toHaveAttribute("aria-current", "page");
  });

  it("sends the Activity seat to Activity, since the phone has no drawer", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(router.push).toHaveBeenCalledWith("/activity");
  });

  it("raises the active section's icon into the centre seat", () => {
    // The centre seat is SEATS[2] = { x: 50, y: 30 }, and the stub folds the
    // animated position into the element's style. Whichever section owns the
    // page rides up there and reads as the current page.
    const home = within(renderBar(vi.fn(), "portfolio").container).getByRole("button", {
      name: "Home",
    });
    expect(home).toHaveAttribute("aria-current", "page");
    expect(home.style.left).toBe("50%");
    expect(home.style.top).toBe("30%");

    const activity = within(renderBar(vi.fn(), "activity").container).getByRole("button", {
      name: "Activity",
    });
    expect(activity).toHaveAttribute("aria-current", "page");
    expect(activity.style.left).toBe("50%");
  });

  it("names the active section under the dock", () => {
    renderBar(vi.fn(), "casino");
    expect(screen.getByText("Casino")).toBeInTheDocument();
  });

  it("raises no icon and names nothing where no seat owns the page", () => {
    const { container } = renderBar(vi.fn(), "meme");
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
    // No section owns the page, so the dock carries no name.
    expect(screen.queryByText("Memecoins")).toBeNull();
  });

  it("scroll-spies portfolio and casino, which are sections of the shell", () => {
    const { onNavigate } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Arkade" }));
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(["portfolio", "casino"]);
  });
});
