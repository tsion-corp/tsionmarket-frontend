import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The marker slides with motion; the bar under test is the tap zones.
// The marker animates its position; the stub applies the animated values as
// plain style so a test can read where it landed.
vi.mock("motion/react", () => ({
  motion: {
    div: ({
      animate,
      transition: _transition,
      ...props
    }: {
      animate?: Record<string, string>;
      transition?: unknown;
      [key: string]: unknown;
    }) => <div {...props} style={animate} />,
  },
  useReducedMotion: () => true,
}));

vi.mock("@/lib/market-square", () => ({
  marketSquareHref: () => "https://square.example",
}));

const { CurvedTabBar } = await import("./curved-tab-bar");

function renderBar(onNavigate = vi.fn(), activeSection: "portfolio" | "activity" = "portfolio") {
  const { container } = render(
    <CurvedTabBar items={[]} activeSection={activeSection} onNavigate={onNavigate} />
  );
  return { onNavigate, zones: screen.getAllByRole("button"), container };
}

beforeEach(() => {
  router.push.mockClear();
});

describe("CurvedTabBar", () => {
  it("draws five tap zones over the art", () => {
    expect(renderBar().zones).toHaveLength(5);
  });

  it("sends the second zone to the phone Market page", () => {
    const { zones, onNavigate } = renderBar();
    fireEvent.click(zones[1]);
    expect(router.push).toHaveBeenCalledWith("/market");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("opens Market Square beside the app from the centre card", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { zones } = renderBar();
    fireEvent.click(zones[2]);
    expect(open).toHaveBeenCalledWith("https://square.example", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("sends the last zone to Activity, since the phone has no drawer", () => {
    const { zones } = renderBar();
    fireEvent.click(zones[4]);
    expect(router.push).toHaveBeenCalledWith("/activity");
  });

  it("rings the clock on the Activity page, as it rings the home on Portfolio", () => {
    const { container } = renderBar(vi.fn(), "activity");
    const marker = container.querySelector(
      ".rounded-full.border-\\[1\\.5px\\]"
    ) as HTMLElement | null;
    expect(marker).not.toBeNull();
    expect(marker?.style.left).toBe("86.8%");
  });

  it("scroll-spies portfolio and casino, which are sections of the shell", () => {
    const { zones, onNavigate } = renderBar();
    fireEvent.click(zones[0]);
    fireEvent.click(zones[3]);
    expect(onNavigate.mock.calls.map((c) => c[0])).toEqual(["portfolio", "casino"]);
  });
});
