import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { TicketBuilder } from "@/features/casino/components/arkball/ticket-builder";
import messages from "@/messages/en.json";
import { LotteryFundingError } from "@/features/casino/lib/lottery-funding";
import { toast } from "@/lib/toast";

vi.mock("@/lib/toast", () => ({
  toast: {
    loading: vi.fn(() => "toast"),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const gate = vi.hoisted(() => ({ signedIn: true, asked: [] as string[] }));
vi.mock("@/hooks/use-require-session", () => ({
  useRequireSession: () => (action: string) => {
    if (gate.signedIn) return true;
    gate.asked.push(action);
    return false;
  },
}));
const addFunds = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-funds-modal", () => ({ useAddFunds: () => addFunds }));
vi.mock("@/hooks/use-signed-in", () => ({ useSignedIn: () => (gate.signedIn ? "yes" : "no") }));

describe("TicketBuilder short on USDC", () => {
  it("offers Add funds beside the shortfall", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <TicketBuilder
          drawId="draw-current"
          drawStatus="open"
          salesCloseAt="2099-08-16T18:00:00Z"
          priceUsdc="0.37"
          availableUsdc="0"
          eligibility={null}
          ownedTickets={[]}
          quickPick={vi.fn()}
          purchase={vi.fn()}
          quickPicking={false}
          purchasing={false}
        />
      </NextIntlClientProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: messages.balance.addFunds }));
    expect(addFunds).toHaveBeenCalledTimes(1);
  });
});

describe("TicketBuilder signed out", () => {
  it("asks for a sign-in on Quick Pick and on Buy, and calls neither", async () => {
    gate.signedIn = false;
    gate.asked = [];
    const quickPick = vi.fn();
    const purchase = vi.fn();
    try {
      render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <TicketBuilder
            drawId="draw-current"
            drawStatus="open"
            salesCloseAt="2099-08-16T18:00:00Z"
            priceUsdc="0.37"
            availableUsdc="0"
            eligibility={null}
            ownedTickets={[]}
            quickPick={quickPick}
            purchase={purchase}
            quickPicking={false}
            purchasing={false}
          />
        </NextIntlClientProvider>
      );
      const pick = screen.getByRole("button", { name: /quick pick/i });
      await waitFor(() => expect(pick).toBeEnabled());
      fireEvent.click(pick);
      const buy = screen.getByRole("button", { name: "Buy ticket for 0.37 USD" });
      expect(buy).toBeEnabled();
      fireEvent.click(buy);
      expect(gate.asked).toEqual(["play", "play"]);
      expect(quickPick).not.toHaveBeenCalled();
      expect(purchase).not.toHaveBeenCalled();
    } finally {
      gate.signedIn = true;
    }
  });
});

describe("TicketBuilder", () => {
  it("renders the backend-configured 0.37 USD ticket price", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <TicketBuilder
          drawId="draw-current"
          drawStatus="open"
          salesCloseAt="2099-08-16T18:00:00Z"
          priceUsdc="0.37"
          availableUsdc="10"
          eligibility={null}
          ownedTickets={[]}
          quickPick={vi.fn()}
          purchase={vi.fn()}
          quickPicking={false}
          purchasing={false}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("$0.37")).toBeInTheDocument();
    expect(screen.getByText("0.37 USD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy ticket for 0.37 USD" })).toBeInTheDocument();
  });

  it("shows saved funding as a pending notice rather than an internet failure", async () => {
    const message = messages.casino.arkball.funding.fundedPending;
    const pendingTicket = {
      wallet: "0x0000000000000000000000000000000000000001",
      drawId: "draw-current",
      amountUsdc: "0.37",
      selection: { whiteNumbers: [1, 2, 3, 4, 5], powerNumber: 6 },
      idempotencyKey: "saved-key",
      txHash: `0x${"a".repeat(64)}`,
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <TicketBuilder
          drawId="draw-current"
          drawStatus="open"
          salesCloseAt="2099-08-16T18:00:00Z"
          priceUsdc="0.37"
          availableUsdc="0"
          eligibility={null}
          ownedTickets={[]}
          quickPick={vi.fn()}
          purchase={vi.fn().mockRejectedValue(new LotteryFundingError(message, { pending: true }))}
          quickPicking={false}
          purchasing={false}
          pendingTicket={pendingTicket}
        />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry pending ticket" }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(message, { id: "toast" }));
  });
});
