"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";
import type { MarketNavItem } from "../types";

interface NavigationRailProps<Key extends string> {
  activeKey: Key;
  ariaLabel: string;
  items: Array<MarketNavItem<Key>>;
  variant: "primary" | "secondary";
}

export function NavigationRail<Key extends string>({
  activeKey,
  ariaLabel,
  items,
  variant,
}: NavigationRailProps<Key>) {
  const primary = variant === "primary";
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const updateScrollState = () => {
      setCanScrollPrevious(rail.scrollLeft > 2);
      setCanScrollNext(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
    };
    const observer = new ResizeObserver(updateScrollState);

    observer.observe(rail);
    rail.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();

    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", updateScrollState);
    };
  }, [items.length]);

  function scrollForward() {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: Math.max(180, rail.clientWidth * 0.72), behavior: "smooth" });
  }

  function scrollBack() {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: -Math.max(180, rail.clientWidth * 0.72), behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={railRef}
        aria-label={ariaLabel}
        className={`flex touch-pan-x snap-x snap-proximity [scrollbar-width:none] items-stretch overflow-x-auto overscroll-x-contain pr-10 [&::-webkit-scrollbar]:hidden ${
          primary
            ? "min-h-11 scroll-px-3 lg:min-h-[50px]"
            : "min-h-12 scroll-px-2 gap-1.5 py-1.5 sm:min-h-[58px] sm:scroll-px-4 sm:gap-2 sm:py-2"
        }`}
      >
        {items.map((item) => {
          const active = item.key === activeKey;

          if (primary) {
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex min-h-11 min-w-[76px] shrink-0 snap-start items-center justify-center px-3 text-center text-[12px] leading-[1.05] font-bold whitespace-nowrap transition-[background,color,transform] after:absolute after:right-3 after:bottom-0 after:left-3 after:h-0.5 lg:min-h-[50px] lg:min-w-0 lg:flex-1 lg:text-[13px] lg:after:hidden ${
                  active
                    ? "bg-white/[0.055] text-white after:bg-[#d9ff43] lg:[transform:skewX(-6deg)] lg:bg-[linear-gradient(180deg,#dedee2_0%,#bdbdc3_100%)] lg:text-[#0a0a0b] lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                    : "text-white/52 hover:bg-white/[0.055] hover:text-white/85"
                }`}
              >
                <span className={active ? "lg:[transform:skewX(6deg)]" : undefined}>
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative inline-flex h-9 shrink-0 snap-center items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11px] leading-none whitespace-nowrap transition-[border-color,background-color,color,transform] active:scale-[0.98] sm:h-[42px] sm:gap-2 sm:px-3.5 sm:text-[12px] ${
                active
                  ? "border-white/38 bg-white/[0.11] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "border-white/9 bg-white/[0.025] font-semibold text-white/52 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/82"
              }`}
            >
              {item.badge ? (
                <span
                  aria-hidden="true"
                  className={`grid size-6 place-items-center rounded-full border text-[8px] font-black sm:size-7 sm:text-[9px] ${
                    active
                      ? "border-white/24 bg-white text-black"
                      : "border-white/10 bg-[#24252a] text-white/62"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
              {item.label}
            </Link>
          );
        })}
      </div>

      {canScrollPrevious ? (
        <button
          type="button"
          onClick={scrollBack}
          aria-label={`Scroll ${ariaLabel} left`}
          className={`absolute top-0 left-0 z-10 flex h-full w-11 cursor-pointer items-center justify-start pl-1 text-white/62 transition-colors hover:text-white ${
            primary
              ? "bg-gradient-to-r from-[#101114] via-[#101114]/95 to-transparent"
              : "bg-gradient-to-r from-[#09090a] via-[#09090a]/95 to-transparent"
          }`}
        >
          <ChevronLeftIcon size={15} />
        </button>
      ) : null}

      {canScrollNext ? (
        <button
          type="button"
          onClick={scrollForward}
          aria-label={`Scroll ${ariaLabel} right`}
          className={`absolute top-0 right-0 z-10 flex h-full w-11 cursor-pointer items-center justify-end pr-1 text-white/62 transition-colors hover:text-white ${
            primary
              ? "bg-gradient-to-l from-[#101114] via-[#101114]/95 to-transparent"
              : "bg-gradient-to-l from-[#09090a] via-[#09090a]/95 to-transparent"
          }`}
        >
          <ChevronLeftIcon size={15} className="rotate-180" />
        </button>
      ) : null}
    </div>
  );
}
