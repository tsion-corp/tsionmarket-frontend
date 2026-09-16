import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import enMessages from "@/messages/en.json";
import type { ActivityEntry } from "@/lib/activity/entries";

const activity = vi.fn();
vi.mock("@/features/activity/hooks/use-activity", () => ({ useActivity: () => activity() }));
vi.mock("@/hooks/use-portfolio", () => ({ usePortfolio: () => ({ tokens: [] }) }));

const { ActivityView } = await import("./activity-view");

function entry(): ActivityEntry {
  return {
    id: "in:0xabc",
    hash: "0xabc",
    network: "base-mainnet",
    kind: "deposited",
    direction: "in",
    symbol: "USDC",
    amount: 25,
    timestamp: Date.now(),
    counterparty: null,
    logo: null,
  } as ActivityEntry;
}

// PnlCards reads FX rates through react-query, so the tree needs a client.
// Retries off: nothing in this file wants a background refetch.
function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ActivityView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("ActivityView", () => {
  beforeEach(() => {
    activity.mockReturnValue({
      items: [],
      loading: false,
      error: false,
      partial: false,
      refetch: vi.fn(),
    });
  });

  it("says the history is empty only when the read was complete", () => {
    renderView();
    expect(screen.getByText(enMessages.activity.emptyTitle)).toBeInTheDocument();
  });

  it("does not claim an empty history when nothing could be read", () => {
    // The reported bug: every Alchemy key over its monthly capacity, so the
    // sweep returned nothing, and the page told the user their account had no
    // deposits, trades or withdrawals.
    activity.mockReturnValue({
      items: [],
      loading: false,
      error: false,
      partial: true,
      refetch: vi.fn(),
    });

    renderView();
    expect(screen.queryByText(enMessages.activity.emptyTitle)).not.toBeInTheDocument();
    expect(screen.getByText(enMessages.activity.errorBody)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: enMessages.activity.tryAgain })).toBeInTheDocument();
  });

  it("keeps the rows it did read when only some sources failed", () => {
    // One chain down must not blank a page the others filled.
    activity.mockReturnValue({
      items: [entry()],
      loading: false,
      error: false,
      partial: true,
      refetch: vi.fn(),
    });

    renderView();
    expect(screen.queryByText(enMessages.activity.errorBody)).not.toBeInTheDocument();
    // The row is a link to the transaction, so its presence is the row's.
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("0xabc"));
    // The incomplete-read notice carries its own retry alongside the rows.
    expect(screen.getByRole("button", { name: enMessages.activity.tryAgain })).toBeInTheDocument();
  });
});
