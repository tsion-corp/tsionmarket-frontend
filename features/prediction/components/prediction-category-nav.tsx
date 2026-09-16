"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PREDICTION_CATEGORIES,
  predictionCategoryHref,
  type PredictionCategory,
} from "@/features/prediction/categories";
import type { DiscoveryMarketSort } from "@/features/prediction/markets/api";

export type PredictionFeedFilter = "trending" | "breaking" | "new";

const FEED_FILTERS: ReadonlyArray<{
  key: PredictionFeedFilter;
  label: string;
  sort: DiscoveryMarketSort;
  href: string;
}> = [
  { key: "trending", label: "Trending", sort: "volume_24h", href: "/prediction" },
  {
    key: "breaking",
    label: "Breaking",
    sort: "ending_soon",
    href: "/prediction/markets?category=trending&sort=ending_soon",
  },
  {
    key: "new",
    label: "New",
    sort: "newest",
    href: "/prediction/markets?category=trending&sort=newest",
  },
];

function TrendingIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path
        d="M1.75 12.25 5.396 8.604a.5.5 0 0 1 .707 0l3.293 3.293a.5.5 0 0 0 .707 0l6.146-6.146"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <polyline
        points="11.25 5.75 16.25 5.75 16.25 10.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
      {direction === "left" ? (
        <path d="M9.807 4.473a.664.664 0 0 0-.94 0l-3.06 3.06c-.26.26-.26.68 0 .94l3.06 3.06a.664.664 0 1 0 .94-.94L7.22 8l2.587-2.587a.67.67 0 0 0 0-.94Z" />
      ) : (
        <path d="M6.194 4.473c-.26.26-.26.68 0 .94L8.78 8l-2.586 2.587a.664.664 0 1 0 .94.94l3.06-3.06c.26-.26.26-.68 0-.94l-3.06-3.06a.67.67 0 0 0-.94.006Z" />
      )}
    </svg>
  );
}

export function PredictionCategoryNav({
  activeFilter,
  activeCategory,
}: {
  activeFilter?: PredictionFeedFilter;
  activeCategory?: PredictionCategory;
}) {
  const scroller = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    const update = () => {
      setCanScrollLeft(node.scrollLeft > 2);
      setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
    };
    update();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      observer?.disconnect();
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scroll = (direction: "left" | "right") => {
    scroller.current?.scrollBy({ left: direction === "left" ? -560 : 560, behavior: "smooth" });
  };

  const itemClass =
    "inline-flex h-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1 font-sans text-[14px] leading-5 font-semibold tracking-[-0.09px] whitespace-nowrap text-[#858b96] transition-colors duration-150 hover:text-[#a8adb7]";

  return (
    <div className="w-full bg-black">
      <div className="relative mx-auto w-full max-w-[1350px] overflow-hidden">
        <button
          type="button"
          aria-label="Scroll prediction navigation left"
          onClick={() => scroll("left")}
          className={`absolute top-0 bottom-0 left-0 z-10 w-10 bg-gradient-to-r from-black via-black to-transparent text-white ${canScrollLeft ? "grid place-items-center" : "hidden"}`}
        >
          <Chevron direction="left" />
        </button>

        <nav
          ref={scroller}
          aria-label="Prediction feeds"
          className="flex h-12 w-full [scrollbar-width:none] items-center overflow-x-auto px-4 lg:px-6 [&::-webkit-scrollbar]:hidden"
        >
          {FEED_FILTERS.map((filter) => {
            const active = filter.key === activeFilter;
            return (
              <Link
                key={filter.key}
                href={filter.href}
                aria-current={active ? "page" : undefined}
                className={`${itemClass} ${active ? "text-white" : ""}`}
              >
                {filter.key === "trending" ? <TrendingIcon /> : null}
                <span>{filter.label}</span>
              </Link>
            );
          })}

          <span
            aria-hidden="true"
            className="mx-2 hidden h-3.5 w-0.5 shrink-0 rounded-full bg-white/15 lg:block"
          />

          {PREDICTION_CATEGORIES.filter((category) => category.key !== "trending").map(
            (category) => {
              const active = category.key === activeCategory;
              return (
                <Link
                  key={category.key}
                  href={predictionCategoryHref(category.key)}
                  aria-current={active ? "page" : undefined}
                  className={`${itemClass} ${active ? "text-white" : ""}`}
                >
                  {category.label}
                </Link>
              );
            }
          )}
        </nav>

        <button
          type="button"
          aria-label="Scroll prediction navigation right"
          onClick={() => scroll("right")}
          className={`absolute top-0 right-0 bottom-0 z-10 w-10 bg-gradient-to-l from-black via-black to-transparent text-white ${canScrollRight ? "grid place-items-center" : "hidden"}`}
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}
