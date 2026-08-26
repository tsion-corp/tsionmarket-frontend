"use client";

import { useState } from "react";

import { ShareToSquare, type ShareDraft } from "@/components/share/share-to-square";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { DiceIcon } from "@/components/ui/icons";
import { useMoney } from "@/components/ui/currency-select";
import {
  gameForKind,
  isDrawKind,
  isGameKind,
  isStable,
  type ActivityEntry,
} from "@/lib/activity/entries";
import { encodeGameRef } from "@/lib/broadcast/deep-link";
import { track } from "@/lib/analytics/mixpanel";
import { tokenBg } from "@/lib/trade/assets";
import { displayNetwork, displaySymbol } from "@/lib/buy";
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

// An off-chain game play: chess/checkers carry an opponent, ArkBall does not; a
// draw refunds the stake, so it shows no signed amount. No block-explorer link,
// because there is no on-chain transaction.
function GameRow({ item }: { item: ActivityEntry }) {
  const [sharing, setSharing] = useState(false);
  const t = useTranslations("activity");
  const money = useMoney();
  const incoming = item.direction === "in";
  const draw = isDrawKind(item.kind);
  const opponent = item.counterparty ? truncateAddress(item.counterparty) : null;
  const title = t(item.kind);

  // A played game is the most shareable thing on the platform, and it was the
  // one activity kind with no share control at all. Game entries carry the
  // match id in `hash` (there is no on-chain transaction), so the link points
  // at the match rather than at the casino index.
  const game = gameForKind(item.kind);
  const shareDraft: ShareDraft | null = game
    ? {
        title,
        subtitle: [
          draw ? t("refunded") : `${incoming ? "+" : "\u2212"}${money.format(item.amount)}`,
          opponent ? `${t("vs")} ${opponent}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        deepLink: { kind: "game", ref: encodeGameRef(game, item.hash) },
        suggestedText: "",
        // A game stake is money like any other, so it stays behind the same
        // opt-in the trade rows use rather than riding along in the card.
        amount: money.format(item.amount),
      }
    : null;

  return (
    <div className="group relative">
      <div
        title={fullTimestamp(item.timestamp)}
        className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3.5 first:border-t-0 sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-white/8 text-white/80">
            <DiceIcon size={18} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-sans text-[14.5px] font-medium">{t(item.kind)}</div>
            <div className="truncate text-xs font-normal text-white/50">
              {clockTime(item.timestamp)}
              {opponent ? ` · ${t("vs")} ${opponent}` : ""}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`tnum text-sm font-semibold ${
              draw ? "text-white/55" : incoming ? "text-up" : "text-white/85"
            }`}
          >
            {draw ? t("refunded") : `${incoming ? "+" : "−"}${money.format(item.amount)}`}
          </div>
          <div className="tnum text-[12px] font-normal text-white/45">
            {relativeTime(item.timestamp, t)}
          </div>
        </div>
      </div>
      {shareDraft ? <ShareButton label={title} onClick={() => setSharing(true)} /> : null}
      {sharing && shareDraft ? (
        <ShareToSquare draft={shareDraft} open onClose={() => setSharing(false)} />
      ) : null}
    </div>
  );
}

export function ActivityRow({ item, priceUsd }: { item: ActivityEntry; priceUsd: number }) {
  const [sharing, setSharing] = useState(false);
  const t = useTranslations("activity");
  const money = useMoney();
  if (isGameKind(item.kind)) return <GameRow item={item} />;
  const incoming = item.direction === "in";
  const explorer = EXPLORER[item.network];
  const value = priceUsd > 0 ? priceUsd * item.amount : 0;
  const sym = displaySymbol(item.symbol);
  const network = displayNetwork(item.symbol, item.network);
  // Buying KASH+ shows the KASH+ coin, not the USDC it was paid in: the row
  // reads as the thing you got, the same way a token buy shows the token.
  const kashBuy = item.kind === "bought_kash";
  const iconSym = kashBuy ? "KASH+" : sym;
  const iconLogo = kashBuy ? "/kash/kash-plus-coin.png" : item.logo;
  // Stablecoins are the product's cash: they read as dollars, never as a
  // token. Everything else keeps its own (display) symbol and quantity.
  const cash = isStable(item.symbol);
  // What the user did, named. A trade also carries what it cost or fetched,
  // which is more use on the row than the dollar value of one leg.
  const title = t(item.kind, { symbol: cash ? "USD" : sym });
  const primary = cash ? money.format(item.amount) : `${formatQty(item.amount)} ${sym}`;
  const counter =
    item.counterSymbol && item.counterAmount != null
      ? `${item.kind === "sold" ? "+" : "\u2212"}${
          isStable(item.counterSymbol)
            ? money.format(item.counterAmount)
            : `${formatQty(item.counterAmount)} ${displaySymbol(item.counterSymbol)}`
        }`
      : null;

  // A past transaction is the easiest thing to share, and the row is already
  // an anchor to the explorer — so the share control is a SIBLING of that
  // link, never nested inside it: a button inside an anchor is invalid and
  // swallows the tap on touch.
  const shareDraft: ShareDraft = {
    title,
    subtitle: `${primary}${counter ? ` · ${counter}` : ""}`,
    deepLink: { kind: "trade", ref: `${item.network}:${item.hash}` },
    suggestedText: "",
    amount: value > 0 ? money.format(value) : undefined,
  };

  return (
    <div className="group relative">
      <a
        data-sensitive="other"
        href={explorer ? `${explorer}${item.hash}` : undefined}
        onClick={() => {
          if (explorer)
            track("arktivity_tx_opened", { chain: item.network, direction: item.direction });
        }}
        target="_blank"
        rel="noopener noreferrer"
        title={fullTimestamp(item.timestamp)}
        className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/6 px-4 py-3.5 transition-colors first:border-t-0 hover:bg-white/4 sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <AssetIcon sym={iconSym} bg={tokenBg(iconSym)} logo={iconLogo} fallback="gradient" />
            <span className="absolute -right-1 -bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-black">
              <NetworkIcon network={network} size={13} />
            </span>
          </span>
          <div className="min-w-0">
            <div className="truncate font-sans text-[14.5px] font-medium">{title}</div>
            <div className="truncate text-xs font-normal text-white/50">
              {clockTime(item.timestamp)} ·{" "}
              {network === "Bitcoin" ? network : (NETWORK_LABEL[network] ?? network)}
              {item.counterparty
                ? ` · ${incoming ? t("from") : t("to")} ${truncateAddress(item.counterparty)}`
                : ""}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className={`tnum text-sm font-semibold ${incoming ? "text-up" : "text-white/85"}`}>
            {incoming ? "+" : "−"}
            {primary}
          </div>
          <div className="tnum text-[12px] font-normal text-white/45">
            {counter ??
              (!cash && value > 0 ? money.format(value) : relativeTime(item.timestamp, t))}
          </div>
        </div>
      </a>
      <ShareButton label={title} onClick={() => setSharing(true)} />
      {sharing ? <ShareToSquare draft={shareDraft} open onClose={() => setSharing(false)} /> : null}
    </div>
  );
}

// The control was `text-white/0` until `group-hover`, so on a phone it was
// invisible and untappable: there is no hover on touch, which made sharing a
// desktop-only feature by accident. It is visible by default now and only
// gains its emphasis on hover, and the hit area is 44px on touch.
function ShareButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Share ${label} to Market Square`}
      className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white/45 transition-colors group-hover:bg-white/8 group-hover:text-white/70 hover:!text-white focus-visible:bg-white/8 focus-visible:text-white/70 sm:size-8"
    >
      <ShareGlyph />
    </button>
  );
}

/** Outward arrow: sharing OUT of Ark, into the square. */
function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4m0 0L8 8m4-4l4 4M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
