"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { timeAgo } from "@/lib/format";
import { formatCompact } from "@/lib/square/format-count";
import { authorName } from "@/lib/square/author";
import { distinctByAuthor } from "@/lib/square/distinct-authors";
import { withFeaturedFirst } from "@/lib/square/featured";
import { squareLinks } from "@/lib/square/links";
import { fetchSuggestedProfiles } from "@/lib/api/market-square";
import { useSquareFeed } from "@/features/square/hooks/use-square-feed";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { PromoCard, PromoShell } from "@/features/square/components/promo-shell";
import { VerifiedChip } from "@/features/square/components/verified-chip";
import {
  IconComment,
  IconLike,
  IconRepost,
  IconViews,
} from "@/features/square/components/square-icons";
import { FollowButton } from "@/features/square/components/follow-button";

/**
 * Market Square blocks for the gaps between dashboard sections.
 *
 * They exist to recruit: someone reading their portfolio meets a little of the
 * square on the way down rather than having to reach the very bottom of the
 * page to learn it exists. Each is ONE horizontal rail, so it costs a fixed
 * slice of height however much it has to show.
 *
 * Every block returns NULL when it has nothing worth showing. A recruitment
 * block advertising an empty room argues against visiting, so the dashboard
 * closes back up around it rather than rendering an empty shelf.
 */

/**
 * One tally in the engagement pill: the glyph, then the count.
 *
 * The icon is not decoration — a row of four bare numbers says nothing about
 * WHICH four, and the first version of this shipped exactly that. The design
 * pairs each count with its glyph for the same reason every feed does.
 */
/**
 * One tally in the engagement pill, at the design's own proportions.
 *
 * The design pairs a 15.44px glyph with 7.72px text and a 1.29px gap inside a
 * FIXED 31.53px cell — a tight, deliberately small unit. Rounded to whole
 * pixels here (16 / 8 / 1px) because sub-pixel type renders blurry, but the
 * relationship is kept: the glyph is twice the type, and they sit almost
 * touching rather than spaced apart.
 */
function Tally({
  count,
  label,
  children,
}: {
  count: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-[1px] text-white" aria-label={label}>
      {children}
      <span className="tnum text-[8px] leading-none">{formatCompact(count)}</span>
    </span>
  );
}

/** The design's 15.44px glyph, rounded to a whole pixel. */
const GLYPH = "h-4 w-4 shrink-0";

/** Posts people are talking about. */
export function SquarePostsPromo() {
  const t = useTranslations("square");
  const feed = useSquareFeed("for-you");

  const posts = useMemo(() => {
    const all = (feed.data?.pages.flatMap((page) => page.items) ?? []).flatMap((item) =>
      item.type === "post" && item.post ? [item.post] : []
    );
    // ONE post per author, so the rail shows a room rather than one person's
    // timeline. See lib/square/distinct-authors.ts for the fallback.
    return distinctByAuthor(all, (post) => post.author?.id ?? post.authorId).slice(0, 8);
  }, [feed.data]);

  if (posts.length === 0) return null;

  return (
    <PromoShell title={t("promoPostsTitle")} action={t("openSquare")}>
      {posts.map((post) => (
        <PromoCard key={post.id} href={squareLinks.post(post.id)} width="w-[320px]">
          <div className="flex items-center gap-2">
            <SquareAvatar
              src={post.author?.avatarUrl ?? null}
              seed={post.author?.id ?? post.id}
              name={post.author?.displayName}
              size={34}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1">
                <span className="truncate text-[13.5px] font-bold text-white">
                  {authorName(post.author, t("someone"))}
                </span>
                <VerifiedChip verification={post.author?.verification} />
              </p>
              <p className="truncate text-[11.5px] text-white/50">
                {post.author ? `@${post.author.username} · ` : ""}
                {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>

          {/* Clamped here too, but with no expand control: this card is a
              LINK into the square, so the whole post is one tap away already.
              A "show more" that expanded a promo card would grow the rail's
              row height and shove the cards beside it out of alignment. */}
          {/* Leading is 1.6, not the 1.44 this started at, because CLAMPED
              text hides overflow — and an emoji's glyph box is taller than a
              Latin line box, so a tight leading slices the tops and bottoms
              off 🚀 while leaving the words untouched. The extra headroom
              costs one line of density and is the difference between emoji
              rendering and emoji being visibly cut. */}
          <p className="mt-2.5 line-clamp-4 text-[12.5px] leading-[20px] text-[#E5E5E5]">
            {post.text}
          </p>

          {/* Pinned to the card's foot, so every pill in the rail sits on one
              line however long the caption above it runs. */}

          {/* The design holds the tallies in ONE soft pill, so they read as a
              single fact about the post rather than four competing numbers. */}
          {/* The pill as the design draws it: a white-3% ground with a full
              radius, hugging its contents rather than spanning the card, and
              CENTRED in it. Two separate decisions — `w-fit` makes it hug,
              `mx-auto` puts it in the middle. Left-aligned it read as a
              toolbar bolted to the card's edge; centred it reads as one quiet
              fact about the post, which is what it is. */}
          <div className="mx-auto mt-auto flex w-fit items-center justify-center gap-[11px] rounded-full bg-white/3 px-[5px] py-[5px]">
            <Tally count={post.commentCount} label={t("commentsLabel")}>
              <IconComment className={GLYPH} />
            </Tally>
            <Tally count={post.repostCount} label={t("repostsLabel")}>
              <IconRepost className={GLYPH} />
            </Tally>
            <Tally count={post.likeCount} label={t("likesLabel")}>
              <IconLike className={GLYPH} />
            </Tally>
            <Tally count={post.viewCount} label={t("viewsLabel")}>
              <IconViews className={GLYPH} />
            </Tally>
          </div>
        </PromoCard>
      ))}
    </PromoShell>
  );
}

/** Rooms that are live right now. */
export function SquareLivePromo() {
  const t = useTranslations("square");
  const feed = useSquareFeed("live");

  const streams = useMemo(
    () =>
      (feed.data?.pages.flatMap((page) => page.items) ?? [])
        .flatMap((item) =>
          item.type === "stream" && item.stream && item.stream.status === "live"
            ? [item.stream]
            : []
        )
        .slice(0, 8),
    [feed.data]
  );

  if (streams.length === 0) return null;

  return (
    <PromoShell title={t("promoLiveTitle")} action={t("openSquare")}>
      {streams.map((stream) => (
        <PromoCard key={stream.id} href={squareLinks.live(stream.id)} width="w-[320px]">
          <div className="flex items-start justify-between gap-2">
            <SquareAvatar
              src={stream.owner?.avatarUrl ?? null}
              seed={stream.owner?.id ?? stream.id}
              name={stream.owner?.displayName}
              size={42}
            />
            {/* Live is the one thing here that must be unmistakable, so it
                keeps the square's red and a pulse — motion-safe, so it holds
                still for anyone who asked for that. */}
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#FF0B0B] px-2 py-1">
              <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
              <span className="text-[9.5px] font-bold tracking-wide text-white uppercase">
                {t("liveNow")}
              </span>
            </span>
          </div>

          {/* Same reason as the post body: stream titles carry emoji too. */}
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-[21px] font-semibold text-[#E5E5E5]">
            {stream.title}
          </p>
          <p className="mt-1.5 truncate text-[11.5px] text-white/50">
            {stream.owner
              ? t("createdBy", { name: stream.owner.displayName })
              : t("createdInSquare")}
          </p>
          <p className="mt-0.5 text-[11.5px] text-white/50">
            {t("joinedCount", { count: stream.peakViewers })}
          </p>

          <span className="mt-auto block rounded-full bg-[#34C759] py-2 text-center text-[12.5px] font-bold text-black">
            {t("joinLive")}
          </span>
        </PromoCard>
      ))}
    </PromoShell>
  );
}

/** People worth following. */
export function SquarePeoplePromo() {
  const t = useTranslations("square");
  const squareHref = squareLinks.home();

  const people = useQuery({
    queryKey: ["market-square", "suggested-profiles"],
    // Fetched WIDER than the rail shows, because a pinned profile may not be
    // in the top eight by followers — pinning cannot promote someone who was
    // never fetched.
    queryFn: () => fetchSuggestedProfiles(30),
    enabled: squareHref !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const profiles = useMemo(
    () => withFeaturedFirst(people.data ?? [], (profile) => profile.username).slice(0, 8),
    [people.data]
  );
  if (profiles.length === 0) return null;

  return (
    <PromoShell title={t("promoPeopleTitle")} action={t("openSquare")}>
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="bg-grey-800 flex h-[232px] w-[196px] shrink-0 snap-start flex-col rounded-lg p-4"
        >
          {/* Centred stack, as the design draws it: portrait, name, handle,
              reach, action. The avatar is deliberately large — on a card whose
              whole job is "follow this person", the face IS the content. */}
          <div className="flex flex-1 flex-col items-center text-center">
            <a
              href={squareLinks.profile(profile.username) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-[filter] hover:brightness-110"
            >
              <SquareAvatar
                src={profile.avatarUrl}
                seed={profile.id}
                name={profile.displayName}
                size={96}
              />
            </a>

            <p className="mt-2.5 flex max-w-full items-center justify-center gap-1">
              <span className="truncate text-[13.5px] font-bold text-white">
                {profile.displayName || `@${profile.username}`}
              </span>
              <VerifiedChip verification={profile.verification} />
            </p>
            <p className="mt-0.5 max-w-full truncate text-[12px] text-white/50">
              @{profile.username}
            </p>
            <p className="mt-1 text-[11.5px] text-white/50">
              {t("followersCount", { count: profile.followerCount })}
            </p>

            {/* A real Follow, not a link to go and do it elsewhere — the write
                is already relayed, and a card that says Follow should follow. */}
            <div className="mt-auto w-full pt-2.5">
              <FollowButton
                author={{
                  id: profile.id,
                  username: profile.username,
                  displayName: profile.displayName,
                  avatarUrl: profile.avatarUrl,
                  verification: profile.verification,
                  role: profile.role,
                  isFollowing: profile.isFollowing,
                }}
                block
              />
            </div>
          </div>
        </div>
      ))}
    </PromoShell>
  );
}
