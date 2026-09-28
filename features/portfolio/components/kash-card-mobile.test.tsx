import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import type { KashAccount } from "@/features/portfolio/lib/kash";

const kashHooks = vi.hoisted(() => ({
  useKashAccount: vi.fn(),
  useKashStatus: vi.fn(() => ({ data: undefined })),
  useKashSubscription: vi.fn(() => ({ data: undefined })),
}));
vi.mock("@/features/portfolio/hooks/use-kash", () => kashHooks);
vi.mock("@/features/portfolio/components/add-to-metamask-button", () => ({
  AddToMetaMaskButton: () => null,
}));

const sendFlag = { enabled: true };
vi.mock("@/features/portfolio/lib/kash-send", () => ({
  get KASH_SEND_ENABLED() {
    return sendFlag.enabled;
  },
}));

import { KashCardMobile } from "@/features/portfolio/components/kash-card-mobile";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

const account = (over: Partial<KashAccount> = {}): KashAccount =>
  ({
    wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    balance: "1250",
    balanceUsd: "7.50",
    lifetimeEarned: "0",
    gate: { met: true, shortfall: "0", minHoldingUsd: "10" },
    week: { unclaimed: "0" },
    settlements: [],
    ...over,
  }) as KashAccount;

function renderCard() {
  render(
    <KashCardMobile onBuy={() => {}} onSend={() => {}} onConvert={() => {}} onHistory={() => {}} />,
    {
      wrapper,
    }
  );
}

// Send is back on the card (2026-09-28), now that Kash goes to an Ark ID
// rather than to an address somebody pasted — which is how people were sending
// KASH+ to the Dextopus deposit address and losing it. The switch stays, so
// both states are covered here, including the row's own width.
describe("KashCardMobile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFlag.enabled = true;
    kashHooks.useKashAccount.mockReturnValue({
      data: account(),
      isError: false,
      walletMissing: false,
    });
    kashHooks.useKashStatus.mockReturnValue({ data: undefined });
  });

  it("puts Send between Buy and Convert, in a row sized for three", () => {
    renderCard();
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim())
      .filter((label) => label === "Buy" || label === "Send" || label === "Convert");
    expect(labels).toEqual(["Buy", "Send", "Convert"]);
    expect(screen.getByRole("button", { name: "Buy" }).parentElement?.className).toContain(
      "grid-cols-3"
    );
  });

  describe("and if it is taken down again", () => {
    beforeEach(() => {
      sendFlag.enabled = false;
    });

    it("offers Buy and Convert, and no way to send", () => {
      renderCard();
      expect(screen.getByRole("button", { name: "Buy" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Convert" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    });

    // Two buttons in a three-column grid would leave a hole where Send was.
    it("sizes the row to the buttons it actually has", () => {
      renderCard();
      const row = screen.getByRole("button", { name: "Buy" }).parentElement;
      expect(row?.className).toContain("grid-cols-2");
      expect(row?.className).not.toContain("grid-cols-3");
    });
  });
});
