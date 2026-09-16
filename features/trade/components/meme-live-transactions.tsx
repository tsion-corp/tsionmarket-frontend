"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Disclosure } from "@/components/ui/disclosure";
import { groupBaseUnits, parseBaseUnits } from "@/features/trade/components/meme-base-units";
import { Caret } from "@/features/trade/components/meme-board-disclosure";
import type { MemeSwapsStatus } from "@/features/trade/hooks/use-meme-swaps";
import { displaySymbol } from "@/lib/buy";
import { type MemeToken, type SwapDetail, type SwapStatus } from "@/lib/meme/api";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";

const SECOND_MS = 1_000;

// A trade that is on chain or already settled. Everything else is either a
// quote nobody acted on or an attempt that never became a transaction, and
// listing those as transactions would be a lie about what happened.
const LANDED: ReadonlySet<SwapStatus> = new Set<SwapStatus>([
  "SUBMITTED",
  "CONFIRMING",
  "CONFIRMED",
]);

// Two chains, two address conventions: a Solana mint is case-sensitive, an EVM
// address is not.
function sameAddress(a: string, b: string, chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID ? a === b : a.toLowerCase() === b.toLowerCase();
}

export interface CoinTransaction {
  id: string;
  side: "BUY" | "SELL";
  /** Already formatted and grouped, in the coin. null when unreadable. */
  amount: string | null;
  /** Epoch milliseconds, or null when the timestamp cannot be parsed. */
  at: number | null;
}

// The wallet's swaps in one coin, newest first.
//
// A buy's coin leg is the buy side of the swap and a sell's is the sell side,
// so the amount shown is always denominated in the coin on screen rather than
// in whatever the other half of the pair was. The actual amount is preferred
// over the quoted one: a settled trade reports what it really moved.
export function coinTransactions(swaps: SwapDetail[], token: MemeToken): CoinTransaction[] {
  const rows: CoinTransaction[] = [];
  for (const swap of swaps) {
    if (swap.chainId !== token.chainId) continue;
    if (!LANDED.has(swap.status)) continue;
    const buying = swap.side === "BUY";
    const coinAddress = buying ? swap.buyTokenAddress : swap.sellTokenAddress;
    if (!sameAddress(coinAddress, token.address, token.chainId)) continue;

    const atomic = buying
      ? (swap.actualBuyAmountAtomic ?? swap.quotedBuyAmountAtomic)
      : (swap.actualSellAmountAtomic ?? swap.sellAmountAtomic);
    const decimals = buying ? swap.buyTokenDecimals : swap.sellTokenDecimals;
    const raw = parseBaseUnits(atomic ?? "");
    const at = Date.parse(swap.createdAt);
    rows.push({
      id: swap.id,
      side: swap.side,
      amount: raw === null ? null : groupBaseUnits(raw, decimals),
      at: Number.isFinite(at) ? at : null,
    });
  }
  return rows;
}

function subscribeToSecond(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, SECOND_MS);
  return () => clearInterval(id);
}

// Quantised to whole seconds: getSnapshot is called during render and compared
// by identity, so returning a raw Date.now() would differ on every read and
// spin the store.
function readSecond(): number {
  return Math.floor(Date.now() / SECOND_MS) * SECOND_MS;
}

// The wall clock, read as the external system it is rather than written into
// state from an effect on a timer. Same shape as hooks/use-countdown.ts, and
// for the same reasons: setting state synchronously inside an effect cascades
// renders, and the store API gives the server a snapshot of its own.
//
// The server's snapshot is a fixed zero because there is no server clock the
// client will still agree with a second later. Every elapsed time is clamped at
// zero, so a row rendered before the store attaches reads "just now" and then
// ticks, instead of hydrating onto a different number.
function useNow(): number {
  return useSyncExternalStore(subscribeToSecond, readSecond, () => 0);
}

interface LiveTransactionsProps {
  /** The coin on screen. Rows in any other coin are filtered out. */
  token: MemeToken;
  /** The wallet's whole swap page, in every coin. */
  swaps: SwapDetail[];
  status: MemeSwapsStatus;
  onRetry: () => void;
}

// The transactions card under the ticket.
//
// It is a feed, so it has all four of a feed's states: in flight, failed with a
// way to ask again, answered with nothing, and answered with rows. The times
// tick against the clock store above rather than a timestamp frozen at first
// render.
//
// Scope worth knowing: the trade service publishes no market-wide trade tape
// and no per-trade price, so these rows are the signed-in wallet's own swaps in
// this coin, and no row carries a price. Neither figure is invented to fill the
// column the design draws.
export function LiveTransactions({ token, swaps, status, onRetry }: LiveTransactionsProps) {
  const t = useTranslations("meme");
  const [open, setOpen] = useState(true);
  const panelId = `meme-transactions-${useId()}`;
  const now = useNow();

  const symbol = displaySymbol(token.symbol ?? "") || "?";
  const transactions = coinTransactions(swaps, token);

  function elapsed(at: number | null): string {
    if (at === null) return t("metricUnavailable");
    const seconds = Math.max(0, Math.floor((now - at) / SECOND_MS));
    if (seconds < 1) return t("txJustNow");
    if (seconds < 60) return t("txSecondsAgo", { n: seconds });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("txMinutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("txHoursAgo", { n: hours });
    return t("txDaysAgo", { n: Math.floor(hours / 24) });
  }

  return (
    <section
      data-region="meme-live-transactions"
      // No gap between the header and the list: the 10px rides on the panel's
      // content instead, so it folds away with the list. On the card it would
      // survive the collapse and pad a shut card by 10px it never had.
      className="border-hairline rounded-card bg-surface flex flex-col border p-4"
    >
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[44px] cursor-pointer items-center justify-between text-left"
      >
        <span className="font-serif text-[12px] font-bold tracking-[0.02em] text-white/50 uppercase">
          {t("txTitle")}
        </span>
        <Caret open={open} />
      </button>

      {/* Wrapped whole, not gated: every state below is drawn from the `swaps`
          prop, and the query and its 15s poll belong to the board (useMemeSwaps),
          so keeping the rows mounted while the card is shut costs nothing and is
          what lets the card fold rather than snap.

          The 10px lead is on this inner box, not on the Disclosure's className:
          that lands on the grid item, whose padding counts towards the 0fr
          track and would hold a shut card 10px open. */}
      <Disclosure open={open} id={panelId}>
        <div className="flex flex-col pt-[10px]">
          {status === "loading" ? (
            <div role="status" aria-label={t("txTitle")} className="flex flex-col gap-2">
              {[0, 1].map((row) => (
                <div key={row} className="h-[34px] animate-pulse rounded-[10px] bg-white/6" />
              ))}
            </div>
          ) : status === "error" ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <span className="text-[13px] font-normal text-white/70">{t("txError")}</span>
              <button
                type="button"
                onClick={onRetry}
                className="border-hairline bg-surface flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 font-serif text-[12.5px] font-semibold text-white"
              >
                {t("retry")}
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <span className="text-[13px] font-normal text-white/45">{t("txEmpty")}</span>
          ) : (
            <ul className="flex flex-col">
              {transactions.map((row) => (
                <li
                  key={row.id}
                  data-testid="meme-tx-row"
                  className="flex min-h-[44px] items-center gap-3"
                >
                  {/* The word carries the side, not the colour: "Buy" and "Sell"
                    read the same to someone who cannot tell the two fills
                    apart. */}
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 font-serif text-[11px] font-bold ${
                      row.side === "BUY" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
                    }`}
                  >
                    {row.side === "BUY" ? t("buy") : t("sell")}
                  </span>
                  <span className="tnum min-w-0 flex-1 truncate text-[12.5px] font-medium text-white">
                    {row.amount === null ? t("metricUnavailable") : `${row.amount} ${symbol}`}
                  </span>
                  <span className="tnum shrink-0 text-[11px] font-normal text-white/40">
                    {elapsed(row.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Disclosure>
    </section>
  );
}
