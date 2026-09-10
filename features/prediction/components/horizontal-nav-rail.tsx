"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5 fill-current">
      {direction === "left" ? (
        <path d="M9.807 4.473a.664.664 0 0 0-.94 0l-3.06 3.06c-.26.26-.26.68 0 .94l3.06 3.06a.664.664 0 1 0 .94-.94L7.22 8l2.587-2.587a.67.67 0 0 0 0-.94Z" />
      ) : (
        <path d="M6.194 4.473c-.26.26-.26.68 0 .94L8.78 8l-2.586 2.587a.664.664 0 1 0 .94.94l3.06-3.06c.26-.26.26-.68 0-.94l-3.06-3.06a.67.67 0 0 0-.94.006Z" />
      )}
    </svg>
  );
}

export function HorizontalNavRail({
  ariaLabel,
  children,
  itemCount,
  className = "",
  viewportClassName = "",
}: {
  ariaLabel: string;
  children: ReactNode;
  itemCount: number;
  className?: string;
  viewportClassName?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      setCanScrollLeft(viewport.scrollLeft > 2);
      setCanScrollRight(
        viewport.scrollWidth > viewport.clientWidth + 2 &&
          viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 2
      );
    };
    const frame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);

    observer?.observe(viewport);
    window.addEventListener("resize", update);
    viewport.addEventListener("scroll", update, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [itemCount]);

  const scroll = (direction: "left" | "right") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = Math.max(180, viewport.clientWidth * 0.72);
    viewport.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
  };

  return (
    <div className={`group/nav-rail relative overflow-hidden ${className}`}>
      <div
        ref={viewportRef}
        aria-label={ariaLabel}
        className={`touch-pan-x [scrollbar-width:none] overflow-x-auto overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden ${viewportClassName}`}
      >
        {children}
      </div>

      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label={`Scroll ${ariaLabel} left`}
          className="absolute top-0 bottom-0 left-0 z-20 flex w-11 cursor-pointer items-center justify-start bg-gradient-to-r from-[#222] via-[#222]/95 to-transparent pl-1 text-[#aaa] transition-colors hover:text-white md:w-14"
        >
          <span className="grid size-8 place-items-center rounded-full border border-[#3a3a3a] bg-[#292929] shadow-lg">
            <Chevron direction="left" />
          </span>
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label={`Scroll ${ariaLabel} right`}
          className="absolute top-0 right-0 bottom-0 z-20 flex w-11 cursor-pointer items-center justify-end bg-gradient-to-l from-[#222] via-[#222]/95 to-transparent pr-1 text-[#aaa] transition-colors hover:text-white md:w-14"
        >
          <span className="grid size-8 place-items-center rounded-full border border-[#3a3a3a] bg-[#292929] shadow-lg">
            <Chevron direction="right" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
