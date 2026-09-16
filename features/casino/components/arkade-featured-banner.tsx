"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CasinoGame } from "@/features/casino/lib/games";
import type { FeaturedStat } from "@/features/casino/lib/featured";

export type { FeaturedStat };

/**
 * The Arkade featured banner — desktop (Figma 2234:10801) and mobile
 * (2234:11192) share one tree; `variant` swaps the sizing. A full-width hero at
 * the 20/16px corner spotlights one game over its wide backdrop, dimmed 65%.
 * The left column carries the "Featured" label, the game's name and one-liner
 * and a chrome Play Now pill; the right column carries the prize pool, an avatar
 * stack and a player count; pager dots switch featured games.
 *
 * Presentational. The name, note, backdrop and destination come from the
 * catalogue; the prize pool, avatars and player count arrive per game id
 * through `stats`, and each block is absent when its figure is — never invented.
 */

// The same brushed-metal fill and top light the Add-funds and Play pills use.
const CHROME =
  "linear-gradient(179.02deg, #ffffff 2.36%, #ededf0 38.57%, #cbcbd1 62.39%, #f5f5f8 97.64%)";
const CHROME_SHADOW = "inset 0 0.774px 0 rgba(255,255,255,0.95)";

// Avatar footprints per variant: circle size and the three overlap offsets
// (2234:10818 desktop, 2234:11210 mobile).
const AVATARS = {
  desktop: { size: 34, left: [0, 17, 36], w: 70 },
  mobile: { size: 20.833, left: [0, 10.42, 22.06], w: 43 },
} as const;

export interface ArkadeFeaturedBannerProps {
  // The games the banner rotates through; the first is shown first.
  games: CasinoGame[];
  // Desktop hero or the phone's compact card.
  variant?: "desktop" | "mobile";
  // Fired with the active game when Play Now is pressed. Navigation is the
  // caller's job, as with the cards.
  onPlay?: (game: CasinoGame) => void;
  // Live figures keyed by game id. A game missing here shows no stat column.
  stats?: Record<string, FeaturedStat>;
}

function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .toLowerCase();
}

export function ArkadeFeaturedBanner({
  games,
  variant = "desktop",
  onPlay,
  stats,
}: ArkadeFeaturedBannerProps) {
  const t = useTranslations("casino.hub");
  const [active, setActive] = useState(0);

  if (games.length === 0) return null;
  const m = variant === "mobile";
  const av = m ? AVATARS.mobile : AVATARS.desktop;
  const index = Math.min(active, games.length - 1);
  const game = games[index];
  const backdrop = game.featuredImage ?? game.image;
  const stat = stats?.[game.id];
  const avatars = stat?.avatars?.slice(0, 3) ?? [];
  const hasStats = Boolean(stat && (stat.prizePool || stat.players != null || avatars.length));

  return (
    <section
      className={`relative flex w-full flex-col items-center justify-center overflow-hidden ${
        m ? "rounded-[16px] px-4 pt-[22px] pb-3" : "rounded-[20px] px-9 pt-9 pb-[18px]"
      }`}
    >
      {/* Backdrop under a 65% black wash. */}
      <div aria-hidden className="absolute inset-0">
        {backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-black/65" />
      </div>

      <div className={`relative flex w-full flex-col items-end ${m ? "gap-3" : "gap-9"}`}>
        <div className="flex w-full items-center justify-between gap-4">
          {/* Left: label, title, subtitle, Play Now. */}
          <div
            className={`flex shrink-0 flex-col items-start ${m ? "w-[190px] gap-[7.353px]" : "w-[311px] gap-3"}`}
          >
            <p
              className={`w-full font-serif leading-[1.1] font-semibold text-[#ffe178] ${
                m ? "text-[12px] tracking-[-0.18px]" : "text-[15px] tracking-[-0.225px]"
              }`}
            >
              {t("featured")}
            </p>
            <div className={`flex w-full flex-col items-start ${m ? "gap-[14.706px]" : "gap-6"}`}>
              <div className="flex w-full flex-col items-start gap-1 text-left">
                <p
                  className={`w-full font-serif leading-[1.02] font-semibold text-white capitalize ${
                    m ? "text-[18px] tracking-[-0.54px]" : "text-[36px] tracking-[-1.08px]"
                  }`}
                >
                  {t(`games.${game.id}.name`)}
                </p>
                {game.note ? (
                  <p
                    className={`w-full font-serif font-semibold ${
                      m
                        ? "text-[13px] leading-[1.4] tracking-[-0.195px] text-white/75 opacity-80"
                        : "text-[15px] leading-[1.1] tracking-[-0.225px] text-white/60"
                    }`}
                  >
                    {t(`games.${game.id}.note`)}
                  </p>
                ) : null}
              </div>
              {game.href ? (
                <button
                  type="button"
                  onClick={() => onPlay?.(game)}
                  style={{ backgroundImage: CHROME, boxShadow: CHROME_SHADOW }}
                  className={`flex cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90 ${
                    m
                      ? "w-[105px] px-[9.24px] py-[10.92px]"
                      : "w-[119px] px-[10.472px] py-[12.376px]"
                  }`}
                >
                  <span
                    className={`text-center font-serif leading-[1.1] font-semibold text-[#0a0a0a] ${
                      m
                        ? "w-[56px] text-[12px] tracking-[-0.12px]"
                        : "w-16 text-[13px] tracking-[-0.13px]"
                    }`}
                  >
                    {t("playNow")}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Right: prize pool, avatar stack, player count. Each block renders
              only with a real figure behind it. */}
          {hasStats ? (
            <div
              className={`flex shrink-0 flex-col items-end justify-center ${
                m ? "w-[91px] gap-[14.706px]" : "w-[148px] gap-6"
              }`}
            >
              {stat?.prizePool ? (
                <div
                  className={`flex w-full flex-col items-end justify-center whitespace-nowrap ${
                    m ? "gap-[7.353px]" : "gap-3"
                  }`}
                >
                  <p
                    className={`font-serif leading-[1.1] font-semibold text-white/70 ${
                      m ? "text-[10px] tracking-[-0.05px]" : "text-[15px] tracking-[-0.225px]"
                    }`}
                  >
                    {t("prizePool")}
                  </p>
                  <p
                    className={`font-serif leading-[1.02] font-bold text-white capitalize ${
                      m ? "text-[13px] tracking-[-0.39px]" : "text-[24px] tracking-[-0.72px]"
                    }`}
                  >
                    {stat.prizePool}
                  </p>
                </div>
              ) : null}

              {avatars.length || stat?.players != null ? (
                <div
                  className={`flex flex-col items-start ${m ? "w-[59px] gap-[7.353px]" : "w-24 gap-3"}`}
                >
                  {avatars.length ? (
                    <div className="relative" style={{ width: av.w, height: av.size }}>
                      {avatars.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={src}
                          src={src}
                          alt=""
                          style={{
                            width: av.size,
                            height: av.size,
                            left: av.left[i] ?? i * av.left[1],
                            top: 0,
                            zIndex: i,
                          }}
                          className="absolute rounded-full object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {stat?.players != null ? (
                    <p
                      className={`font-serif leading-[1.1] font-semibold whitespace-nowrap text-white/60 ${
                        m ? "text-[10px] tracking-[-0.15px]" : "text-[15px] tracking-[-0.225px]"
                      }`}
                    >
                      {t("featuredPlayers", { count: compact(stat.players) })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Pager dots (2234:10823 / 2234:11215). */}
        {games.length > 1 ? (
          <div className={`flex items-center ${m ? "gap-[5px]" : "gap-[7px]"}`}>
            {games.map((g, i) => (
              <button
                key={g.id}
                type="button"
                aria-label={t("featuredSlide", { name: t(`games.${g.id}.name`) })}
                aria-current={i === index}
                onClick={() => setActive(i)}
                className={`rounded-full transition-colors ${m ? "size-[5px]" : "size-[7px]"} ${
                  i === index ? "bg-white" : "bg-white/35 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
