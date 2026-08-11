import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CloseTimer } from "@/features/prediction/components/close-timer";
import { compactUsd, priceToCents, priceToPct } from "@/features/prediction/lib/format";
import type { MarketGroup } from "@/features/prediction/lib/types";

interface EventCardProps {
  group: MarketGroup;
}

// How many outcome rows to preview on the card before "+N more". The event
// detail page lists all of them; the card is a teaser of the leading outcomes.
const PREVIEW_OUTCOMES = 3;

// A multi-outcome EVENT tile in the Local browse grid (Polymarket's grouped
// "event" card). Unlike a single market it has no single YES/NO price — it
// previews the leading outcomes with their normalized probabilities and links to
// the event detail page, where each outcome is its own tradable YES/NO market.
export function EventCard({ group }: EventCardProps) {
  const t = useTranslations("prediction");
  // Outcomes arrive already sorted by prominence (highest YES first) from the
  // backend; preview the leaders and summarize the rest.
  const preview = group.outcomes.slice(0, PREVIEW_OUTCOMES);
  const remaining = group.outcomeCount - preview.length;
  const href = `/prediction/event/${group.slug}`;

  return (
    <div className="ws-beam ws-card relative flex h-full flex-col overflow-hidden rounded-[20px]">
      <Link href={href} className="flex flex-1 flex-col">
        {group.imageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={group.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,14,0.15),rgba(12,12,14,0.85))]" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-5 pb-2.5">
              {group.category ? (
                <span className="rounded-full border border-white/14 bg-black/45 px-[11px] py-1 text-xs font-normal text-white/85 backdrop-blur-sm">
                  {group.category}
                </span>
              ) : (
                <span />
              )}
              <span className="text-xs font-normal text-white/70">
                {compactUsd(group.volumeUsdc)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col px-5 pt-5 pb-3.5 sm:px-[22px] sm:pt-[22px]">
          <div className="mb-3 flex items-center justify-between">
            {group.imageUrl ? (
              <span className="border-accent/25 bg-accent/10 text-accent rounded-full border px-[11px] py-1 text-xs font-normal">
                {t("outcomeCount", { count: group.outcomeCount })}
              </span>
            ) : (
              <span className="rounded-full border border-white/12 bg-white/7 px-[11px] py-1 text-xs font-normal text-white/75">
                {group.category ?? t("marketFallback")}
              </span>
            )}
            {group.imageUrl ? null : (
              <span className="text-xs font-normal text-white/45">
                {compactUsd(group.volumeUsdc)}
              </span>
            )}
          </div>

          <div className="font-sans text-[17px] leading-[1.3] font-medium">{group.title}</div>
        </div>
      </Link>

      {/* Leading outcomes, each with a probability bar and its own Yes/No — every
          outcome IS a standalone binary market, so the buttons deep-link to that
          member market's detail page with the side preselected (NOT to the event
          page). Kept OUTSIDE the event <Link> above so these per-outcome links
          aren't nested inside another anchor. */}
      <div className="flex flex-1 flex-col gap-2.5 px-5 sm:px-[22px]">
        {preview.map((o) => {
          const outcomeHref = `/prediction/${o.marketId.toString()}`;
          return (
            <div key={o.memberId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-white/75">
                  {o.label}
                </span>
                <span className="ws-display text-accent text-[15px]">
                  {priceToCents(o.normalizedYes)}
                </span>
              </div>
              <ProgressBar pct={priceToPct(o.normalizedYes)} />
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`${outcomeHref}?side=yes`}
                  className="border-up/35 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-[10px] border py-2 text-center font-sans text-[12px] leading-tight font-semibold"
                >
                  {t("buyYes", { price: priceToCents(o.priceYes) })}
                </Link>
                <Link
                  href={`${outcomeHref}?side=no`}
                  className="border-down/30 bg-down/12 text-down hover:bg-down/18 cursor-pointer rounded-[10px] border py-2 text-center font-sans text-[12px] leading-tight font-semibold"
                >
                  {t("buyNo", { price: priceToCents(o.priceNo) })}
                </Link>
              </div>
            </div>
          );
        })}
        {remaining > 0 ? (
          <span className="text-[12px] font-normal text-white/40">
            {t("moreOutcomes", { count: remaining })}
          </span>
        ) : null}
      </div>

      <div className="mt-3.5 flex items-center justify-between px-5 pb-5 sm:px-[22px]">
        <CloseTimer
          closeTime={group.closeTime}
          status={group.status}
          className="text-[11.5px] font-normal text-white/45"
        />
        <Link
          href={href}
          className="cursor-pointer rounded-[10px] border border-white/12 bg-white/6 px-3 py-1.5 font-sans text-[12px] leading-tight font-semibold text-white/85 hover:bg-white/10"
        >
          {t("viewOutcomes")}
        </Link>
      </div>
    </div>
  );
}
