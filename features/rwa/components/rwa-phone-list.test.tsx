import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";
import { RwaPhoneList } from "@/features/rwa/components/rwa-phone-list";

vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

function asset(over: Partial<RwaAssetView> = {}): RwaAssetView {
  return {
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
    ...over,
  } as RwaAssetView;
}

function renderList(props: Partial<React.ComponentProps<typeof RwaPhoneList>> = {}) {
  const onOpen = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RwaPhoneList
        assets={[
          asset(),
          asset({
            id: "base:pro",
            chain: "base",
            symbol: "PRO",
            name: "Propy",
            priceUsd: "0.3722",
            market: { priceUsd: 0.3722, change24h: -3.68 },
          }),
        ]}
        loading={false}
        error={false}
        query=""
        onOpen={onOpen}
        {...props}
      />
    </NextIntlClientProvider>
  );
  return { onOpen };
}

describe("RwaPhoneList", () => {
  it("draws one row per asset with ticker, name, price and the day's move", () => {
    renderList();
    expect(screen.getByText("GLDx")).toBeInTheDocument();
    expect(screen.getByText("Gold ETF xStock")).toBeInTheDocument();
    expect(screen.getByText("$403.83")).toBeInTheDocument();
    expect(screen.getByText("+0.26%")).toBeInTheDocument();
  });

  it("lists Base assets first, as the desk does", () => {
    renderList();
    const tickers = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(tickers[0]).toContain("PRO");
  });

  it("filters by the page's search query", () => {
    renderList({ query: "gold" });
    expect(screen.getByText("GLDx")).toBeInTheDocument();
    expect(screen.queryByText("PRO")).toBeNull();
  });

  it("opens the tapped asset", () => {
    const { onOpen } = renderList();
    fireEvent.click(screen.getByText("GLDx"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ symbol: "GLDx" }));
  });

  it("says so when nothing matches, and when the registry is down", () => {
    renderList({ query: "zzz" });
    expect(screen.getByText(enMessages.rwa.noSearchMatches)).toBeInTheDocument();
  });
});
