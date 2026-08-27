"use client";

import { useTranslations } from "next-intl";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { squareLinks } from "@/lib/square/links";
import type { MarketSquareFeedStream } from "@/lib/api/market-square";

/**
 * Live rooms, as a horizontal rail above the feed.
 *
 * A rail rather than a stacked list because live is perishable: it earns a
 * glance and a tap, and a vertical list of rooms would push the feed — the
 * thing that is always there — below the fold to advertise something that may
 * be over in ten minutes. It renders nothing at all when nobody is live, so
 * the section does not carry a permanently empty shelf.
 */
export function SquareLiveStrip({ streams }: { streams: MarketSquareFeedStream[] }) {
  const t = useTranslations("square");
  if (streams.length === 0) return null;

  return (
    <div className="-mx-4 mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {streams.map((stream) => {
        const href = squareLinks.live(stream.id);
        const content = (
          <>
            <SquareAvatar
              src={stream.owner?.avatarUrl ?? null}
              seed={stream.owner?.id ?? stream.id}
              size={28}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-white">
                {stream.owner ? `@${stream.owner.username}` : stream.title}
              </span>
              <span className="text-grey-500 block truncate text-[11px]">
                {t("watching", { count: stream.peakViewers })}
              </span>
            </span>
            {/* The live tell: a dot that pulses. Motion is what separates "on
                now" from "was on", and it is the only animation in the rail —
                which is also why it is the one thing here that is not grey.
                `motion-safe` so it holds still for anyone who asked for that. */}
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="bg-accent absolute inline-flex h-full w-full rounded-full opacity-70 motion-safe:animate-ping" />
              <span className="bg-accent relative inline-flex h-2 w-2 rounded-full" />
            </span>
          </>
        );
        // Monochrome, because Ark's brand is (globals.css: "no purple, no
        // gold"). The rail earns its prominence from contrast and motion
        // rather than from a colour borrowed off another product.
        const className =
          "border-grey-800 bg-grey-900 hover:border-grey-700 flex w-[212px] shrink-0 " +
          "snap-start items-center gap-2 rounded-full border px-3 py-2 transition-colors";
        return href ? (
          <a
            key={stream.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            {content}
          </a>
        ) : (
          <div key={stream.id} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
