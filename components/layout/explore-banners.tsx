"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

const BANNERS = [
  {
    id: "prediction",
    href: "/prediction",
    image:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80&auto=format&fit=crop",
    tintRgb: "96 165 250",
  },
  {
    id: "earn",
    href: "/earn",
    image:
      "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&q=80&auto=format&fit=crop",
    tintRgb: "251 191 36",
  },
  {
    id: "casino",
    href: "/casino",
    image:
      "https://images.unsplash.com/photo-1522069213448-443a614da9b6?w=1200&q=80&auto=format&fit=crop",
    tintRgb: "248 113 113",
  },
] as const;

type BannerId = (typeof BANNERS)[number]["id"];

interface ExploreBannersProps {
  // Renders one banner rather than the set. The dashboard uses this to place
  // them between sections on a phone, where three at the foot of a long page
  // is three the reader has already scrolled past.
  only?: BannerId;
}

// Doorways to the routed destinations (prediction, earn, casino), pitched
// where the prediction section used to scroll.
export function ExploreBanners({ only }: ExploreBannersProps = {}) {
  const t = useTranslations("explore");
  const shown = only ? BANNERS.filter((b) => b.id === only) : BANNERS;

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* One banner is a full-width card in its own right. The set is a swipe
          track on a phone, one card at a time with the next one peeking, and a
          row of three from 900px. */}
      <div
        className={
          only
            ? "grid grid-cols-1"
            : "flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto pb-1 min-[900px]:grid min-[900px]:grid-cols-3 min-[900px]:overflow-visible [&::-webkit-scrollbar]:hidden"
        }
      >
        {shown.map((b) => (
          <Link
            key={b.id}
            href={b.href}
            className={`group hover:border-accent/50 relative flex h-[190px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[20px] border border-white/10 p-5 transition-[transform,border-color] duration-150 hover:-translate-y-0.5 ${
              only ? "w-full" : "w-[82%] min-[900px]:w-auto"
            }`}
          >
            <span aria-hidden className="pointer-events-none absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.image}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <span
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, rgb(${b.tintRgb} / 0.32), transparent 60%)`,
                  mixBlendMode: "hard-light",
                }}
              />
              {/* The copy sits along the foot, so the scrim is heaviest there
                  and clears entirely by the top, leaving most of the picture
                  visible. Photographs vary wildly in brightness, and a scrim
                  that merely tints leaves white text on whatever happens to be
                  behind it. */}
              <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.7)_28%,rgba(0,0,0,0.3)_58%,rgba(0,0,0,0)_92%)]" />
              {/* A shallow blur over the words only. It softens high-contrast
                  detail directly under them without flattening the image, which
                  a heavier scrim would. */}
              <span className="absolute inset-x-0 bottom-0 h-[62%] [mask-image:linear-gradient(to_top,#000_35%,transparent)] backdrop-blur-[2px]" />
            </span>

            <span className="relative">
              <span className="ws-display block text-[22px] leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
                {t(`${b.id}Title`)}
              </span>
              <span className="mt-1 block text-[12.5px] font-normal text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
                {t(`${b.id}Body`)}
              </span>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-3.5 py-1.5 font-sans text-[12.5px] font-semibold text-white backdrop-blur-sm transition-colors group-hover:border-white/45">
                {t("cta")}
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  ›
                </span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
