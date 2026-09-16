"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DiscoveryCta } from "@/features/discovery/components/discovery-cta";
import type { RwaSpot } from "@/features/discovery/types";

// The four cards of the "Own the Real World" shelf. Each is one category of
// tokenised asset in its own hue, with a motif drawn in CSS so nothing needs an
// export: gold bars, a yield ring, a skyline, a ticker tape. Real assets are
// not memecoins, so nothing here is confetti or a sunburst: the figures are
// the feed's, the issuer is named, and the action is a plain verb.
//
// Every card is pure. The row hands each its assets and each renders the same
// for a given input wherever the carousel draws it.

const CARD_BOX =
  "relative flex h-full min-h-[212px] flex-col justify-between overflow-hidden rounded-[18px] border-[1.03px] border-transparent p-6 shadow-[inset_0_1.41px_0_rgba(255,255,255,0.15)]";

/** Decorative layers never take the pointer: the pill is the thing under it. */
const ART = "pointer-events-none absolute select-none";

/**
 * What the pill does: go to the desk, or open the trade sheet in place. Never
 * both, for the same reason `DiscoveryCta` itself splits the two: a pill that
 * opens a sheet is not a link, and giving it an `href` too would promise a
 * page tap and middle-click never load.
 */
type CardCta = { label: string } & (
  { href: string; onClick?: never } | { onClick: () => void; href?: never }
);

interface FrameProps {
  surface: string;
  art: ReactNode;
  kicker: string;
  headline: string;
  /** The line under the headline: an asset's name and issuer, or the idle copy. */
  detail: string;
  /** The figure row: price and move, or the yield. Null draws nothing. */
  figure: ReactNode;
  cta: CardCta;
  onHold?: (held: boolean) => void;
}

function Frame({ surface, art, kicker, headline, detail, figure, cta, onHold }: FrameProps) {
  // WCAG 2.2.2 (Pause, Stop, Hide): the stocks card rotates on its own, so
  // hover and focus-within hold it still, reported upward because the
  // carousel draws each card more than once.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  useEffect(() => {
    if (!held || !onHold) return;
    onHold(true);
    return () => onHold(false);
  }, [held, onHold]);

  return (
    <article
      className={CARD_BOX}
      style={{ background: surface }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {art}
      <div className="relative z-[1] max-w-[56%] md:max-w-[62%]">
        <p className="font-serif text-[11px] leading-[1.2] font-semibold tracking-[0.04em] text-white/70 uppercase">
          {kicker}
        </p>
        <h3 className="mt-2 line-clamp-2 font-serif text-[22px] leading-[1.1] font-bold text-white md:text-[24px]">
          {headline}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.35] text-white/65">{detail}</p>
      </div>
      <div className="relative z-[1] flex items-end justify-between gap-4">
        <div className="min-w-0">{figure}</div>
        <DiscoveryCta {...cta} tone="light" size={13} />
      </div>
    </article>
  );
}

function PriceFigure({ spot }: { spot: RwaSpot }) {
  if (spot.price === null) return null;
  return (
    <p className="tnum flex items-baseline gap-2">
      <span className="font-serif text-[20px] leading-none font-bold text-white">{spot.price}</span>
      {spot.change ? (
        <span
          className={`text-[12px] font-semibold ${spot.up ? "text-[#7be495]" : "text-[#ff8a8a]"}`}
        >
          {spot.change}
        </span>
      ) : null}
    </p>
  );
}

function detailOf(spot: RwaSpot, by: (issuer: string) => string): string {
  return `${spot.name} · ${by(spot.issuer)}`;
}

interface CategoryCardProps {
  spots: readonly RwaSpot[];
  onHold?: (held: boolean) => void;
  /**
   * Open the trade sheet on this spot instead of leaving for the desk.
   * Wired only when the spot itself carries a `chain` and `address`; a
   * placeholder card (no live asset) has nothing to trade and always keeps
   * its link to `/rwa`.
   */
  onBuy?: (spot: RwaSpot) => void;
}

/**
 * The pill's action for a featured spot: open the trade sheet when the row
 * was given a callback and the spot itself carries a chain and address, the
 * desk link otherwise. A category placeholder (`spot` null) has nothing to
 * trade and always falls back to `/rwa`, same as before this shelf could
 * open a sheet at all.
 */
function ctaFor(
  spot: RwaSpot | null,
  onBuy: ((spot: RwaSpot) => void) | undefined,
  label: string
): CardCta {
  if (spot && onBuy && spot.chain && spot.address) {
    return { onClick: () => onBuy(spot), label };
  }
  return { href: spot?.href ?? "/rwa", label };
}

// Charcoal to bronze, three bevelled bars in a soft glow. Features the gold
// token the feed prices best.
export function GoldCard({ spots, onBuy }: CategoryCardProps) {
  const t = useTranslations("discovery");
  const spot = spots[0] ?? null;
  const label = spot ? t("rwaBuy", { symbol: spot.symbol }) : t("rwaExplore");
  const cta = ctaFor(spot, onBuy, label);
  return (
    <Frame
      surface="linear-gradient(160deg, #15110a 0%, #3b2a0d 55%, #8a5d16 100%)"
      art={
        <>
          <span
            aria-hidden
            className={`${ART} top-[-40px] right-[-20px] size-[260px] rounded-full opacity-70 blur-2xl`}
            style={{
              background:
                "radial-gradient(circle, rgba(246,211,122,0.55) 0%, rgba(246,211,122,0) 70%)",
            }}
          />
          <span
            aria-hidden
            className={`${ART} top-[18px] right-[10px] w-[150px] origin-top-right scale-[0.62] md:top-[26px] md:right-[26px] md:scale-100`}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block h-[30px] w-[130px] rounded-[4px] shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
                style={{
                  marginLeft: i * 10,
                  marginTop: i === 0 ? 0 : -6,
                  transform: "skewX(-14deg)",
                  background:
                    "linear-gradient(180deg, #f9e19a 0%, #e2b64a 35%, #b8862b 70%, #8f6519 100%)",
                }}
              />
            ))}
          </span>
        </>
      }
      kicker={t("rwaGoldKicker")}
      headline={spot ? spot.symbol : t("rwaGoldHeadline")}
      detail={spot ? detailOf(spot, (i) => t("rwaBy", { issuer: i })) : t("rwaGoldIdle")}
      figure={spot ? <PriceFigure spot={spot} /> : null}
      cta={cta}
    />
  );
}

// Navy to teal, the yield inside a ring. Features the highest published APY.
export function TreasuriesCard({ spots, onBuy }: CategoryCardProps) {
  const t = useTranslations("discovery");
  const spot = spots[0] ?? null;
  const apy = spot?.apy ?? null;
  const label = apy ? t("rwaEarn", { apy }) : t("rwaExplore");
  const cta = ctaFor(spot, onBuy, label);
  return (
    <Frame
      surface="linear-gradient(160deg, #051426 0%, #0b3b52 55%, #14707c 100%)"
      art={
        <span
          aria-hidden
          className={`${ART} top-[16px] right-[14px] grid size-[120px] origin-top-right scale-[0.72] place-items-center md:top-[22px] md:right-[26px] md:scale-100`}
        >
          <svg viewBox="0 0 120 120" width="120" height="120" className="absolute inset-0">
            <circle
              cx="60"
              cy="60"
              r="52"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              stroke="#7fe3d6"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
              strokeDasharray="327"
              strokeDashoffset={apy ? 110 : 245}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <span className="relative text-center">
            <span className="tnum block font-serif text-[22px] leading-none font-bold text-white">
              {apy ?? "—"}
            </span>
            <span className="mt-1 block text-[9px] font-semibold tracking-[0.12em] text-white/60 uppercase">
              {t("rwaApyLabel")}
            </span>
          </span>
        </span>
      }
      kicker={t("rwaTreasuriesKicker")}
      headline={spot ? spot.symbol : t("rwaTreasuriesHeadline")}
      detail={spot ? detailOf(spot, (i) => t("rwaBy", { issuer: i })) : t("rwaTreasuriesIdle")}
      figure={spot ? <PriceFigure spot={spot} /> : null}
      cta={cta}
    />
  );
}

// The skyline's buildings: height and width as a share of the stage, and
// which windows are lit, fixed so the picture is the same on every render.
const BUILDINGS = [
  { w: 22, h: 58, lit: "2px 2px, 8px 14px, 14px 26px" },
  { w: 30, h: 92, lit: "4px 4px, 16px 12px, 8px 28px, 20px 44px" },
  { w: 18, h: 70, lit: "4px 10px, 10px 30px" },
  { w: 34, h: 110, lit: "6px 6px, 20px 18px, 10px 40px, 24px 60px, 6px 80px" },
  { w: 24, h: 64, lit: "6px 8px, 14px 24px" },
];

// Slate to terracotta, a skyline with lit windows at the foot.
export function RealEstateCard({ spots, onBuy }: CategoryCardProps) {
  const t = useTranslations("discovery");
  const spot = spots[0] ?? null;
  const label = spot ? t("rwaOwn") : t("rwaExplore");
  const cta = ctaFor(spot, onBuy, label);
  return (
    <Frame
      surface="linear-gradient(160deg, #1f1d26 0%, #4a2f33 55%, #b5533a 100%)"
      art={
        <span
          aria-hidden
          className={`${ART} right-[12px] bottom-0 flex origin-bottom-right scale-[0.78] items-end gap-[6px] md:right-[18px] md:scale-100`}
        >
          {BUILDINGS.map((b, i) => (
            <span
              key={i}
              className="block rounded-t-[3px] bg-[#120f14]/85"
              style={{
                width: b.w,
                height: b.h,
                backgroundImage: b.lit
                  .split(", ")
                  .map(() => "radial-gradient(rgba(255,214,122,0.95) 0 2px, transparent 2.5px)")
                  .join(", "),
                backgroundPosition: b.lit,
                backgroundSize: "6px 6px",
                backgroundRepeat: "no-repeat",
              }}
            />
          ))}
        </span>
      }
      kicker={t("rwaRealEstateKicker")}
      headline={spot ? spot.symbol : t("rwaRealEstateHeadline")}
      detail={spot ? detailOf(spot, (i) => t("rwaBy", { issuer: i })) : t("rwaRealEstateIdle")}
      figure={spot ? <PriceFigure spot={spot} /> : null}
      cta={cta}
    />
  );
}

interface StocksCardProps extends CategoryCardProps {
  /** Which stock is featured: the row owns the rotation. */
  index: number;
}

// Ink to forest, a restrained ticker tape of the tokenised stocks. The
// featured one rotates; the tape shows the rest with their moves.
export function StocksCard({ spots, index, onHold, onBuy }: StocksCardProps) {
  const t = useTranslations("discovery");
  const spot = spots.length > 0 ? spots[index % spots.length] : null;
  const tape = spots.slice(0, 8);
  const label = spot ? t("rwaTrade", { symbol: spot.symbol }) : t("rwaExplore");
  const cta = ctaFor(spot, onBuy, label);
  return (
    <Frame
      surface="linear-gradient(160deg, #050a08 0%, #0f2c1f 55%, #1c5a3a 100%)"
      art={
        tape.length > 0 ? (
          <span
            aria-hidden
            className={`${ART} top-[14px] right-[-48px] flex w-[260px] origin-top-right scale-[0.62] flex-col gap-[8px] md:top-[22px] md:right-[-40px] md:scale-100`}
            style={{ rotate: "-6deg" }}
          >
            {[0, 1].map((line) => (
              <span key={line} className="flex gap-[8px]" style={{ marginLeft: line * 26 }}>
                {tape.slice(line * 4, line * 4 + 4).map((s) => (
                  <span
                    key={s.id}
                    className="tnum flex shrink-0 items-center gap-[6px] rounded-full border border-white/10 bg-white/8 px-[10px] py-[5px] text-[11px] font-semibold whitespace-nowrap text-white/85"
                  >
                    {s.symbol}
                    {s.change ? (
                      <span className={s.up ? "text-[#7be495]" : "text-[#ff8a8a]"}>{s.change}</span>
                    ) : null}
                  </span>
                ))}
              </span>
            ))}
          </span>
        ) : null
      }
      kicker={t("rwaStocksKicker")}
      headline={spot ? spot.symbol : t("rwaStocksHeadline")}
      detail={spot ? detailOf(spot, (i) => t("rwaBy", { issuer: i })) : t("rwaStocksIdle")}
      figure={spot ? <PriceFigure spot={spot} /> : null}
      cta={cta}
      onHold={onHold}
    />
  );
}
