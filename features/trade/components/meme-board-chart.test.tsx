import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/lib/meme/fixture";

// The phone board's chart takes its colour from the coin's 24h change. A change
// the service did not publish is not a gain: the chart is handed no direction.

vi.mock("@/hooks/use-coingecko-id", () => ({
  useCoingeckoId: () => ({ id: "some-coin", loading: false }),
}));
vi.mock("@/components/ui/asset-chart", () => ({
  AssetChart: ({ up }: { up?: boolean | null }) => (
    <div data-testid="asset-chart" data-up={String(up)} />
  ),
}));

import { BoardChart } from "@/features/trade/components/meme-board-chart";

function renderChart(priceChange24hPercent: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardChart token={memeToken({ priceChange24hPercent })} />
    </NextIntlClientProvider>
  );
}

describe("the board chart's direction", () => {
  it("is neutral for a change the service did not publish", async () => {
    renderChart(null);
    expect(await screen.findByTestId("asset-chart")).toHaveAttribute("data-up", "null");
  });

  it("follows a published change", async () => {
    renderChart("-3.1");
    expect(await screen.findByTestId("asset-chart")).toHaveAttribute("data-up", "false");
  });
});
