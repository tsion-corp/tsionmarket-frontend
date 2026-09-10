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
  render(<KashCardMobile onBuy={() => {}} onConvert={() => {}} onHistory={() => {}} />, {
    wrapper,
  });
}

// Send is off the card for now; Buy and Convert stay. The send modal and its
// wiring remain in the codebase, only the door is gone. The phone card carries
// the same guard as the desktop one: users were sending KASH+ to the Dextopus
// deposit address and losing it.
describe("KashCardMobile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kashHooks.useKashAccount.mockReturnValue({
      data: account(),
      isError: false,
      walletMissing: false,
    });
    kashHooks.useKashStatus.mockReturnValue({ data: undefined });
  });

  it("offers Buy and Convert but not Send", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
});
