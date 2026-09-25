import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The shell composes the book out of four code-split panels, a navigation read
// and the slip store. None of that is what this suite is about: it is about
// the page carrying the switch that decides whether a ticket placed here is
// posted publicly on its own.
vi.mock("@/components/shine/shine-toggle", () => ({
  ShineToggle: ({ service }: { service: string }) => (
    <div data-testid="shine-toggle">{service}</div>
  ),
}));
vi.mock("../hooks/use-sportsbook", () => ({
  useSportsbookNavigation: () => ({ data: { sports: [] }, isLoading: false }),
  useSportsbookCapabilities: () => ({ data: undefined }),
}));
vi.mock("../slip-store", () => ({
  updateSportsbookSlip: vi.fn(),
  useSportsbookSlip: () => ({ selections: [], stake: "2" }),
}));
vi.mock("./sportsbook-header", () => ({ SportsbookHeader: () => <header /> }));
vi.mock("./market-browser", () => ({ MarketBrowser: () => <div /> }));
vi.mock("./event-markets", () => ({ EventMarkets: () => <div /> }));
vi.mock("./bet-slip-panel", () => ({ BetSlipPanel: () => <div /> }));
vi.mock("./ticket-modal", () => ({ TicketModal: () => null }));

import { SportsbookShell } from "./sportsbook-shell";

describe("the sportsbook page", () => {
  // Shine moved to the account menu on 2026-09-25: one switch panel for all
  // seven services instead of a card on each page. This asserts the card has
  // not come back, which is what stops them reappearing one page at a time.
  it("does not carry a Shine card: Shine lives in the account menu", () => {
    render(
      <SportsbookShell
        requestedSport="football"
        country=""
        league=""
        state="prematch"
        eventKind="sports"
      />
    );

    expect(screen.queryByTestId("shine-toggle")).toBeNull();
  });
});
