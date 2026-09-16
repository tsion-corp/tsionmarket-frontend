import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MemeRiskConsent } from "@/features/trade/components/meme-risk-consent";
import { memeToken } from "@/features/trade/lib/meme-fixture";

// The confirmation the contract asks for before a quote on a LOW_LIQUIDITY
// token. What it must say is the service's own warning, not our paraphrase,
// with the rest of the token's warnings, its risk badge and the disclaimer.
// Whether a preview is sent before it is accepted is pinned where the gate
// lives (use-meme-trade.test.tsx) and on each surface that hosts it.

const LOW = {
  code: "LOW_LIQUIDITY",
  message: "Liquidity is below $50,000. You may proceed at your own risk.",
};
const HOLDERS = { code: "HOLDER_CONCENTRATION", message: "Top holders own 60% of supply." };
const UPGRADEABLE = { code: "UPGRADEABLE_CONTRACT", message: "The token contract is upgradeable." };

const thin = memeToken({
  symbol: "THIN",
  riskLevel: "HIGH",
  warnings: [HOLDERS, LOW, UPGRADEABLE],
});

function renderConsent(open = true) {
  const onContinue = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeRiskConsent open={open} token={thin} onContinue={onContinue} onCancel={onCancel} />
    </NextIntlClientProvider>
  );
  return { onContinue, onCancel };
}

describe("MemeRiskConsent", () => {
  it("is a modal alert dialog, named for what it asks", () => {
    renderConsent();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Before you trade THIN");
  });

  it("shows the service's own LOW_LIQUIDITY message first, then the other warnings", () => {
    renderConsent();
    const dialog = screen.getByRole("alertdialog");
    const lines = within(dialog)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lines).toEqual([LOW.message, HOLDERS.message]);
  });

  it("drops the upgradeable-proxy line, as every trade surface does", () => {
    renderConsent();
    expect(screen.queryByText(UPGRADEABLE.message)).toBeNull();
  });

  it("carries the risk badge and the disclaimer", () => {
    renderConsent();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("High risk")).toBeInTheDocument();
    expect(within(dialog).getByText(messages.meme.riskDisclaimer)).toBeInTheDocument();
  });

  it("continues only on the explicit acknowledgement", () => {
    const { onContinue, onCancel } = renderConsent();
    fireEvent.click(screen.getByRole("button", { name: "I understand, continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels from its Cancel button and from Escape, never continuing", () => {
    const { onContinue, onCancel } = renderConsent();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" })
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    renderConsent(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
