import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import {
  MemeSellPanel,
  type MemeSellPanelProps,
} from "@/features/trade/components/meme-sell-panel";
import type { MemeTradeInput } from "@/features/trade/hooks/use-meme-trade";
import type { SwapPreview } from "@/lib/meme/api";
import { toBaseUnits } from "@/lib/trade/math";

// The panel is controlled: the parent owns the amount so it can debounce it
// into a preview. The harness supplies that state.
function renderPanel(overrides: Partial<MemeSellPanelProps> = {}) {
  // Wrapped so the panel's own call is always inspectable, whether the test
  // supplied a handler or not.
  const handler: (input: MemeTradeInput) => Promise<void> =
    overrides.onSell ?? (() => Promise.resolve());
  const onSell = vi.fn(handler);
  const token = overrides.token ?? memeToken({ symbol: "PEPE" });

  function Harness() {
    const [amount, setAmount] = useState(overrides.amount ?? "");
    return (
      <MemeSellPanel
        token={token}
        balanceRaw={overrides.balanceRaw ?? "0"}
        balanceDecimals={overrides.balanceDecimals}
        preview={overrides.preview ?? null}
        previewLoading={overrides.previewLoading}
        previewError={overrides.previewError}
        phase={overrides.phase}
        error={overrides.error}
        amount={amount}
        onAmountChange={setAmount}
        onSell={onSell}
      />
    );
  }

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );
  return { onSell, token };
}

function amountInput() {
  return screen.getByLabelText("You sell") as HTMLInputElement;
}

function swapPreview(overrides: Partial<SwapPreview> = {}): SwapPreview {
  const sellToken = memeToken({ symbol: "PEPE" });
  const buyToken = memeToken({ symbol: "USDC", decimals: 6 });
  return {
    side: "SELL",
    chainId: 8453,
    walletAddress: "0xwallet",
    sellToken,
    buyToken,
    sellAmountAtomic: "500000000000000000000",
    sellAmountFormatted: "500",
    expectedBuyAmountAtomic: "5000000001",
    expectedBuyAmountFormatted: "5000.000001",
    minimumBuyAmountAtomic: "4950000001",
    minimumBuyAmountFormatted: "4950.000001",
    priceImpactBps: 125,
    slippageBps: 350,
    platformFeeAmountAtomic: "0",
    platformFeeAmountFormatted: "0",
    liquidityAvailable: true,
    approvalRequired: false,
    riskLevel: "LOW",
    warnings: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe("MemeSellPanel", () => {
  it("sells the exact base-unit balance on a 100% shortcut", async () => {
    // 123.456789012345678901 PEPE. The last digit is the one a float drops.
    const balanceRaw = "123456789012345678901";
    const { onSell, token } = renderPanel({ balanceRaw, balanceDecimals: 18 });

    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(amountInput().value).toBe("123.456789012345678901");

    fireEvent.click(screen.getByRole("button", { name: "Sell PEPE" }));
    await waitFor(() => expect(onSell).toHaveBeenCalledTimes(1));

    const sent = onSell.mock.calls[0][0];
    expect(sent).toEqual({
      side: "SELL",
      tokenAddress: token.address,
      amount: "123.456789012345678901",
      chainId: token.chainId,
    });
    // The amount that leaves the panel maps back to the balance exactly, with
    // no base unit gained or lost on the way.
    expect(toBaseUnits(sent.amount, 18)).toBe(BigInt(balanceRaw));
  });

  it("computes a 25% shortcut in base units rather than through a float", () => {
    // 0.333333333333333333 PEPE. A float rounds this to 0.3333333333333333
    // before the quarter is taken, and the shortcut lands three base units low.
    const balanceRaw = "333333333333333333";
    renderPanel({ balanceRaw, balanceDecimals: 18 });

    fireEvent.click(screen.getByRole("button", { name: "25%" }));

    const value = amountInput().value;
    expect(value).toBe("0.083333333333333333");
    expect(toBaseUnits(value, 18)).toBe((BigInt(balanceRaw) * 25n) / 100n);

    const viaFloat = toBaseUnits(String(Number("0.333333333333333333") * 0.25), 18);
    expect(toBaseUnits(value, 18)).not.toBe(viaFloat);
  });

  it("keeps every shortcut inside the balance for a nine-decimal Solana token", () => {
    // 18,446,744,073.709551615 of a 9-decimal coin: past 2^53 base units, so
    // any float step here is already lossy.
    const balanceRaw = "18446744073709551615";
    renderPanel({ balanceRaw, balanceDecimals: 9 });

    for (const [label, percent] of [
      ["25%", 25n],
      ["50%", 50n],
      ["75%", 75n],
      ["Max", 100n],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      const base = toBaseUnits(amountInput().value, 9);
      expect(base).toBe((BigInt(balanceRaw) * percent) / 100n);
      expect(base <= BigInt(balanceRaw)).toBe(true);
    }
  });

  it("disables the sell and says why when the amount is over the balance", () => {
    const { onSell } = renderPanel({ balanceRaw: "1000000", balanceDecimals: 6 });

    fireEvent.change(amountInput(), { target: { value: "2" } });

    const cta = screen.getByRole("button", { name: "Not enough balance" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(onSell).not.toHaveBeenCalled();
  });

  it("allows the whole balance and blocks one base unit more", () => {
    renderPanel({ balanceRaw: "1000000", balanceDecimals: 6 });

    fireEvent.change(amountInput(), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Sell PEPE" })).toBeEnabled();

    fireEvent.change(amountInput(), { target: { value: "1.000001" } });
    expect(screen.getByRole("button", { name: "Not enough balance" })).toBeDisabled();
  });

  it("surfaces a failed sell instead of swallowing the rejection", async () => {
    const onSell = vi.fn(() => Promise.reject(new Error("insufficient liquidity")));
    renderPanel({ balanceRaw: "1000000000000000000", onSell });

    fireEvent.change(amountInput(), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Sell PEPE" }));

    expect(
      await screen.findByText(
        "We couldn't complete this right now. Try again, or a different amount or asset."
      )
    ).toBeInTheDocument();
  });

  it("disables the sell while an order is in flight", async () => {
    let release = () => {};
    const onSell = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    renderPanel({ balanceRaw: "1000000000000000000", onSell });

    fireEvent.change(amountInput(), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Sell PEPE" }));

    const busy = await screen.findByRole("button", { name: "Selling" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(onSell).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sell PEPE" })).toBeEnabled());
  });

  it("reports the trade phase the caller passes while it confirms", () => {
    renderPanel({ balanceRaw: "1000000000000000000", amount: "0.5", phase: "confirming" });

    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
  });

  it("blocks the sell when the token has selling paused", () => {
    renderPanel({
      balanceRaw: "1000000000000000000",
      amount: "0.5",
      token: memeToken({ symbol: "PEPE", sellEnabled: false }),
    });

    expect(screen.getByRole("button", { name: "Trading is paused for this token" })).toBeDisabled();
  });

  it("treats an unreadable balance as nothing to sell", () => {
    renderPanel({ balanceRaw: "not-a-balance" });

    fireEvent.change(amountInput(), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Not enough balance" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Max" })).toBeDisabled();
  });

  it("renders the quote's own strings, never a re-parsed number", () => {
    renderPanel({
      balanceRaw: "1000000000000000000000",
      amount: "500",
      preview: swapPreview(),
    });

    expect(screen.getByText("5000.000001 USDC")).toBeInTheDocument();
    expect(screen.getByText("4950.000001 USDC")).toBeInTheDocument();
    expect(screen.getByText("1.25%")).toBeInTheDocument();
    expect(screen.getByText("3.50%")).toBeInTheDocument();
  });

  it("shows the holding on the balance line", () => {
    renderPanel({ balanceRaw: "1240000000000000000000", balanceDecimals: 18 });

    expect(screen.getByText("Balance 1,240 PEPE")).toBeInTheDocument();
  });

  it("surfaces a preview failure rather than leaving the details blank", () => {
    renderPanel({
      balanceRaw: "1000000000000000000",
      amount: "0.5",
      previewError: new Error("boom"),
    });

    expect(screen.getByText(/Couldn't get a price for this trade/)).toBeInTheDocument();
  });
});
