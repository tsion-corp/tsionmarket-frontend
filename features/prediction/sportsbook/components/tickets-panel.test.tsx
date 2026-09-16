import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BetSlipPanel } from "./bet-slip-panel";

const mocks = vi.hoisted(() => ({
  getOrderByBookingCode: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ authenticated: true, login: vi.fn() }),
}));

vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => ({ ETH: 3_000 }),
}));

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
