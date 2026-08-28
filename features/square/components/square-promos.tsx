"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { timeAgo } from "@/lib/format";
import { formatCompact } from "@/lib/square/format-count";
import { authorName } from "@/lib/square/author";
import { squareLinks } from "@/lib/square/links";
import { fetchSuggestedProfiles } from "@/lib/api/market-square";
import { useSquareFeed } from "@/features/square/hooks/use-square-feed";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { PromoCard, PromoShell } from "@/features/square/components/promo-shell";
import { VerifiedChip } from "@/features/square/components/verified-chip";
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

function Tally({ count, label }: { count: number; label: string }) {
  return (
    <span className="text-[9.5px] text-white/70" aria-label={label}>
      {formatCompact(count)}
    </span>
  );
}

/** Posts people are talking about. */
export function SquarePostsPromo() {
  const t = useTranslations("square");
  const feed = useSquareFeed("for-you");

  const posts = useMemo(
    () =>
      (feed.data?.pages.flatMap((page) => page.items) ?? [])
        .flatMap((item) => (item.type === "post" && item.post ? [item.post] : []))
        .slice(0, 8),
    [feed.data]
  );

  if (posts.length === 0) return null;

  return (
    <PromoShell title={t("promoPostsTitle")} action={t("openSquare")}>
      {posts.map((post) => (
        <PromoCard key={post.id} href={squareLinks.post(post.id)} width="w-[285px]">
          <div className="flex items-center gap-2">
            <SquareAvatar
              src={post.author?.avatarUrl ?? null}
              seed={post.author?.id ?? post.id}
              size={26}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1">
                <span className="truncate text-[12px] font-bold text-white">
                  {authorName(post.author, t("someone"))}
                </span>
                <VerifiedChip verification={post.author?.verification} />
              </p>
              <p className="truncate text-[10.5px] text-white/50">
                {post.author ? `@${post.author.username} · ` : ""}
                {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>

          <p className="mt-2 line-clamp-3 text-[11px] leading-[15px] text-[#E5E5E5]">{post.text}</p>

          {/* The design holds the tallies in ONE soft pill, so they read as a
              single fact about the post rather than four competing numbers. */}
          <div className="mt-2.5 flex items-center gap-3 rounded-full bg-white/3 px-2.5 py-1.5">
            <Tally count={post.commentCount} label={t("commentsLabel")} />
            <Tally count={post.repostCount} label={t("repostsLabel")} />
            <Tally count={post.likeCount} label={t("likesLabel")} />
            <Tally count={post.viewCount} label={t("viewsLabel")} />
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
        <PromoCard key={stream.id} href={squareLinks.live(stream.id)} width="w-[285px]">
          <div className="flex items-start justify-between gap-2">
            <SquareAvatar
              src={stream.owner?.avatarUrl ?? null}
              seed={stream.owner?.id ?? stream.id}
              size={36}
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

          <p className="mt-2 line-clamp-2 text-[11.5px] leading-[15px] font-semibold text-[#E5E5E5]">
            {stream.title}
          </p>
          <p className="mt-1 truncate text-[10.5px] text-white/50">
            {stream.owner
              ? t("createdBy", { name: stream.owner.displayName })
              : t("createdInSquare")}
          </p>
          <p className="mt-0.5 text-[10.5px] text-white/50">
            {t("joinedCount", { count: stream.peakViewers })}
          </p>

          <span className="mt-2.5 block rounded-full bg-[#34C759] py-1.5 text-center text-[11.5px] font-bold text-black">
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
    queryFn: () => fetchSuggestedProfiles(8),
    enabled: squareHref !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const profiles = people.data ?? [];
  if (profiles.length === 0) return null;

  return (
    <PromoShell title={t("promoPeopleTitle")} action={t("openSquare")}>
      {profiles.map((profile) => (
        <div key={profile.id} className="bg-grey-800 w-[187px] shrink-0 snap-start rounded-lg p-3">
          {/* Centred stack, as the design draws it: portrait, name, handle,
              reach, action. The avatar is deliberately large — on a card whose
              whole job is "follow this person", the face IS the content. */}
          <div className="flex flex-col items-center text-center">
            <a
              href={squareLinks.profile(profile.username) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-[filter] hover:brightness-110"
            >
              <SquareAvatar src={profile.avatarUrl} seed={profile.id} size={84} />
            </a>

            <p className="mt-2.5 flex max-w-full items-center justify-center gap-1">
              <span className="truncate text-[12.5px] font-bold text-white">
                {profile.displayName || `@${profile.username}`}
              </span>
              <VerifiedChip verification={profile.verification} />
            </p>
            <p className="mt-0.5 max-w-full truncate text-[11px] text-white/50">
              @{profile.username}
            </p>
            <p className="mt-0.5 text-[10.5px] text-white/50">
              {t("followersCount", { count: profile.followerCount })}
            </p>

            {/* A real Follow, not a link to go and do it elsewhere — the write
                is already relayed, and a card that says Follow should follow. */}
            <div className="mt-2.5 w-full">
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
