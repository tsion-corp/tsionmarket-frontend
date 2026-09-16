"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ArtboardProps {
  /** The comp's artboard, in its own pixels. */
  width: number;
  height: number;
  className?: string;
  children: ReactNode;
}

// A comp drawn once at its artboard size in real pixels, then scaled as one
// piece to whatever width it is given. Font sizes, offsets and every image
// position keep the comp's exact ratios at any width, instead of the artwork
// stretching by percentage while the type stays at its pixel size. aspect-ratio
// reserves the matching height up front, so there is no layout shift on the
// first measure; a ResizeObserver keeps the scale exact as the slide or the
// viewport changes. Under jsdom nothing has a width, so the scale stays at 1.
export function Artboard({ width, height, className, children }: ArtboardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (w: number) => {
      if (w > 0) setScale(w / width);
    };
    measure(el.clientWidth);
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={ref}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width, height, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
