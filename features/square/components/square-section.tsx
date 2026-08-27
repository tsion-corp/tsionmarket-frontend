"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { squareLinks } from "@/lib/square/links";
import { fetchSquareTopics, type SquareLane } from "@/lib/api/market-square";
import { useSquareFeed } from "@/features/square/hooks/use-square-feed";
import { SquareLiveStrip } from "@/features/square/components/square-live-strip";
import { SquarePostCard } from "@/features/square/components/square-post-card";
import { SquareRail } from "@/features/square/components/square-rail";
import { SquareTabs, type SquareTab } from "@/features/square/components/square-tabs";
import { SquareComposer } from "@/components/share/square-composer";
import type { TradableSymbol } from "@/lib/square/tradable";
import type { BuyPayload } from "@/lib/modal-types";

/** Lane ids are prefixed so a lane and a topic can never collide. */
const LANE_FOR_YOU = "lane:for-you";
const LANE_FOLLOWING = "lane:following";

/**
 * Market Square, met while scrolling the dashboard.
 *
 * The PRD makes the square the platform's connective tissue, but a link in the
 * nav is something you have to already want. Trading surfaces that feel social
 * consolidate attention into ONE feed inside the app people are already in,
 * rather than splitting it across products — so the square is found here by
 * scrolling, not by deciding to leave.
 *
 * ── Fitting the dashboard ───────────────────────────────────────────────────
 * This sits in `ws-card`, the same raised panel every other section on the
 * page uses. Without it the feed floated on the page background while the
 * tables above sat on a surface, which is what made the section read as pasted
 * in. The group is LEFT-aligned, not centred, so the feed's left edge lines up
 * with every table above it.
 *
 * ── Width ───────────────────────────────────────────────────────────────────
 * A feed reads at roughly 600px however wide the monitor is. Centring one
 * column in a 1520px shell leaves two dead gutters; fanning it into a grid
 * destroys the stream. So: feed at reading width, secondary content in a rail
 * beside it, and the rail folded back into the single column below `lg`.
 */
export function SquareSection({
  onOpenBuy,
  markets = [],
}: {
  onOpenBuy?: (buy: BuyPayload) => void;
  /** Supplied by the dashboard, which owns both this and the trade slice. */
  markets?: TradableSymbol[];
}) {
  const t = useTranslations("square");
  const [tab, setTab] = useState<string>(LANE_FOR_YOU);
  const squareHref = squareLinks.home();
  const [composing, setComposing] = useState(false);

  // A topic tab filters the for-you lane; the lane tabs carry no topic.
  const lane: SquareLane = tab === LANE_FOLLOWING ? "following" : "for-you";
  const topics = useMemo(
    () => (tab.startsWith("lane:") ? undefined : [tab.replace(/^topic:/, "")]),
    [tab]
  );

  const feed = useSquareFeed(lane, topics);

  const topicQuery = useQuery({
    queryKey: ["market-square", "topics"],
    queryFn: fetchSquareTopics,
    enabled: squareHref !== null,
    // The vocabulary changes about as often as a deploy does.
    staleTime: 30 * 60_000,
  });

  const tabs = useMemo<SquareTab[]>(
    () => [
      { id: LANE_FOR_YOU, label: t("laneForYou") },
      { id: LANE_FOLLOWING, label: t("laneFollowing") },
      ...(topicQuery.data ?? []).map((topic) => ({
        id: `topic:${topic.key}`,
        label: topic.label,
      })),
    ],
    [topicQuery.data, t]
  );

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const posts = useMemo(
    () => items.flatMap((item) => (item.type === "post" && item.post ? [item.post] : [])),
    [items]
  );
  const streams = useMemo(
    () =>
      items.flatMap((item) =>
        item.type === "stream" && item.stream && item.stream.status === "live" ? [item.stream] : []
      ),
    [items]
  );

  // Without the square's URL there is no upstream to read, so the section does
  // not exist rather than sitting under the markets as a permanent error.
  if (!squareHref) return null;

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>{t("title")}</Eyebrow>

      <div className="ws-card mt-4 flex gap-8 p-4 sm:p-5 lg:p-6">
        <div className="w-full min-w-0 lg:max-w-[680px]">
          <div className="border-grey-800 border-b">
            <SquareTabs tabs={tabs} active={tab} onSelect={setTab} label={t("tabsLabel")} />
          </div>

          <div className="mt-4">
            {feed.isPending ? <AsyncLoading label={t("loading")} rows={3} /> : null}

            {feed.isError ? (
              <AsyncError
                error={feed.error}
                subject={t("subject")}
                unconfiguredDetail={t("unconfigured")}
                onRetry={() => void feed.refetch()}
              />
            ) : null}

            {!feed.isPending && !feed.isError ? (
              <>
                {/* Below lg the rail is not rendered, so live rooms appear here
                    instead of stacking somewhere nobody scrolls. */}
                <div className="lg:hidden">
                  <SquareLiveStrip streams={streams} />
                </div>

                {posts.length === 0 ? (
                  // A first-run surface, not an apology. An empty feed is the
                  // most common state on a new deployment, and "nothing here"
                  // with no way forward teaches people the section is broken.
                  <div className="px-4 py-12 text-center">
                    <p className="text-[14px] font-medium text-white">
                      {tab === LANE_FOLLOWING ? t("emptyFollowing") : t("empty")}
                    </p>
                    <p className="text-grey-500 mx-auto mt-1 max-w-[320px] text-[12.5px] leading-[18px]">
                      {tab === LANE_FOLLOWING ? t("emptyFollowingHint") : t("emptyHint")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setComposing(true)}
                      className="bg-accent text-ink mt-4 inline-flex h-9 items-center rounded-full px-4 text-[12.5px] font-semibold transition-[filter] hover:brightness-110"
                    >
                      {t("compose")}
                    </button>
                  </div>
                ) : (
                  <div>
                    {posts.map((post) => (
                      <SquarePostCard
                        key={post.id}
                        post={post}
                        markets={markets}
                        onOpenBuy={onOpenBuy}
                      />
                    ))}
                  </div>
                )}

                {feed.hasNextPage ? (
                  <div className="mt-4 flex justify-center">
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
              </>
            ) : null}
          </div>
        </div>

        <SquareRail streams={streams} />
      </div>

      <SquareComposer open={composing} onClose={() => setComposing(false)} markets={markets} />
    </div>
  );
}
