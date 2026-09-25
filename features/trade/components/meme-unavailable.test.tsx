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
const CHESS_PATH = "/api/chess/matches";

// Opens a breaker the way three failed requests would.
function openTheBreaker(path: string) {
  for (let i = 0; i < 3; i += 1) recordCircuitFailure(path, 503);
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
    openTheBreaker(TRADE_PATH);
    expect(circuitAllows(TRADE_PATH)).toBe(false);
    const onRetry = vi.fn();

    render(<MemeUnavailable onRetry={onRetry} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: enMessages.meme.retry }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(circuitAllows(TRADE_PATH)).toBe(true);
  });

  // The order is the whole point. Resetting the breaker after the refetch has
  // already been kicked off leaves that refetch refused in process, exactly
  // the bug this fixes, and a test that only reads the breaker afterwards
  // cannot tell the two apart. So the retry callback reads the breaker at the
  // moment it runs.
  it("has already dropped the cooldown by the time the retry callback runs", () => {
    openTheBreaker(TRADE_PATH);
    let allowedWhenRetryRan: boolean | null = null;

    render(
      <MemeUnavailable
        onRetry={() => {
          allowedWhenRetryRan = circuitAllows(TRADE_PATH);
        }}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.meme.retry }));

    expect(allowedWhenRetryRan).toBe(true);
  });

  // retryCircuitNow clears every open breaker, not just this list's. Worth
  // pinning: the press un-gates one probe per failing service app-wide, so a
  // change that narrowed it to one service would land here first.
  it("clears the cooldown on every open service, not only the trade one", () => {
    openTheBreaker(TRADE_PATH);
    openTheBreaker(CHESS_PATH);
    expect(circuitAllows(CHESS_PATH)).toBe(false);

    render(<MemeUnavailable onRetry={() => {}} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: enMessages.meme.retry }));

    expect(circuitAllows(CHESS_PATH)).toBe(true);
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
