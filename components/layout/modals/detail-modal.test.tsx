import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { DetailModal } from "@/components/layout/modals/detail-modal";
import type { DetailPayload } from "@/lib/modal-types";

// DetailModal draws its real chart through AssetChart, which needs a coin id
// and pulls lightweight-charts underneath it. Stubbed so these tests check
// which id the modal decided to chart on, not the chart library itself.
vi.mock("@/components/ui/asset-chart", () => ({
  AssetChart: ({ coingeckoId }: { coingeckoId: string | null }) => (
    <div data-testid="asset-chart">{coingeckoId}</div>
  ),
}));

// Controls what the resolve-from-contract hook returns per test, without
// hitting /api/token-chart-id or CoinGecko.
const useCoingeckoIdMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-coingecko-id", () => ({
  useCoingeckoId: (platform: string | null, address: string | null) =>
    useCoingeckoIdMock(platform, address),
}));

// "noChart" is a new key this feature needs under the portfolio namespace,
// reported separately since messages/en.json isn't touched by this change.
const messages = {
  ...en,
  portfolio: { ...en.portfolio, noChart: "No price history yet." },
};

function renderDetail(overrides: Partial<DetailPayload> = {}) {
  const payload: DetailPayload = {
    sym: "HYPE",
    name: "Hyperliquid",
    sub: "HYPE",
    price: "$25.00",
    chg: "+1.2%",
    bg: "#000",
    stats: [],
    ...overrides,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DetailModal detail={payload} />
    </NextIntlClientProvider>
  );
}

describe("DetailModal chart source", () => {
  it("charts on a known coingeckoId and never queries the contract resolver", () => {
    useCoingeckoIdMock.mockReturnValue({ id: null, loading: false });
    renderDetail({ coingeckoId: "hyperliquid" });

    expect(screen.getByTestId("asset-chart")).toHaveTextContent("hyperliquid");
    expect(useCoingeckoIdMock).toHaveBeenCalledWith(null, null);
  });

  it("resolves a coin id from chain and address and charts on the result", () => {
    useCoingeckoIdMock.mockReturnValue({ id: "resolved-coin", loading: false });
    renderDetail({ chartChain: "base", chartAddress: "0xabc" });

    expect(useCoingeckoIdMock).toHaveBeenCalledWith("base", "0xabc");
    expect(screen.getByTestId("asset-chart")).toHaveTextContent("resolved-coin");
  });

  it("shows a quiet loading state while resolution is in flight, not the decorative line", () => {
    useCoingeckoIdMock.mockReturnValue({ id: null, loading: true });
    const { container } = renderDetail({ chartChain: "base", chartAddress: "0xabc" });

    expect(screen.queryByTestId("asset-chart")).toBeNull();
    expect(container.querySelector("svg linearGradient")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("falls back honestly, without the decorative line, when resolution finds nothing", () => {
    useCoingeckoIdMock.mockReturnValue({ id: null, loading: false });
    const { container } = renderDetail({ chartChain: "base", chartAddress: "0xabc" });

    expect(screen.queryByTestId("asset-chart")).toBeNull();
    expect(container.querySelector("svg linearGradient")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByText("No price history yet.")).toBeInTheDocument();
  });

  it("renders the decorative sparkline unchanged when neither a coin id nor a contract is given", () => {
    useCoingeckoIdMock.mockReturnValue({ id: null, loading: false });
    const { container } = renderDetail({});

    expect(useCoingeckoIdMock).toHaveBeenCalledWith(null, null);
    expect(screen.queryByTestId("asset-chart")).toBeNull();
    expect(screen.queryByText("No price history yet.")).toBeNull();
    expect(container.querySelector("svg linearGradient")).not.toBeNull();
  });
});
