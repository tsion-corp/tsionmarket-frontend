"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePrices } from "@/hooks/use-prices";
import type { SportsbookOrder } from "../api";
import {
  atomicToDecimal,
  formatUsdcAmount,
  settlementTokenPriceUsd,
  tokenToUsdcAmount,
} from "../money";
import { useSportsbookOrderHistory } from "../hooks/use-sportsbook";

const POSITIVE = new Set(["won", "redeemable", "redeemed"]);
const NEGATIVE = new Set(["lost", "rejected", "failed"]);

export function TicketsPanel({ onOpen }: { onOpen: (ticketId: string) => void }) {
  const { authenticated, login } = usePrivy();
  const ethPriceUsd = usePrices(["ETH"]).ETH ?? 0;
  const history = useSportsbookOrderHistory(authenticated);

  if (!authenticated) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] font-medium text-[#999]">Sign in to see your tickets.</p>
        <button
          type="button"
          onClick={login}
          className="mt-4 cursor-pointer rounded-lg bg-[#b9fcff] px-4 py-2 text-[11px] font-semibold text-[#171717]"
        >
          Log in
        </button>
      </div>
    );
  }
  if (history.isLoading) {
    return <div className="h-48 animate-pulse bg-[#171717]" />;
  }
  if (history.isError) {
    return (
      <div className="px-5 py-10 text-center text-[12px] font-medium text-[#f42e52]">
        Ticket history could not load.
      </div>
    );
  }
  const orders = history.data?.items ?? [];
  if (orders.length === 0) {
    return <div className="px-5 py-10 text-center text-[12px] text-[#7e7e7e]">No tickets yet.</div>;
  }
  return (
    <div className="max-h-[520px] [scrollbar-width:thin] overflow-y-auto">
      {orders.map((order) => (
        <TicketRow key={order.ticketId} order={order} onOpen={onOpen} ethPriceUsd={ethPriceUsd} />
      ))}
    </div>
  );
}

function TicketRow({
  order,
  onOpen,
  ethPriceUsd,
}: {
  order: SportsbookOrder;
  onOpen: (id: string) => void;
  ethPriceUsd: number;
}) {
  const positive = POSITIVE.has(order.status);
  const negative = NEGATIVE.has(order.status);
  const tokenPriceUsd = settlementTokenPriceUsd(order.token.symbol, ethPriceUsd);
  const stakeUsdc = tokenPriceUsd
    ? tokenToUsdcAmount(
        atomicToDecimal(order.stakeAtomic, order.token.decimals, order.token.decimals),
        tokenPriceUsd,
        order.token.decimals
      )
    : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(order.ticketId)}
      className="flex w-full cursor-pointer items-center gap-3 border-b border-[#2e2e2e] px-4 py-4 text-left hover:bg-[#242424]"
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-black ${
          positive
            ? "bg-[#3eff8b]/10 text-[#3eff8b]"
            : negative
              ? "bg-[#f42e52]/10 text-[#f42e52]"
              : "bg-[#2e2e2e] text-[#999]"
        }`}
      >
        {positive ? "✓" : negative ? "×" : "·"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-[#ebebeb]">
          {order.legs.length === 1
            ? order.legs[0].eventTitle
            : `${order.legs.length} selection combo`}
        </span>
        <span className="mt-1 block text-[9px] font-medium text-[#7e7e7e] uppercase">
          {order.bookingCode} · {order.status.replaceAll("_", " ")}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[11px] font-semibold text-[#ebebeb] tabular-nums">
          {stakeUsdc ? formatUsdcAmount(stakeUsdc) : "-"}
        </span>
        <span className="text-[8px] font-medium text-[#7e7e7e]">USDC</span>
      </span>
    </button>
  );
}
