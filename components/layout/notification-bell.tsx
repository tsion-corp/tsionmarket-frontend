"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { BellIcon } from "@/components/ui/icons";
import {
  BELL_POLL_MS,
  useActivity,
  type ActivityEntry,
} from "@/features/activity/hooks/use-activity";
import { useNotificationInbox } from "@/hooks/use-notification-inbox";
import { useServiceNotifications } from "@/hooks/use-service-notifications";
import { mergeBellNotifications, type BellNotification } from "@/lib/notifications/merge";
import { usePushSubscription, type PushState } from "@/hooks/use-push-subscription";
import { notificationDestination } from "@/lib/notifications/destination";
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

const SECTION_LABEL = "text-[11px] tracking-[0.05em] text-white/40 uppercase";
const PANEL_NOTE = "px-3 py-6 text-center text-[13px] font-normal text-white/45";

function ago(ms: number, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: hours });
  return t("daysAgo", { n: Math.floor(hours / 24) });
}

// The inbox timestamps are ISO strings written by the service. One that will
// not parse gets no time rather than a row reading "NaN days ago".
function agoIso(iso: string, t: ReturnType<typeof useTranslations>): string {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ago(ms, t) : "";
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

// One platform notification. The title and body are operator-authored text
// that reaches every user, so they are rendered as text and nothing else.
//
// A url the destination rules refuse makes the row plain text: there is
// nowhere safe to send the reader, and a row that quietly went to the home
// page would hide a bad campaign instead of showing it.
function InboxRow({
  item,
  onSelect,
}: {
  item: BellNotification;
  onSelect: (item: BellNotification) => void;
}) {
  const t = useTranslations("activity");
  // A service row may carry no url at all, which is not a destination either.
  const followable = item.url !== null && notificationDestination(item.url) !== null;
  const body = (
    <>
      <span
        aria-hidden
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-accent"}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-sans text-[13px] ${item.readAt ? "font-medium text-white/70" : "font-semibold text-white"}`}
        >
          {item.title}
        </span>
        {item.body ? (
          <span className="mt-0.5 block truncate text-[12px] font-normal text-white/45">
            {item.body}
          </span>
        ) : null}
        <span className="mt-0.5 block text-[11.5px] font-normal text-white/30">
          {agoIso(item.createdAt, t)}
        </span>
      </span>
    </>
  );

  const className = "flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left";
  if (!followable) return <div className={className}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`${className} cursor-pointer hover:bg-white/5`}
    >
      {body}
    </button>
  );
}

interface PushPromptProps {
  state: PushState;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onRetry: () => void;
}

// The soft ask, and the reasons there is nothing to ask. Only "prompt" and
// "enabling" carry the turn-on button: every other state is either already on,
// or something the reader has to change somewhere else.
function PushPrompt({ state, error, onEnable, onDisable, onRetry }: PushPromptProps) {
  const n = useTranslations("notifications");
  if (state === "unsupported") return null;

  const action = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ws-inset shrink-0 cursor-pointer rounded-full px-3 py-1.5 font-sans text-[11.5px] font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-40"
    >
      {label}
    </button>
  );

  let title = "";
  let body: string | null = null;
  let control: React.ReactNode = null;

  if (state === "prompt" || state === "enabling") {
    title = n("enableTitle");
    body = n("enableBody");
    control = action(
      state === "enabling" ? n("enabling") : n("enable"),
      onEnable,
      state === "enabling"
    );
  } else if (state === "enabled") {
    title = n("enabled");
    control = action(n("disable"), onDisable);
  } else if (state === "blocked") {
    title = n("blockedTitle");
    body = n("blockedBody");
  } else if (state === "needs-install") {
    title = n("installTitle");
    body = n("installBody");
  } else if (state === "unavailable") {
    title = n("unavailableTitle");
    body = n("unavailableBody");
  } else {
    title = error ?? n("failed");
    control = action(n("retry"), onRetry);
  }

  return (
    <div className="mb-1 flex items-start justify-between gap-3 rounded-[10px] border border-white/10 bg-white/4 px-2.5 py-2">
      <span className="min-w-0">
        <span className="block font-sans text-[12.5px] font-medium text-white">{title}</span>
        {body ? (
          <span className="mt-0.5 block text-[11.5px] font-normal text-white/45">{body}</span>
        ) : null}
      </span>
      {control}
    </div>
  );
}

// Activity the user has not seen yet, one tap from anywhere. The Activity page
// is the full record; this is the nudge that something happened.
//
// The panel now carries two lists: the platform inbox, which is a durable
// server-side record, and the on-chain activity feed, which is not. They keep
// separate read state on purpose. Opening the bell acknowledges activity, as
// it always has, and leaves notifications unread until one is actually read.
export function NotificationBell() {
  const t = useTranslations("activity");
  const n = useTranslations("notifications");
  const router = useRouter();
  // The topbar renders on every screen, so this observer sets the floor on
  // how often the whole signed-in population sweeps its history.
  const { items, loading } = useActivity({ pollMs: BELL_POLL_MS });
  const inbox = useNotificationInbox();
  // The second store: what the platform's own services publish, a Last Man win
  // among them. Read on sign-in rather than on open, because that read is also
  // what links this wallet to this person on the service side.
  const service = useServiceNotifications();
  // Called here rather than inside the panel, because the silent refresh has
  // to run on load and not only when somebody opens the bell.
  const push = usePushSubscription();
  const [open, setOpen] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
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
  const activityBadge = unreadBadge(unread.length);
  const badge = unreadBadge(unread.length + inbox.unreadCount + service.unreadCount);
  const unreadIds = new Set(unread.map((e) => e.id));
  const rows = mergeBellNotifications(inbox.items, service.items);
  // One store failing must not blank the other's rows: the panel only shows
  // the error state when there is nothing left to show.
  const bothFailed = Boolean(inbox.error) && Boolean(service.error);
  const bothLoading = inbox.isLoading && service.isLoading;
  // One store down is not an empty inbox. Saying nothing would present a
  // partial list as the whole of somebody's mail, which is how a missing
  // payout notice looks exactly like no payout notice.
  const partlyFailed = !bothFailed && (Boolean(inbox.error) || Boolean(service.error));

  const retryBoth = () => {
    inbox.refetch();
    service.refetch();
  };
  const preview = items.slice(0, PREVIEW_COUNT);

  // Opening is the acknowledgement. The dots stay for this view so the user can
  // still see which ones were new, and the badge clears on the next render.
  const toggle = () => {
    if (!open) markRead(Date.now());
    setOpen((v) => !v);
  };

  const close = () => setOpen(false);

  // The optimistic update has already moved the row, so a failure has to say
  // so: silently rolling back would look like the click did nothing.
  // Read state is per store: marking a vault win read has to go to the
  // notification service, and an announcement to user-management. Sending
  // either to the wrong one answers 404 and leaves the badge stuck.
  const markOne = (item: BellNotification) => {
    setMarkFailed(false);
    const done = item.source === "service" ? service.markRead(item.id) : inbox.markRead([item.id]);
    void done.catch(() => setMarkFailed(true));
  };

  // "Mark all read" means both, and one store failing must not hide that the
  // other succeeded.
  const markAll = () => {
    setMarkFailed(false);
    void Promise.allSettled([inbox.markAllRead(), service.markAllRead()]).then((results) => {
      if (results.some((r) => r.status === "rejected")) setMarkFailed(true);
    });
  };

  const openNotification = (item: BellNotification) => {
    const destination = item.url === null ? null : notificationDestination(item.url);
    if (!destination) return;
    if (!item.readAt) markOne(item);
    close();
    if (destination.kind === "internal") {
      router.push(destination.path);
      return;
    }
    // Opened without an opener handle, so the operator's page cannot reach
    // back into this one.
    window.open(destination.href, "_blank", "noopener,noreferrer");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        aria-label={t("notifications")}
        aria-expanded={open}
        className="border-hairline md:bg-topbar-pill relative grid size-[38px] cursor-pointer place-items-center rounded-full border bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:size-[46px] md:hover:bg-black/30"
      >
        <BellIcon size={17} className="md:hidden" />
        {/* The Market head's own bell, exported from the design file. It is a
            fixed-white glyph rather than a currentColor one, so it sits in an
            explicitly sized box instead of inheriting the button's text
            colour. Desktop only; the phone keeps the icon set's bell. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/rollout/chrome/topbar-icon-bell.svg"
          alt=""
          width={21}
          height={21}
          className="hidden size-[20.65px] shrink-0 md:block"
        />
        {badge ? (
          <span className="text-ink absolute -top-0.5 -right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-white px-1 text-[10px] font-bold">
            {badge}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          // Anchored to the bell, which is where a popover belongs. The width
          // caps against the viewport rather than switching layout at a
          // breakpoint, so it fits every screen down to the narrowest phone
          // without ever running off the left edge.
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="bg-panel absolute top-[46px] right-0 z-[80] max-h-[min(70vh,420px)] w-[min(340px,calc(100vw-5rem))] overflow-auto rounded-[14px] border border-white/12 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] md:top-[54px]"
          >
            <PushPrompt
              state={push.state}
              error={push.error}
              onEnable={() => void push.enable()}
              onDisable={() => void push.disable()}
              onRetry={push.retry}
            />

            <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
              <span className={SECTION_LABEL}>{n("title")}</span>
              {inbox.unreadCount + service.unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markAll}
                  className="cursor-pointer text-[11px] font-medium text-white/55 transition-colors hover:text-white"
                >
                  {n("markAllRead")}
                </button>
              ) : null}
            </div>

            {markFailed ? (
              <p className="px-2.5 pb-1.5 text-[11.5px] font-normal text-white/45">{n("error")}</p>
            ) : null}

            {partlyFailed ? (
              <p className="flex items-center gap-1.5 px-2.5 pb-1.5 text-[11.5px] font-normal text-white/45">
                {n("partial")}
                <button
                  type="button"
                  onClick={retryBoth}
                  className="text-accent cursor-pointer font-medium"
                >
                  {n("retry")}
                </button>
              </p>
            ) : null}

            {/* One list from two stores. Each keeps its own read state; the
                merge is display only (lib/notifications/merge.ts). */}
            {bothFailed ? (
              <div className={PANEL_NOTE}>
                <span className="block">{n("error")}</span>
                <button
                  type="button"
                  onClick={retryBoth}
                  className="text-accent mt-1 cursor-pointer text-[12.5px] font-medium"
                >
                  {n("retry")}
                </button>
              </div>
            ) : bothLoading ? (
              // A skeleton rather than a word, so the panel keeps its shape
              // while the first page lands.
              <div aria-hidden className="space-y-1.5 px-2.5 py-2">
                <div className="h-8 animate-pulse rounded-[10px] bg-white/6" />
                <div className="h-8 animate-pulse rounded-[10px] bg-white/6" />
              </div>
            ) : rows.length === 0 ? (
              <div className={PANEL_NOTE}>{n("empty")}</div>
            ) : (
              <>
                {rows.map((item) => (
                  <InboxRow key={item.key} item={item} onSelect={openNotification} />
                ))}
                {inbox.hasMore ? (
                  <button
                    type="button"
                    onClick={inbox.loadMore}
                    disabled={inbox.isLoadingMore}
                    className="mt-1 flex w-full items-center justify-center rounded-[10px] px-3 py-2 text-[12px] font-medium text-white/55 hover:bg-white/5 disabled:opacity-40"
                  >
                    {n("loadMore")}
                  </button>
                ) : null}
              </>
            )}

            <div className="mt-1.5 flex items-center justify-between px-2.5 pt-2 pb-1.5">
              <span className={SECTION_LABEL}>{n("activity")}</span>
              {activityBadge ? (
                <span className="text-accent text-[11px] font-medium">
                  {t("newCount", { count: unread.length })}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className={PANEL_NOTE}>{t("loading")}</div>
            ) : preview.length === 0 ? (
              <div className={PANEL_NOTE}>{t("emptyTitle")}</div>
            ) : (
              preview.map((item) => (
                <Row key={item.id} item={item} unread={unreadIds.has(item.id)} />
              ))
            )}

            <Link
              href="/activity"
              onClick={close}
              className="mt-1 flex items-center justify-center rounded-[10px] border border-white/10 bg-white/4 px-3 py-2.5 text-[12.5px] font-medium text-white hover:bg-white/8"
            >
              {t("viewAll")}
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
