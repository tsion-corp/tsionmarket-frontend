"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  RAIL_SIZES,
  isVideoUrl,
  railDotWidth,
  railIndexAt,
  type PostMediaLike,
  type RailSize,
} from "@/lib/square/post-media";
import { IconPlay } from "@/features/square/components/square-home-icons";

/**
 * A post's pictures on a sideways rail, the Square's own carried over
 * (market-square-frontend/features/feed/components/media-rail.tsx, node
 * 1029:22591): the pager dots above, then the tiles at the file's size,
 * scroll-snapped. A tile opens the post in the Square, where its viewer is;
 * a video tile is a poster with the play mark, as it is there.
 */
export function SquareMediaRail({
  items,
  size = "post",
  href,
}: {
  items: PostMediaLike[];
  size?: RailSize;
  /** The post in the Square, which a tile opens. */
  href: string | null;
}) {
  const t = useTranslations("square");
  const g = RAIL_SIZES[size];
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    setActive(
      railIndexAt(node.scrollLeft, node.scrollWidth - node.clientWidth, items.length, size)
    );
  };

  return (
    <div className={cn(size === "compact" && "flex min-h-0 flex-1 flex-col")}>
      <div className="flex items-center" style={{ gap: g.dotGap }} aria-hidden>
        {items.map((item, index) => (
          <span
            key={`${item.url}-${index}`}
            className={cn(
              "rounded-[15.59px] transition-[width,background-color] duration-200 motion-reduce:transition-none",
              index === active ? "bg-[#9F5AFF]" : "bg-[#D9D9D9]"
            )}
            style={{ width: railDotWidth(index, active, size), height: g.dotHeight }}
          />
        ))}
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        aria-label={t("photosCount", { count: items.length })}
        style={{ gap: g.gap, marginTop: size === "compact" ? 10.7 : 20 }}
        className={cn(
          "flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden",
          size === "compact" && "min-h-0 flex-1"
        )}
      >
        {items.map((item, index) => {
          const video = item.kind === "video" || isVideoUrl(item.url);
          const poster = item.thumbnailUrl ?? null;
          const tile = (
            <>
              {video ? (
                <span className="relative block h-full w-full">
                  {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element -- author-supplied host is unknown
                    <img
                      src={poster}
                      alt=""
                      decoding="async"
                      loading={index > 2 ? "lazy" : undefined}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="block h-full w-full bg-white/[0.06]" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[rgba(20,20,22,0.7)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[16px]">
                      <IconPlay className="h-4 w-4" />
                    </span>
                  </span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- author-supplied host is unknown
                <img
                  src={item.url}
                  alt=""
                  decoding="async"
                  loading={index > 2 ? "lazy" : undefined}
                  className="h-full w-full object-cover"
                />
              )}
            </>
          );
          const style = {
            width: g.tile,
            ...(size === "compact" ? {} : { height: g.tileHeight }),
            borderRadius: g.radius,
          };
          const className = cn(
            "ws-pressable block shrink-0 snap-start overflow-hidden bg-white/[0.04]",
            size === "compact" && "h-full"
          );
          return href ? (
            <a
              key={`${item.url}-${index}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                video
                  ? t("videoOf", { index: index + 1, count: items.length })
                  : t("photoOf", { index: index + 1, count: items.length })
              }
              style={style}
              className={className}
            >
              {tile}
            </a>
          ) : (
            <span key={`${item.url}-${index}`} style={style} className={className}>
              {tile}
            </span>
          );
        })}
      </div>
    </div>
  );
}
