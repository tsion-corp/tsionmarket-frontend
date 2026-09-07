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

function renderTrending(onOpen = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeTrending onOpen={onOpen} />
    </NextIntlClientProvider>
  );
  return onOpen;
}

describe("MemeTrending", () => {
  it("shows five to a page and pages the rest", () => {
    feed.tokens = Array.from({ length: 7 }, (_, i) => memeToken({ symbol: `T${i}` }));
    renderTrending();
    expect(screen.getByText("T4")).toBeInTheDocument();
    expect(screen.queryByText("T5")).not.toBeInTheDocument();
  });

  it("opens the coin modal rather than navigating away", () => {
    feed.tokens = [memeToken({ symbol: "AAA" })];
    const onOpen = renderTrending();
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByText("AAA"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("narrows to a risk band and says when the band is empty", () => {
    feed.tokens = [memeToken({ symbol: "SAFE", riskLevel: "LOW" })];
    renderTrending();
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(screen.getByText("No coins in the bands you picked.")).toBeInTheDocument();
  });

  // A medium-risk coin must stay reachable; four chips would strand it.
  it("offers the medium band", () => {
    feed.tokens = [memeToken({ symbol: "MID", riskLevel: "MEDIUM" })];
    renderTrending();
    // Anchored, because a coin row is a button too and its accessible name
    // carries the risk badge; only the chip starts with the band name.
    fireEvent.click(screen.getByRole("button", { name: /^Medium/ }));
    expect(screen.getByText("MID")).toBeInTheDocument();
  });

  it("replaces the list with search results rather than filtering the page", () => {
    feed.tokens = [memeToken({ symbol: "TREND" })];
    search.active = true;
    search.results = [memeToken({ symbol: "FOUND" })];
    renderTrending();
    expect(screen.getByText("FOUND")).toBeInTheDocument();
    expect(screen.queryByText("TREND")).not.toBeInTheDocument();
    search.active = false;
    search.results = [];
  });
});
