import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({
  pathname: "/casino/chess" as string | null,
  setupOpen: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => ({
    has: (key: string) => key === "setup" && route.setupOpen,
  }),
}));

vi.mock("@/features/casino/components/casino-page", () => ({
  CasinoDashboardShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

vi.mock("@/features/casino/components/chess-app/chess-profile-balance", () => ({
  ChessHeaderActions: () => <div data-testid="chess-header-actions" />,
}));

vi.mock("@/features/casino/components/chess-app/chess-style-boundary", () => ({
  ChessStyleBoundary: () => <div data-testid="chess-styles" />,
}));

import { ChessRouteShell } from "@/features/casino/components/chess-app/chess-route-shell";

describe("ChessRouteShell", () => {
  beforeEach(() => {
    route.pathname = "/casino/chess";
    route.setupOpen = false;
  });

  it("keeps the dashboard sidebar only on the Chess home", () => {
    render(
      <ChessRouteShell>
        <div data-testid="page" />
      </ChessRouteShell>
    );

    expect(screen.getByTestId("dashboard-shell")).toContainElement(screen.getByTestId("page"));
    expect(screen.queryByTestId("chess-styles")).not.toBeInTheDocument();
    expect(screen.getByTestId("chess-header-actions")).toBeInTheDocument();
  });

  it("yields the mobile action layer to an open setup dialog", () => {
    route.setupOpen = true;

    const { container } = render(
      <ChessRouteShell>
        <div data-testid="page" />
      </ChessRouteShell>
    );

    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("chess-header-actions")).not.toBeInTheDocument();
    expect(container.querySelector("[data-chess-setup-open]")).toBeInTheDocument();
  });

  it.each([
    "/casino/chess/play",
    "/casino/chess/puzzles",
    "/casino/chess/learn",
    "/casino/chess/watch",
    "/casino/chess/tournaments/create",
    "/casino/chess/swiss/create",
  ])("uses the full viewport for %s", (pathname) => {
    route.pathname = pathname;

    render(
      <ChessRouteShell>
        <div data-testid="page" />
      </ChessRouteShell>
    );

    expect(screen.queryByTestId("dashboard-shell")).not.toBeInTheDocument();
    expect(screen.getByTestId("chess-styles")).toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("chess-header-actions")).not.toBeInTheDocument();
  });
});
