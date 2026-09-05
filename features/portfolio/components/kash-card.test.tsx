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
vi.mock("@/features/portfolio/hooks/use-kash-sync", () => ({ useKashSyncing: () => false }));
vi.mock("@/features/portfolio/components/add-to-metamask-button", () => ({
  AddToMetaMaskButton: () => null,
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ setProfile: vi.fn() }));

import { KashCard } from "@/features/portfolio/components/kash-card";

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
    <KashCard
      onBuy={() => {}}
      onSend={() => {}}
      onConvert={() => {}}
      onHistory={() => {}}
      onUpgrade={() => {}}
    />,
    { wrapper }
  );
}

// The bug this guards: the card used to fall back to "0" whenever the account
// query returned nothing, so a failed read was indistinguishable from an empty
// wallet and holders were told their balance was zero.
describe("KashCard balance states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the balance once the account loads", () => {
    kashHooks.useKashAccount.mockReturnValue({
      data: account(),
      isError: false,
      walletMissing: false,
    });
    renderCard();
    expect(screen.getByText("1,250")).toBeInTheDocument();
    expect(screen.getByText("$7.50")).toBeInTheDocument();
  });

  it("shows a real zero for an account that genuinely holds none", () => {
    kashHooks.useKashAccount.mockReturnValue({
      data: account({ balance: "0", balanceUsd: "0" }),
      isError: false,
      walletMissing: false,
    });
    renderCard();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText(messages.kash.balanceUnavailable)).not.toBeInTheDocument();
  });

  it("says the balance could not be loaded instead of printing zero when the read fails", () => {
    kashHooks.useKashAccount.mockReturnValue({
      data: undefined,
      isError: true,
      walletMissing: false,
    });
    renderCard();
    expect(screen.getByText(messages.kash.balanceUnavailable)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("explains the wallet is still setting up when the query never runs", () => {
    kashHooks.useKashAccount.mockReturnValue({
      data: undefined,
      isError: false,
      walletMissing: true,
    });
    renderCard();
    expect(screen.getByText(messages.kash.balanceNoWallet)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders neither a number nor an error while the read is still in flight", () => {
    kashHooks.useKashAccount.mockReturnValue({
      data: undefined,
      isError: false,
      walletMissing: false,
    });
    renderCard();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(messages.kash.balanceUnavailable)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.kash.balanceNoWallet)).not.toBeInTheDocument();
  });
});
