"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { setFollow } from "@/lib/api/market-square";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { formatCompact } from "@/lib/square/format-count";
import { parseCashtags } from "@/lib/square/cashtags";
import { squareLinks } from "@/lib/square/links";
import { isVideoPost, postMediaList } from "@/lib/square/post-media";
import { marketSquareHref } from "@/lib/market-square";
import { useSquareEngage } from "@/features/square/hooks/use-square-engage";
import { useRecordView } from "@/features/square/hooks/use-record-view";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { SquareCommentsSheet } from "@/features/square/components/square-comments-sheet";
import { SquareMediaRail } from "@/features/square/components/square-media-rail";
import {
  OrgBadgeChip,
  RoleChip,
  VerifiedBadge,
} from "@/features/square/components/square-post-badges";
import {
  IconMsBookmark,
  IconMsChart,
  IconMsComment,
  IconMsGift,
  IconMsLike,
  IconMsMore,
  IconMsRepost,
  IconMsShare,
  IconMsWinkFace,
} from "@/features/square/components/square-post-icons";
import type { MarketSquareFeedPost } from "@/lib/api/market-square";
import type { TradableSymbol } from "@/lib/square/tradable";
import type { BuyPayload } from "@/lib/modal-types";

/** A tally in the pill: the glyph beside its count, the file's 24 and 12/16. */
function CountAction({
  label,
  count,
  active,
  activeClass = "text-[#fafafa]",
  hoverClass,
  onClick,
  children,
}: {
  label: string;
  count: number;
  active?: boolean;
  activeClass?: string;
  hoverClass?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center transition-colors",
          active ? activeClass : cn("text-[#9b9b9b]", hoverClass ?? "group-hover:text-[#fafafa]")
        )}
      >
        {children}
      </span>
      <span className={cn("tnum text-[12px] leading-4 text-white transition-colors", hoverClass)}>
        {formatCompact(count)}
      </span>
    </>
  );
  if (!onClick) {
    return (
      <span aria-label={label} className="group flex shrink-0 items-center gap-0.5 md:gap-[2px]">
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="group flex shrink-0 items-center gap-0.5 transition-colors md:gap-[2px]"
    >
      {body}
    </button>
  );
}

/** A glyph-only control at the row's end, opening the Square. */
function GlyphLink({
  href,
  label,
  hoverClass,
  children,
}: {
  href: string | null;
  label: string;
  hoverClass: string;
  children: React.ReactNode;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center text-[#d4d4d8] transition-colors",
        hoverClass
      )}
    >
      {children}
    </a>
  );
}

/** A tag or a handle in the caption, pointing at the Square. */
function TappableLink({ path, value }: { path: string; value: string }) {
  const href = marketSquareHref(path);
  if (!href) return <span>{value}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#c27aff] hover:underline"
    >
      {value}
    </a>
  );
}

/**
 * The Square's post card, carried over as Home's "Post For You" draws it
 * (market-square-frontend/features/feed/components/post-card.tsx, node
 * 496:13361, in its compact variant): the identity row with the seal, the
 * org lockup and the role chip, the tip, wink and follow controls at its
 * end, the rule, the media rail or the picture, the caption on two lines,
 * then the tallies pill and share, Arkmark and more at the foot.
 *
 * What each control does, split the way the ADR splits them: like, repost
 * and reply are relayed by this app, so they act here on the same hooks the
 * dashboard's card uses, and a $TICKER the app trades opens the buy sheet.
 * Tip, wink, share, Arkmark and more are the Square's: each opens the post
 * or the author there, wearing the file's own glyph.
 */
export function SquareFeedPostCard({
  post,
  markets,
  onOpenBuy,
  meId,
}: {
  post: MarketSquareFeedPost;
  markets: TradableSymbol[];
  onOpenBuy?: (buy: BuyPayload) => void;
  meId?: string;
}) {
  const t = useTranslations("square");
  const engage = useSquareEngage();
  const [commenting, setCommenting] = useState(false);
  const seenRef = useRecordView(post.id);
  const author = post.author;
  const isMe = meId !== undefined && author?.id === meId;
  const href = squareLinks.post(post.id);
  const authorHref = author ? squareLinks.profile(author.username) : null;
  // A profile without a display name still has its handle; a blank beside
  // the seal reads as a missing person, not a missing field.
  const authorName = author ? author.displayName?.trim() || author.username : "";
  const video = isVideoPost(post);
  const rail = postMediaList(post);

  // Seeded from the feed's viewer state, owned locally afterwards so the pill
  // answers at once; put back on failure rather than left lying.
  const [following, setFollowing] = useState(author?.isFollowing ?? false);
  const follow = useMutation({
    mutationFn: (next: boolean) => setFollow(author?.id ?? "", next),
    onMutate: (next) => {
      const previous = following;
      setFollowing(next);
      return { previous };
    },
    onError: (_error, _next, context) => setFollowing(context?.previous ?? false),
  });

  const bySymbol = useMemo(() => {
    const map = new Map<string, TradableSymbol>();
    for (const market of markets) map.set(market.symbol.toUpperCase(), market);
    return map;
  }, [markets]);
  const segments = useMemo(
    () =>
      onOpenBuy
        ? parseCashtags(post.text, bySymbol.keys())
        : [{ kind: "text" as const, value: post.text }],
    [post.text, bySymbol, onOpenBuy]
  );

  return (
    <article
      ref={seenRef}
      className="flex h-full flex-col rounded-[16.5px] border-[0.69px] border-white/10 bg-transparent p-3 shadow-[0_5.5px_6.87px_-4.12px_rgba(0,0,0,0.1),0_13.75px_17.19px_-3.44px_rgba(0,0,0,0.1)]"
    >
      <header className="flex items-center gap-3 md:h-[43.9px]">
        <span className="shrink-0 overflow-hidden rounded-[25%] ring-[1.8px] ring-white/20 ring-inset">
          <SquareAvatar
            src={author?.avatarUrl ?? null}
            seed={author?.id ?? post.authorId ?? post.id}
            name={author?.displayName}
            size={39}
            shape="squircle"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[7px]">
            {author ? (
              <>
                {authorHref ? (
                  <a
                    href={authorHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[14.8px] leading-[14.1px] font-bold text-white hover:underline"
                  >
                    {authorName}
                  </a>
                ) : (
                  <span className="truncate text-[14.8px] leading-[14.1px] font-bold text-white">
                    {authorName}
                  </span>
                )}
                <VerifiedBadge verification={author.verification} className="h-3.5 w-3.5" />
                <OrgBadgeChip orgBadge={author.orgBadge} bare />
                <RoleChip role={author.role} />
              </>
            ) : null}
          </div>
          <p className="mt-[2.8px] truncate text-[12.1px] leading-[16.2px] text-white/50">
            {author ? `@${author.username}  •  ` : ""}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("openPost")}
                className="hover:text-white/80 hover:underline"
              >
                {timeAgo(post.createdAt)}
              </a>
            ) : (
              timeAgo(post.createdAt)
            )}
          </p>
        </div>

        {/* Tip, wink, follow, 8 apart, each centred on the row. Tip and wink
            are the Square's; follow is relayed here. */}
        {author ? (
          <div className="flex shrink-0 items-center gap-2">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("tip")}
                title={t("tip")}
                className="ws-pressable flex h-[33.26px] w-[33.26px] shrink-0 items-center justify-center rounded-full border border-white/20 text-[#d4d4d8] transition-colors hover:bg-white/10 hover:text-white"
              >
                <IconMsGift className="h-6 w-6 shrink-0" />
              </a>
            ) : null}
            {authorHref ? (
              <a
                href={authorHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("winkAt", { name: authorName })}
                title={t("wink")}
                className="ws-pressable flex h-[33.26px] w-[33.26px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(195deg,#9f65fd_0%,#7e3beb_100%)] text-white transition-colors"
              >
                <IconMsWinkFace className="h-[22.15px] w-[22.15px] shrink-0" />
              </a>
            ) : null}
            {!isMe ? (
              <button
                type="button"
                aria-pressed={following}
                disabled={follow.isPending}
                onClick={() => follow.mutate(!following)}
                className={cn(
                  "ws-pressable flex h-[38px] w-[78px] shrink-0 items-center justify-center rounded-full border px-3 py-1 text-[12px] leading-4 transition-colors",
                  following
                    ? "border-white/20 bg-white/5 font-normal text-white/90 hover:bg-white/10"
                    : "border-transparent bg-[#d4d4d8] font-bold text-[#0a0a0a] hover:bg-white"
                )}
              >
                {following ? t("following") : t("follow")}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <hr className="my-[18px] border-t border-[#222222]" />

      {rail.length > 0 ? <SquareMediaRail items={rail} size="compact" href={href} /> : null}

      <div className="shrink-0 overflow-hidden">
        <p
          className={cn(
            "line-clamp-2 text-[13.8px] leading-[23px] break-words whitespace-pre-wrap text-white/90",
            rail.length > 1 ? "mt-[20.72px]" : rail.length === 1 && "mt-3"
          )}
        >
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
                aria-label={t("buySymbol", { symbol: segment.symbol })}
                className="ws-pressable mx-[1px] rounded-md bg-[#7e3beb]/20 px-1.5 py-[1px] align-baseline text-[13px] font-semibold text-[#c27aff] transition-colors hover:bg-[#7e3beb]/35"
              >
                {segment.value}
              </button>
            ) : segment.kind === "hashtag" ? (
              <TappableLink key={index} path={`t/${segment.tag}`} value={segment.value} />
            ) : segment.kind === "mention" ? (
              <TappableLink key={index} path={`u/${segment.handle}`} value={segment.value} />
            ) : segment.kind === "url" ? (
              <a
                key={index}
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={segment.href}
                className="text-[#c27aff] hover:underline"
              >
                {segment.label}
              </a>
            ) : (
              <span key={index}>{segment.value}</span>
            )
          )}
        </p>
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-3 pt-5 md:flex-row md:items-end md:gap-6">
        <div className="flex items-center justify-between gap-3 md:contents">
          <div className="flex h-10 shrink-0 items-center gap-3 rounded-full bg-white/[0.03] px-2 md:gap-[17px]">
            <CountAction
              label={t("commentsLabel")}
              count={post.commentCount}
              hoverClass="group-hover:text-[#1d9bf0]"
              onClick={() => setCommenting(true)}
            >
              <IconMsComment className="h-6 w-6" />
            </CountAction>
            <CountAction
              label={post.repostedByMe ? t("undoRepost") : t("repostsLabel")}
              count={post.repostCount}
              active={post.repostedByMe}
              activeClass="text-up"
              hoverClass="group-hover:text-up"
              onClick={() =>
                engage.mutate({ postId: post.id, action: "repost", on: !post.repostedByMe })
              }
            >
              <IconMsRepost className="h-[18px] w-[18px]" />
            </CountAction>
            <CountAction
              label={post.likedByMe ? t("unlike") : t("like")}
              count={post.likeCount}
              active={post.likedByMe}
              activeClass="text-[#e84a4a]"
              hoverClass="group-hover:text-[#e84a4a]"
              onClick={() =>
                engage.mutate({ postId: post.id, action: "like", on: !post.likedByMe })
              }
            >
              <IconMsLike className="h-6 w-6" filled={post.likedByMe} />
            </CountAction>
            <CountAction
              label={
                video
                  ? t("playsCount", { count: post.viewCount })
                  : t("viewsCount", { count: post.viewCount })
              }
              count={post.viewCount}
            >
              <IconMsChart className="h-6 w-6" />
            </CountAction>
          </div>

          <div className="flex shrink-0 items-center gap-3 md:order-3 md:ml-auto md:gap-[17px]">
            <div className="flex items-center gap-3">
              <GlyphLink href={href} label={t("shareLabel")} hoverClass="hover:text-[#1d9bf0]">
                <IconMsShare className="h-6 w-6" />
              </GlyphLink>
              <span className="group flex items-center gap-0.5 md:gap-[2px]">
                <GlyphLink href={href} label={t("arkmark")} hoverClass="hover:text-[#9f65fd]">
                  <IconMsBookmark className="h-6 w-6" />
                </GlyphLink>
                {post.bookmarkCount !== undefined ? (
                  <span className="tnum text-[12px] leading-4 text-white">
                    {formatCompact(post.bookmarkCount)}
                  </span>
                ) : null}
              </span>
            </div>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("moreOptions")}
                className="text-grey-100 flex h-[38.37px] w-[38.37px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#111111_0%,#171717_55%,#1c1c1c_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09),inset_-1px_-1px_2px_rgba(255,255,255,0.10)] transition-colors hover:text-[#9f65fd]"
              >
                <IconMsMore className="h-6 w-6" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <SquareCommentsSheet post={post} open={commenting} onClose={() => setCommenting(false)} />
    </article>
  );
}
