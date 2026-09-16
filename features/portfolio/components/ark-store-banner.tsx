"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFitText } from "@/hooks/use-fit-text";
import { cn } from "@/lib/utils";

// The scalloped edge the whole deck is cut with. It is horizontally symmetric,
// so the same file serves both sides, as it does on the casino ticket.
const EDGE = "/casino/set-the-stake/ticket-edge.svg";
const DIVIDER = "/casino/set-the-stake/divider.svg";

// The deck's artboard: drawn once at this size in real pixels and scaled as one
// piece, so every position and font size keeps its ratio at any width instead
// of stretching. Same geometry as the casino and square tickets beside it.
const W = 340;
const H = 58;
const FILL_LEFT = 14;
const FILL_TOP = 2;
const FILL_W = 312;
const FILL_H = 54;
const STUB_W = 17.938;

// Each stub takes the colour the body's wash reaches at its end.
const STUBS = [
  { left: 0, top: 1, colour: "#3a3f47" },
  { left: 322, top: 0, colour: "#15171b" },
];

// The four tiles of the app-grid motif, as a home screen reads: three plain
// tiles and the Ark tile, which is the lit one.
const TILES = [
  { x: 0, y: 0, ark: true },
  { x: 15, y: 0, ark: false },
  { x: 0, y: 15, ark: false },
  { x: 15, y: 15, ark: false },
];

/**
 * The ArkStore promo, first in the deck.
 *
 * The three tickets beside it are each a colour: the casino's red, Kash's gold,
 * the square's purple. This one is the app itself, so it is the brand's own
 * ink and white rather than a fourth hue, and the motif is the thing being
 * offered: a phone's home screen with the Ark tile lit, and the download badge
 * that puts it there. Drawn in CSS rather than exported, so it needs no
 * artwork of its own and stays sharp at any scale.
 *
 * Presentational: the doorway to the store is the link the caller wraps it in,
 * the way the casino ticket takes its own.
 */
export function ArkStoreBanner({ className }: { className?: string }) {
  const t = useTranslations("portfolio");
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // "Get our app" in Mona Sans bold at 15px runs about 96px against the 104px
  // the row leaves it, so the first paint starts just under 1.
  const { ref: pitchRef, scale: pitchScale } = useFitText<HTMLParagraphElement>(
    t("arkStorePitch"),
    0.92
  );

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
        {/* The scalloped edges. The export is the casino ticket's red, so it
            is used as a mask rather than an image: each stub is then painted in
            the colour the body reaches at that end, and the ticket reads as one
            piece instead of three. */}
        {STUBS.map((stub) => (
          <span
            key={stub.left}
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: stub.left,
              top: stub.top,
              width: STUB_W,
              height: 60,
              background: stub.colour,
              maskImage: `url(${EDGE})`,
              WebkitMaskImage: `url(${EDGE})`,
              maskSize: "100% 100%",
              WebkitMaskSize: "100% 100%",
            }}
          />
        ))}

        {/* Ink body. The wash is lit from the left, behind the phone, so the
            motif sits in the light and the words stay on the flat. */}
        <div
          className="absolute overflow-hidden bg-[linear-gradient(100deg,#3a3f47_0%,#23262c_46%,#15171b_100%)]"
          style={{ left: FILL_LEFT, top: FILL_TOP, width: FILL_W, height: FILL_H }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/15"
          />
          {/* A star field, the same night sky the app's own cards carry. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.55) 0.7px, transparent 1.3px), radial-gradient(circle, rgba(255,255,255,0.3) 0.6px, transparent 1.2px)",
              backgroundSize: "47px 33px, 31px 41px",
              backgroundPosition: "6px 9px, 21px 23px",
            }}
          />
          {/* The glow the phone stands in. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-[-34px] left-[-16px] size-[112px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22)_0%,transparent_68%)]"
          />

          {/* The phone: a home screen of four tiles, the Ark tile lit, with the
              download badge on its corner. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-[6px] left-[10px] h-[42px] w-[30px] rotate-[-8deg] rounded-[6px] border border-white/25 bg-[linear-gradient(160deg,#3b4048_0%,#15171b_100%)] shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
          >
            <span className="absolute top-[3px] left-1/2 h-[2px] w-[8px] -translate-x-1/2 rounded-full bg-white/30" />
            <span className="absolute top-[8px] left-[4px] h-[30px] w-[22px]">
              {TILES.map((tile) => (
                <span
                  key={`${tile.x}-${tile.y}`}
                  className={`absolute size-[9px] rounded-[2.5px] ${
                    tile.ark ? "bg-white" : "bg-white/18"
                  }`}
                  style={{ left: tile.x, top: tile.y }}
                >
                  {tile.ark ? (
                    <span className="absolute inset-0 grid place-items-center text-[6px] leading-none font-black text-[#15171b]">
                      A
                    </span>
                  ) : null}
                </span>
              ))}
            </span>
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute top-[30px] left-[30px] grid size-[16px] place-items-center rounded-full bg-white text-[#15171b] shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
          >
            <svg viewBox="0 0 12 12" className="size-[8px]" fill="none" aria-hidden>
              <path
                d="M6 1.5v6m0 0L3.6 5.1M6 7.5l2.4-2.4M2.5 10h7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          {/* The words, in the band the phone leaves, on the casino ticket's
              own rhythm: pitch, hairline, tagline. */}
          <div className="absolute inset-y-0 right-[10px] left-[56px] flex items-center gap-[7px]">
            <p
              ref={pitchRef}
              className="min-w-0 flex-1 font-serif leading-none font-bold whitespace-nowrap text-white capitalize"
              style={{ fontSize: `calc(15px * ${pitchScale.toFixed(4)})` }}
            >
              {t("arkStorePitch")}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DIVIDER}
              alt=""
              className="pointer-events-none h-[15px] w-px shrink-0 opacity-60"
            />
            <p
              className="shrink-0 text-[11px] leading-[1.5] font-medium tracking-[-0.22px] whitespace-nowrap text-white/75 capitalize"
              style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wdth" 100' }}
            >
              {t("arkStoreTagline")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
