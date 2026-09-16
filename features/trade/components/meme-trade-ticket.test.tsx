import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { TradeTicket } from "@/features/trade/components/meme-trade-ticket";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { BuyFunding } from "@/lib/meme/funding";
import type { SwapPreview } from "@/lib/meme/api";

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
    // You receive, min received, price impact, slippage and the platform fee:
    // five unknowns.
    expect(screen.getAllByText("—")).toHaveLength(5);
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

function swapPreview(overrides: Partial<SwapPreview> = {}): SwapPreview {
  return {
    side: "BUY",
    chainId: 8453,
    walletAddress: "0xwallet",
    sellToken: { address: "0xusdc", symbol: "USDC" },
    buyToken: { address: aaa.address, symbol: "AAA" },
    sellAmountAtomic: "50000000",
    sellAmountFormatted: "50",
    expectedBuyAmountAtomic: "40650000000000000000000",
    expectedBuyAmountFormatted: "40650",
    minimumBuyAmountAtomic: "40240000000000000000000",
    minimumBuyAmountFormatted: "40240",
    priceImpactBps: 30,
    slippageBps: 100,
    platformFeeAmountAtomic: "250000",
    platformFeeAmountFormatted: "0.25",
    riskLevel: "LOW",
    warnings: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

// The phone ticket is a trade surface like the sheet, so it tells the trader
// what the sheet tells them: the risk level and the warnings the service
// attached, before any amount is sent.
describe("the risk the ticket shows", () => {
  const warned = memeToken({
    symbol: "RISKY",
    riskLevel: "HIGH",
    warnings: [
      { code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." },
      { code: "UPGRADEABLE_CONTRACT", message: "The token contract is upgradeable." },
      { code: "HOLDER_CONCENTRATION", message: "Top holders own 60% of supply." },
    ],
  });

  it("carries the risk badge and the visible warnings, without the upgradeable-proxy line", () => {
    renderTicket({ token: warned });
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Liquidity is below $50,000.")).toBeInTheDocument();
    expect(screen.getByText("Top holders own 60% of supply.")).toBeInTheDocument();
    expect(screen.queryByText("The token contract is upgradeable.")).toBeNull();
  });

  it("says liquidity is unknown when the service published none", () => {
    renderTicket({ token: memeToken({ symbol: "NEW", liquidityUsd: null }) });
    expect(screen.getByText(enMessages.meme.liquidityUnknown)).toBeInTheDocument();
  });
});

// The contract: display the fee the preview returned, in USDC, never a rate
// the client knows.
describe("the platform fee", () => {
  function feeRow() {
    return screen.getByText("Platform fee").parentElement as HTMLElement;
  }

  it("shows the preview's formatted fee in USDC, exactly as returned", () => {
    renderTicket({ amount: "50", preview: swapPreview({ platformFeeAmountFormatted: "0.25" }) });
    expect(feeRow()).toHaveTextContent("0.25 USDC");
  });

  it("shows no fee it has not been told", () => {
    renderTicket({ amount: "50" });
    expect(feeRow()).toHaveTextContent("—");
    expect(screen.queryByText(/0\.5\s?%/)).toBeNull();
  });
});

// The preview hook blanks a lapsed quote; the ticket says why and offers a
// fresh one, the way the sheet does.
describe("a lapsed quote", () => {
  it("says the price lapsed and asks for a fresh one", () => {
    const onRefreshQuote = vi.fn();
    renderTicket({ amount: "50", preview: null, quoteExpired: true, onRefreshQuote });
    expect(screen.getByText(enMessages.meme.quoteExpired)).toBeInTheDocument();
    expect(screen.queryByText(/40650/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: enMessages.meme.retry }));
    expect(onRefreshQuote).toHaveBeenCalledTimes(1);
  });
});
