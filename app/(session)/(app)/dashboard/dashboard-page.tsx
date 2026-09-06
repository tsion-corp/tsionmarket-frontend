"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { useAppChrome, useReportActiveSection } from "@/components/layout/app-chrome";
import { PortfolioView } from "@/features/portfolio";
import { SectionOverview } from "@/components/ui/section-overview";
import { SpotOverview } from "@/features/trade/components/spot-overview";
import { PerpsOverview } from "@/features/trade/components/perps-overview";
import { MemeOverview } from "@/features/trade/components/meme-overview";
import { RwaOverview } from "@/features/rwa/components/rwa-overview";
import { ExploreBanners } from "@/components/layout/explore-banners";
// Deep imports for activity and remit, not their barrels. The activity barrel
// also exports the full ActivityView and the remit barrel the CrossBorderModal;
// neither renders here, and through the barrels both shipped in the dashboard's
// first load. optimizePackageImports only rewrites npm barrels, not ours.
import { DepositAnalytics } from "@/features/activity/components/deposit-analytics";
import { SectionVisibility } from "@/components/ui/section-visibility";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { BankDepositAnalytics } from "@/features/funds";
import { CrossBorderBanner } from "@/features/remit/components/cross-border-banner";
import { RwaSettlementTracker } from "@/features/rwa/components/rwa-settlement-tracker";
import { SquareComposeFab, SquareSection } from "@/features/square";
import { SquareLivePromo, SquarePeoplePromo, SquarePostsPromo } from "@/features/square";
import { useSpotMarkets } from "@/features/trade/hooks/use-spot-markets";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { useDepositPrefill } from "@/hooks/use-deposit-prefill";
import { useDashboardTour } from "@/features/tour";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";
import type { SectionId } from "@/lib/sections";
import type { DashboardModal } from "@/lib/modal-types";
import type { DepositPrefill } from "@/lib/voice/intent";

const SECTION_CLASS = "scroll-mt-[124px] md:scroll-mt-[76px]";

// Rows in each service brief. Four is enough to show the market is real and
// moving, and few enough that all four briefs together cost less scroll than
// the single spot table they replaced.
const PREVIEW_ROWS = 4;

/**
 * The services that appear on the dashboard as a brief rather than in full.
 *
 * Each has a page of its own; what stands here is a header, a line on what the
 * service is, four live rows, and the way in. The order is not fixed here: the
 * nav decides it, so the section a user chose at onboarding still leads.
 */
const BRIEFED_SECTIONS = ["spot", "perps", "meme", "rwa"] as const;
type BriefedSectionId = (typeof BRIEFED_SECTIONS)[number];

function isBriefed(id: SectionId): id is BriefedSectionId {
  return (BRIEFED_SECTIONS as readonly SectionId[]).includes(id);
}

const BRIEF_HREF: Record<BriefedSectionId, string> = {
  spot: "/spot",
  perps: "/perps",
  meme: "/meme",
  rwa: "/rwa",
};

// Which doorway follows which brief, indexed by the brief's position. Spread
// rather than stacked, so Prediction and Arkade are met while reading. An index
// with no entry gets no banner, so a reordered or shorter list still works.
const INTERLEAVED_BANNERS: readonly ("prediction" | "casino" | undefined)[] = [
  "prediction",
  undefined,
  "casino",
];

/**
 * Market Square blocks, by the same index — a SECOND track rather than entries
 * in the one above.
 *
 * Keeping them separate is the point: a square block can sit in a gap that
 * already has a product doorway without evicting it, and a new dashboard
 * section brings a new gap that either track can fill without renumbering the
 * other. The alternative — one array where a slot holds exactly one thing —
 * means every square block costs a doorway, which is a trade nobody wanted to
 * make.
 *
 * Live leads because it is perishable: it earns an early position that a post
 * does not. Posts follow it, and People sits at the foot of the briefs. Each
 * block renders nothing when it has nothing, so a quiet deployment simply
 * closes back up.
 */
const INTERLEAVED_SQUARE: readonly ("live" | "posts" | "people" | undefined)[] = [
  "live",
  undefined,
  "posts",
  "people",
];

// Portfolio is the only section still rendered in full here, so it is the only
// scroll-spy anchor: every other nav entry is now a route of its own.
const SCROLL_SECTIONS: readonly SectionId[] = ["portfolio"];

// The briefs stay mounted at once, so memoize them: with a stable row count
// they skip re-rendering when the page re-renders for a modal open/close. Each
// still re-renders on its own data.
const Portfolio = memo(PortfolioView);
const Spot = memo(SpotOverview);
const Perps = memo(PerpsOverview);
const Meme = memo(MemeOverview);
const Rwa = memo(RwaOverview);

const BRIEF_BODY: Record<BriefedSectionId, (props: { rows: number }) => React.ReactNode> = {
  spot: Spot,
  perps: Perps,
  meme: Meme,
  rwa: Rwa,
};

// The dashboard as the browser runs it. page.tsx beside this file is the
// server half: it starts the balance prefetch and streams it into the query
// cache while this renders.
export function DashboardPage() {
  const tSections = useTranslations("sections");
  const tOverview = useTranslations("overview");
  const tRemit = useTranslations("remitBanner");
  const { nav } = useAppChrome();
  // Which section sits under the header is scroll state, not a route fact, so
  // the rail is told from here while this page is mounted.
  const activeSection = useScrollSpy(SCROLL_SECTIONS);
  useReportActiveSection(activeSection);
  // The services briefed on this page, in the nav's own order.
  const briefs = useMemo(() => nav.map((n) => n.id).filter(isBriefed), [nav]);
  const buyParam = useSearchParams().get("buy");
  // The tradeable universe, so a $TICKER in a square post can open the real
  // buy sheet. Only gathered while something can use it: the square, when it
  // is shown, or a ?buy= deep link. The brief above reads the dashboard feed
  // now, so without one of those this would have been a price poll under a
  // page that already had its numbers.
  const { markets: spotMarkets } = useSpotMarkets({
    enabled: !MARKET_SQUARE_HIDDEN || buyParam !== null,
  });
  // The square's feed tab lives here because two siblings drive it: the
  // section's own strip, and the plus sheet's discussions.
  const [squareTab, setSquareTab] = useState<string | undefined>(undefined);
  const openTopic = useCallback((key: string) => {
    setSquareTab(`topic:${key}`);
    // Otherwise the tab changes off-screen and the tap reads as doing nothing.
    document.getElementById("market-square")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  const openDiscussion = useCallback((tag: string) => {
    setSquareTab(`tag:${tag}`);
    // Otherwise the tab changes off-screen and the tap reads as doing nothing.
    document.getElementById("market-square")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useDashboardTour();

  const modals = useAppModals();

  // A spoken deposit ("deposit USDC on Solana") lands here as URL params: open
  // the funds modal on the crypto screen with the chain/token pre-selected. The
  // hook returns a NEW prefill object each time a fresh deposit command arrives
  // and clears the URL params so a reload doesn't re-open it. We guard on the
  // prefill's identity (not a one-shot boolean) so a SECOND spoken deposit while
  // the page is still mounted re-opens the modal — the boolean latch used to
  // block every deposit after the first, which is why it only worked on refresh.
  const depositPrefill = useDepositPrefill();
  const openedDepositRef = useRef<DepositPrefill | null>(null);
  const openDeposit = modals.openDeposit;
  useEffect(() => {
    if (!depositPrefill || openedDepositRef.current === depositPrefill) return;
    openedDepositRef.current = depositPrefill;
    openDeposit(depositPrefill);
  }, [depositPrefill, openDeposit]);

  /**
   * `?buy=ETH` opens the buy sheet for that symbol.
   *
   * Market Square posts are full of $TICKER, and tapping one should land where
   * Ark would put you: the sheet that buys it. Without a URL for that, a
   * cross-product link could only drop somebody on a page and leave them to
   * find the coin themselves.
   *
   * DERIVED, not set in an effect. The catalogue arrives asynchronously, so an
   * effect would have to setState once it lands and trigger a second render
   * pass; deriving means the sheet is simply part of what this render already
   * knows. Dismissal is explicit rather than implied by clearing state, or the
   * derivation would immediately reopen what was just closed.
   *
   * An unknown symbol opens nothing: the square cannot know what this
   * deployment lists, and an empty sheet is worse than no sheet.
   */
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const deepLinkBuy = useMemo((): DashboardModal => {
    if (!buyParam || deepLinkDismissed) return null;
    const wanted = buyParam.toUpperCase();
    const market = spotMarkets.find((m) => m.symbol.toUpperCase() === wanted);
    if (!market) return null;
    return {
      type: "buy",
      buy: {
        symbol: market.symbol,
        name: market.name,
        priceUsd: market.priceUsd,
        logo: market.logo,
      },
    };
  }, [buyParam, deepLinkDismissed, spotMarkets]);

  // Strips the parameter so a refresh or a back does not reopen a sheet
  // somebody already dismissed. No setState here, only history.
  useEffect(() => {
    if (buyParam) window.history.replaceState(null, "", window.location.pathname);
  }, [buyParam]);

  // The deep-linked sheet only shows when nothing else is open.
  const active = modals.modal ?? deepLinkBuy;

  const closeModal = modals.close;
  const close = useCallback(() => {
    closeModal();
    setDeepLinkDismissed(true);
  }, [closeModal]);

  // Cross-border is not open yet. The banner stays as the announcement; a tap
  // says so rather than opening a flow that cannot complete.
  const openCrossBorder = useCallback(() => toast.info(tRemit("comingSoonToast")), [tRemit]);

  return (
    <>
      <RwaSettlementTracker />
      {/* Reports settled deposits. It used to ride on the recent-activity
            list that stood here; it is mounted on its own now that history
            lives only on its own page. */}
      <DepositAnalytics />
      {/* Follows a bank deposit to settlement so the arrival above can be
            reported as the Naira deposit it is, rather than as a chain one. */}
      <BankDepositAnalytics />

      {/* The account, in full. It is what someone opened Ark to see, and the
            only section that is not a doorway to somewhere else. */}
      <SectionVisibility id="portfolio" className={SECTION_CLASS}>
        <Portfolio
          onOpenFunds={modals.openFunds}
          onOpenWithdraw={modals.openWithdraw}
          crossBorderSlot={<CrossBorderBanner onClick={openCrossBorder} />}
          onOpenDetail={modals.openDetail}
          onOpenBuy={modals.openBuy}
          onOpenSell={modals.openSell}
          onOpenMemeSell={modals.openMemeSell}
          onOpenRwaTrade={modals.openRwaTrade}
        />
      </SectionVisibility>

      {briefs.map((id, index) => {
        const Body = BRIEF_BODY[id];
        return (
          <Fragment key={id}>
            {/* The id stays what it always was, so /dashboard#spot from
                  outside the app still lands here, and the walkthrough still
                  finds a section to point at.

                  The gate sits HERE, above the brief, not inside it. A brief
                  that called useSectionActive() in its own body would sit
                  ABOVE its own returned JSX and read the context default, so
                  it would poll regardless — the trap that made the RWA gating
                  dead code. RwaOverview and MemeOverview both run gated hooks
                  in their bodies, so a brief off screen must be wrapped from
                  out here to stay quiet. Renders a div with the same id and
                  classes, so the scroll-spy anchor is unchanged. */}
            <SectionVisibility id={id} className={SECTION_CLASS}>
              <SectionOverview
                title={tSections(id)}
                blurb={tOverview(`${id}Blurb`)}
                href={BRIEF_HREF[id]}
                action={tOverview("viewAll", { section: tSections(id) })}
              >
                <Body rows={PREVIEW_ROWS} />
              </SectionOverview>
            </SectionVisibility>
            {/* One doorway between the briefs, so Prediction and Arkade are
                  met while reading rather than only at the very bottom. */}
            {INTERLEAVED_BANNERS[index] ? (
              <ExploreBanners only={INTERLEAVED_BANNERS[index]} />
            ) : null}
            {/* Closed by the launch switch, the gaps close up and the doorway
                  track above is unaffected. */}
            {MARKET_SQUARE_HIDDEN ? null : (
              <>
                {INTERLEAVED_SQUARE[index] === "live" ? <SquareLivePromo /> : null}
                {INTERLEAVED_SQUARE[index] === "posts" ? <SquarePostsPromo /> : null}
                {INTERLEAVED_SQUARE[index] === "people" ? <SquarePeoplePromo /> : null}
              </>
            )}
          </Fragment>
        );
      })}

      {/* The social floor of the dashboard. It sits AFTER the markets on
            purpose: someone opening Ark came for their money, and the square
            is what they scroll into once they are done reading it — met by
            browsing rather than by deciding to leave for another deployment.
            MARKET_SQUARE_HIDDEN in lib/market-square.ts is the off switch. */}
      {MARKET_SQUARE_HIDDEN ? null : (
        <SquareSection
          onOpenBuy={modals.openBuy}
          markets={spotMarkets}
          tab={squareTab}
          onTabChange={setSquareTab}
        />
      )}
      {/* Fixed to the viewport, so it sits the same wherever it renders. It
          reveals itself once the square is in reach. */}
      {MARKET_SQUARE_HIDDEN ? null : (
        <SquareComposeFab
          markets={spotMarkets}
          onPickTopic={openTopic}
          onPickDiscussion={openDiscussion}
        />
      )}

      <AppModalHost active={active} onClose={close} onConfirmed={modals.showDone} />
    </>
  );
}
