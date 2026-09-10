"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import { useMoney } from "@/components/ui/currency-select";
import { parseCloseTime } from "@/hooks/use-countdown";
import { BetModal } from "@/features/prediction/components/bet-modal";
import { usePredictions } from "@/features/prediction/hooks/use-predictions";
import { usePolymarketAccess } from "@/features/prediction/hooks/use-polymarket-access";
import type { Prediction } from "@/lib/types";

// The Market design's phone Prediction tab (Figma 1:16194): the market cards
// stacked in one column under the shared search and category strip. Each card is
// a coloured header band carrying the market's artwork and question, the two
// outcomes as rows below it, and a footer of volume and close date.
//
// The comp draws three cards, two of them with several named outcomes. This
// deployment's markets are binary: one Yes and one No per market, which is what
// the feed carries and what the CLOB can price. So every card is the comp's
// third variant, the one with a Predict Yes row and a Predict No row.
//
// Two things the comp shows are not in the feed and are therefore not drawn: the
// trade count ("7.1k Trades") and the sample volume and names. Volume comes from
// the feed's own figure through the money layer, the close date from the feed's
// own timestamp, and both elements are absent when the feed states neither.

const SKELETON_COUNT = 3;

/**
 * The market artwork as a URL safe to put inside a CSS `url()`.
 *
 * The image comes from an upstream feed and is interpolated into a style
 * attribute, so it is parsed before use: anything that is not an http(s) URL is
 * refused, and parsing normalises the quotes, backslashes and newlines that
 * would otherwise let the value break out of the `url()` token.
 */
function artworkUrl(image: string | null | undefined): string | null {
  if (!image) return null;
  try {
    const url = new URL(image);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    // Not a URL. The card falls back to the plain dark header.
    return null;
  }
}

interface OutcomePillProps {
  label: string;
  tone: "yes" | "no";
  /** The question element, so a screen reader hears which market this buys. */
  describedBy: string;
  onPress: () => void;
}

// The pill's visual size is the comp's (about 32px tall). The button around it
// is 44px in both directions, which is the tap target the design system asks
// for, so the press area is bigger than the paint. Colour is not the only
// signal: each pill says which side it is in words.
function OutcomePill({ label, tone, describedBy, onPress }: OutcomePillProps) {
  const skin =
    tone === "yes"
      ? "border-[#34ca5b]/15 bg-[#34ca5b]/10 text-[#34ca5b]"
      : "border-[#ed2b07]/15 bg-[#ff3a34]/20 text-[#ff3a34]";
  return (
    <button
      type="button"
      onClick={onPress}
      aria-describedby={describedBy}
      className="ws-pressable flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center"
    >
      <span className={`rounded-[9px] border px-3.5 py-1.5 text-[12.5px] font-medium ${skin}`}>
        {label}
      </span>
    </button>
  );
}

interface PredictionMarketCardProps {
  prediction: Prediction;
  /** Where the market opens, or undefined when this app has no route for it. */
  href?: string;
  /** Volume, already in the reader's currency. Null when the feed states none. */
  volumeLabel: string | null;
  /** The close date, already formatted. Null when the feed carries no date. */
  endsLabel: string | null;
  onPredict: (yes: boolean) => void;
}

function PredictionMarketCard({
  prediction: p,
  href,
  volumeLabel,
  endsLabel,
  onPredict,
}: PredictionMarketCardProps) {
  const t = useTranslations("prediction");
  const questionId = useId();
  const artwork = artworkUrl(p.image);

  return (
    // `relative` is on the card root and nowhere between it and the link: the
    // link's stretched ::after is positioned against its nearest positioned
    // ancestor, so a positioned wrapper in between would shrink the card's hit
    // area to that wrapper.
    <article
      aria-labelledby={questionId}
      className="relative flex flex-col gap-5 overflow-hidden rounded-[17px] border-2 border-[#767474] bg-[#292929] pb-3.5"
    >
      {/* Header band. The comp's violet, olive and red come from the market's
          own artwork, so it is painted as the band's background with a scrim
          over it, in one background-image rather than an overlay element: an
          absolutely positioned overlay would have to sit in a positioned
          ancestor, which is what the stretched link cannot have. */}
      <div
        className="flex items-center gap-3.5 rounded-t-[15px] bg-black/40 bg-cover bg-center p-3.5"
        style={
          artwork
            ? {
                backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${artwork}")`,
              }
            : undefined
        }
      >
        <span className="block size-[45px] shrink-0 overflow-hidden rounded-full bg-white/10">
          {artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artwork} alt="" loading="lazy" className="size-full object-cover" />
          ) : null}
        </span>
        {/* The question is the link's own text, so the link's accessible name
            is the market it opens. */}
        <p
          id={questionId}
          className="ws-display min-w-0 flex-1 text-[16px] leading-[1.2] font-semibold tracking-[-0.48px] text-[#e8eaed]"
        >
          {href ? (
            // `data-no-ripple`: click-ripple.tsx sets `position: relative` on a
            // statically positioned anchor at pointerdown so it can host its
            // ripple layer, which turns this anchor into the containing block
            // for its own stretched ::after and collapses the hit area between
            // pointerdown and mouseup. The clamp then sits on the span inside
            // the link, never on an ancestor: `line-clamp` is
            // `overflow: hidden`, and hidden overflow above the link clips the
            // stretched ::after back to the text box.
            <Link
              href={href}
              data-no-ripple
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-[#b9fcff]"
            >
              <span className="line-clamp-3">{p.q}</span>
            </Link>
          ) : (
            <span className="line-clamp-3">{p.q}</span>
          )}
        </p>
      </div>

      {/* The two outcomes, each with its standing price and its pill. Raised out
          of the stretched link's reach so the pills keep their own presses. */}
      <div className="relative z-[1] flex flex-col gap-1 px-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] leading-[1.2] font-semibold tracking-[-0.36px] text-[#e8eaed]">
            {t("yesLabel")} <span className="tnum text-white/55">{p.yes}</span>
          </span>
          <OutcomePill
            label={t("predictYes")}
            tone="yes"
            describedBy={questionId}
            onPress={() => onPredict(true)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] leading-[1.2] font-semibold tracking-[-0.36px] text-[#e8eaed]">
            {t("noLabel")} <span className="tnum text-white/55">{p.no}</span>
          </span>
          <OutcomePill
            label={t("predictNo")}
            tone="no"
            describedBy={questionId}
            onPress={() => onPredict(false)}
          />
        </div>
      </div>

      {/* Footer. Nothing here is interactive, so it stays under the stretched
          link. The comp's trade count has no counterpart in the feed and is not
          drawn; volume and the close date are drawn only when the feed has
          them. */}
      {volumeLabel || endsLabel ? (
        <div className="flex items-center justify-between gap-3 px-3.5 text-[10px] font-semibold text-white/50">
          {volumeLabel ? (
            <span data-testid="market-volume" className="tnum flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/prediction/icon-volume.svg" alt="" className="size-[13px]" />
              {volumeLabel}
            </span>
          ) : null}
          {endsLabel ? (
            <span data-testid="market-ends" className="ml-auto">
              {endsLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CardSkeleton() {
  return (
    <div
      data-testid="market-skeleton"
      className="overflow-hidden rounded-[17px] border-2 border-[#767474] bg-[#292929] pb-3.5"
    >
      <div className="flex items-center gap-3.5 bg-black/40 p-3.5">
        <span className="size-[45px] shrink-0 animate-pulse rounded-full bg-white/10" />
        <span className="h-4 flex-1 animate-pulse rounded bg-white/10" />
      </div>
      <div className="flex flex-col gap-3 px-3.5 pt-5">
        <span className="block h-8 animate-pulse rounded-[9px] bg-white/8" />
        <span className="block h-8 animate-pulse rounded-[9px] bg-white/8" />
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[17px] border-2 border-white/8 px-6 py-10 text-center">
      {children}
    </div>
  );
}

/**
 * The phone Prediction tab's market list.
 *
 * A container: it reads the feed, turns the two numbers the cards cannot format
 * themselves (volume and the close date) into strings, and hosts the bet flow a
 * pill opens. The card below it is presentational and holds no data layer.
 */
export function PredictionMarketList() {
  const t = useTranslations("prediction");
  const money = useMoney();
  const format = useFormatter();
  const access = usePolymarketAccess();
  const { data, isPending, isError, refetch } = usePredictions();
  const [bet, setBet] = useState<{ p: Prediction; side: "yes" | "no" } | null>(null);

  if (!access.allowed) {
    return (
      <Notice>
        <span className="ws-display text-[18px] text-white">{t("regionBlockedTitle")}</span>
        <p className="max-w-[300px] text-[13px] font-normal text-white/55">
          {t("regionBlockedBody", { brand: BRAND })}
        </p>
      </Notice>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 pb-6">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Notice>
        <p className="text-[13px] font-normal text-white/55">{t("mobileMarketsError")}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="ws-pressable flex min-h-[44px] cursor-pointer items-center rounded-[9px] border border-white/12 bg-white/8 px-4 text-[13px] font-semibold text-white"
        >
          {t("refresh")}
        </button>
      </Notice>
    );
  }

  const markets = data ?? [];
  if (markets.length === 0) {
    return (
      <Notice>
        <p className="text-[13px] font-normal text-white/55">{t("mobileNoMarkets")}</p>
      </Notice>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 pb-6">
        {markets.map((p) => {
          // Volume is money, so it goes through the app's money layer and
          // reaches the card already in the reader's currency. A market that
          // reports no volume gets no volume element: nothing here invents a
          // zero.
          const volumeLabel =
            typeof p.volumeUsd === "number" && Number.isFinite(p.volumeUsd) && p.volumeUsd > 0
              ? money.format(p.volumeUsd)
              : null;

          // The deadline is the feed's own instant. parseCloseTime returns null
          // for a missing or unparseable date, and a null here means the card
          // shows no date at all rather than a made-up one. The date is
          // rendered in UTC so the server's first paint and the client's
          // hydration agree on which day it is.
          const closeMs = parseCloseTime(p.endsAt);
          const endsLabel =
            closeMs === null
              ? null
              : t("closesAt", {
                  when: format.dateTime(new Date(closeMs), {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }),
                });

          return (
            <PredictionMarketCard
              key={p.conditionId ?? p.eventId ?? p.q}
              prediction={p}
              // No detail route on this build: the question is plain text and
              // the Yes and No pills are the way in.
              href={undefined}
              volumeLabel={volumeLabel}
              endsLabel={endsLabel}
              onPredict={(yes) => setBet({ p, side: yes ? "yes" : "no" })}
            />
          );
        })}
      </div>

      <BetModal
        prediction={bet?.p ?? null}
        side={bet?.side ?? "yes"}
        onClose={() => setBet(null)}
      />
    </>
  );
}
