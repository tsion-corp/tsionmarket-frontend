"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { useMoney } from "@/components/ui/currency-select";
import type { ActivityItem } from "@/hooks/use-activity";
import { tokenBg } from "@/lib/trade/assets";
import { formatQty, truncateAddress } from "@/lib/format";

// Explorer per chain, so a row links to the transaction it describes.
const EXPLORER: Record<string, string> = {
  "base-mainnet": "https://basescan.org/tx/",
  "eth-mainnet": "https://etherscan.io/tx/",
  "arb-mainnet": "https://arbiscan.io/tx/",
  "opt-mainnet": "https://optimistic.etherscan.io/tx/",
  "polygon-mainnet": "https://polygonscan.com/tx/",
  "solana-mainnet": "https://solscan.io/tx/",
};

const NETWORK_LABEL: Record<string, string> = {
  "base-mainnet": "Base",
  "eth-mainnet": "Ethereum",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

export type Translate = ReturnType<typeof useTranslations>;

function relativeTime(ms: number, t: Translate): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: hours });
  return t("daysAgo", { n: Math.floor(hours / 24) });
}

// The clock time, which is what someone checks a transfer against.
function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fullTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Today and Yesterday read better than a date; anything older gets the date.
export function dayHeading(ms: number, t: Translate): string {
  const day = new Date(ms);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (isSameDay(day, today)) return t("today");
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(day, yesterday)) return t("yesterday");
  return day.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function ActivityRow({ item, priceUsd }: { item: ActivityItem; priceUsd: number }) {
  const t = useTranslations("activity");
  const money = useMoney();
  const incoming = item.direction === "in";
  const explorer = EXPLORER[item.network];
  const value = priceUsd > 0 ? priceUsd * item.amount : 0;

  return (
    <a
      href={explorer ? `${explorer}${item.hash}` : undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={fullTimestamp(item.timestamp)}
      className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3.5 transition-colors first:border-t-0 hover:bg-white/4 sm:px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0">
          <AssetIcon sym={item.symbol} bg={tokenBg(item.symbol)} fallback="gradient" />
          <span className="absolute -right-1 -bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-black">
            <NetworkIcon network={item.network} size={13} />
          </span>
        </span>
        <div className="min-w-0">
          <div className="truncate font-sans text-[14.5px] font-medium">
            {incoming
              ? t("receivedSymbol", { symbol: item.symbol })
              : t("sentSymbol", { symbol: item.symbol })}
          </div>
          <div className="truncate text-xs font-normal text-white/50">
            {clockTime(item.timestamp)} · {NETWORK_LABEL[item.network] ?? item.network}
            {item.counterparty
              ? ` · ${incoming ? t("from") : t("to")} ${truncateAddress(item.counterparty)}`
              : ""}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className={`tnum text-sm font-semibold ${incoming ? "text-up" : "text-white/85"}`}>
          {incoming ? "+" : "−"}
          {formatQty(item.amount)} {item.symbol}
        </div>
        <div className="tnum text-[12px] font-normal text-white/45">
          {value > 0 ? money.format(value) : relativeTime(item.timestamp, t)}
        </div>
      </div>
    </a>
  );
}
