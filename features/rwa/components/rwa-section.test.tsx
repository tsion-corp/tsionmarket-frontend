import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";
import { RwaSection } from "@/features/rwa/components/rwa-section";

const ASSETS = [
  {
    id: "solana:gldx",
    chain: "solana",
    address: "GLDx111",
    symbol: "GLDx",
    name: "Gold ETF xStock",
    issuer: "Backed (xStocks)",
    category: "commodity",
    decimals: 8,
    priceUsd: "403.83",
    market: { priceUsd: 403.83, change24h: 0.26 },
  },
] as unknown as RwaAssetView[];

vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

vi.mock("@/features/rwa/hooks/use-rwa-assets", () => ({
  useListedRwaAssets: () => ({ assets: ASSETS, loading: false, error: false }),
}));

vi.mock("@/features/rwa/hooks/use-rwa-prices", () => ({
  useRwaEnrichedAssets: (assets: RwaAssetView[]) => assets,
}));

// The voice prefill hook polls window.location on an interval; nothing here
// exercises a spoken trade, so it stays quiet.
vi.mock("@/hooks/use-trade-prefill", () => ({
  useTradePrefill: () => null,
}));

// Standing in for the order ticket, whose real body is the trade panel with its
// wallets, quotes and settlement legs. What this file checks is which surface
// the section hands the reader, not what the ticket does once it has them.
vi.mock("@/features/rwa/components/rwa-ticket", () => ({
  RwaTicket: ({ asset }: { asset: RwaAssetView }) => (
    <div data-testid="rwa-ticket">ticket:{asset.symbol}</div>
  ),
}));

function renderSection() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RwaSection />
    </NextIntlClientProvider>
  );
}

describe("RwaSection", () => {
  it("gives the phone list exactly one search field of its own", () => {
    renderSection();
    expect(
      screen.getAllByRole("searchbox", { name: enMessages.rwa.searchPlaceholder })
    ).toHaveLength(1);
  });

  // The phone tab trades in place now: no modal, no second step. The list is
  // hidden rather than unmounted so the reader's scroll offset survives.
  it("swaps the phone list for the inline ticket, opening no modal", () => {
    renderSection();
    fireEvent.click(screen.getByText("GLDx"));

    expect(screen.getByText("ticket:GLDx")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("rwa-market-list")).not.toBeVisible();
  });

  // The section no longer has a desktop branch to test. The desk at /rwa
  // composes RwaDeskView directly, and its own suite covers that surface. What
  // is left here is the one job this file still has: feed the phone list.
  it("hands the phone list the enriched catalogue", () => {
    renderSection();
    expect(screen.getByText("GLDx")).toBeInTheDocument();
    expect(screen.getByText("$403.83")).toBeInTheDocument();
  });
});
