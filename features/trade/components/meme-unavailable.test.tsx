import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import { circuitAllows, recordCircuitFailure, resetCircuitForTest } from "@/lib/api/circuit-store";
import { MemeUnavailable } from "@/features/trade/components/meme-unavailable";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const TRADE_PATH = "/api/trade/tokens";

// Opens the trade breaker the way three failed requests would.
function openTheBreaker() {
  for (let i = 0; i < 3; i += 1) recordCircuitFailure(TRADE_PATH, 503);
}

afterEach(() => {
  resetCircuitForTest();
});

describe("MemeUnavailable", () => {
  it("shows what happened and offers a way to ask again", () => {
    render(<MemeUnavailable onRetry={() => {}} />, { wrapper });
    expect(screen.getByText(enMessages.meme.unavailable)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: enMessages.meme.retry })).toBeInTheDocument();
  });

  // The failure that empties this list is usually the breaker refusing in
  // process, and while it is open a refetch never reaches the network: the
  // query throws "can't reach the server" and lib/query-client.ts does not
  // retry that. Pressing the button then did nothing at all, for as long as
  // the cooldown ran, which doubles to two minutes. A person pressing Try
  // again is asking to probe now, so the press drops the cooldown first.
  it("drops the cooldown before asking again, so the retry can reach the network", () => {
    openTheBreaker();
    expect(circuitAllows(TRADE_PATH)).toBe(false);
    const onRetry = vi.fn();

    render(<MemeUnavailable onRetry={onRetry} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: enMessages.meme.retry }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(circuitAllows(TRADE_PATH)).toBe(true);
  });

  it("still asks again when no breaker is open", () => {
    const onRetry = vi.fn();
    render(<MemeUnavailable onRetry={onRetry} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: enMessages.meme.retry }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers no button when the caller has no way to retry", () => {
    render(<MemeUnavailable />, { wrapper });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
