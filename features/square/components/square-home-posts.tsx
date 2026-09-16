"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { useSquareFeed } from "@/features/square/hooks/use-square-feed";
import {
  SquareHomeRail,
  SquareHomeSection,
} from "@/features/square/components/square-home-section";
import { SquareFeedPostCard } from "@/features/square/components/square-feed-post-card";
import type { TradableSymbol } from "@/lib/square/tradable";
import type { BuyPayload } from "@/lib/modal-types";

/**
 * "Post For You": Home's for-you lane, laid sideways the way Home lays it,
 * one 467-by-367 card per post, on the Square's own post card. Like, repost,
 * reply and follow stay in the app, and a $TICKER the app trades opens the
 * buy sheet; the rest of the card opens the post in the Square. The whole
 * timeline is where "View more" goes.
 *
 * The rail grows to the right when asked to, with the same "Show more" the
 * dashboard section uses at its end, never a scroll listener.
 */
export function SquareHomePosts({
  markets,
  onOpenBuy,
  meId,
}: {
  markets: TradableSymbol[];
  onOpenBuy?: (buy: BuyPayload) => void;
  meId?: string;
}) {
  const t = useTranslations("square");
  const feed = useSquareFeed("for-you");
  const posts = useMemo(
    () =>
      (feed.data?.pages.flatMap((page) => page.items) ?? []).flatMap((item) =>
        item.type === "post" && item.post ? [item.post] : []
      ),
    [feed.data]
  );

  return (
    <SquareHomeSection
      id="square-post-for-you"
      lead={t("homePosts")}
      viewMore={{ label: t("viewMore"), href: squareLinks.feed() }}
      loading={feed.isPending}
      loadingLabel={t("loading")}
      error={feed.error}
      errorSubject={t("subject")}
      unconfiguredDetail={t("unconfigured")}
      onRetry={() => void feed.refetch()}
      empty={posts.length === 0}
    >
      <SquareHomeRail gap={17.37} align="end">
        {posts.map((post) => (
          <div key={post.id} className="h-[367px] w-[467px] max-w-[85vw] shrink-0 snap-start">
            <SquareFeedPostCard post={post} markets={markets} onOpenBuy={onOpenBuy} meId={meId} />
          </div>
        ))}
        {feed.hasNextPage ? (
          <div className="flex h-[367px] shrink-0 items-center px-2">
            <button
              type="button"
              onClick={() => void feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
              className="border-grey-800 hover:bg-grey-900 text-grey-300 rounded-full border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {feed.isFetchingNextPage ? t("loadingMore") : t("loadMore")}
            </button>
          </div>
        ) : null}
      </SquareHomeRail>
    </SquareHomeSection>
  );
}
