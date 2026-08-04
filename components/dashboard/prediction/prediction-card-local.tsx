import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CloseTimer } from "@/components/dashboard/prediction/close-timer";
import { compactUsd, priceToCents, priceToPct } from "@/lib/prediction/format";
import type { Market } from "@/lib/prediction/types";

interface PredictionCardProps {
  market: Market;
}

// A single market tile in the Local browse grid. The whole card links to the
// market detail page; the YES/NO buttons deep-link to it with a side preselected
// so the execution panel opens on that outcome. No "Local" badge here — the tab
// already identifies the source, so a per-card badge would be redundant noise.
export function LocalPredictionCard({ market: m }: PredictionCardProps) {
  const t = useTranslations("prediction");
  const href = `/prediction/${m.marketId}`;
  const yesCents = priceToCents(m.priceYes);
  const noCents = priceToCents(m.priceNo);

  return (
    <div className="ws-beam ws-card relative flex h-full flex-col overflow-hidden rounded-[20px]">
      <Link href={href} className="flex flex-1 flex-col">
        {m.imageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            {/* Market art is hosted on Cloudinary; a plain img avoids per-host
                next/image allowlisting, matching the other remote images. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,14,0.15),rgba(12,12,14,0.85))]" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-5 pb-2.5">
              {m.category ? (
                <span className="rounded-full border border-white/14 bg-black/45 px-[11px] py-1 text-xs font-normal text-white/85 backdrop-blur-sm">
                  {m.category}
                </span>
              ) : (
                <span />
              )}
              <span className="text-xs font-normal text-white/70">{compactUsd(m.volumeUsdc)}</span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col p-5 sm:p-[22px]">
          {m.imageUrl ? null : (
            <div className="mb-3.5 flex items-center justify-between">
              <span className="rounded-full border border-white/12 bg-white/7 px-[11px] py-1 text-xs font-normal text-white/75">
                {m.category ?? t("marketFallback")}
              </span>
              <span className="text-xs font-normal text-white/45">{compactUsd(m.volumeUsdc)}</span>
            </div>
          )}
          <div className="flex-1 font-sans text-[17px] leading-[1.3] font-medium">
            {m.question ?? t("marketFallback")}
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="ws-display text-accent text-[30px]">{yesCents}</span>
            <span className="text-[13px] font-normal text-white/50">{t("yesLabel")}</span>
          </div>
          <div className="mt-1.5">
            <ProgressBar pct={priceToPct(m.priceYes)} />
          </div>
          <CloseTimer
            closeTime={m.closeTime}
            status={m.status}
            className="mt-2.5 text-[11.5px] font-normal text-white/45"
          />
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:px-[22px]">
        <Link
          href={`${href}?side=yes`}
          className="border-up/35 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-[11px] border p-[11px] text-center font-sans text-[13px] leading-tight font-semibold"
        >
          {t("buyYes", { price: yesCents })}
        </Link>
        <Link
          href={`${href}?side=no`}
          className="border-down/30 bg-down/12 text-down hover:bg-down/18 cursor-pointer rounded-[11px] border p-[11px] text-center font-sans text-[13px] leading-tight font-semibold"
        >
          {t("buyNo", { price: noCents })}
        </Link>
      </div>
    </div>
  );
}
