"use client";

import { usePrices } from "@/hooks/use-prices";
import type { SportsbookOrder } from "../api";
import { useRedeemSportsbookOrder } from "../hooks/use-place-order";
import { useSportsbookOrder } from "../hooks/use-sportsbook";
import {
  atomicToDecimal,
  formatUsdcAmount,
  settlementTokenPriceUsd,
  tokenToUsdcAmount,
} from "../money";
import { canRebet } from "../ticket-rebet";
import { ticketStatusDetail } from "../ticket-status";

const PROCESSING = new Set([
  "draft",
  "awaiting_signature",
  "submitted",
  "accepted",
  "partially_accepted",
  "live",
  "pending_resolution",
]);
const POSITIVE = new Set(["won", "redeemable", "redeemed"]);

export function TicketModal({
  ticketId,
  onClose,
  onRebet,
}: {
  ticketId: string | null;
  onClose: () => void;
  onRebet: (order: SportsbookOrder) => void;
}) {
  const query = useSportsbookOrder(ticketId);
  const redemption = useRedeemSportsbookOrder();
  const ethPriceUsd = usePrices(["ETH"]).ETH ?? 0;
  if (!ticketId) return null;
  const order = query.data;
  const processing = order ? PROCESSING.has(order.status) : true;
  const positive = order ? POSITIVE.has(order.status) : false;
  const redeemable = Boolean(
    order &&
    order.status !== "redeemed" &&
    (order.status === "redeemable" || order.settlement?.isRedeemable)
  );
  const tokenPriceUsd = order ? settlementTokenPriceUsd(order.token.symbol, ethPriceUsd) : null;
  const asUsdc = (valueAtomic: string | null): string => {
    if (!order || !valueAtomic || !tokenPriceUsd) return "-";
    const tokenAmount = atomicToDecimal(valueAtomic, order.token.decimals, order.token.decimals);
    return formatUsdcAmount(tokenToUsdcAmount(tokenAmount, tokenPriceUsd, order.token.decimals));
  };
  const redemptionLabel =
    redemption.phase === "preparing"
      ? "Preparing payout..."
      : redemption.phase === "quoting"
        ? "Getting USDC rate..."
        : redemption.phase === "redeeming"
          ? "Redeeming to USDC..."
          : redemption.phase === "submitting"
            ? "Confirming redemption..."
            : "Redeem to USDC";

  return (
    <div className="fixed inset-0 z-[90] grid place-items-end bg-black/80 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <button
        type="button"
        aria-label="Close ticket"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <section className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-[#333] bg-[#171717] shadow-2xl sm:max-w-[510px] sm:rounded-2xl">
        <header className="flex items-center border-b border-[#333] px-5 py-4">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.12em] text-[#7e7e7e] uppercase">
              Ticket
            </p>
            <h2 className="mt-0.5 text-[18px] font-semibold text-[#ebebeb]">
              {order?.bookingCode ?? "Loading..."}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid size-9 cursor-pointer place-items-center rounded-full bg-[#242424] text-[#999]"
          >
            ×
          </button>
        </header>

        {!order ? (
          <div className="h-72 animate-pulse bg-[#242424]" />
        ) : (
          <div className="p-5">
            <div
              className={`flex items-center gap-3 rounded-[10px] border px-4 py-3 ${
                positive
                  ? "border-[#3eff8b]/20 bg-[#3eff8b]/8"
                  : order.status === "failed" ||
                      order.status === "rejected" ||
                      order.status === "lost"
                    ? "border-[#f42e52]/20 bg-[#f42e52]/8"
                    : "border-[#b9fcff]/15 bg-[#b9fcff]/5"
              }`}
            >
              <span
                className={`size-2.5 rounded-full ${processing ? "animate-pulse bg-[#b9fcff]" : positive ? "bg-[#3eff8b]" : "bg-[#f42e52]"}`}
              />
              <div>
                <p className="text-[12px] font-semibold text-[#ebebeb] capitalize">
                  {processing ? "Processing" : order.status.replaceAll("_", " ")}
                </p>
                <p className="mt-0.5 text-[9px] text-[#7e7e7e]">
                  {ticketStatusDetail(order.status, processing)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {order.legs.map((leg) => {
                const won =
                  leg.result?.toLowerCase() === "won" || leg.result?.toLowerCase() === "win";
                const lost =
                  leg.result?.toLowerCase() === "lost" || leg.result?.toLowerCase() === "lose";
                return (
                  <article
                    key={`${leg.conditionId}:${leg.outcomeId}`}
                    className="rounded-lg border border-[#333] bg-[#242424] p-3.5"
                  >
                    <div className="flex gap-3">
                      <span
                        className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${won ? "bg-[#3eff8b]/10 text-[#3eff8b]" : lost ? "bg-[#f42e52]/10 text-[#f42e52]" : "bg-[#2e2e2e] text-[#999]"}`}
                      >
                        {won ? "✓" : lost ? "×" : leg.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] text-[#999]">{leg.eventTitle}</p>
                        <p className="mt-1 text-[13px] font-semibold text-[#ebebeb]">
                          {leg.outcomeTitle}
                        </p>
                        <p className="mt-0.5 text-[9px] text-[#7e7e7e]">{leg.marketTitle}</p>
                      </div>
                      <span className="text-[12px] font-semibold text-[#ebebeb] tabular-nums">
                        {leg.acceptedOdds ?? leg.requestedOdds}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[#333] pt-4">
              <div>
                <dt className="text-[9px] font-medium text-[#7e7e7e]">Stake</dt>
                <dd className="mt-1 text-[12px] font-semibold text-[#ebebeb] tabular-nums">
                  {asUsdc(order.stakeAtomic)} USDC
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-medium text-[#7e7e7e]">Possible</dt>
                <dd className="mt-1 text-[12px] font-semibold text-[#ebebeb] tabular-nums">
                  {asUsdc(order.possiblePayoutAtomic)} USDC
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-[9px] font-medium text-[#7e7e7e]">Payout</dt>
                <dd className="mt-1 text-[12px] font-semibold text-[#3eff8b] tabular-nums">
                  {asUsdc(order.payoutAtomic)} USDC
                </dd>
              </div>
            </dl>

            {order.errorMessage ? (
              <p className="mt-4 rounded-lg bg-[#f42e52]/8 px-3 py-2 text-[10px] font-medium text-[#f42e52]">
                {order.errorMessage}
              </p>
            ) : null}
            {canRebet(order.status) ? (
              <button
                type="button"
                onClick={() => onRebet(order)}
                className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-[#b9fcff] text-[14px] font-semibold text-[#171717] transition-colors hover:bg-white"
              >
                Rebet selections
              </button>
            ) : null}
            {redeemable ? (
              <button
                type="button"
                disabled={redemption.isPending}
                onClick={() => redemption.mutate(order.ticketId)}
                className="mt-5 h-12 w-full cursor-pointer rounded-xl bg-[#b9fcff] text-[14px] font-semibold text-[#171717] disabled:opacity-45"
              >
                {redemptionLabel}
              </button>
            ) : null}
            {redeemable ? (
              <p className="mt-2 text-center text-[9px] leading-4 text-[#7e7e7e]">
                Winnings are withdrawn and converted through Uniswap V3 in one transaction.
              </p>
            ) : null}
            {redemption.error ? (
              <p className="mt-2 text-[10px] font-medium text-[#f42e52]">
                {redemption.error.message}
              </p>
            ) : null}
            {order.transactionHash ? (
              <a
                href={`https://basescan.org/tx/${order.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block text-center text-[10px] font-medium text-[#b9fcff] hover:text-white"
              >
                View transaction ↗
              </a>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
