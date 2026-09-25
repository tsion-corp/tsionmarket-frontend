"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { useAppChrome, useReportActiveSection } from "@/components/layout/app-chrome";
import { PortfolioView } from "@/features/portfolio";
// Deep import, not the @/features/migrate barrel: that barrel re-exports the
// sweep button, which mounts the whole Privy SDK. This hook is light — a
// localStorage read, the migration status, and one cached lookup.
import { useMaskBalance } from "@/features/migrate/hooks/use-offer-migration";
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
import { SectionVisibility } from "@/components/ui/section-visibility";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";
import { CrossBorderBanner } from "@/features/remit/components/cross-border-banner";
import { RwaSettlementTracker } from "@/features/rwa/components/rwa-settlement-tracker";
import { MemeSettlementTracker } from "@/features/trade/components/meme-settlement-tracker";
import { SquareComposeFab, SquareSection } from "@/features/square";
import { SquareLivePromo, SquarePeoplePromo, SquarePostsPromo } from "@/features/square";
// The desktop discovery shelves. Each falls back to a static editorial card
// when the route has nothing live to feed it.
import { ConversationRow } from "@/features/discovery/components/conversation-row";
import { ArkadeRow } from "@/features/discovery/components/arkade-row";
import { TokenMovesRow } from "@/features/discovery/components/token-moves-row";
import { Next100xRow } from "@/features/discovery/components/next-100x-row";
import { RealAssetsRow, realAssetsLead } from "@/features/discovery/components/real-assets-row";
import { useMemeSpots } from "@/app/(session)/(app)/dashboard/discovery/memecoins";
import { useTokenSpots } from "@/app/(session)/(app)/dashboard/discovery/tokens";
import { useRwaSpots } from "@/app/(session)/(app)/dashboard/discovery/real-assets";
import { useDiscoveryTrade } from "@/app/(session)/(app)/dashboard/discovery/trade-intents";
import { useInterest } from "@/hooks/use-interest";
import { useSpotMarkets } from "@/features/trade/hooks/use-spot-markets";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { useDepositPrefill } from "@/hooks/use-deposit-prefill";
import { startDashboardTour, useDashboardTour } from "@/features/tour";
import { useMigrationGateActive } from "@/features/migrate/lib/gate-state";
// This page reads the square's SECTIONS switch, not the rail's. The rail links
// out to the square's own deployment and follows MARKET_SQUARE_HIDDEN; what
// renders here is the square's content, which is off on its own switch.
import { SQUARE_SECTIONS_HIDDEN } from "@/lib/market-square";
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

// Briefs hidden from the dashboard at request. All four stay full routes of
// their own; they just do not get a brief here, so the dashboard shows no
// service brief at all. Remove an id to bring its brief back.
const HIDDEN_BRIEFS: readonly SectionId[] = ["spot", "rwa", "meme", "perps"];

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
// Prediction is not offered on production (HIDDEN_NAV_SECTIONS in
// lib/sections.ts), so its doorway is `undefined` here rather than removed:
// the track is indexed by brief position, and dropping the entry would move
// Arkade up into Prediction's slot. ExploreBanners has no prediction banner
// on this branch either, for the reason its own comment gives. Restoring the
// section means putting the banner back there and "prediction" back here.
const INTERLEAVED_BANNERS: readonly ("casino" | undefined)[] = [undefined, undefined, "casino"];

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
  // Hide the headline figure while the user's money is still in the old
  // wallet, and show the sweep beside it. Decided here rather than in the
  // portfolio feature: the rule belongs to the migration, and features never
  // import each other. Comes off the moment a sweep lands anything.
  // Whether this user has anything to move. The button checks it too and
  // renders null when false — but next/dynamic fetches a chunk as soon as its
  // host mounts, so an ungated host downloads the Privy SDK for every visitor
  // to render nothing. Gated here, only the users being offered the sweep pay
  // for it.
  const maskForMigration = useMaskBalance();
  // Which section sits under the header is scroll state, not a route fact, so
  // the rail is told from here while this page is mounted.
  const activeSection = useScrollSpy(SCROLL_SECTIONS);
  useReportActiveSection(activeSection);
  // The services briefed on this page, in the nav's own order.
  const briefs = useMemo(
    // Every service brief is hidden at request (see HIDDEN_BRIEFS), so this
    // resolves to an empty list and no brief renders on the dashboard.
    () =>
      nav
        .map((n) => n.id)
        .filter(isBriefed)
        .filter((id) => !HIDDEN_BRIEFS.includes(id)),
    [nav]
  );
  const buyParam = useSearchParams().get("buy");
  // The tradeable universe, so a $TICKER in a square post can open the real
  // buy sheet. Only gathered while something can use it: the square's sections,
  // when they are shown, or a ?buy= deep link. The brief above reads the
  // dashboard feed now, so without one of those this would have been a price
  // poll under a page that already had its numbers.
  //
  // The gate follows SQUARE_SECTIONS_HIDDEN, not MARKET_SQUARE_HIDDEN. The two
  // readers of `spotMarkets` are the square section and the compose button
  // below, both of which that switch governs, plus the ?buy= handler. Pointing
  // it at the rail's switch instead would start this poll for everyone who can
  // see the rail entry, which is everyone, to feed sections that do not render.
  const { markets: spotMarkets } = useSpotMarkets({
    enabled: !SQUARE_SECTIONS_HIDDEN || buyParam !== null,
  });
  // The live trending memecoins the "Find the next 100X" row cycles through.
  // Sourced at the route so discovery stays clear of the trade slice; the row
  // falls back to its editorial cards when this is empty.
  const memeSpots = useMemeSpots();
  // The five biggest movers the "Stay Ahead of Token Moves" card cycles
  // through. Sourced here for the same reason as the memecoins above:
  // discovery does not import trade. Until this was wired the card had no
  // tokens prop at all and fell back to a hardcoded BTC comp.
  const { tokens: tokenSpots, loading: tokenSpotsLoading } = useTokenSpots();
  // The markets the "prediction starts" card cycles through. Sourced here for
  // the same reason as the two rows above: discovery does not import the
  // feature slices. Until this was wired the card had no markets prop and
  // showed the design's sample market on every dashboard.
  // "Own the Real World" shows for everyone; the saved onboarding interest
  // only decides whether it leads the discovery area or closes it. Its assets
  // come from the feed already loaded above.
  const rwaSpots = useRwaSpots();
  const rwaLeads = realAssetsLead(useInterest());
  // The square's feed tab lives here because two siblings drive it: the
  // section's own strip, and the plus sheet's discussions.
  const [squareTab, setTab] = useState<string | undefined>(undefined);
  const openTopic = useCallback((key: string) => {
    setTab(`topic:${key}`);
    // Otherwise the tab changes off-screen and the tap reads as doing nothing.
    document.getElementById("market-square")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  const openDiscussion = useCallback((tag: string) => {
    setTab(`tag:${tag}`);
    // Otherwise the tab changes off-screen and the tap reads as doing nothing.
    document.getElementById("market-square")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  // Hold the product tour until the migration gate is finished — it is a
  // full-screen overlay and the tour must not open on top of it.
  useDashboardTour({ suppressed: useMigrationGateActive() });

  // The balance card carries the walkthrough's replay button in the phone
  // design. The steps live on this page, so starting it here is a direct call;
  // the portfolio slice never imports the tour itself.
  const tTour = useTranslations("tour");
  const takeTour = useCallback(() => startDashboardTour(tTour), [tTour]);

  const modals = useAppModals();
  // A discovery card's Buy pill opens the asset in place instead of sending the
  // reader to a desk. The conversions the sheets need (registry chain to
  // Alchemy network, display spot to meme token) live in the intents, since
  // discovery may not import trade or rwa to do them itself.
  const discoveryTrade = useDiscoveryTrade(modals);
  const realAssets = <RealAssetsRow spots={rwaSpots} onBuy={discoveryTrade.onBuyRwa} />;

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
      <MemeSettlementTracker />
      {/* Deposit and withdrawal reporting used to be mounted here, so a
            deposit counted only if its owner came back to the dashboard. It
            now runs from the session providers, on every signed-in page. */}

      {/* The account, in full. It is what someone opened Ark to see, and the
            only section that is not a doorway to somewhere else. */}
      <SectionVisibility id="portfolio" className={SECTION_CLASS}>
        <Portfolio
          onOpenFunds={modals.openFunds}
          onOpenWithdraw={modals.openWithdraw}
          onTakeTour={takeTour}
          crossBorderSlot={<CrossBorderBanner onClick={openCrossBorder} />}
          maskForMigration={maskForMigration}
          onOpenDetail={modals.openDetail}
          onOpenBuy={modals.openBuy}
          onOpenSell={modals.openSell}
          onOpenMemeSell={modals.openMemeSell}
          onOpenRwaTrade={modals.openRwaTrade}
        />
      </SectionVisibility>

      {/* Phone home, under the balance cards. The phone uses purpose-built
          mobile sections where the desktop shelf is a fixed composition, and
          the desktop shelf itself where it reflows: "Join the Conversation"
          and "Find the next 100X" are the same rows as on desktop, one card
          to a frame on a phone. The conversation row handles a hidden square
          itself: its card goes and its heading falls back to chess. */}
      <div className="flex flex-col gap-6 md:hidden">
        {/* The Arkade's own shelf, one card per game. It leads the shelves,
            directly under the balance cards and the promo strip, whatever was
            picked at onboarding: it is what the platform is putting in front
            of everyone, so it is not something an interest can push down. */}
        <div className="px-4">
          <ArkadeRow />
        </div>
        {rwaLeads ? <div className="px-4">{realAssets}</div> : null}
        <div className="px-4">
          <ConversationRow />
        </div>
        {/* "Stay Ahead of Token Moves" — the desktop token-moves discovery
            card, now on the phone too, in the phone's gutter. */}
        <div className="px-4">
          <TokenMovesRow
            tokens={tokenSpots}
            loading={tokenSpotsLoading}
            onBuy={discoveryTrade.onBuyToken}
          />
        </div>
        {/* "Find the next 100X" — the same discovery carousel the desktop shows
            (the Pepe card, a rotating live memecoin, then Pepe again), now on
            the phone. The row brings its own header and carousel; it just needs
            the phone's horizontal gutter, which the desktop shelf gives it too. */}
        <div className="px-4">
          <Next100xRow memecoins={memeSpots} onBuy={discoveryTrade.onBuyMeme} />
        </div>
        {rwaLeads ? null : <div className="px-4">{realAssets}</div>}
      </div>

      {/* Not composed here on production: OwnMarketRow (the perps desk's
          shelf) and PredictionStartsRow, with its usePredictionSpots hook.
          Perps and Prediction are both in HIDDEN_NAV_SECTIONS; dropping the
          hook also stops the dashboard asking the gateway's `prediction`
          service, which answers 502 in production. Restore all three imports
          with the sections. */}

      {/* Desktop: the discovery shelves, as the phone design's desktop sibling
          draws them under the balance cards — Token Moves, Join the
          Conversation, the Arkade, Find the next 100X, then Prediction
          starts. */}
      <div className="mx-auto hidden w-full max-w-[1520px] flex-col gap-11 px-4 pb-2 sm:px-6 md:flex lg:px-8">
        {/* The Arkade's own shelf, one card per game. It leads the shelves,
            directly under the balance cards and the promo strip, whatever was
            picked at onboarding: it is what the platform is putting in front
            of everyone, so it is not something an interest can push down. */}
        <ArkadeRow />
        {rwaLeads ? realAssets : null}
        <TokenMovesRow
          tokens={tokenSpots}
          loading={tokenSpotsLoading}
          onBuy={discoveryTrade.onBuyToken}
        />
        <ConversationRow />
        <Next100xRow memecoins={memeSpots} onBuy={discoveryTrade.onBuyMeme} />
        {rwaLeads ? null : realAssets}
      </div>

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
            {/* One doorway between the briefs, so Arkade is met while reading
                  rather than only at the very bottom. */}
            {INTERLEAVED_BANNERS[index] ? (
              <ExploreBanners only={INTERLEAVED_BANNERS[index]} />
            ) : null}
            {/* Square content between the briefs, so closed by the sections
                  switch. The gaps close up and the doorway track above is
                  unaffected. */}
            {SQUARE_SECTIONS_HIDDEN ? null : (
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
            Off for now: SQUARE_SECTIONS_HIDDEN in lib/market-square.ts is the
            switch, and the rail's link out to the square is unaffected by it. */}
      {SQUARE_SECTIONS_HIDDEN ? null : (
        <SquareSection
          onOpenBuy={modals.openBuy}
          markets={spotMarkets}
          tab={squareTab}
          onTabChange={setTab}
        />
      )}
      {/* Fixed to the viewport, so it sits the same wherever it renders. It
          reveals itself once the square is in reach, so it goes with the
          section above rather than with the rail's link out. */}
      {SQUARE_SECTIONS_HIDDEN ? null : (
        <SquareComposeFab
          markets={spotMarkets}
          onPickTopic={openTopic}
          onPickDiscussion={openDiscussion}
        />
      )}

      <AppModalHost
        active={active}
        onClose={close}
        onConfirmed={modals.showDone}
        onOpenFunds={modals.openFunds}
      />
    </>
  );
}
