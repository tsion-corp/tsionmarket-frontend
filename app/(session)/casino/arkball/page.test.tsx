import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/casino/components/casino-page", () => ({
  CasinoPage: ({ children, backActions }: { children: ReactNode; backActions?: ReactNode }) => (
    <>
      <nav data-testid="game-nav">
        <a href="/casino">Arkade</a>
        {backActions}
      </nav>
      <main>{children}</main>
    </>
  ),
}));
vi.mock("@/features/casino/components/chess-app/chess-profile-balance", () => ({
  ChessProfileBalance: ({ showArkadeLink = true }: { showArkadeLink?: boolean }) => (
    <>
      {showArkadeLink ? <a href="/casino">Arkade</a> : null}
      <a href="/dashboard">Balance $1.17</a>
    </>
  ),
}));
vi.mock("@/features/casino/components/arkball/arkball-section", () => ({
  ArkBallSection: () => <section>Ticket builder</section>,
}));

import ArkBallPage from "./page";

describe("ArkBall navigation balance", () => {
  it("composes Chess balance controls into the navigation, not the ticket content", () => {
    render(<ArkBallPage />);
    const balance = screen.getByRole("link", { name: "Balance $1.17" });
    expect(screen.getByTestId("game-nav")).toContainElement(balance);
    expect(screen.getByRole("main")).not.toContainElement(balance);
    expect(screen.queryByText("Main wallet balance")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Arkade" })).toHaveLength(1);
  });
});
