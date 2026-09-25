import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memeToken } from "@/lib/meme/fixture";
import type { MemeToken } from "@/lib/meme/api";

// The phone Memecoins tab. Null is not zero: a coin with no published volume
// is not the coldest coin on the list, so "Hot" puts it last rather than
// ranking it as $0, and a real $0 of volume is shown as $0.

const trending = vi.hoisted(() => ({ tokens: [] as MemeToken[] }));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useTrendingMemes: () => ({ tokens: trending.tokens, isLoading: false, error: null }),
}));
vi.mock("@/features/trade/components/memecoin-promos", () => ({ MemecoinPromos: () => null }));
vi.mock("@/features/trade/components/meme-trade-sheet", () => ({ MemeTradeSheet: () => null }));

import { MemecoinsView } from "@/features/trade/components/memecoins-view";

// The table rows, in order, by coin name. Names appear only in the table: the
// trending cards above it show symbols.
const NAMES = /^(Blaze|Ember|Frost|Quiet)$/;
function tableOrder(): string[] {
  return screen.getAllByText(NAMES).map((el) => el.textContent ?? "");
}

beforeEach(() => {
  trending.tokens = [
    memeToken({ symbol: "QUI", name: "Quiet", volume24hUsd: null }),
    memeToken({ symbol: "FRO", name: "Frost", volume24hUsd: "0" }),
    memeToken({ symbol: "BLA", name: "Blaze", volume24hUsd: "900000" }),
    memeToken({ symbol: "EMB", name: "Ember", volume24hUsd: "5000" }),
  ];
});

describe("the Hot sort", () => {
  it("ranks by published volume and puts a coin with none last", () => {
    render(<MemecoinsView />);
    fireEvent.click(screen.getByRole("button", { name: "Hot" }));
    expect(tableOrder()).toEqual(["Blaze", "Ember", "Frost", "Quiet"]);
  });
});

describe("volume cells", () => {
  it("shows a real zero as $0 and a missing figure as a dash", () => {
    render(<MemecoinsView />);
    const cold = screen.getByText("Frost").closest("button") as HTMLElement;
    const pending = screen.getByText("Quiet").closest("button") as HTMLElement;
    expect(within(cold).getByText("$0")).toBeInTheDocument();
    expect(within(pending).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(pending).queryByText("$0")).toBeNull();
  });
});

// A token is chainId + address. Two chains can carry the same address, and a
// list keyed by address alone collides: React warns and may reuse one row's
// element for the other.
describe("row identity", () => {
  it("keys rows by chainId:address, so the same address on two chains is two rows", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    trending.tokens = [
      memeToken({ symbol: "TWIN", name: "Blaze", address: "0xsame", chainId: 8453 }),
      memeToken({ symbol: "TWIN", name: "Ember", address: "0xsame", chainId: 1 }),
    ];
    render(<MemecoinsView />);
    expect(tableOrder()).toEqual(["Blaze", "Ember"]);
    const keyWarnings = error.mock.calls.filter((call) =>
      call.some((part) => typeof part === "string" && part.includes("same key"))
    );
    expect(keyWarnings).toEqual([]);
    error.mockRestore();
  });
});
