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

// Doorways to the routed destinations (prediction, earn, casino), pitched
// where the prediction section used to scroll.
export function ExploreBanners() {
  const t = useTranslations("explore");

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
        {BANNERS.map((b) => (
          <Link
            key={b.id}
            href={b.href}
            className="group hover:border-accent/50 relative flex h-[190px] flex-col justify-end overflow-hidden rounded-[20px] border border-white/10 p-5 transition-[transform,border-color] duration-150 hover:-translate-y-0.5"
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
              <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.35)_55%,rgba(0,0,0,0.1)_100%)]" />
            </span>

            <span className="relative">
              <span className="ws-display block text-[22px] leading-tight text-white">
                {t(`${b.id}Title`)}
              </span>
              <span className="mt-1 block text-[12.5px] font-normal text-white/65">
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
