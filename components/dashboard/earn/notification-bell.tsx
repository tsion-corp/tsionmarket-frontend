"use client";

import { useState } from "react";
import Link from "next/link";
import { SidePanel } from "@/components/ui/side-panel";
import { useMarkNotificationsRead, useNotifications } from "@/hooks/use-earn-notifications";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import type { EarnNotification } from "@/lib/earn/api/types";

// How long ago, in the roughest terms that are still useful. A notification is
// read at a glance, so "3d" beats a date.
function ago(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationBell() {
  const { items, unread } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="ws-inset relative cursor-pointer rounded-full px-4 py-2.5 font-sans text-[12.5px] font-semibold text-white/75 transition-colors hover:text-white"
      >
        Notifications
        {unread > 0 ? (
          <span className="bg-accent text-ink tnum absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      <SidePanel open={open} onClose={() => setOpen(false)} title="Notifications">
        {unread > 0 ? (
          <div className="flex justify-end border-b border-white/8 px-5 py-2.5">
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
              className="cursor-pointer font-sans text-[12px] font-medium text-white/55 transition-colors hover:text-white disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center font-sans text-[12.5px] font-normal text-white/40">
              Nothing yet. You&apos;ll hear here when a sponsor picks winners.
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationRow
                    item={item}
                    onOpen={() => {
                      if (!item.isRead) markRead.mutate([item.id]);
                      setOpen(false);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <PushPrompt />
      </SidePanel>
    </>
  );
}

function NotificationRow({ item, onOpen }: { item: EarnNotification; onOpen: () => void }) {
  const body = (
    <>
      <div className="flex items-start gap-2">
        {/* Unread carries a dot rather than a different background, so a long
            list does not turn into stripes. */}
        <span
          aria-hidden
          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-accent"}`}
        />
        <div className="min-w-0">
          <div
            className={`font-sans text-[13px] ${item.isRead ? "font-medium text-white/70" : "font-semibold text-white"}`}
          >
            {item.title}
          </div>
          {item.body ? (
            <div className="mt-0.5 font-sans text-[12px] font-normal text-white/45">
              {item.body}
            </div>
          ) : null}
        </div>
      </div>
      <span className="tnum shrink-0 font-sans text-[11px] font-normal text-white/30">
        {ago(item.createdAt)}
      </span>
    </>
  );

  const className =
    "flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/4";

  // A notification that names a listing opens it; one that does not is still
  // worth marking read on click.
  if (!item.listingSlug) {
    return (
      <button type="button" onClick={onOpen} className={`${className} cursor-pointer`}>
        {body}
      </button>
    );
  }

  return (
    <Link href={`/earn/listing/${item.listingSlug}`} onClick={onOpen} className={className}>
      {body}
    </Link>
  );
}

// Offers browser notifications, and only while there is a decision to make:
// once granted or refused there is nothing useful to say, and a permanent
// banner asking for permission is the thing people learn to ignore.
function PushPrompt() {
  const { canAsk, enable, isEnabling } = usePushNotifications();
  if (!canAsk) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3">
      <span className="font-sans text-[11.5px] font-normal text-white/45">
        Get these even when this tab is closed.
      </span>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={isEnabling}
        className="ws-inset shrink-0 cursor-pointer rounded-full px-3 py-1.5 font-sans text-[11.5px] font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-40"
      >
        {isEnabling ? "Enabling…" : "Enable"}
      </button>
    </div>
  );
}
