import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const kashHooks = vi.hoisted(() => ({
  useKashStatus: () => ({ data: { chainMode: "ethers" } }),
  useKashAccount: () => ({
    data: { balance: "1", balanceUnits: "1000000000000000000" },
    isPending: false,
    isError: false,
    wallet: "0xabc",
  }),
  useKashConversion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useKashConversionQuote: () => ({ data: undefined, isError: false, isPending: false }),
}));
const deskHooks = vi.hoisted(() => ({
  useKashDeskInfo: () => ({ data: { paused: { redeem: false, buy: false } } }),
  useKashDeskSellQuote: () => ({
    data: {
      kashIn: "1",
      usdcOut: "7",
      usdcOutUnits: "7000000",
      reserveUsdc: "1309.697976",
      covered: true,
      paused: false,
    },
    isError: false,
    isPending: false,
  }),
  useKashDeskSell: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/features/portfolio/hooks/use-kash", () => kashHooks);
vi.mock("@/features/portfolio/hooks/use-kash-desk", () => deskHooks);
vi.mock("@/features/portfolio/hooks/use-kash-permit", () => ({
  useKashPermitSigner: () => vi.fn(),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));

import { KashConvertModal } from "@/features/portfolio/components/kash-convert-modal";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

// The desk's public reserve is not the user's business: a four-figure sum
// under their seven-dollar payout read as a fee, a lock, or a mistake. The
// payout line stays; the reserve line is gone.
describe("KashConvertModal quote panel", () => {
  it("shows the payout and never the redemption reserve", () => {
    render(<KashConvertModal open onClose={() => {}} />, { wrapper });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1" } });
    expect(screen.getByText("You receive")).toBeInTheDocument();
    expect(screen.queryByText("Redemption reserve")).toBeNull();
    expect(screen.queryByText(/1309\.697976/)).toBeNull();
  });
});
