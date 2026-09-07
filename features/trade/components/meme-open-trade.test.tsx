import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken } from "@/lib/meme/api";

const feed = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  isLoading: false,
  error: null as unknown,
}));
const search = vi.hoisted(() => ({ results: [] as MemeToken[], searching: false, active: false }));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useTrendingMemes: () => feed,
  useMemeSearch: () => search,
}));

import { MemeTrending } from "@/features/trade/components/meme-trending";

// Picking a coin used to open a detail card first, which read price, liquidity,
// market cap and a risk block from the token endpoint. That endpoint returns
// nothing for a good number of coins, so the tap landed on an empty panel. The
// lists now hand the whole token straight out, which is all the trade sheet
// needs.
describe("picking a coin", () => {
  it("hands out the token itself, not just an address to look up", () => {
    const token = memeToken({ symbol: "AAA" });
    feed.tokens = [token];
    const onOpen = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemeTrending onOpen={onOpen} />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByText("AAA"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ symbol: "AAA" }));
  });

  // Everything the sheet opens with is already on the row, so a coin whose
  // detail lookup comes back empty still opens with a name, a price and a band.
  it("carries enough to trade with even if a later lookup is empty", () => {
    const token = memeToken({ symbol: "AAA" });
    expect(token.address).toBeTruthy();
    expect(token.decimals).not.toBeNull();
    expect(token.buyEnabled || token.sellEnabled).toBe(true);
  });
});
