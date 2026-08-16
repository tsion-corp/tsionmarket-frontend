"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArkMark } from "@/components/ui/ark-mark";
import { LanguageSelect } from "@/components/ui/language-select";
import { MarketLogo } from "@/components/ui/market-logo";
import { WaitlistForm } from "@/components/landing/waitlist/waitlist-form";
import { LaunchCountdown } from "@/components/landing/waitlist/launch-countdown";
import { BRAND } from "@/lib/brand";

// The pre-launch page, shown in place of the landing film while the app is
// closed (see lib/launch-gate.ts). One screen: the same waypoint-0
// composition the film opens on — the mARKet lockup over the single point of
// light — then the ask, and either the countdown to the scheduled launch or,
// with no launch scheduled, the waitlist form; then the market row.
// Deliberately short.
//
// The film's nine layers and its ~16MB of video are not loaded; the still
// alone carries the frame.

const TICKER_KEYS = ["stocks", "gold", "treasuries", "trading", "predictions"] as const;

interface WaitlistPageProps {
  /** When the doors open, epoch ms; null shows the waitlist form instead. */
  launchAt: number | null;
  /** The server's clock at render, so the countdown's first paint matches. */
  serverNow: number;
}

export function WaitlistPage({ launchAt, serverNow }: WaitlistPageProps) {
  const t = useTranslations("waitlist");
  const counting = launchAt !== null;
  const tHero = useTranslations("hero");
  const tJourney = useTranslations("landing.journey");
  const tFooter = useTranslations("landing.footer");

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-black">
      {/* The film's opening frame as a still. Decorative, and a plain img so
          no loader or remote host is involved. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/film/w0-still.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-black/90"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-[1120px] items-center justify-between px-6 pt-7">
        <Link href="/" className="flex items-center gap-2 text-white">
          <ArkMark
            className="h-[17px] w-auto sm:h-[22px]"
            style={{ width: undefined, height: undefined }}
          />
        </Link>
        <LanguageSelect />
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-160px)] w-full max-w-[1120px] flex-col items-center justify-center px-6 pt-14 pb-16 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/6 px-3.5 py-1.5 text-[11.5px] font-medium tracking-[0.16em] text-white/70 uppercase backdrop-blur-[30px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          {t("eyebrow")}
        </span>

        <MarketLogo className="mt-9" style={{ width: "min(300px, 62vw)", height: "auto" }} />
        <div className="mt-4 text-[11.5px] font-normal tracking-[0.22em] text-[#8a8a8f] uppercase min-[880px]:text-[13px]">
          {tJourney("poweredBy", { name: "Tsion" })}
        </div>

        <h1 className="ws-display mt-9 max-w-[min(94vw,760px)] text-[clamp(32px,5.6vw,58px)] leading-[1.08] tracking-[-0.015em] [text-wrap:balance]">
          {t.rich(counting ? "countdownTitle" : "title", {
            accent: (c) => <span className="text-[#d4d4d8]">{c}</span>,
          })}
        </h1>
        <p className="mt-[18px] max-w-[52ch] text-[clamp(14.5px,1.5vw,17px)] leading-[1.55] font-light text-[rgba(244,244,244,0.85)]">
          {t(counting ? "countdownSubtitle" : "subtitle")}
        </p>

        <div className="mt-8 flex justify-center">
          {counting ? (
            <LaunchCountdown launchAt={launchAt} serverNow={serverNow} />
          ) : (
            <WaitlistForm />
          )}
        </div>

        <div className="mt-11 flex flex-wrap justify-center gap-[clamp(18px,4vw,48px)]">
          {TICKER_KEYS.map((k) => (
            <span
              key={k}
              className="ws-display text-[clamp(15px,2vw,22px)] text-[rgba(244,244,244,0.55)]"
            >
              {tHero(`ticker.${k}`)}
            </span>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-[1120px] border-t border-white/8 px-6 py-6 text-center">
        <span className="text-[12.5px] font-normal text-white/40">
          {tFooter("rights", { brand: BRAND })}
        </span>
      </footer>
    </main>
  );
}
