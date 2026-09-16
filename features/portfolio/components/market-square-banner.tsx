"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// The Market Square promo, from the comp (node 108:4007): a purple gradient
// ticket carrying the streaming pitch, a photo of a crowd, a chat bubble and an
// "explore" chip, between the same scalloped edges the other rail banners use.
//
// The art lives together in one folder because it is one illustration cut into
// layers, not a set of icons.
const ART = "/market/square-banner";

// The comp's exact artboard. The banner is drawn once at this size in real
// pixels and scaled as one piece, the way SetTheStakeBanner is, so every
// position, rotation and font size keeps the comp's ratios at any width instead
// of stretching. Every figure below is a design pixel, taken from the node.
const W = 339.9381;
const H = 58;

// The gradient fill inside the scalloped edges. The frame pads it 14px across
// and 2px down, and the stubs overlap those 14px so the ticket reads as one
// piece rather than three.
const FILL_LEFT = 14;
const FILL_TOP = 2;
const FILL_W = 312;
const FILL_H = 54;

// The stub edge is the same width the casino ticket uses, and the comp draws
// the right one 322px across rather than flush, so it overlaps the fill.
const STUB_W = 17.938;
const STUB_RIGHT_LEFT = 322;

/**
 * The Market Square rail banner.
 *
 * `href` is the square's own deployment, which lives at a URL rather than a
 * route here, so this opens in a new tab the way the sidebar entry does. The
 * caller decides whether there is one: with the square unconfigured there is no
 * destination and the banner must not render, which is the same rule the
 * sidebar follows.
 */
export function MarketSquareBanner({ href, className }: { href: string; className?: string }) {
  const t = useTranslations("discovery");
  const ref = useRef<HTMLAnchorElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Present in every browser this app supports; the guard is for test
    // environments that do not provide it, where leaving the artboard at its
    // natural size is harmless because nothing is painted.
    if (typeof ResizeObserver === "undefined") return;
    // ResizeObserver reports the current size as soon as it starts observing,
    // so the first measurement comes from the observer rather than a setState
    // in this effect body. aspect-ratio reserves the height up front, so the
    // slide does not shift when that first measurement lands.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setScale(entry.contentRect.width / W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("squareAria")}
      ref={ref}
      className={cn("ws-pressable relative block w-full overflow-hidden", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      >
        {/* The gradient ticket. overflow-hidden is load-bearing: the crowd,
              the rings and the bubble are all drawn larger than the fill and
              run off its edges in the comp. */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: FILL_LEFT,
            top: FILL_TOP,
            width: FILL_W,
            height: FILL_H,
            backgroundImage: "linear-gradient(130.9967deg, #C7A4FF 3.4647%, #7E3BEB 80.657%)",
          }}
        >
          {/* Two pale rings, mostly off the top and bottom edges. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/ring.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{ left: 14, top: 2.263, width: 109.097, height: 108.742 }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/ring.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{ left: 113, top: -66.737, width: 109.097, height: 108.742 }}
          />

          {/* The glow behind the words. */}
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: 78,
              top: 27,
              width: 45,
              height: 45,
              borderRadius: 29,
              background: "#7E3BEB",
              filter: "blur(15.85px)",
            }}
          />

          {/* The crowd, tilted, running off the bottom of the ticket. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/people.png`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{
              left: 139.432,
              top: -14.958,
              width: 88.233,
              height: 110.312,
              transform: "rotate(-9.58deg)",
            }}
          />

          {/* Hearts drifting off the crowd. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/spark-b.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{ left: 176, top: 7, width: 5.27, height: 4.57, transform: "rotate(6.61deg)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/spark-a.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{
              left: 172,
              top: 11,
              width: 6.28,
              height: 6.06,
              transform: "rotate(-34.16deg)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/spark-c.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{ left: 175, top: 17, width: 6.8, height: 6, transform: "rotate(10.4deg)" }}
          />

          {/* The two emoji stickers pinned to the crowd. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/sticker-warm.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{
              left: 209.446,
              top: 17.442,
              width: 9.2,
              height: 9.2,
              transform: "rotate(26.2deg)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/sticker-cool.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{
              left: 146.047,
              top: 31.698,
              width: 9.54,
              height: 8.87,
              transform: "rotate(-31.29deg)",
            }}
          />

          {/* The chat bubble at the tail. The comp mirrors it, which it does
                with a 180 degree turn and a vertical flip; the two compose to a
                horizontal flip, which is what this is. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/bubble.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{
              left: 218,
              top: -15.826,
              width: 109.72,
              height: 81.652,
              transform: "scaleX(-1)",
            }}
          />

          {/* A cursor pointing into the crowd. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/arrow.svg`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute max-w-none"
            style={{
              left: 183.924,
              top: 47.726,
              width: 7.512,
              height: 5.59,
              transform: "rotate(-141.72deg) scaleY(-1)",
            }}
          />

          {/* The pitch. Real text, not artwork, so it translates and so a
                screen reader reads the banner rather than skipping it. The two
                emphasised runs are the comp's: the first is brighter and bold,
                the second is larger as well. */}
          <div
            className="absolute flex flex-col justify-center"
            style={{
              left: 21,
              top: 29,
              width: 132.477,
              transform: "translateY(-50%)",
              fontFamily: "var(--font-sans)",
              color: "#DDC4FA",
            }}
          >
            <p style={{ fontSize: 8.549, lineHeight: "9.865px", fontWeight: 500 }}>
              {t.rich("squareTitle", {
                strong: (chunks) => (
                  <span style={{ color: "#F8F2FF", fontWeight: 700 }}>{chunks}</span>
                ),
              })}
            </p>
            <p style={{ fontSize: 8.549, lineHeight: "9.865px", fontWeight: 500 }}>
              {t.rich("squareSubtitle", {
                strong: (chunks) => (
                  <span style={{ color: "#F7F0FF", fontWeight: 600, fontSize: 10.721 }}>
                    {chunks}
                  </span>
                ),
              })}
            </p>
          </div>

          {/* The explore chip, tucked into the bottom right of the ticket. */}
          <div
            aria-hidden
            className="absolute flex items-center"
            style={{
              left: 283.015,
              top: 44.0,
              width: 23.987,
              height: 6.0,
              borderRadius: 6.285,
              background: "#B890FB",
              border: "0.273px solid #FBEAA7",
              paddingLeft: 4.767,
              paddingRight: 3.9,
              paddingTop: 1.333,
              paddingBottom: 0.867,
              gap: 0.867,
            }}
          >
            <span
              className="font-sans whitespace-nowrap text-white uppercase"
              style={{ fontSize: 2.57, fontWeight: 600, lineHeight: "normal" }}
            >
              {t("squareExplore")}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ART}/chip-caret.svg`}
              alt=""
              className="max-w-none"
              style={{
                width: 1.632,
                height: 1.632,
                transform: "rotate(91.4deg)",
              }}
            />
          </div>
        </div>

        {/* The scalloped edges sit on the frame, not the fill, so they bite
              into it from both ends. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ART}/scallop-left.svg`}
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 max-w-none"
          style={{ width: STUB_W, height: H }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ART}/scallop-right.svg`}
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-0 max-w-none"
          style={{ left: STUB_RIGHT_LEFT, width: STUB_W, height: H }}
        />
      </div>
    </a>
  );
}
