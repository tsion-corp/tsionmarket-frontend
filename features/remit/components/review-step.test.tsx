import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SubmittedEvmOperationError } from "@/lib/trade/sponsor";
import { PAYOUT_COUNTRIES } from "@/features/remit/lib/cross-border";
import type { RemitForm } from "@/features/remit/components/remit-types";

// Regression for the double-send gap (docs/2026-11-24-balance-sending-auth-nav-audit.md §2):
// a sponsored send that reached the bundler may already have landed, so the
// screen must not offer the Retry that would pay the same deposit address again.

const sendToken = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ evmAddress: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("@/hooks/use-fx", () => ({ useFx: () => ({ rate: () => 1500 }) }));
vi.mock("@/hooks/use-withdraw", () => ({ useSendToken: () => ({ sendToken }) }));
vi.mock("@/features/remit/hooks/use-offramp", () => ({
  useCreateOfframp: () => ({ mutateAsync }),
  useOfframpQuote: () => ({
    data: {
      pay: { amountIn: { amount: "10000000", decimals: 6 } },
      fiat: { receive: { amount: "15000", currency: "NGN" }, totalFee: "0" },
    },
    error: null,
    refetch: vi.fn(),
  }),
  useRampOrder: () => ({ data: null }),
}));
vi.mock("@/features/remit/lib/pending", () => ({
  savePendingRemit: vi.fn(),
  clearPendingRemit: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  toast: { loading: vi.fn(() => "t"), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/ui/flag-icon", () => ({ FlagIcon: () => null }));

import { ReviewStep } from "./review-step";

const country = PAYOUT_COUNTRIES.find((c) => c.methods.includes("bank"))!;
const form: RemitForm = {
  country,
  method: "bank",
  network: null,
  recipientName: "Ada Obi",
  accountNumber: "0123456789",
  bank: { id: "058", name: "GTBank" } as RemitForm["bank"],
  recipientPhone: "8012345678",
  amountUsd: "10",
  verifiedAccountName: null,
};

function renderStep() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReviewStep form={form} onBack={vi.fn()} onDone={vi.fn()} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  sendToken.mockReset();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ id: "order-1", depositAddress: "0xdeposit" });
});
afterEach(cleanup);

describe("ReviewStep funding failures", () => {
  it("offers no retry when the send may already have landed", async () => {
    sendToken.mockRejectedValue(new SubmittedEvmOperationError("0xabc"));
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: messages.remit.sendPayment }));

    expect(await screen.findByText(messages.remit.fundUnconfirmedBody)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.remit.retry })).not.toBeInTheDocument();
    expect(sendToken).toHaveBeenCalledTimes(1);
  });

  it("still offers a retry to the same address for an ordinary failure", async () => {
    sendToken.mockRejectedValueOnce(new Error("user rejected"));
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: messages.remit.sendPayment }));

    fireEvent.click(await screen.findByRole("button", { name: messages.remit.retry }));
    await vi.waitFor(() => expect(sendToken).toHaveBeenCalledTimes(2));
    expect(sendToken.mock.calls[1][0].to).toBe("0xdeposit");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });
});
