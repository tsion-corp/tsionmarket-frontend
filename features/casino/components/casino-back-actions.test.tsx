import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/casino/arkball" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-interest", () => ({ useInterest: () => null }));
vi.mock("@/components/layout/nav-items", () => ({ buildNav: () => [] }));
vi.mock("@/components/layout/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <>
      <header data-testid="app-topbar">Account</header>
      <main>{children}</main>
    </>
  ),
}));
vi.mock("@/components/auth/auth-guard", () => ({
  AuthGuard: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/casino/components/casino-nav-guard", () => ({
  CasinoNavGuardProvider: ({ children }: { children: ReactNode }) => children,
  useCasinoNavGuard: () => ({ blocked: () => false }),
}));
vi.mock("@/features/casino/components/draughts/draughts-site-header", () => ({
  DraughtsSiteHeader: () => null,
}));
vi.mock("@/features/casino/components/chess-app/chess-site-shell", () => ({
  ChessSiteShell: ({ children }: { children: ReactNode }) => children,
}));

import { CasinoPage } from "./casino-page";

describe("casino game navigation row", () => {
  it("aligns game balance actions with the back link, not the app topbar", () => {
    render(<CasinoPage backActions={<button>Balance $1.17</button>}>Tickets</CasinoPage>);
    const row = screen.getByRole("link", { name: "Arkade" }).closest("[data-casino-back-row]");
    expect(row).toContainElement(screen.getByRole("button", { name: "Balance $1.17" }));
    expect(row).toHaveClass("flex", "items-center", "justify-between");
    expect(screen.getByTestId("app-topbar")).not.toContainElement(
      screen.getByRole("button", { name: "Balance $1.17" })
    );
  });
});
