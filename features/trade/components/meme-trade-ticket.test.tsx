import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { TradeTicket } from "@/features/trade/components/meme-trade-ticket";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { BuyFunding } from "@/lib/meme/funding";

// The ticket, on its own. The board's suite covers it in place on the two paths
// a user takes every day; this one covers the refusals, because each of them is
// a reason not to send an order and none of them needs a board to reach.
//
// The shipped catalogue is read rather than a local stand-in, so a key dropped
// from messages/*.json fails here instead of passing against a stub.
const messages = enMessages;

const aaa = memeToken({ symbol: "AAA", priceUsd: "0.001" });

// 250 USDC on Base, nothing to move first: the ordinary case.
const funded: BuyFunding = {
  spendableUsd: 250,
  needsFunding: false,
  canFund: true,
  fundingUsd: 0,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

type TicketProps = Parameters<typeof TradeTicket>[0];

function renderTicket(props: Partial<TicketProps> = {}) {
  const onSubmit = vi.fn(async () => {});
  const defaults: TicketProps = {
    token: aaa,
    side: "BUY",
    amount: "",
    onAmountChange: () => {},
    funding: funded,
    heldRaw: "12345678900000000000000",
    heldDecimals: 18,
    preview: null,
    previewLoading: false,
    previewError: null,
    onSubmit,
    phase: "idle",
    error: null,
  };
  render(<TradeTicket {...defaults} {...props} />, { wrapper });
  return { onSubmit };
}

function cta() {
  // The action is the only button in the ticket that is not Max.
  return screen
    .getAllByRole("button")
    .find((button) => button.textContent !== "Max") as HTMLButtonElement;
}

describe("the amounts the ticket refuses to send", () => {
  it("names the minimum instead of the coin when the buy is under it", () => {
    renderTicket({ amount: "0.10" });
    expect(cta()).toBeDisabled();
    expect(cta().textContent).toMatch(/Minimum/i);
  });

  it("refuses a buy over what the wallet can spend", () => {
    const { onSubmit } = renderTicket({ amount: "400" });
    expect(cta()).toHaveTextContent("Not enough balance");
    fireEvent.click(cta());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses a sell over the holding, read from the base-unit string", () => {
    // The holding is 12345.6789 exactly. One unit more is over it.
    renderTicket({ side: "SELL", amount: "12345.6790" });
    expect(cta()).toHaveTextContent("Not enough balance");
  });

  it("treats a holding it cannot read as covering nothing", () => {
    renderTicket({ side: "SELL", amount: "1", heldRaw: "not-a-number" });
    expect(cta()).toHaveTextContent("Not enough balance");
    expect(screen.getByRole("button", { name: "Max" })).toBeDisabled();
  });

  it("refuses a Solana buy whose USDC cannot be moved across", () => {
    renderTicket({
      token: memeToken({ symbol: "SOL1", chainId: SOLANA_CHAIN_ID, priceUsd: "0.001" }),
      amount: "50",
      funding: {
        spendableUsd: 50,
        needsFunding: true,
        canFund: false,
        fundingUsd: 50,
      },
    });
    expect(cta()).toHaveTextContent("Not enough balance");
  });

  it("refuses the side the coin has switched off", () => {
    renderTicket({ token: memeToken({ symbol: "AAA", buyEnabled: false }), amount: "50" });
    expect(cta()).toBeDisabled();
  });
});

describe("what the ticket says while it has no quote", () => {
  it("shows a dash rather than a figure it does not have", () => {
    renderTicket({ amount: "50" });
    // You receive, min received, price impact and slippage: four unknowns.
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("shows the listed-price estimate while a Solana buy waits on its funding", () => {
    renderTicket({
      token: memeToken({ symbol: "SOL1", chainId: SOLANA_CHAIN_ID, priceUsd: "0.001" }),
      amount: "50",
      funding: {
        spendableUsd: 250,
        needsFunding: true,
        canFund: true,
        fundingUsd: 50,
      },
    });
    expect(screen.getByText("≈ 50,000 SOL1")).toBeInTheDocument();
  });

  it("hands the order to its caller once the amount is good", () => {
    const { onSubmit } = renderTicket({ amount: "50" });
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledWith({
      side: "BUY",
      tokenAddress: aaa.address,
      amount: "50",
      chainId: aaa.chainId,
    });
  });
});
