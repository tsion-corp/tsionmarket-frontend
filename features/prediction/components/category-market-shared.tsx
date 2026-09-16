"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePrivy } from "@privy-io/react-auth";
import { MarketLogo } from "@/components/ui/market-logo";
import { PredictionCategoryButton } from "./prediction-category-drawer";
import type { PredictionCategory } from "../categories";
import { usdcVolume, type CategoryPrediction } from "../category-market-presenter";

export const CategoryBetSidebar = dynamic(
  () => import("./category-bet-sidebar").then((module) => module.CategoryBetSidebar),
  { ssr: false }
);

export function CategorySearchIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryMarketImage({
  src,
  size = "size-12",
}: {
  src?: string | null;
  size?: string;
}) {
  return (
    <div
      className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-md bg-[#303030]`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-6 text-[#888]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )}
    </div>
  );
}

export function CategoryTopNav({
  onOpenCategories,
  categoriesOpen,
  category,
}: {
  onOpenCategories: () => void;
  categoriesOpen: boolean;
  category: PredictionCategory;
}) {
  const { authenticated, login } = usePrivy();
  return (
    <div className="sticky top-0 z-[100] bg-[#171717] px-3 py-2 md:px-5">
      <div className="flex min-h-10 items-center gap-2 md:gap-4">
        <Link
          href="/dashboard"
          aria-label="Open dashboard"
          className="relative block h-8 shrink-0 md:h-[34px]"
        >
          <MarketLogo className="h-full w-auto" />
        </Link>
        <PredictionCategoryButton expanded={categoriesOpen} onClick={onOpenCategories} />
        <div className="hidden h-9 max-w-xl min-w-[120px] flex-1 items-center rounded-lg border border-[#2a2a2a] bg-white/[0.03] px-3 text-[#7e7e7e] md:flex">
          <CategorySearchIcon />
          <span className="px-3 text-[13px]">Search {category} markets...</span>
        </div>
        <div className="ml-auto shrink-0">
          {authenticated ? (
            <Link
              href="/prediction"
              className="rounded-lg bg-[#b9fcff] px-4 py-2 text-sm font-medium text-[#171717] hover:bg-[#b9fcff]/90"
            >
              My tickets
            </Link>
          ) : (
            <button
              type="button"
              onClick={login}
              className="cursor-pointer rounded-lg bg-[#b9fcff] px-4 py-2 text-sm font-medium text-[#171717] hover:bg-[#b9fcff]/90"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CategoryMarketRow({
  prediction,
  accessAllowed,
  onBuy,
  href,
  eventTitle,
  marketCount,
  selectedSide,
  showVolume = true,
  surface = "default",
}: {
  prediction: CategoryPrediction;
  accessAllowed: boolean;
  onBuy: (side: "yes" | "no") => void;
  href?: string;
  eventTitle?: string;
  marketCount?: number;
  selectedSide?: "yes" | "no";
  showVolume?: boolean;
  surface?: "default" | "black";
}) {
  const details = (
    <>
      <CategoryMarketImage src={prediction.image} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-[#888]">
          <span className="truncate">
            {eventTitle ?? prediction.tag}
            {marketCount ? ` · ${marketCount} markets` : ""}
            {!prediction.tradable ? " / Unavailable" : ""}
          </span>
        </div>
        <h2 className="mt-1 line-clamp-2 text-sm leading-5 font-medium text-[#ebebeb]">
          {prediction.q}
        </h2>
      </div>
    </>
  );

  return (
    <article
      className={`border-b border-white/[0.06] px-3 py-3 transition-colors last:border-b-0 md:px-4 ${
        surface === "black" ? "bg-black hover:bg-[#080808]" : "bg-[#242424] hover:bg-[#292929]"
      }`}
    >
      <div
        className={`grid min-w-0 items-center gap-3 ${
          showVolume
            ? "min-[800px]:grid-cols-[minmax(0,1fr)_280px_100px] min-[1280px]:grid-cols-[1fr_28rem_1fr]"
            : "min-[800px]:grid-cols-[minmax(0,1fr)_280px] min-[1280px]:grid-cols-[minmax(0,1fr)_28rem]"
        }`}
      >
        {href ? (
          <Link
            href={href}
            prefetch={false}
            aria-label={`Open ${eventTitle ?? prediction.q} details`}
            className="flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#b9fcff]"
          >
            {details}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-3">{details}</div>
        )}
        <div className="grid w-full grid-cols-2 gap-2 justify-self-center min-[1280px]:w-[28rem]">
          <button
            type="button"
            disabled={!accessAllowed || !prediction.tradable || !prediction.yesTokenId}
            aria-label={`Yes ${prediction.yesDecimalOdds.toFixed(2)}`}
            onClick={() => onBuy("yes")}
            aria-pressed={selectedSide === "yes"}
            className={`flex h-12 cursor-pointer items-center justify-between rounded-sm border px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              selectedSide === "yes"
                ? "border-[#80dbae] bg-[#285a45] ring-1 ring-[#80dbae]"
                : "border-[#275c46] bg-[#1c3d30] hover:border-[#3f9d73] hover:bg-[#224c3b]"
            }`}
          >
            <span className="font-semibold text-[#80dbae]">Yes</span>
            <span className="font-bold text-white">{prediction.yesDecimalOdds.toFixed(2)}</span>
          </button>
          <button
            type="button"
            disabled={!accessAllowed || !prediction.tradable || !prediction.noTokenId}
            aria-label={`No ${prediction.noDecimalOdds.toFixed(2)}`}
            onClick={() => onBuy("no")}
            aria-pressed={selectedSide === "no"}
            className={`flex h-12 cursor-pointer items-center justify-between rounded-sm border px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              selectedSide === "no"
                ? "border-[#ef9ca5] bg-[#63353b] ring-1 ring-[#ef9ca5]"
                : "border-[#68353a] bg-[#43272b] hover:border-[#aa5962] hover:bg-[#503036]"
            }`}
          >
            <span className="font-semibold text-[#ef9ca5]">No</span>
            <span className="font-bold text-white">{prediction.noDecimalOdds.toFixed(2)}</span>
          </button>
        </div>
        {showVolume ? (
          <>
            <div className="hidden w-[6.5rem] justify-self-end text-center text-xs text-[#999] min-[800px]:block">
              {usdcVolume(prediction.vol)}
            </div>
            <div className="text-right text-[10px] text-[#777] min-[800px]:hidden">
              Volume {usdcVolume(prediction.vol)}
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
