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

  // The defect: the list was dropped out of the layout the instant the caret
  // was pressed, so the caret turned smoothly and the card snapped shut under
  // it. The rows have to stay while the card folds for there to be a fold.
  it("keeps the rows mounted and collapsed while shut, rather than dropping them", () => {
    renderCard({ swaps: [swap()] });
    const header = screen.getByRole("button", { name: /Live transactions/i });
    const panel = document.getElementById(
      header.getAttribute("aria-controls") as string
    ) as HTMLElement;

    expect(panel.className).toContain("[grid-template-rows:1fr]");

    fireEvent.click(header);
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel.className).toContain("[grid-template-rows:0fr]");
    expect(panel.className).toContain("transition-[grid-template-rows,opacity]");
    expect(panel).toHaveAttribute("inert");
    expect(within(panel).getByTestId("meme-tx-row")).toBeInTheDocument();
  });

  // The rows stay mounted while the card is shut, so it is worth being explicit
  // that keeping them costs nothing: this card holds no query. It is rendered
  // here with no QueryClientProvider at all, which a useQuery anywhere under it
  // would throw on. The swap history and its 15s poll belong to the board
  // (useMemeSwaps), and arrive as props, so collapsing the card neither starts
  // a poll nor stops one.
  it("holds no query of its own, so a collapsed card polls nothing", () => {
    expect(() => renderCard({ swaps: [swap()] })).not.toThrow();
    expect(screen.getByTestId("meme-tx-row")).toBeInTheDocument();
  });

  // The 10px between the header and the list has to fold with the list. Left on
  // the card as a flex gap it would outlive the collapse and pad the closed
  // card by 10px it never had, and on the Disclosure's className it would sit
  // on the grid item, whose padding counts towards the 0fr track and holds a
  // shut card 10px open. It belongs on the content inside the clip.
  it("folds the gap under the header away with the list", () => {
    renderCard({ swaps: [swap()] });
    const header = screen.getByRole("button", { name: /Live transactions/i });
    const panel = document.getElementById(header.getAttribute("aria-controls") as string);
    const card = panel?.parentElement as HTMLElement;
    const clip = panel?.firstElementChild as HTMLElement;

    expect(card.className).not.toContain("gap-[10px]");
    expect(clip.className).toContain("overflow-hidden");
    expect(clip.className).not.toMatch(/(^|\s)-?(m|p)(t|b|y)?-/);
    expect((clip.firstElementChild as HTMLElement).className).toContain("pt-[10px]");
  });
});
