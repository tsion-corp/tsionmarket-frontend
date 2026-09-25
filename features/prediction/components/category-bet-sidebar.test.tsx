import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryPrediction } from "../category-market-presenter";
import { CategoryBetSidebar } from "./category-bet-sidebar";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  fetchHouseTicketByBookingCode: vi.fn(),
  fetchHouseTickets: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(),
  getIdentityToken: vi.fn(),
}));

// Through the Decane-backed session seam; "login" is now a route to /auth, so
// the router is stubbed rather than a Privy login callback. Each test sets
// mocks.authenticated, so the seam reads it rather than fixing it here.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    evmAddress: mocks.authenticated ? "0x0000000000000000000000000000000000000001" : null,
    solanaAddress: null,
    profile: { name: "Account", email: "", avatarSeed: "worldstreet" },
    logout: vi.fn(),
  }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/use-withdraw", () => ({
  useSendToken: () => ({ sendToken: vi.fn() }),
}));

vi.mock("../markets/api", () => ({
  confirmHouseTicket: vi.fn(),
  fetchHouseTicketByBookingCode: mocks.fetchHouseTicketByBookingCode,
  fetchHouseTickets: mocks.fetchHouseTickets,
  prepareHouseTicket: vi.fn(),
}));

const prediction: CategoryPrediction = {
  eventId: "event-1",
  eventTitle: "Election",
  marketId: "market-1",
  q: "Will the candidate win?",
  tag: "Elections",
  vol: "$1M vol",
  yes: "5¢",
  no: "95¢",
  pct: 5,
  yesTokenId: "yes-token",
  noTokenId: "no-token",
  conditionId: "condition",
  tradable: true,
  yesDecimalOdds: 20,
  noDecimalOdds: 1.05,
};

function renderSidebar(props: Partial<React.ComponentProps<typeof CategoryBetSidebar>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CategoryBetSidebar
        selections={[{ prediction, side: "yes" }]}
        desktopOpen
        mobileOpen={false}
        onDesktopOpenChange={vi.fn()}
        onMobileOpenChange={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("category bet sidebar", () => {
  beforeEach(() => {
    mocks.authenticated = false;
    mocks.fetchHouseTicketByBookingCode.mockReset();
    mocks.fetchHouseTickets.mockReset();
  });

  it("shows the accumulator requirements and removes a pick on desktop", () => {
    const onRemove = vi.fn();
    renderSidebar({ onRemove });

    expect(screen.getByRole("button", { name: "Ticket (1)" })).toBeInTheDocument();
    expect(screen.getByText("Accumulator")).toBeInTheDocument();
    expect(screen.getByText("Add 2 more markets.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove will the candidate win/i }));
    expect(onRemove).toHaveBeenCalledWith("condition");
  });

  it("opens the same accumulator as a mobile bottom sheet", () => {
    const onMobileOpenChange = vi.fn();
    renderSidebar({
      desktopOpen: false,
      mobileOpen: true,
      onMobileOpenChange,
      selections: [{ prediction, side: "no" }],
    });

    expect(screen.getByText("No", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close ticket" })[0]);
    expect(onMobileOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens an active My Bets ticket in a details modal", async () => {
    mocks.authenticated = true;
    mocks.fetchHouseTickets.mockResolvedValue({
      tickets: [
        {
          id: "ticket-1",
          bookingCode: "ARK-1234",
          status: "accepted",
          stakeE6: "1000000",
          combinedOddsE6: "2450000",
          potentialPayoutE6: "2450000",
          treasuryAddress: "0x0000000000000000000000000000000000000001",
          fundingTxHash: "0xabc",
          legs: [
            {
              eventId: "1",
              eventTitle: "Election",
              marketId: "2",
              conditionId: "condition-1",
              outcome: "yes",
              marketLabel: "Will the candidate win?",
              probabilityE6: "500000",
              decimalOddsE6: "2450000",
              status: "open",
            },
          ],
          expiresAt: "2026-09-14T08:05:00Z",
          acceptedAt: "2026-09-14T08:00:00Z",
          resolvedAt: null,
          paidAt: null,
          payoutTxHash: null,
          createdAt: "2026-09-14T07:59:00Z",
          updatedAt: "2026-09-14T08:00:00Z",
        },
      ],
    });
    renderSidebar({ selections: [] });

    fireEvent.click(screen.getByRole("button", { name: "My tickets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open ticket ARK-1234" }));

    expect(screen.getByRole("dialog", { name: "ARK-1234" })).toBeInTheDocument();
    expect(screen.getAllByText("All selections in progress")).toHaveLength(1);
    expect(screen.getByText("1 Selection In Progress")).toBeInTheDocument();
    expect(screen.getByText("Will the candidate win?")).toBeInTheDocument();
    expect(screen.getByText("2.45 USDC")).toBeInTheDocument();
    expect(screen.getByText("Payout")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "ARK-1234" })).not.toBeInTheDocument();
    });
  });

  it("opens a Polymarket ticket from its hexadecimal bet code", async () => {
    mocks.authenticated = true;
    mocks.fetchHouseTickets.mockResolvedValue({ tickets: [] });
    mocks.fetchHouseTicketByBookingCode.mockResolvedValue({
      id: "ticket-code",
      bookingCode: "AB12CD",
      status: "accepted",
      stakeE6: "1000000",
      combinedOddsE6: "2000000",
      potentialPayoutE6: "2000000",
      treasuryAddress: "0x0000000000000000000000000000000000000001",
      fundingTxHash: "0xabc",
      legs: [],
      expiresAt: "2026-09-14T08:05:00Z",
      acceptedAt: "2026-09-14T08:00:00Z",
      resolvedAt: null,
      paidAt: null,
      payoutTxHash: null,
      createdAt: "2026-09-14T07:59:00Z",
      updatedAt: "2026-09-14T08:00:00Z",
    });
    renderSidebar({ selections: [] });

    fireEvent.change(screen.getByLabelText("Polymarket ticket code"), {
      target: { value: "ab-12-cd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Polymarket ticket code" }));

    await waitFor(() => {
      expect(mocks.fetchHouseTicketByBookingCode).toHaveBeenCalledWith("AB12CD");
    });
    expect(await screen.findByRole("dialog", { name: "AB12CD" })).toBeInTheDocument();
  });

  it("hides the bet-code field after a selection is added and inside My bets", () => {
    const view = renderSidebar({ selections: [] });
    expect(screen.getByLabelText("Polymarket ticket code")).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CategoryBetSidebar
          selections={[{ prediction, side: "yes" }]}
          desktopOpen
          mobileOpen={false}
          onDesktopOpenChange={vi.fn()}
          onMobileOpenChange={vi.fn()}
          onRemove={vi.fn()}
          onClear={vi.fn()}
        />
      </QueryClientProvider>
    );
    expect(screen.queryByLabelText("Polymarket ticket code")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "My tickets" }));
    expect(screen.queryByLabelText("Polymarket ticket code")).not.toBeInTheDocument();
  });
});
