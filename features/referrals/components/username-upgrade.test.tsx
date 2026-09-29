import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";

// A Kash username is free and claimed on this page. An Ark ID is a PAID .ark
// name on chain. They are different things, and the upgrade hint under a
// working link must open the free form, not send anyone off to buy a name.

const { stats } = vi.hoisted(() => ({
  stats: {
    value: {
      isPending: false,
      isError: false,
      data: { wallet: "0xabc", username: null as string | null, refCode: "7k4m9x2p" },
      refetch: vi.fn(),
    },
  },
}));

vi.mock("@/features/referrals/hooks/use-referrals", () => ({
  useReferralStats: () => stats.value,
  useUsernameAvailability: () => ({ data: undefined, isFetching: false }),
  useSetUsername: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/features/referrals/hooks/use-referral-network", () => ({
  useReferralNetwork: () => ({ network: undefined, loading: false }),
  useDownlineBranches: () => ({ open: [], toggle: vi.fn(), pages: {}, loading: {} }),
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => ({ evmAddress: "0xabc" }) }));

import { ReferralView } from "@/features/referrals/components/referral-view";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

describe("the username upgrade", () => {
  it("opens the free username form, and never links to the paid Ark ID page", () => {
    render(<ReferralView />, { wrapper });

    const upgrade = screen.getByRole("button", { name: messages.referral.upgradeCta });
    // Not a link at all, so it cannot point at /ark-id.
    expect(screen.queryByRole("link", { name: messages.referral.upgradeCta })).toBeNull();

    fireEvent.click(upgrade);
    expect(screen.getByText(messages.referral.claimTitle)).toBeInTheDocument();
  });

  it("shows the working link first, not the form", () => {
    render(<ReferralView />, { wrapper });
    expect(screen.queryByText(messages.referral.claimTitle)).toBeNull();
  });
});
