import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/en.json";
import { RwaTicket } from "@/features/rwa/components/rwa-ticket";
import type { UseRwaTicketResult } from "@/features/rwa/hooks/use-rwa-ticket";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";
import type { TokenBalance } from "@/lib/server/alchemy";

// What the ticket is handed this render. The execution hook has its own
// characterisation suite covering quotes, the gates and both settlement legs;
// this suite is about the markup the ticket draws around whatever the hook
// reports, so the hook is a value rather than a flow.
let ticket: UseRwaTicketResult;

vi.mock("@/features/rwa/hooks/use-rwa-ticket", () => ({
  useRwaTicket: () => ticket,
}));

// The chart's query needs a react-query client and a network. Neither belongs
// in a markup suite, so the history answers empty and the panel is judged on
// what it draws around it.
vi.mock("@/features/rwa/hooks/use-rwa-price-history", () => ({
  useRwaPriceHistory: () => ({ points: [], loading: false, error: false }),
}));

vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

const ASSET = {
  id: "base:ondo",
  chain: "base",
  address: "0xondo",
  symbol: "ONDO",
  name: "Ondo US Treasuries",
  issuer: "Ondo Finance",
  category: "treasury",
  priceUsd: "1.00",
  market: { change24h: 2.5, liquidityUsd: 1_200_000 },
} as unknown as RwaAssetView;

// 2.5 ONDO at six decimals, exact in base units, which is what the sell leg
// measures against.
const HOLDING: TokenBalance = {
  symbol: "ONDO",
  name: "Ondo US Treasuries",
  network: "base-mainnet",
  address: "0xondo",
  decimals: 6,
  kind: "rwa",
  balance: 2.5,
  rawBalance: "2500000",
  priceUsd: 1,
  valueUsd: 2.5,
  logo: null,
};

const QUOTE = {} as NonNullable<UseRwaTicketResult["quote"]>;

function stub(over: Partial<UseRwaTicketResult> = {}): UseRwaTicketResult {
  return {
    side: "buy",
    setSide: vi.fn(),
    isBuy: true,
    amount: "",
    setAmount: vi.fn(),
    phase: "idle",
    quote: null,
    notice: null,
    signStep: null,
    confirm: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    fillSellPct: vi.fn(),
    fillSpendable: vi.fn(),
    price: 1,
    logo: "",
    issuerAccess: false,
    holding: null,
    sellBalance: 0,
    spendableUsd: 1000,
    portfolioLoading: false,
    belowMin: false,
    minBuyUsd: 1,
    overBalance: false,
    walletEmpty: false,
    sellable: true,
    sellBlocked: false,
    confirming: false,
    busy: false,
    canConfirm: false,
    needsBaseToSolanaFunding: false,
    canFundSolana: true,
    solanaFundingAmount: 0,
    usdValue: 0,
    recvDecimals: 6,
    quoteReceive: null,
    receiveEst: null,
    receiveUsd: null,
    feeUsd: null,
    settlementRequest: null,
    settlementProgress: null,
    settlementBusy: false,
    ...over,
  };
}

function renderTicket(props: { onAddFunds?: () => void; onChangeAsset?: () => void } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RwaTicket asset={ASSET} {...props} />
    </NextIntlClientProvider>
  );
}

describe("RwaTicket denomination", () => {
  it("counts the buy leg in USDC", () => {
    ticket = stub({ spendableUsd: 1000 });
    renderTicket();

    expect(screen.getByLabelText("Amount to pay")).toBeInTheDocument();
    expect(screen.getByText("You pay")).toBeInTheDocument();
    expect(screen.getByText("Balance 1,000 USDC")).toBeInTheDocument();
    expect(screen.getByText("Purchase Value")).toBeInTheDocument();
  });

  it("counts the sell leg in the asset, against the holding's own decimals", () => {
    ticket = stub({ side: "sell", isBuy: false, holding: HOLDING, sellBalance: 2.5 });
    renderTicket();

    expect(screen.getByLabelText("Amount to sell")).toBeInTheDocument();
    expect(screen.getByText("You are selling")).toBeInTheDocument();
    expect(screen.getByText("Balance 2.5 ONDO")).toBeInTheDocument();
    expect(screen.getByText("You receive")).toBeInTheDocument();
  });
});

describe("RwaTicket shortcuts", () => {
  it("offers the dollar presets on the buy leg", () => {
    ticket = stub();
    renderTicket();

    for (const label of ["Pay $10", "Pay $50", "Pay $100"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("sets the amount from a preset", () => {
    ticket = stub();
    renderTicket();

    fireEvent.click(screen.getByRole("button", { name: "Pay $50" }));
    expect(ticket.setAmount).toHaveBeenCalledWith("50");
  });

  it("hides the dollar presets on the sell leg, where the field counts the asset", () => {
    ticket = stub({ side: "sell", isBuy: false, holding: HOLDING });
    renderTicket();

    expect(screen.queryByRole("button", { name: "Pay $10" })).toBeNull();
  });

  it("shows the share shortcuts only on the sell leg", () => {
    ticket = stub();
    const { unmount } = renderTicket();
    expect(screen.queryByRole("group", { name: "Sell a share of your balance" })).toBeNull();
    unmount();

    ticket = stub({ side: "sell", isBuy: false, holding: HOLDING });
    renderTicket();
    const shortcuts = screen.getByRole("group", { name: "Sell a share of your balance" });
    expect(shortcuts).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Max" })).toBeInTheDocument();
  });

  it("stages a share of the holding through the hook's own setter", () => {
    ticket = stub({ side: "sell", isBuy: false, holding: HOLDING });
    renderTicket();

    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    // Half of 2,500,000 base units at six decimals, computed as integers.
    expect(ticket.setAmount).toHaveBeenCalledWith("1.25");
  });
});

describe("RwaTicket side switch", () => {
  it("reports the chosen leg to the hook", () => {
    ticket = stub();
    renderTicket();

    fireEvent.click(screen.getByRole("radio", { name: "Sell" }));
    expect(ticket.setSide).toHaveBeenCalledWith("sell");
  });
});

describe("RwaTicket actions", () => {
  it("confirms through the hook", () => {
    ticket = stub({ amount: "10", phase: "quoted", quote: QUOTE });
    renderTicket();

    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(ticket.confirm).toHaveBeenCalled();
  });

  it("holds the action shut under the purchase minimum and says so", () => {
    ticket = stub({ amount: "0.5", belowMin: true, minBuyUsd: 1 });
    renderTicket();

    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
    expect(screen.getByText("Minimum purchase is $1.")).toBeInTheDocument();
  });

  it("names the missing holding on the sell leg", () => {
    ticket = stub({ side: "sell", isBuy: false, holding: null, sellBlocked: true });
    renderTicket();

    expect(screen.getByRole("button", { name: "Sell" })).toBeDisabled();
    expect(screen.getByText("You don't hold any ONDO to sell.")).toBeInTheDocument();
  });
});

describe("RwaTicket progress and notices", () => {
  it("names the signing step it is on, once, beside what the order is doing", () => {
    ticket = stub({
      amount: "10",
      phase: "confirming",
      quote: QUOTE,
      confirming: true,
      busy: true,
      signStep: { index: 1, total: 3, label: "Approve" },
    });
    renderTicket();

    expect(screen.getByText("Signing step 2 of 3…")).toBeInTheDocument();
    // The action says what the order is doing rather than repeating the step.
    expect(screen.getByText("Buying ONDO…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });

  it("paints an error notice red and reports it as an alert", () => {
    ticket = stub({ notice: { kind: "error", message: "The route failed." } });
    renderTicket();

    const banner = screen.getByTestId("rwa-ticket-notice");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner.className).toContain("text-down");
    expect(banner).toHaveTextContent("The route failed.");
  });

  it("paints a gas notice amber and reports it as a status", () => {
    ticket = stub({ notice: { kind: "gas", message: "Add a little ETH." } });
    renderTicket();

    const banner = screen.getByTestId("rwa-ticket-notice");
    expect(banner).toHaveAttribute("role", "status");
    expect(banner.className).toContain("text-amber-200");
  });

  it("paints an info notice amber", () => {
    ticket = stub({ notice: { kind: "info", message: "Moving funds…" } });
    renderTicket();

    expect(screen.getByTestId("rwa-ticket-notice").className).toContain("text-amber-200");
  });

  it("reports a settlement leg and lets the reader wave it off", () => {
    ticket = stub({
      settlementRequest: { id: "req-1", direction: "solana-to-base" },
      settlementBusy: true,
      busy: true,
    });
    renderTicket();

    const notice = screen.getByTestId("rwa-settlement-notice");
    expect(notice).toHaveTextContent("Moving sale proceeds to Base…");
    expect(notice).toHaveTextContent(
      "We're moving only this sale's proceeds to your main balance."
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue in background" }));
    expect(screen.queryByTestId("rwa-settlement-notice")).toBeNull();
  });

  it("prefers the live settlement status over the opening line", () => {
    ticket = stub({
      settlementRequest: { id: "req-2", direction: "base-to-solana" },
      settlementProgress: { stage: "processing", pct: 60, label: "Almost there", terminal: false },
    });
    renderTicket();

    expect(screen.getByTestId("rwa-settlement-notice")).toHaveTextContent("Almost there");
  });
});

describe("RwaTicket empty wallet", () => {
  it("offers the deposit flow when the route can open one", () => {
    const onAddFunds = vi.fn();
    ticket = stub({ walletEmpty: true, spendableUsd: 0 });
    renderTicket({ onAddFunds });

    expect(screen.getByText("Add money to start buying")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(onAddFunds).toHaveBeenCalled();
    // The card stands in place of the action, so there is no Buy button over an
    // empty wallet.
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
  });

  it("still explains itself with no deposit flow to offer", () => {
    ticket = stub({ walletEmpty: true, spendableUsd: 0 });
    renderTicket();

    expect(screen.getByText("Add money to start buying")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add funds" })).toBeNull();
  });
});

describe("RwaTicket issuer access", () => {
  it("replaces the whole form with the issuer card", () => {
    ticket = stub({ issuerAccess: true });
    renderTicket();

    expect(screen.getByText("Issuer access only")).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount to pay")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Buy or sell" })).toBeNull();
  });
});

describe("RwaTicket chart", () => {
  // The chart is open when the ticket first draws, so the price is in view
  // before anyone reaches for it; the disclosure still folds it away.
  it("opens on the chart, wired to its panel, and folds it away on request", async () => {
    ticket = stub();
    renderTicket();

    const trigger = screen.getByRole("button", { name: "View Chart" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", "rwa-ticket-chart");
    expect(screen.getByText("No price history yet.")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Disclosure holds the body for one fold animation, then drops it.
    await waitFor(() => expect(screen.queryByText("No price history yet.")).toBeNull());
  });
});

describe("RwaTicket asset pill", () => {
  it("is a picker where the list is off screen", () => {
    const onChangeAsset = vi.fn();
    ticket = stub();
    renderTicket({ onChangeAsset });

    const pill = screen.getByRole("button", { name: /Change asset/ });
    expect(pill).toHaveTextContent("ONDO");
    fireEvent.click(pill);
    expect(onChangeAsset).toHaveBeenCalled();
  });

  it("is a label where the list is already beside it", () => {
    ticket = stub();
    renderTicket();

    expect(screen.queryByRole("button", { name: /Change asset/ })).toBeNull();
    expect(screen.getByText("ONDO")).toBeInTheDocument();
    expect(screen.getByText("+2.50%")).toBeInTheDocument();
  });
});
