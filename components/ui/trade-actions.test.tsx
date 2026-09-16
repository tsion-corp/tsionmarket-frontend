import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TradeActions, type TradeActionsProps } from "@/components/ui/trade-actions";

// Nothing here wraps the tree in a NextIntlClientProvider, and that omission is
// the point of the file. next-intl's useTranslations throws without a provider,
// so if these actions ever reach for a message catalogue again every one of
// these renders fails. Passing is the proof that all of the copy comes from
// `labels`.

const USDC_DECIMALS = 6;
const BALANCE_1240 = 1_240_000_000n;
// The sell leg is a different asset with different decimals, which is the whole
// point of gating the two sides separately.
const BTC_DECIMALS = 8;
const HALF_BTC = 50_000_000n;

// The three argument-taking labels echo their arguments back, so a test can see
// which symbol and which decimal count the component actually passed in.
const LABELS: TradeActionsProps["labels"] = {
  stageWaiting: "WAITING",
  ctaEnterAmount: "ENTER-AMOUNT",
  ctaNoBalanceOf: (symbol) => `SHORT-OF:${symbol}`,
  amountTooPrecise: (symbol, decimals) => `TOO-PRECISE:${symbol}:${decimals}`,
  amountInvalid: "INVALID",
  ctaSelect: "PICK-A-MARKET",
  noSellBalance: (symbol) => `NONE-HELD:${symbol}`,
  buy: "BUY-LABEL",
  sell: "SELL-LABEL",
  addFunds: "ADD-FUNDS",
};

function renderActions(props: Partial<TradeActionsProps> = {}) {
  const onBuy = vi.fn();
  const onSell = vi.fn();
  const side = props.side ?? "buy";
  render(
    <TradeActions
      side={side}
      amount=""
      pay={{ balance: BALANCE_1240, decimals: USDC_DECIMALS, symbol: "USDC" }}
      sell={{ balance: HALF_BTC, decimals: BTC_DECIMALS, symbol: "BTC" }}
      onBuy={onBuy}
      onSell={onSell}
      labels={LABELS}
      {...props}
    />
  );
  return {
    onBuy,
    onSell,
    // One button, for the chosen side. Rendering both at once is what let a
    // USDC-denominated amount be measured against a coin balance.
    action: screen.getByRole("button", {
      name: new RegExp(side === "buy" ? LABELS.buy : LABELS.sell),
    }),
  };
}

// The over-balance buy that the Add-funds companion is built for: an amount a
// cent past the pay balance, on the buy leg.
const OVER_BALANCE = "1240.000001";

describe("TradeActions", () => {
  it("renders the label it is handed for the chosen side", () => {
    renderActions({ side: "buy", amount: "100" });
    expect(screen.getByRole("button", { name: LABELS.buy })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LABELS.sell })).not.toBeInTheDocument();
    cleanup();

    renderActions({ side: "sell", amount: "0.1" });
    expect(screen.getByRole("button", { name: LABELS.sell })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LABELS.buy })).not.toBeInTheDocument();
  });

  it("reports the exact string typed, on either side", () => {
    const buy = renderActions({ side: "buy", amount: "0.12345" });
    expect(buy.action).toBeEnabled();
    fireEvent.click(buy.action);
    expect(buy.onBuy).toHaveBeenCalledWith("0.12345");
    cleanup();

    const sell = renderActions({ side: "sell", amount: "0.12345" });
    fireEvent.click(sell.action);
    expect(sell.onSell).toHaveBeenCalledWith("0.12345");
  });

  it("disables the action and says why when no amount is entered", () => {
    const { action } = renderActions({ amount: "" });
    expect(action).toBeDisabled();
    expect(screen.getByText(LABELS.ctaEnterAmount)).toBeInTheDocument();
  });

  it("ties the reason to the button for screen readers", () => {
    const { action } = renderActions({ amount: "" });
    expect(action).toHaveAttribute("aria-describedby", screen.getByText("ENTER-AMOUNT").id);
  });

  // The reason element is present even when silent, so aria-describedby always
  // resolves to something rather than dangling.
  it("keeps a silent reason in the DOM once the amount is spendable", () => {
    const { action } = renderActions({ amount: "100" });
    expect(action).toBeEnabled();
    const reasonId = action.getAttribute("aria-describedby");
    expect(reasonId).not.toBeNull();
    const reason = document.getElementById(reasonId ?? "");
    expect(reason).toHaveClass("sr-only");
    expect(reason).toBeEmptyDOMElement();
  });

  it("names the asset the active side is short of, and refuses to fire", () => {
    const { action, onBuy } = renderActions({ side: "buy", amount: "1240.000001" });
    expect(action).toBeDisabled();
    expect(screen.getByText("SHORT-OF:USDC")).toBeInTheDocument();
    fireEvent.click(action);
    expect(onBuy).not.toHaveBeenCalled();
  });

  // BTC carries 8 decimals and USDC 6, so an 8dp amount is fine to sell and too
  // precise to spend. Each side applies its own asset's limit, and the label
  // function is handed both the symbol and that limit.
  it("applies the active side's own decimal limit", () => {
    const sell = renderActions({ side: "sell", amount: "0.12345678" });
    expect(sell.action).toBeEnabled();
    cleanup();

    const buy = renderActions({ side: "buy", amount: "0.12345678" });
    expect(buy.action).toBeDisabled();
    expect(screen.getByText("TOO-PRECISE:USDC:6")).toBeInTheDocument();
  });

  it("refuses a malformed amount as invalid rather than coercing it", () => {
    const { action } = renderActions({ side: "buy", amount: "1e3" });
    expect(action).toBeDisabled();
    expect(screen.getByText(LABELS.amountInvalid)).toBeInTheDocument();
  });

  it("explains rather than offering a sell for a coin the wallet holds none of", () => {
    const { action } = renderActions({
      side: "sell",
      amount: "1",
      sell: { balance: null, symbol: "BTC" },
    });
    expect(action).toBeDisabled();
    expect(screen.getByText("NONE-HELD:BTC")).toBeInTheDocument();
  });

  it("asks for a market when there is no sell leg at all", () => {
    const { action } = renderActions({ side: "sell", amount: "1", sell: undefined });
    expect(action).toBeDisabled();
    expect(screen.getByText(LABELS.ctaSelect)).toBeInTheDocument();
  });

  /**
   * The trapping case. Gating Sell on the pay balance would strand a user who
   * holds the asset but no USDC: they could not close the position.
   */
  it("lets a holder sell with an empty pay balance", () => {
    const { action, onSell } = renderActions({
      side: "sell",
      amount: "0.25",
      pay: { balance: 0n, decimals: USDC_DECIMALS, symbol: "USDC" },
    });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onSell).toHaveBeenCalledWith("0.25");
  });

  // While an order is in flight the side is locked whatever the balances say,
  // so the amount cannot move under a signature.
  it("shows the spinner and the waiting reason on the side in flight", () => {
    const { action } = renderActions({ side: "buy", amount: "100", pending: "buy" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    expect(action.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByText(LABELS.stageWaiting)).toBeInTheDocument();
  });

  it("locks the idle side too, without spinning it", () => {
    const { action } = renderActions({ side: "sell", amount: "0.1", pending: "buy" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "false");
    expect(action.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText(LABELS.stageWaiting)).toBeInTheDocument();
  });

  // The Add-funds companion: the way forward when a buy outruns the pay
  // balance, standing where the dead Buy button was rather than only in a line.
  describe("add funds", () => {
    it("grows an Add funds button beside a Buy the balance cannot cover", () => {
      const onAddFunds = vi.fn();
      const { action } = renderActions({ side: "buy", amount: OVER_BALANCE, onAddFunds });
      expect(action).toBeDisabled();
      const addFunds = screen.getByRole("button", { name: LABELS.addFunds });
      expect(addFunds).toBeEnabled();
      fireEvent.click(addFunds);
      expect(onAddFunds).toHaveBeenCalledOnce();
    });

    it("stays hidden while the buy is affordable", () => {
      renderActions({ side: "buy", amount: "100", onAddFunds: vi.fn() });
      expect(screen.queryByRole("button", { name: LABELS.addFunds })).not.toBeInTheDocument();
    });

    // Empty, too-precise and malformed amounts are the user's to fix; a deposit
    // would not clear them, so the button holds off.
    it.each([
      ["an empty amount", ""],
      ["a too-precise amount", "0.12345678"],
      ["a malformed amount", "1e3"],
    ])("stays hidden on %s", (_case, amount) => {
      renderActions({ side: "buy", amount, onAddFunds: vi.fn() });
      expect(screen.queryByRole("button", { name: LABELS.addFunds })).not.toBeInTheDocument();
    });

    it("stays hidden while the order is in flight", () => {
      renderActions({ side: "buy", amount: OVER_BALANCE, pending: "buy", onAddFunds: vi.fn() });
      expect(screen.queryByRole("button", { name: LABELS.addFunds })).not.toBeInTheDocument();
    });

    // Selling draws down the asset, not the pay token, so a short pay balance is
    // no reason to top up: the companion is a buy-leg control only.
    it("stays hidden on the sell leg", () => {
      renderActions({
        side: "sell",
        amount: "0.6",
        sell: { balance: HALF_BTC, decimals: BTC_DECIMALS, symbol: "BTC" },
        onAddFunds: vi.fn(),
      });
      expect(screen.queryByRole("button", { name: LABELS.addFunds })).not.toBeInTheDocument();
    });

    it("stays hidden when the desk offers no deposit route", () => {
      const { action } = renderActions({ side: "buy", amount: OVER_BALANCE });
      expect(action).toBeDisabled();
      expect(screen.queryByRole("button", { name: LABELS.addFunds })).not.toBeInTheDocument();
    });
  });
});
