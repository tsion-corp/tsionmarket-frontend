"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import { useMoney } from "@/components/ui/currency-select";
import { SearchField } from "@/components/ui/search-field";
import { ModalShell } from "@/components/ui/modal-shell";
import { parseCloseTime } from "@/hooks/use-countdown";
import { BetModal } from "@/features/prediction/components/bet-modal";
import { usePredictions } from "@/features/prediction/hooks/use-predictions";
import { usePolymarketAccess } from "@/features/prediction/hooks/use-polymarket-access";
import { usePolymarketPositionsController } from "@/features/prediction/hooks/use-polymarket-positions-controller";
import { PredictionPositions } from "@/features/prediction/components/prediction-positions";
import { LocalPredictionView } from "@/features/prediction/components/local-prediction-view";
import type { Prediction } from "@/lib/types";

// The Market design's phone Prediction tab (Figma 1:16194): the market cards
// stacked in one column under this tab's own search field. Each card is a
// coloured header band carrying the market's artwork and question, the two
// outcomes as rows below it, and a footer of volume and close date.
//
// The search field belongs to this list rather than to the Market page around
// it. The page used to pin one shared field above the tab strip and disable it
// here, because this list took no query and could not filter; now every tab owns
// a working field that scrolls away with its own rows.
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

/**
 * Does this market answer what the reader typed?
 *
 * Two fields are searched, and they are the two a reader can actually name. The
 * question is the market's identity and the only sentence the card prints, so it
 * is what someone types when they remember a market. The category beside it is
 * how someone finds a whole subject ("politics", "sports") without recalling any
 * one question.
 *
 * Nothing else is matched: prices and volume are numbers a reader searches by
 * eye, and the feed's raw tag labels are not shown anywhere on the screen, so
 * matching on them would hide markets behind words nobody can see.
 *
 * `needle` arrives trimmed and lower-cased so the query is normalised once per
 * keystroke rather than once per market.
 */
function matchesQuery(p: Prediction, needle: string): boolean {
  return p.q.toLowerCase().includes(needle) || p.tag.toLowerCase().includes(needle);
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
 * A container: it reads the feed, holds the tab's search query, turns the two
 * numbers the cards cannot format themselves (volume and the close date) into
 * strings, and hosts the bet flow a pill opens. The card below it is
 * presentational and holds no data layer.
 *
 * It takes no query prop. The field is this list's own, so the Market page
 * around it neither holds prediction search state nor knows how a prediction is
 * matched.
 */
export function PredictionMarketList() {
  const t = useTranslations("prediction");
  const money = useMoney();
  const format = useFormatter();
  const access = usePolymarketAccess();
  const { data, isPending, isError, refetch } = usePredictions();
  const [bet, setBet] = useState<{ p: Prediction; side: "yes" | "no" } | null>(null);
  const [query, setQuery] = useState("");
  // Global = live Polymarket markets, Local = our on-chain CPMM markets, the
  // same two sources the desktop prediction view switches between.
  const [source, setSource] = useState<"polymarket" | "local">("polymarket");
  // The positions flow (claim, sell, cash-out), shared with the desktop view
  // through one hook. Nothing fetches until the reader opens the sheet.
  const positionsCtl = usePolymarketPositionsController();
  // On the phone the positions live behind a button in a sheet, not inline: the
  // tab stays the market list, and "Load positions" opens the sheet and loads.
  const [positionsOpen, setPositionsOpen] = useState(false);
  const openPositions = () => {
    setPositionsOpen(true);
    positionsCtl.positions.refresh();
  };

  const markets = data ?? [];
  // Trimmed and lower-cased once here, not once per market: a query of spaces
  // alone is no query at all and leaves the list whole.
  const needle = query.trim().toLowerCase();
  const visible = needle ? markets.filter((p) => matchesQuery(p, needle)) : markets;

  let content: ReactNode;
  if (!access.allowed) {
    // Region-blocked: the global (Polymarket) list has nothing behind it here.
    // Local stays reachable through the toggle above, so this is a content
    // state rather than replacing the whole tab.
    content = (
      <Notice>
        <span className="ws-display text-[18px] text-white">{t("regionBlockedTitle")}</span>
        <p className="max-w-[300px] text-[13px] font-normal text-white/55">
          {t("regionBlockedBody", { brand: BRAND })}
        </p>
      </Notice>
    );
  } else if (isPending) {
    content = Array.from({ length: SKELETON_COUNT }, (_, i) => <CardSkeleton key={i} />);
  } else if (isError) {
    content = (
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
  } else if (markets.length === 0) {
    content = (
      <Notice>
        <p className="text-[13px] font-normal text-white/55">{t("mobileNoMarkets")}</p>
      </Notice>
    );
  } else if (visible.length === 0) {
    // A query that matches nothing gets its own line, separate from the feed
    // being empty: the markets are open, they just are not these. The field
    // stays above it so the reader can clear the query without leaving the tab.
    content = (
      <Notice>
        <p className="text-[13px] font-normal text-white/55">{t("noSearchMatches")}</p>
      </Notice>
    );
  } else {
    content = visible.map((p) => {
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
    });
  }

  return (
    <>
      {/* One column for the field and everything under it, so the 24px gap the
          comp puts between the search box and the first card is the same gap
          that separates the cards from each other.

          No horizontal margin of its own: the host scroll box in the Market page
          bleeds 4px each side (`-mx-1`) and the field is a direct child of that
          box exactly as the cards are, so both meet the same edge and the field
          lines up with the rows below it. Any margin here would push it out of
          line with them. */}
      <div className="flex flex-col gap-6 pb-6">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("searchEventMarketsLabel")}
          placeholder={t("searchEventMarketsLabel")}
          // Off on the Local tab (it browses its own way) and while the global
          // feed is arriving, failed, or region-blocked. Back the moment global
          // markets land.
          disabled={source === "local" || isPending || isError || !access.allowed}
        />

        {/* One row under the search: the Global/Local toggle on the left, the
            Load-positions button on the right, spaced apart. Tapping Load opens
            the positions sheet; the open bets never sit inline on the phone. */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex gap-1 rounded-xl bg-white/5 p-1">
            {(["polymarket", "local"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg px-4 text-[13px] font-semibold transition-colors ${
                  source === s ? "bg-white/12 text-white" : "text-white/50 hover:text-white/75"
                }`}
              >
                {t(`sourceTab_${s}`)}
              </button>
            ))}
          </div>
          {source === "polymarket" && access.allowed ? (
            <button
              type="button"
              onClick={openPositions}
              className="ws-pressable flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/12 bg-white/6 px-4 text-[13px] font-semibold text-white"
            >
              {t("loadPositions")}
            </button>
          ) : null}
        </div>

        {source === "local" ? <LocalPredictionView /> : content}
      </div>

      {/* The positions sheet: the same panel the desktop shows, opened from the
          button above rather than sitting inline. */}
      <ModalShell open={positionsOpen} onClose={() => setPositionsOpen(false)}>
        <PredictionPositions controller={positionsCtl} />
      </ModalShell>

      <BetModal
        prediction={bet?.p ?? null}
        side={bet?.side ?? "yes"}
        onClose={() => setBet(null)}
        onPlaced={positionsCtl.positions.refresh}
      />
    </>
  );
}
