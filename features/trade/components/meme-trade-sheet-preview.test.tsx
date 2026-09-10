import { act, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";

const WALLET = "0xabc0000000000000000000000000000000000001";
const state = vi.hoisted(() => ({ phase: "idle" as string }));
const useMemePreview = vi.hoisted(() =>
  vi.fn<(input: unknown) => { data: null; error: null; isFetching: boolean; refetch: () => void }>(
    () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() })
  )
);

vi.mock("@/features/trade/hooks/use-meme-trade", () => ({
  useMemePreview,
  useMemeTrade: () => ({
    walletFor: () => WALLET,
    phase: state.phase,
    error: null,
    received: null,
    trade: vi.fn(),
    reset: vi.fn(),
    linkForPreview: vi.fn(),
  }),
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeToken: () => ({ token: null }),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [
      {
        network: "base-mainnet",
        symbol: "USDC",
        address: "0xusdc",
        balance: 50,
        rawBalance: "50000000",
        decimals: 6,
      },
      {
        network: "base-mainnet",
        symbol: "AAA",
        address: memeToken().address,
        balance: 1000,
        rawBalance: (1000n * 10n ** 18n).toString(),
        decimals: 18,
      },
    ],
    refetchUntilChanged: vi.fn(),
    refetchFresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-withdraw", () => ({ useReroutedWithdraw: () => ({ withdraw: vi.fn() }) }));
vi.mock("@privy-io/react-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@privy-io/react-auth")>()),
  usePrivy: () => ({ user: { id: "did:privy:u1" } }),
  getAccessToken: vi.fn(async () => "token"),
}));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: vi.fn() }));

import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";

function renderSheet() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeTradeSheet token={memeToken({ symbol: "AAA" })} onClose={() => {}} defaultSide="SELL" />
    </NextIntlClientProvider>
  );
}

const lastPreviewInput = () => useMemePreview.mock.calls.at(-1)?.[0];

// The preview query stayed live through the whole trade. Once the sale had
// gone through, a window focus refetched it for the amount just sold, and
// the service answered 422 for a balance that was no longer there: a wasted
// call and a red row on every sell.
describe("MemeTradeSheet preview while a trade is in flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useMemePreview.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("previews a typed amount while idle", async () => {
    state.phase = "idle";
    const { getByRole } = renderSheet();
    const input = getByRole("textbox");
    await act(async () => {
      fireEvent.change(input, { target: { value: "5" } });
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(lastPreviewInput()).toEqual(expect.objectContaining({ side: "SELL", amount: "5" }));
  });

  it("switches the preview off once the trade is confirming", async () => {
    state.phase = "idle";
    const { getByRole, rerender } = renderSheet();
    const input = getByRole("textbox");
    await act(async () => {
      fireEvent.change(input, { target: { value: "5" } });
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(lastPreviewInput()).not.toBeNull();

    state.phase = "confirming";
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemeTradeSheet
          token={memeToken({ symbol: "AAA" })}
          onClose={() => {}}
          defaultSide="SELL"
        />
      </NextIntlClientProvider>
    );
    expect(lastPreviewInput()).toBeNull();
  });
});
