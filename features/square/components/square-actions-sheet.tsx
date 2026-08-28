"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  fetchSquareMe,
  fetchSquareTopics,
  fetchSquareUnread,
  fetchTrendingDiscussions,
} from "@/lib/api/market-square";
import { squareLinks } from "@/lib/square/links";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { GoLiveControl } from "@/components/broadcast/go-live-control";
import { DiscussionRail } from "@/features/square/components/discussion-rail";

/**
 * What the plus opens.
 *
 * The plus used to go straight to the composer, which assumed writing is the
 * only thing someone reaches for it to do. It is really the entry to the
 * square as a whole — so this is a small hub: who you are there, whether
 * anything is waiting for you, and the ways in.
 *
 * Every entry here is backed by something. The reference layout also offers
 * Article, Video, Creator Center and CreatorPad; a post in this platform has
 * exactly two kinds (`update` and `story`) and there is no article or video
 * type behind them, so those tiles would be four controls that fail on tap.
 * The one adjacent thing that IS real — applying to be a creator — is here
 * instead, and only for someone who is not one yet.
 */
function Tile({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ws-inset flex flex-col items-center gap-2 px-2 py-4 transition-colors hover:bg-white/5 disabled:opacity-40"
    >
      <span className="text-accent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-6 w-6">
          {children}
        </svg>
      </span>
      <span className="text-[12.5px] font-semibold text-white">{label}</span>
    </button>
  );
}

export function SquareActionsSheet({
  open,
  onClose,
  onCompose,
  onComposeMedia,
  onPickTopic,
  onPickDiscussion,
}: {
  open: boolean;
  onClose: () => void;
  onCompose: () => void;
  onComposeMedia: () => void;
  onPickTopic?: (key: string) => void;
  /** A hashtag, without the `#`. */
  onPickDiscussion?: (tag: string) => void;
}) {
  const t = useTranslations("square");

  const me = useQuery({
    queryKey: ["market-square", "me"],
    queryFn: fetchSquareMe,
    enabled: open,
    staleTime: 5 * 60_000,
    // Signed out, or the square has no profile yet — the sheet still works,
    // it just cannot greet anyone. Not worth a retry storm.
    retry: false,
  });

  const unread = useQuery({
    queryKey: ["market-square", "unread"],
    queryFn: fetchSquareUnread,
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  // Real discussions first — the hashtags people are using. Topics are the
  // fallback: on a quiet deployment nothing is trending yet, and an empty
  // "Discussions" heading is worse than the curated shelf.
  const discussions = useQuery({
    queryKey: ["market-square", "trending"],
    queryFn: () => fetchTrendingDiscussions(6),
    enabled: open,
    // Short, because "trending" that is an hour stale is not trending.
    staleTime: 2 * 60_000,
    retry: false,
  });

  const topics = useQuery({
    queryKey: ["market-square", "topics"],
    queryFn: fetchSquareTopics,
    enabled: open && (discussions.data?.length ?? 0) === 0,
    staleTime: 30 * 60_000,
  });

  const count = unread.data ?? 0;
  const bellHref = squareLinks.notifications();
  const profileHref = me.data ? squareLinks.profile(me.data.username) : null;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div>
        {/* pr-10 keeps the bell clear of ModalShell's own close button, which
            sits in this row's top-right corner. */}
        <header className="flex items-center justify-between gap-3 pr-10">
          <div className="flex min-w-0 items-center gap-2.5">
            <SquareAvatar src={me.data?.avatarUrl ?? null} seed={me.data?.id ?? "me"} size={38} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-white">
                {me.data?.displayName ?? t("yourProfile")}
              </p>
              {me.data ? (
                <p className="text-grey-500 truncate text-[12px]">@{me.data.username}</p>
              ) : null}
            </div>
          </div>

          {bellHref ? (
            <a
              href={bellHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={count > 0 ? t("notificationsWithCount", { count }) : t("notifications")}
              className="text-grey-400 hover:text-grey-100 relative shrink-0 p-1.5 transition-colors"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
                <path
                  d="M18 9a6 6 0 1 0-12 0c0 4-2 5-2 5h16s-2-1-2-5M13.7 20a2 2 0 0 1-3.4 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {count > 0 ? (
                // Capped, because a badge is a signal not a statistic — three
                // digits stops being readable and starts being a shape.
                <span className="bg-down text-ink absolute -top-0.5 -right-0.5 grid min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-bold">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </a>
          ) : null}
        </header>

        {/* Post, Media, Go Live — the three ways in, all three backed by
            something this platform actually has. Live is not a fourth idea
            bolted on: Ark already broadcasts, and the square is where those
            streams surface, so it belongs beside the other two. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Tile label={t("tilePost")} onClick={onCompose}>
            <path
              d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </Tile>
          <Tile label={t("tileMedia")} onClick={onComposeMedia}>
            <path
              d="M4 5h16v14H4zM4 15l4.5-4.5L13 15m2.5-2.5L20 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </Tile>
          {/* The REAL broadcast control, not a lookalike. This tile used to be
              a plain button gated on an `onGoLive` callback that nothing ever
              passed, so it rendered permanently disabled. Reusing the control
              brings the session state and the route-derived broadcast target
              with it, and leaves no prop for a caller to forget. */}
          <GoLiveControl variant="tile" />
        </div>

        {(discussions.data?.length ?? 0) > 0 ? (
          <section className="mt-4">
            <h3 className="text-grey-400 text-[11.5px] font-medium tracking-[0.14em] uppercase">
              {t("discussions")}
            </h3>
            <div className="mt-2">
              <DiscussionRail
                discussions={discussions.data ?? []}
                onOpen={(tag) => {
                  onPickDiscussion?.(tag);
                  onClose();
                }}
              />
            </div>
          </section>
        ) : topics.data && topics.data.length > 0 ? (
          <section className="mt-4">
            <h3 className="text-grey-400 text-[11.5px] font-medium tracking-[0.14em] uppercase">
              {t("browseTopics")}
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topics.data.map((topic) => (
                <button
                  key={topic.key}
                  type="button"
                  onClick={() => {
                    onPickTopic?.(topic.key);
                    onClose();
                  }}
                  className="border-grey-800 text-grey-300 hover:bg-grey-800 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                >
                  {topic.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {profileHref ? (
          <a
            href={profileHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-grey-400 hover:text-grey-100 mt-4 inline-block text-[12.5px] font-medium transition-colors"
          >
            {t("openProfile")}
          </a>
        ) : null}
      </div>
    </ModalShell>
  );
}
