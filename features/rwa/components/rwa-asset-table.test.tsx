import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { RwaAssetTable } from "@/features/rwa/components/rwa-asset-table";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";

// The logo batch is a network call the table makes for the rows it was handed.
// Nothing here is about logos, and every row falls back to the registry's own
// URL when the batch has nothing.
vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

function asset(over: Partial<RwaAssetView> = {}): RwaAssetView {
  return {
    id: "base:tbill",
    chain: "base",
    address: "0xTBILL",
    symbol: "TBILL",
    name: "US Treasury Bill",
    issuer: "OpenEden",
    category: "treasury",
    decimals: 6,
    priceUsd: "100.00",
    market: { change24h: 0.42, liquidityUsd: 1_200_000, marketCapUsd: 9_900_000_000 },
    ...over,
  } as unknown as RwaAssetView;
}

function renderTable(assets: RwaAssetView[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RwaAssetTable assets={assets} />
    </NextIntlClientProvider>
  );
}

// Data rows carry aria-selected; the column header does not.
function dataRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((el) => el.hasAttribute("aria-selected"));
}

describe("RwaAssetTable", () => {
  it("draws one row per asset it is handed", () => {
    renderTable([asset(), asset({ id: "base:ondo", symbol: "ONDO", name: "Ondo" })]);

    expect(dataRows()).toHaveLength(2);
    expect(screen.getByText("TBILL")).toBeInTheDocument();
    expect(screen.getByText("ONDO")).toBeInTheDocument();
  });

  // The approved decision in the ADR: market cap is populated for almost no
  // real asset, so the fourth column carries live liquidity instead.
  it("carries liquidity in the fourth column, not market cap", () => {
    renderTable([asset()]);

    expect(screen.getByRole("columnheader", { name: messages.rwa.liquidity })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: messages.rwa.marketCap })).toBeNull();
    expect(screen.getByText("$1.2M")).toBeInTheDocument();
    expect(screen.queryByText("$9.9B")).toBeNull();
  });

  it("names the columns and the grid from the rwa catalogue", () => {
    renderTable([asset()]);

    expect(screen.getByRole("grid", { name: messages.rwa.eyebrow })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: messages.rwa.asset })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: messages.rwa.price })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: messages.rwa.change24h })).toBeInTheDocument();
  });

  it("pills the APY beside the ticker, and only where there is a yield", () => {
    renderTable([
      asset({ yieldApyBps: 485 } as Partial<RwaAssetView>),
      asset({ id: "base:ondo", symbol: "ONDO", name: "Ondo" }),
    ]);

    expect(screen.getByText("4.85% APY")).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+\.\d\d% APY$/)).toHaveLength(1);
  });

  it("says so in the reader's words when there is nothing to list", () => {
    renderTable([]);

    expect(screen.getByText(messages.rwa.noSearchMatches)).toBeInTheDocument();
  });
});
