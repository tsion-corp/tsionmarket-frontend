"use client";

import { useRef, useSyncExternalStore } from "react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { FilmStage } from "@/components/landing/film-stage";
import { JourneyRail } from "@/components/landing/journey-rail";
import { JourneyModeProvider } from "@/components/landing/layers/reveal-item";
import { EnterLayer } from "@/components/landing/layers/enter-layer";
import { HeroLayer } from "@/components/landing/layers/hero-layer";
import { ValuesLayer } from "@/components/landing/layers/values-layer";
import { BentoLayer } from "@/components/landing/layers/bento-layer";
import { RampLayer } from "@/components/landing/layers/ramp-layer";
import { HowLayer } from "@/components/landing/layers/how-layer";
import { StatsLayer } from "@/components/landing/layers/stats-layer";
import { FaqLayer } from "@/components/landing/layers/faq-layer";
import { CtaLayer } from "@/components/landing/layers/cta-layer";
import { useScrollJourney } from "@/hooks/use-scroll-journey";
import { TEXT_VEIL } from "@/lib/landing/journey";

// The landing page. On film-capable viewports it is one continuous scroll
// film ("The Silver Thread"): three fixed layers stack over the film — a flat
// black legibility veil, then the nine copy layers — with one tall empty
// track generating the scroll distance, and only the footer scrolling
// conventionally. On small screens the same nine layers render as normal
// stacked sections over their stills: mobile-first, no fixed-stage scaling,
// and none of the film's 16MB of video on a phone connection.

// The bento's rigid 6-track grid collapses below this width; it is also where
// the film stops fitting, so one breakpoint decides both.
const FILM_QUERY = "(min-width: 880px)";

function subscribeToFilmQuery(onChange: () => void) {
  const query = window.matchMedia(FILM_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// The server (and the hydration render) assumes stacked — the mobile-first
// default; a film-capable client upgrades immediately after mount.
function useFilmCapable(): boolean {
  return useSyncExternalStore(
    subscribeToFilmQuery,
    () => window.matchMedia(FILM_QUERY).matches,
    () => false
  );
}

const LAYERS = (
  <>
    <EnterLayer />
    <HeroLayer />
    <ValuesLayer />
    <BentoLayer />
    <RampLayer />
    <HowLayer />
    <StatsLayer />
    <FaqLayer />
    <CtaLayer />
  </>
);

export function ScrollJourney() {
  return useFilmCapable() ? <FilmJourney /> : <StackedJourney />;
}

function FilmJourney() {
  const rootRef = useRef<HTMLDivElement>(null);
  const go = useScrollJourney(rootRef);

  return (
    <JourneyModeProvider mode="film">
      <div ref={rootRef} className="relative bg-black">
        <FilmStage />

        {/* Uniform contrast floor under all type: whatever the film frame is
            doing — including near-white shots — the copy sits on this. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[15] bg-black"
          style={{ opacity: TEXT_VEIL }}
        />

        <div data-copy-stage="" className="pointer-events-none fixed inset-0 z-[20]">
          {LAYERS}
        </div>

        {/* Empty by design: its height is the entire scroll budget. The inline
            vh height only covers the server render — without it the footer sits
            at the top of the first paint until the engine measures; measure()
            replaces it with the exact px figure. ~1790vh = short enter hold
            (0.385vh) + 7 holds (1.1vh) + 8 transits (0.902vh) + final hold +
            1.5vh tail. */}
        <div
          data-track=""
          className="pointer-events-none relative z-[10]"
          style={{ height: "1790vh" }}
        />

        <JourneyRail onNavigate={go} />
        <Navbar onNavigate={go} />

        <div data-journey-footer="" className="relative z-[30]">
          <Footer onNavigate={go} />
        </div>
      </div>
    </JourneyModeProvider>
  );
}

// The stacked page reuses the classic anchor navigation the navbar and footer
// fall back to when no onNavigate is given.
function StackedJourney() {
  return (
    <JourneyModeProvider mode="stacked">
      <div className="relative w-full overflow-hidden bg-black">
        <Navbar />
        {LAYERS}
        <Footer />
      </div>
    </JourneyModeProvider>
  );
}
