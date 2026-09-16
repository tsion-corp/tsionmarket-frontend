import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  BALANCE_FRACTION_DIGITS,
  TradeAmountCard,
  type TradeAmountCardProps,
} from "@/components/ui/trade-amount-card";

// Nothing here wraps the tree in a NextIntlClientProvider, and that omission is
// the point of the file. next-intl's useTranslations throws without a provider,
// so if this card ever reaches for a message catalogue again every one of these
// renders fails. Passing is the proof that all of its copy comes from `labels`.

const USDC_DECIMALS = 6;
// 1,240 USDC in base units. Written out rather than computed so the fixture
// cannot drift with the helper it is meant to check.
const BALANCE_1240 = 1_240_000_000n;

const LABELS: TradeAmountCardProps["labels"] = {
  paying: "PAYING-LABEL",
  selling: "SELLING-LABEL",
  balance: "BALANCE-LINE",
  amountLabel: "BUY-FIELD",
  amountLabelSell: "SELL-FIELD",
  changeToken: "PICK-TOKEN",
};

type HarnessProps = Partial<TradeAmountCardProps> & { initial?: string };

// The card is controlled by its parent, so the tests drive it through a real
// state holder: a rejected keystroke must leave the displayed value alone.
function Harness({ initial = "", onAmountChange, ...rest }: HarnessProps) {
  const [amount, setAmount] = useState(initial);
  return (
    <TradeAmountCard
      amount={amount}
      onAmountChange={(next) => {
        onAmountChange?.(next);
        setAmount(next);
      }}
      balance={BALANCE_1240}
      payDecimals={USDC_DECIMALS}
      paySymbol="USDC"
      labels={LABELS}
      {...rest}
    />
  );
}

function renderCard(props: HarnessProps = {}) {
  const onAmountChange = vi.fn();
  render(<Harness onAmountChange={onAmountChange} {...props} />);
  const name = props.side === "sell" ? LABELS.amountLabelSell : LABELS.amountLabel;
  return { onAmountChange, input: screen.getByRole("textbox", { name }) };
}

describe("TradeAmountCard", () => {
  it("renders the labels it is handed, with no message catalogue in the tree", () => {
    renderCard({ initial: "500" });
    expect(screen.getByText(LABELS.paying)).toBeInTheDocument();
    expect(screen.getByText(LABELS.balance)).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  // The heading and the field's accessible name are the only things the side
  // changes. The asset, its decimals and its balance are chosen by the caller.
  it("swaps the heading and the field name on the sell leg", () => {
    renderCard({ side: "sell" });
    expect(screen.getByText(LABELS.selling)).toBeInTheDocument();
    expect(screen.queryByText(LABELS.paying)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: LABELS.amountLabelSell })).toBeInTheDocument();
  });

  it("passes an accepted keystroke through unchanged", () => {
    const { onAmountChange, input } = renderCard();
    fireEvent.change(input, { target: { value: "12.345678" } });
    expect(onAmountChange).toHaveBeenCalledWith("12.345678");
    expect(input).toHaveValue("12.345678");
  });

  it("rejects letters, signs, separators and a second decimal point", () => {
    const { onAmountChange, input } = renderCard({ initial: "12" });
    for (const bad of ["12a", "12e5", "-12", "1,200", "12.3.4", "+12"]) {
      fireEvent.change(input, { target: { value: bad } });
    }
    expect(onAmountChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("12");
  });

  it("rejects a keystroke that would exceed the token's decimals", () => {
    const { onAmountChange, input } = renderCard({ initial: "1.123456" });
    fireEvent.change(input, { target: { value: "1.1234567" } });
    expect(onAmountChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("1.123456");
  });

  // The rose edge and aria-invalid move together, so a bad amount is visible to
  // a reader of the screen and to a reader of the DOM.
  it("marks the field and the card once the amount is above the balance", () => {
    const { input } = renderCard({ initial: "1240.000001" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const card = input.parentElement?.parentElement;
    expect(card).toHaveClass("border-down/55");
    expect(card).not.toHaveClass("border-hairline");
  });

  it("leaves the card unmarked while the amount is spendable", () => {
    const { input } = renderCard({ initial: "1240" });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input.parentElement?.parentElement).toHaveClass("border-hairline");
  });

  it("opens the token picker when the pill is pressed", () => {
    const onSelectPayToken = vi.fn();
    renderCard({ onSelectPayToken });
    fireEvent.click(screen.getByRole("button", { name: LABELS.changeToken }));
    expect(onSelectPayToken).toHaveBeenCalledOnce();
  });

  it("draws a static pill, not a button, when no picker is wired up", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: LABELS.changeToken })).not.toBeInTheDocument();
  });

  // The caller formats the balance figure, so the digit count has to be agreed
  // somewhere. Pinning it keeps a second desk from choosing its own.
  it("publishes the balance line's fraction digit count", () => {
    expect(BALANCE_FRACTION_DIGITS).toBe(6);
  });
});
