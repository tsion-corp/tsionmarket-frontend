import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import {
  LiveTransactions,
  coinTransactions,
} from "@/features/trade/components/meme-live-transactions";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { SwapDetail } from "@/lib/meme/api";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";

// The transactions card, on its own. The board's own suite covers the card in
// place; this one covers the filter under it and the four states the card can
// be in, because none of those need a board to reach.
//
// The shipped catalogue is read rather than a local stand-in, so a key dropped
// from messages/*.json fails here instead of passing against a stub.
const messages = enMessages;

const aaa = memeToken({ symbol: "AAA" });
const solana = memeToken({ symbol: "SOL1", chainId: SOLANA_CHAIN_ID });

function swap(over: Partial<SwapDetail> = {}): SwapDetail {
  return {
    id: "swap-1",
    walletAddress: "0xwallet",
    chainId: 8453,
    side: "BUY",
    status: "CONFIRMED",
    sellTokenAddress: "0xusdc",
    buyTokenAddress: "0xaaa",
    sellTokenDecimals: 6,
    buyTokenDecimals: 18,
    sellAmountAtomic: "500000000",
    quotedBuyAmountAtomic: "4000000000000000000000000",
    actualSellAmountAtomic: null,
    actualBuyAmountAtomic: "4500000000000000000000000",
    failureCode: null,
    failureReason: null,
    createdAt: new Date(Date.now() - 2_000).toISOString(),
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("picking the coin's rows out of the wallet's swaps", () => {
  it("denominates a buy in the coin bought and a sell in the coin sold", () => {
    const rows = coinTransactions(
      [
        swap({ id: "bought" }),
        swap({
          id: "sold",
          side: "SELL",
          sellTokenAddress: "0xaaa",
          buyTokenAddress: "0xusdc",
          sellTokenDecimals: 18,
          buyTokenDecimals: 6,
          sellAmountAtomic: "1200000000000000000000",
          actualSellAmountAtomic: null,
        }),
      ],
      aaa
    );
    expect(rows).toEqual([
      { id: "bought", side: "BUY", amount: "4,500,000", at: expect.any(Number) },
      { id: "sold", side: "SELL", amount: "1,200", at: expect.any(Number) },
    ]);
  });

  it("prefers what the swap really moved over what it was quoted", () => {
    // 4.5M actual against a 4M quote: the settled figure is the true one.
    expect(coinTransactions([swap()], aaa)[0]?.amount).toBe("4,500,000");
    expect(coinTransactions([swap({ actualBuyAmountAtomic: null })], aaa)[0]?.amount).toBe(
      "4,000,000"
    );
  });

  it("drops a swap that never became a transaction", () => {
    const dropped = (["QUOTED", "FAILED", "EXPIRED"] as const).flatMap((status) =>
      coinTransactions([swap({ status })], aaa)
    );
    expect(dropped).toEqual([]);
    expect(coinTransactions([swap({ status: "SUBMITTED" })], aaa)).toHaveLength(1);
    expect(coinTransactions([swap({ status: "CONFIRMING" })], aaa)).toHaveLength(1);
  });

  it("drops a swap in another coin, and one on another chain at the same address", () => {
    expect(coinTransactions([swap({ buyTokenAddress: "0xzzz" })], aaa)).toEqual([]);
    expect(coinTransactions([swap({ chainId: SOLANA_CHAIN_ID })], aaa)).toEqual([]);
  });

  it("matches an EVM address in any case and a Solana mint only exactly", () => {
    expect(coinTransactions([swap({ buyTokenAddress: "0xAAA" })], aaa)).toHaveLength(1);
    const mint = swap({ chainId: solana.chainId, buyTokenAddress: solana.address });
    expect(coinTransactions([mint], solana)).toHaveLength(1);
    expect(
      coinTransactions([{ ...mint, buyTokenAddress: solana.address.toUpperCase() }], solana)
    ).toEqual([]);
  });

  it("says nothing rather than inventing a figure it cannot read", () => {
    const rows = coinTransactions(
      [
        swap({
          actualBuyAmountAtomic: "4.5e24",
          quotedBuyAmountAtomic: "4.5e24",
          createdAt: "soon",
        }),
      ],
      aaa
    );
    expect(rows[0]?.amount).toBeNull();
    expect(rows[0]?.at).toBeNull();
  });
});

describe("the card the rows are drawn in", () => {
  type CardProps = Parameters<typeof LiveTransactions>[0];

  function renderCard(props: Partial<CardProps> = {}) {
    const defaults: CardProps = { token: aaa, swaps: [], status: "ready", onRetry: () => {} };
    return render(<LiveTransactions {...defaults} {...props} />, { wrapper });
  }

  it("says it is loading before the first answer", () => {
    renderCard({ status: "loading" });
    expect(screen.getByRole("status", { name: "Live transactions" })).toBeInTheDocument();
  });

  it("offers a retry when the feed fails", () => {
    const onRetry = vi.fn();
    renderCard({ status: "error", onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says the feed is empty rather than drawing an empty card", () => {
    renderCard();
    expect(screen.getByText("No transactions in this coin yet.")).toBeInTheDocument();
  });

  it("names the amount in the coin on screen and says how long ago it landed", () => {
    renderCard({ swaps: [swap()] });
    const row = screen.getByTestId("meme-tx-row");
    expect(within(row).getByText("Buy")).toBeInTheDocument();
    expect(row).toHaveTextContent("4,500,000 AAA");
    expect(row).toHaveTextContent(/\d+s ago/);
  });

  it("collapses and reopens from its own header", () => {
    renderCard({ swaps: [swap()] });
    const header = screen.getByRole("button", { name: /Live transactions/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });
});
