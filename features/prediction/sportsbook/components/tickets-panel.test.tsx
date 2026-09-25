import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BetSlipPanel } from "./bet-slip-panel";

const mocks = vi.hoisted(() => ({
  getOrderByBookingCode: vi.fn(),
}));

// Signed in, through the Decane-backed session seam; "login" is now a route
// to /auth, so the router is stubbed rather than a Privy login callback.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0x0000000000000000000000000000000000000001",
    solanaAddress: null,
    profile: { name: "Account", email: "", avatarSeed: "worldstreet" },
    logout: vi.fn(),
  }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => ({ ETH: 3_000 }),
}));

// The ticket list reports settled wins to Shine. Shine's own module reaches
// the square's write path and the Privy session behind it, neither of which
// this suite has; what it does with a ticket is pinned in shine.test.ts and in
// use-sportsbook-shine.test.tsx.
vi.mock("@/lib/shine", () => ({ reportShine: vi.fn() }));

vi.mock("../api", () => ({
  getOrderByBookingCode: mocks.getOrderByBookingCode,
  sportsbookKeys: { order: (id: string) => ["sportsbook", "order", id] },
}));

vi.mock("../hooks/use-sportsbook", () => ({
  useBetCalculation: () => ({ data: undefined, isError: false, isLoading: false }),
  useSportsbookOrderHistory: () => ({
    data: { items: [] },
    isError: false,
    isLoading: false,
  }),
  useSportsbookMarkets: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("../hooks/use-place-order", () => ({
  usePlaceSportsbookOrder: () => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
    phase: "idle",
    reset: vi.fn(),
  }),
}));

vi.mock("../slip-store", () => ({
  updateSportsbookSlip: vi.fn(),
  useSportsbookSlip: () => ({ selections: [], stake: "2" }),
}));

describe("Azuro ticket lookup", () => {
  it("shows lookup in an empty betslip but not in My bets", async () => {
    mocks.getOrderByBookingCode.mockResolvedValue({ ticketId: "ticket-1" });
    const onOpen = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <BetSlipPanel capabilities={undefined} onTicket={onOpen} />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByLabelText("Azuro ticket code"), {
      target: { value: "01-ab-23-cd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Azuro ticket code" }));

    await waitFor(() => {
      expect(mocks.getOrderByBookingCode).toHaveBeenCalledWith("01AB23CD");
      expect(onOpen).toHaveBeenCalledWith("ticket-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "My tickets" }));
    expect(screen.queryByLabelText("Azuro ticket code")).not.toBeInTheDocument();
  });
});
