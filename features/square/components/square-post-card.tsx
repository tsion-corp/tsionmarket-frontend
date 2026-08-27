"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { timeAgo } from "@/lib/format";
import { squareLinks } from "@/lib/square/links";
import { parseCashtags } from "@/lib/square/cashtags";
import { formatCompact } from "@/lib/square/format-count";
import { useSquareEngage } from "@/features/square/hooks/use-square-engage";
import { useRecordView } from "@/features/square/hooks/use-record-view";
import { SquareComments } from "@/features/square/components/square-comments";
import { CoinChip } from "@/features/square/components/coin-chip";
import { FollowButton } from "@/features/square/components/follow-button";
import { authorName } from "@/lib/square/author";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import type { MarketSquareFeedPost } from "@/lib/api/market-square";
import type { TradableSymbol } from "@/lib/square/tradable";
import type { BuyPayload } from "@/lib/modal-types";

/** The platform's tick. Small, and only ever drawn for a verified author. */
function VerifiedTick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="M12 2 14.3 4.2 17.5 3.8 18.6 6.8 21.5 8.1 21 11.2 23 13.6 21 16 21.5 19.1 18.6 20.4 17.5 23.4 14.3 23 12 25.2 9.7 23 6.5 23.4 5.4 20.4 2.5 19.1 3 16 1 13.6 3 11.2 2.5 8.1 5.4 6.8 6.5 3.8 9.7 4.2Z"
        fill="currentColor"
        transform="translate(0 -1.6) scale(1 0.92)"
      />
      <path
        d="m8.6 12.4 2.3 2.3 4.5-4.6"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One control in the action row.
 *
 * Rendered as a BUTTON when there is something to do and a plain tally when
 * there is not — views are a fact about the post, not an action on it, so they
 * must not look pressable. Everything shares one shape so the row reads as a
 * row rather than as three buttons and a number.
 */
function Action({
  label,
  count,
  active,
  activeClass,
  onClick,
  disabled,
  children,
}: {
  label: string;
  count: number;
  active?: boolean;
  activeClass?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <span className="h-[15px] w-[15px]" aria-hidden>
        {children}
      </span>
      <span className="tnum text-[12px]">{formatCompact(count)}</span>
    </>
  );
  const tone = active ? (activeClass ?? "text-white") : "text-grey-500";

  if (!onClick) {
    return (
      <span className={`flex items-center gap-1.5 ${tone}`} aria-label={label}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full transition-colors disabled:opacity-60 ${
        active ? tone : "text-grey-500 hover:text-grey-200"
      }`}
    >
      {body}
    </button>
  );
}

/**
 * One post from the square.
 *
 * Two decisions carry this card:
 *
 * 1. **A $TICKER the app can actually trade becomes a chip that opens the buy
 *    sheet.** This is the only thing Ark can offer that the square itself
 *    cannot, and it turns reading someone's take into acting on it without
 *    leaving the page. Unlisted symbols stay plain text — see `cashtags.ts`.
 * 2. **Everything else is read-only and opens the square.** Ark's proxy relays
 *    the feed, not likes or comments; a heart that cannot beat is worse than a
 *    count that only informs. So engagement is shown, never offered.
 *
 * The whole card is NOT one big link, because the cashtag chips inside it are
 * their own actions — nesting those in an anchor would make a tap ambiguous.
 * The author and the timestamp carry the link instead.
 */
export function SquarePostCard({
  post,
  markets,
  onOpenBuy,
  meId,
}: {
  post: MarketSquareFeedPost;
  /** The reader's own square id, so the card never offers self-follow. */
  meId?: string;
  markets: TradableSymbol[];
  onOpenBuy?: (buy: BuyPayload) => void;
}) {
  const t = useTranslations("square");
  const engage = useSquareEngage();
  const [commenting, setCommenting] = useState(false);
  const seenRef = useRecordView(post.id);
  const author = post.author;
  // Never offer to follow yourself.
  const isMe = meId !== undefined && author?.id === meId;
  const href = squareLinks.post(post.id);

  const bySymbol = useMemo(() => {
    const map = new Map<string, TradableSymbol>();
    for (const market of markets) map.set(market.symbol.toUpperCase(), market);
    return map;
  }, [markets]);

  // Only offer a chip when there is somewhere for it to go.
  const segments = useMemo(
    () =>
      onOpenBuy
        ? parseCashtags(post.text, bySymbol.keys())
        : [{ kind: "text" as const, value: post.text }],
    [post.text, bySymbol, onOpenBuy]
  );

  // Every tradeable coin the post names, in the order it names them, once each.
  // The chips answer the question the sentence raises — "is it moving?" —
  // without the reader leaving the post to go and look.
  const mentioned = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof markets = [];
    for (const segment of segments) {
      if (segment.kind !== "cashtag" || seen.has(segment.symbol)) continue;
      const market = bySymbol.get(segment.symbol);
      if (!market) continue;
      seen.add(segment.symbol);
      out.push(market);
    }
    return out;
  }, [segments, bySymbol]);

  const isVideo =
    post.mediaKind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(post.mediaUrl ?? "");
  const poster = post.thumbnailUrl ?? (isVideo ? null : post.mediaUrl);

  return (
    <article ref={seenRef} className="border-grey-800 border-b px-1 py-4 first:pt-0">
      <header className="flex items-center gap-2.5">
        <SquareAvatar src={author?.avatarUrl ?? null} seed={author?.id ?? post.id} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1">
            <span className="truncate text-[14px] leading-5 font-semibold text-white">
              {authorName(author, t("someone"))}
            </span>
            {author?.verification === "verified" ? (
              <VerifiedTick className="text-accent h-[14px] w-[14px] shrink-0" />
            ) : null}
          </p>
          <p className="text-grey-500 truncate text-[12px] leading-4">
            {author ? `@${author.username} · ` : ""}
            {timeAgo(post.createdAt)}
          </p>
        </div>
        {author && !isMe ? <FollowButton author={author} /> : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-grey-600 hover:text-grey-300 shrink-0 p-1 transition-colors"
            aria-label={t("openPost")}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
              <path
                d="M7 17 17 7M9 7h8v8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : null}
      </header>

      {post.text ? (
        <p className="mt-2.5 text-[14px] leading-[22px] whitespace-pre-wrap text-white/85">
          {segments.map((segment, index) =>
            segment.kind === "cashtag" ? (
              <button
                key={index}
                type="button"
                onClick={() => {
                  const market = bySymbol.get(segment.symbol);
                  if (market && onOpenBuy) {
                    onOpenBuy({
                      symbol: market.symbol,
                      name: market.name,
                      priceUsd: market.priceUsd,
                      logo: market.logo,
                    });
                  }
                }}
                className="bg-grey-800/70 hover:bg-grey-700 text-accent mx-[1px] rounded-md px-1.5 py-[1px] text-[13px] font-semibold transition-colors"
              >
                {segment.value}
              </button>
            ) : (
              <span key={index}>{segment.value}</span>
            )
          )}
        </p>
      ) : null}

      {mentioned.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {mentioned.map((market) => (
            <CoinChip
              key={market.symbol}
              market={market}
              onOpen={
                onOpenBuy
                  ? () =>
                      onOpenBuy({
                        symbol: market.symbol,
                        name: market.name,
                        priceUsd: market.priceUsd,
                        logo: market.logo,
                      })
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}

      {/* The author's card for a deep link — a trade, a result, a position.
          The square cannot resolve what those ARE, so these are the author's
          words: rendered as a quoted claim, never with platform authority. */}
      {post.preview ? (
        <a
          href={href ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="border-grey-800 bg-grey-900 hover:border-grey-700 mt-3 flex items-center gap-3 rounded-xl border p-3 transition-colors"
        >
          {post.preview.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- author-supplied host is unknown
            <img
              src={post.preview.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">
              {post.preview.title}
            </span>
            {post.preview.subtitle ? (
              <span className="text-grey-500 block truncate text-[12px]">
                {post.preview.subtitle}
              </span>
            ) : null}
          </span>
        </a>
      ) : null}

      {poster ? (
        <a
          href={href ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="border-grey-800 relative mt-3 block overflow-hidden rounded-xl border bg-black/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- author-supplied host is unknown */}
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            // CONTAIN, not cover: a screenshot of a chart or a P&L is the
            // whole point of the post, and cropping it to fill a box slices
            // exactly the numbers someone posted it for. Letterboxing on a
            // neutral ground looks deliberate; a beheaded chart looks broken.
            className="max-h-[420px] w-full bg-black/40 object-contain"
          />
          {isVideo ? (
            <span className="absolute inset-0 grid place-items-center bg-black/25">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-black/60 backdrop-blur-sm">
                <svg viewBox="0 0 24 24" aria-hidden className="ml-0.5 h-5 w-5 text-white">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
              </span>
            </span>
          ) : null}
        </a>
      ) : null}

      <footer className="mt-3 flex items-center gap-5">
        {/* Comment, repost, like, views — the ordering people already read
            from every other feed, so the row needs no learning. Views sit
            last and are NOT a button: they are a fact about the post, not
            something you can do to it. */}
        <Action
          label={t("commentsLabel")}
          count={post.commentCount}
          onClick={() => setCommenting(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full">
            <path
              d="M20 12a7 7 0 0 1-7 7H7l-3 2.5V12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </Action>

        <Action
          label={t("repostsLabel")}
          count={post.repostCount}
          active={post.repostedByMe}
          activeClass="text-up"
          disabled={engage.isPending}
          onClick={() =>
            engage.mutate({ postId: post.id, action: "repost", on: !post.repostedByMe })
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full">
            <path
              d="M4 8h11a4 4 0 0 1 4 4M4 8l3-3M4 8l3 3m13 5H9a4 4 0 0 1-4-4m15 4-3 3m3-3-3-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Action>

        <Action
          label={t("likesLabel")}
          count={post.likeCount}
          active={post.likedByMe}
          activeClass="text-down"
          disabled={engage.isPending}
          onClick={() => engage.mutate({ postId: post.id, action: "like", on: !post.likedByMe })}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full">
            <path
              d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z"
              fill={post.likedByMe ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </Action>

        <Action label={t("viewsLabel")} count={post.viewCount}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full">
            <path
              d="M4 20V10m5 10V4m5 16v-7m5 7V8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </Action>
      </footer>

      {commenting ? <SquareComments post={post} onClose={() => setCommenting(false)} /> : null}
    </article>
  );
}
