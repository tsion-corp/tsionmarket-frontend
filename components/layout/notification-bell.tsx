"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { BellIcon } from "@/components/ui/icons";
import { useActivity, type ActivityEntry } from "@/features/activity/hooks/use-activity";
import { tokenBg } from "@/lib/trade/assets";
import { displayNetwork, displaySymbol } from "@/lib/buy";
import { formatQty } from "@/lib/format";
import { isStable } from "@/lib/activity/entries";
import {
  lastReadSnapshot,
  markRead,
  seedReadMarker,
  serverLastReadSnapshot,
  subscribeLastRead,
  unreadBadge,
  unreadEntries,
} from "@/lib/activity/read-state";

const PREVIEW_COUNT = 6;

function ago(ms: number, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: hours });
  return t("daysAgo", { n: Math.floor(hours / 24) });
}

function Row({ item, unread }: { item: ActivityEntry; unread: boolean }) {
  const t = useTranslations("activity");
  const incoming = item.direction === "in";
  const sym = displaySymbol(item.symbol);
  // Stablecoins are the product's cash: dollars, never a token symbol.
  const cash = isStable(item.symbol);
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 hover:bg-white/5">
      <span className="relative shrink-0">
        <AssetIcon sym={sym} bg={tokenBg(sym)} logo={item.logo} size={30} fallback="gradient" />
        <span className="absolute -right-1 -bottom-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-black">
          <NetworkIcon network={displayNetwork(item.symbol, item.network)} size={11} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-[13px] font-medium">
          {t(item.kind, { symbol: cash ? "USD" : sym })}
        </span>
        <span className="block truncate text-[11.5px] font-normal text-white/45">
          {ago(item.timestamp, t)}
        </span>
      </span>
      <span
        className={`tnum shrink-0 text-[12.5px] font-semibold ${incoming ? "text-up" : "text-white/80"}`}
      >
        {incoming ? "+" : "−"}
        {cash ? `$${item.amount.toFixed(2)}` : formatQty(item.amount)}
      </span>
      {unread ? <span className="bg-accent size-1.5 shrink-0 rounded-full" /> : null}
    </div>
  );
}

// Activity the user has not seen yet, one tap from anywhere. The Activity page
// is the full record; this is the nudge that something happened.
export function NotificationBell() {
  const t = useTranslations("activity");
  const { items, loading } = useActivity();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastReadAt = useSyncExternalStore(
    subscribeLastRead,
    lastReadSnapshot,
    serverLastReadSnapshot
  );

  // Writing the first-visit marker updates an external system; the store
  // notifies, so this never sets state itself.
  useEffect(() => {
    seedReadMarker(Date.now());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = unreadEntries(items, lastReadAt);
  const badge = unreadBadge(unread.length);
  const unreadIds = new Set(unread.map((e) => e.id));
  const preview = items.slice(0, PREVIEW_COUNT);

  // Opening is the acknowledgement. The dots stay for this view so the user can
  // still see which ones were new, and the badge clears on the next render.
  const toggle = () => {
    if (!open) markRead(Date.now());
    setOpen((v) => !v);
  };

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        aria-label={t("notifications")}
        aria-expanded={open}
        className="relative grid size-[38px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <BellIcon size={17} />
        {badge ? (
          <span className="text-ink absolute -top-0.5 -right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-white px-1 text-[10px] font-bold">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        // Anchored to the bell, which is where a popover belongs. The width
        // caps against the viewport rather than switching layout at a
        // breakpoint, so it fits every screen down to the narrowest phone
        // without ever running off the left edge.
        <div className="bg-panel absolute top-[46px] right-0 z-[80] max-h-[min(70vh,420px)] w-[min(340px,calc(100vw-5rem))] overflow-auto rounded-[14px] border border-white/12 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
            <span className="text-[11px] tracking-[0.05em] text-white/40 uppercase">
              {t("notifications")}
            </span>
            {badge ? (
              <span className="text-accent text-[11px] font-medium">
                {t("newCount", { count: unread.length })}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="px-3 py-6 text-center text-[13px] font-normal text-white/45">
              {t("loading")}
            </div>
          ) : preview.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] font-normal text-white/45">
              {t("emptyTitle")}
            </div>
          ) : (
            preview.map((item) => <Row key={item.id} item={item} unread={unreadIds.has(item.id)} />)
          )}

          <Link
            href="/activity"
            onClick={close}
            className="mt-1 flex items-center justify-center rounded-[10px] border border-white/10 bg-white/4 px-3 py-2.5 text-[12.5px] font-medium text-white hover:bg-white/8"
          >
            {t("viewAll")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
