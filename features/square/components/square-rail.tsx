"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import type { MarketSquareFeedStream } from "@/lib/api/market-square";

/**
 * The desktop companion column.
 *
 * A feed reads at roughly 600px whatever the monitor is, so on a wide
 * dashboard a lone centred column leaves two dead gutters — which is exactly
 * what the first cut of this looked like. Every major social surface solves it
 * the same way: keep the feed at reading width and give the leftover width to
 * a rail of things worth glancing at.
 *
 * Hidden below `lg` — on a phone this content appears as the horizontal live
 * rail instead, rather than stacked underneath where nobody scrolls.
 */
export function SquareRail({ streams }: { streams: MarketSquareFeedStream[] }) {
  const t = useTranslations("square");
  const squareHref = squareLinks.home();

  return (
    <aside className="hidden w-[300px] shrink-0 lg:block">
      {streams.length > 0 ? (
        <section className="ws-inset p-4">
          <h3 className="text-grey-400 flex items-center gap-2 text-[11.5px] font-medium tracking-[0.14em] uppercase">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="bg-accent absolute inline-flex h-full w-full rounded-full opacity-70 motion-safe:animate-ping" />
              <span className="bg-accent relative inline-flex h-1.5 w-1.5 rounded-full" />
            </span>
            {t("liveNow")}
          </h3>
          <ul className="mt-3 flex flex-col gap-1">
            {streams.slice(0, 5).map((stream) => {
              const href = squareLinks.live(stream.id);
              const row = (
                <>
                  <SquareAvatar
                    src={stream.owner?.avatarUrl ?? null}
                    seed={stream.owner?.id ?? stream.id}
                    size={30}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-white">
                      {stream.title}
                    </span>
                    <span className="text-grey-500 block truncate text-[11.5px]">
                      {stream.owner ? `@${stream.owner.username} · ` : ""}
                      {t("watching", { count: stream.peakViewers })}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={stream.id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:bg-grey-800/70 -mx-2 flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors"
                    >
                      {row}
                    </a>
                  ) : (
                    <span className="-mx-2 flex items-center gap-2.5 px-2 py-2">{row}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {squareHref ? (
        <section className="ws-inset mt-3 p-4">
          <h3 className="text-[13px] font-semibold text-white">{t("railTitle")}</h3>
          <p className="text-grey-500 mt-1 text-[12px] leading-[18px]">{t("railBlurb")}</p>
          <a
            href={squareHref}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent text-ink mt-3 inline-flex h-9 items-center rounded-full px-4 text-[12.5px] font-semibold transition-[filter] hover:brightness-110"
          >
            {t("openSquare")}
          </a>
        </section>
      ) : null}
    </aside>
  );
}
