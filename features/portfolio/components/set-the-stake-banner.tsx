"use client";

import { useEffect, useRef, useState } from "react";
import { useFitText } from "@/hooks/use-fit-text";
import { cn } from "@/lib/utils";

// The exported ticket artwork (node 1:2689). The ticket-edge SVG is horizontally
// symmetric, so the same file serves both scalloped edges.
const ART = "/casino/set-the-stake";

// The comp's exact artboard. The banner is drawn once at this size in real
// pixels, then scaled as one piece to whatever width it is given, so the font
// size, letter spacing, and every image position stay in the comp's exact ratios
// at any width instead of stretching.
const W = 337;
const H = 61;

// The "Set the stake" promo, pixel-for-pixel from the comp (node 1:2689): a red
// #ed2b07 ticket — four-bump scalloped edges, a flame, two faint orange glow
// rings — with the pitch beside a tagline, split by a hairline.
//
// The comp drew the pitch in Chewy and pinned the hairline and the tagline at
// fixed offsets to its right. Production sets the pitch in Mona Sans bold,
// which is wider, so pinned offsets ran the two into each other. The words
// are a row instead: the pitch takes what the tagline leaves and is scaled to
// fit that share, so the hairline and the gap around it hold at any face.
// Presentational; it takes no action of its own.
export function SetTheStakeBanner({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // "Set The Stake" in Mona Sans bold at 16px runs about 108px; the share the
  // tagline leaves it is about 95px, so the first paint starts near 0.88.
  const { ref: pitchRef, scale: pitchScale } = useFitText<HTMLParagraphElement>(
    "Set the stake",
    0.88
  );

  // Scale the fixed artboard to the container width. A ResizeObserver keeps it
  // exact as the carousel slide or viewport changes; aspect-ratio reserves the
  // matching height up front so there is no layout shift on the first measure.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) => setScale(width / W);
    measure(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      >
        {/* Scalloped ticket edges — the same symmetric SVG on both sides. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ART}/ticket-edge.svg`}
          alt=""
          className="pointer-events-none absolute top-px left-0 h-[60px] w-[17.938px]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ART}/ticket-edge.svg`}
          alt=""
          className="pointer-events-none absolute top-0 left-[319px] h-[60px] w-[17.938px]"
        />

        {/* Red body; clips the flame and glow rings to the ticket. */}
        <div className="absolute top-[4px] left-[12px] h-[54px] w-[312px] overflow-hidden bg-[#ed2b07]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/glow-right.svg`}
            alt=""
            className="pointer-events-none absolute top-[-47.1px] left-[123.44px] size-[287.48px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/glow-left.svg`}
            alt=""
            className="pointer-events-none absolute top-[-11.37px] left-[-12.99px] size-[165.667px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/flame.svg`}
            alt=""
            className="pointer-events-none absolute top-[5px] left-[12px] h-[64.896px] w-[39.005px]"
          />
          {/* The words, in the band the flame leaves: from x=59 to 8px short
              of the body's edge, centred on the ticket's height. */}
          <div className="absolute inset-y-0 right-[8px] left-[59px] flex items-center gap-[6px]">
            <p
              ref={pitchRef}
              className="min-w-0 flex-1 font-serif leading-none font-bold whitespace-nowrap text-white capitalize"
              style={{ fontSize: `calc(16px * ${pitchScale.toFixed(4)})` }}
            >
              Set the stake
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ART}/divider.svg`}
              alt=""
              className="pointer-events-none h-[15px] w-px shrink-0"
            />
            <p
              className="shrink-0 text-[12px] leading-[1.52] font-medium tracking-[-0.24px] whitespace-nowrap text-white capitalize"
              style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wdth" 100' }}
            >
              Everyone plays to win
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
