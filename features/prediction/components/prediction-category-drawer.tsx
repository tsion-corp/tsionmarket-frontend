"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { MarketLogo } from "@/components/ui/market-logo";
import {
  PREDICTION_CATEGORIES,
  predictionCategoryAvailable,
  predictionCategoryHref,
  type PredictionCategory,
} from "@/features/prediction/categories";

interface PredictionCategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  activeCategory: PredictionCategory;
}

interface PredictionCategoryButtonProps {
  onClick: () => void;
  expanded?: boolean;
}

function CategoryIcon({ category }: { category: PredictionCategory }) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (category === "sports") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
        <circle cx="12" cy="12" r="8" />
        <path d="m9.3 9.6 2.7-2 2.7 2-1 3.2h-3.4l-1-3.2ZM7.3 16l3-3.2M16.7 16l-3-3.2M7.2 8.5l2.1 1.1M16.8 8.5l-2.1 1.1" />
      </svg>
    );
  }

  if (category === "politics") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
        <path d="m4 9 8-5 8 5M5.5 10.5h13M6.5 10.5v6M10.2 10.5v6M13.8 10.5v6M17.5 10.5v6M4 19h16" />
      </svg>
    );
  }

  if (category === "crypto") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
        <path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" />
        <path d="M9 8.2h4.3a2 2 0 0 1 0 4H9m0 0h4.8a2 2 0 0 1 0 4H9M11 6v12M14 6v2.2" />
      </svg>
    );
  }

  if (category === "finance") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
        <path d="M4 18V6M4 18h16M7 15l3.5-4 3 2 5-6M15.8 7H18.5v2.7" />
      </svg>
    );
  }

  if (category === "tech") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M9.5 1.8V7M14.5 1.8V7M9.5 17v5.2M14.5 17v5.2M1.8 9.5H7M17 9.5h5.2M1.8 14.5H7M17 14.5h5.2M10 10h4v4h-4z" />
      </svg>
    );
  }

  if (category === "culture") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
        <path d="m12 3 2.2 5.7 6.1.3-4.8 3.8 1.6 5.9-5.1-3.4-5.1 3.4 1.6-5.9L3.7 9l6.1-.3L12 3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" {...shared}>
      <path d="M5 19V9M10 19V5M15 19v-7M20 19V3M3 19h19" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 fill-none stroke-current">
      <path d="M3 5.25h14M3 10h14M3 14.75h14" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PredictionCategoryButton({
  onClick,
  expanded = false,
}: PredictionCategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open markets sidebar"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#303030] bg-[#222] px-3 text-[#aaa] transition-colors hover:border-[#444] hover:bg-[#292929] hover:text-white"
    >
      <MenuIcon />
      <span className="hidden text-xs font-semibold sm:inline">Markets</span>
    </button>
  );
}

export function PredictionCategoryDrawer({
  open,
  onClose,
  activeCategory,
}: PredictionCategoryDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  return (
    <>
      <button
        type="button"
        aria-label="Close market categories"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-[120] cursor-default bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Market categories"
        aria-hidden={!open}
        className={`fixed top-0 bottom-0 left-0 z-[130] flex w-[min(264px,88vw)] flex-col overflow-hidden border-r border-[#2a2a2a] bg-[#171717] shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#2a2a2a] px-4">
          <MarketLogo className="h-6 w-auto" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close markets sidebar"
            tabIndex={open ? 0 : -1}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-[#888] transition-colors hover:bg-[#262626] hover:text-white"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <p className="px-4 pt-5 pb-2 text-[10px] font-semibold tracking-[0.12em] text-[#666] uppercase">
          Explore
        </p>
        <nav aria-label="Prediction market categories" className="flex-1 overflow-y-auto px-2">
          {PREDICTION_CATEGORIES.map((category) => {
            const active = category.key === activeCategory;
            const available = predictionCategoryAvailable(category.key);
            const content = (
              <>
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-md border ${
                    active ? "border-[#3a3a3a] bg-[#202020]" : "border-[#2d2d2d] bg-[#1d1d1d]"
                  }`}
                >
                  <CategoryIcon category={category.key} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{category.label}</span>
                {available ? null : (
                  <span className="text-[9px] font-semibold tracking-wide text-[#555] uppercase">
                    Soon
                  </span>
                )}
              </>
            );
            const className = `flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors ${
              active
                ? "bg-[#282828] text-[#b9fcff]"
                : available
                  ? "text-[#aaa] hover:bg-[#222] hover:text-white"
                  : "cursor-not-allowed text-[#777]"
            }`;

            return available ? (
              <Link
                key={category.key}
                href={predictionCategoryHref(category.key)}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                tabIndex={open ? 0 : -1}
                className={className}
              >
                {content}
              </Link>
            ) : (
              <button
                key={category.key}
                type="button"
                disabled
                tabIndex={open ? 0 : -1}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
