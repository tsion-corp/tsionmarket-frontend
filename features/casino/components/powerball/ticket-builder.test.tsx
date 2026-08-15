import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { TicketBuilder } from "@/features/casino/components/powerball/ticket-builder";
import messages from "@/messages/en.json";

vi.mock("@/lib/toast", () => ({
  toast: {
    loading: vi.fn(() => "toast"),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TicketBuilder", () => {
  it("renders the backend-configured 0.37 USDC ticket price", () => {
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
    expect(screen.getByText("0.37 USDC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy ticket for 0.37 USDC" })).toBeInTheDocument();
  });
});
