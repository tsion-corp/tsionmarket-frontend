"use client";

import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { LanguageSelect } from "@/components/ui/language-select";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MarketLogo } from "@/components/ui/market-logo";
import { Avatar } from "@/components/ui/avatar";
import { HelpIcon } from "@/components/ui/icons";
import { truncateAddress } from "@/lib/format";
import { deriveProfile, getWalletAddress } from "@/lib/user";
import { requestTourReplay, startDashboardTour } from "@/features/tour";

interface TopbarProps {
  onOpenAccount: () => void;
}

function CompassIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Topbar({ onOpenAccount }: TopbarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  const address = getWalletAddress(user, "ethereum");
  const t = useTranslations("topbar");
  const tTour = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();
  // Phone rule only: home (portfolio) shows who you are, every other page puts
  // the MARKET wordmark in the centre instead. From md up the name and the
  // address are on every page, so this flag does nothing there.
  const isHome = pathname === "/portfolio";

  // Replays the walkthrough. The steps live on the portfolio, so any other
  // page parks a replay request and routes there first.
  const takeTour = () => {
    if (pathname === "/portfolio") {
      startDashboardTour(tTour);
    } else {
      requestTourReplay();
      router.push("/portfolio");
    }
  };

  // From md up this is the Market design's head: a 79px bar carrying the
  // designer's ray fan, no rule beneath it. The phone keeps the blurred black
  // bar it already had, which a separate redesign covers.
  //
  // The rays are an irregular vector starburst, not a gradient, so they are the
  // node's own SVG export rather than anything CSS can approximate. In the
  // design the fan is a full-bleed background of the head: it is drawn far
  // larger than the 1071px frame and cropped by it, so it has to span whatever
  // width the bar takes rather than sit as a fixed-width piece.
  //
  // Spanning it needs bg-cover, not a 100% by 100% size. The export carries
  // preserveAspectRatio="none", so sizing it to the box outright hands the
  // artwork the wrong shape and splays the ray fan wider the wider the screen.
  // Cover keeps the file's own 1071 by 79 ratio and crops the overflow, which
  // is what the design does to the vector in the first place. bg-topbar under
  // it matches the flat fill baked into that file, so the band is already the
  // right colour before the SVG loads.
  return (
    <div className="bg-topbar relative z-[2] flex items-center gap-3 border-b border-white/7 bg-[url('/rollout/chrome/topbar-starburst.svg')] bg-cover bg-center bg-no-repeat px-4 py-3.5 sm:px-5 md:h-[79px] md:border-b-0 md:px-5 md:py-[15px]">
      {/* Who you are signed in as, and the wallet that holds the money. Tapping
          it opens the account modal. The desktop head carries the name and the
          address on every screen, which is what the design repeats across all
          seven. The phone keeps its own rule: name and address on home, the
          centred MARKET wordmark everywhere else. */}
      <button
        type="button"
        data-tour="profile"
        onClick={onOpenAccount}
        aria-label={t("account")}
        className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left md:gap-[8.29px]"
      >
        <Avatar seed={profile.avatarSeed} size={38} />
        <span className={`min-w-0 flex-col md:flex md:gap-[5.43px] ${isHome ? "flex" : "hidden"}`}>
          <span className="block truncate font-sans text-[14px] font-semibold text-white md:font-serif md:text-[15px] md:leading-[17.4px] md:tracking-[-0.15px]">
            {profile.name}
          </span>
          {address ? (
            <span className="tnum block truncate text-[11.5px] font-normal text-white/45 md:font-serif md:text-[12px] md:leading-[14.3px] md:font-medium">
              {truncateAddress(address)}
            </span>
          ) : null}
        </span>
      </button>
      {isHome ? null : (
        <MarketLogo className="pointer-events-none absolute top-1/2 left-1/2 h-[14px] w-auto -translate-x-1/2 -translate-y-1/2 md:hidden" />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-[7.24px]">
        {/* Replay of the first-visit walkthrough on a phone: a labelled pill
            from sm up, just the compass on the narrowest screens. It stops at
            md, where the help circle below takes over, so no breakpoint ever
            shows two ways into the same tour. */}
        <button
          type="button"
          onClick={takeTour}
          aria-label={tTour("replayCta")}
          className="ws-pressable flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/14 bg-white/5 px-[10px] text-white/75 sm:px-3.5 md:hidden"
        >
          <CompassIcon />
          <span className="hidden font-sans text-[12.5px] font-medium whitespace-nowrap sm:block">
            {tTour("replayCta")}
          </span>
        </button>
        {/* Language moves into the account modal on a phone rather than
            competing for the row. */}
        <span className="hidden md:block">
          <LanguageSelect variant="chrome" />
        </span>
        {/* The walkthrough, from md up: the help mark in the same circle the
            bell wears, 46px on the darker topbar-pill fill, so language, tour
            and bell share one centre line. Every class but the display mode is
            the bell's, and the display mode is what keeps this off the phone,
            which already has the labelled pill above. */}
        <button
          type="button"
          onClick={takeTour}
          aria-label={tTour("replayCta")}
          title={tTour("replayCta")}
          className="border-hairline md:bg-topbar-pill hidden size-[38px] shrink-0 cursor-pointer place-items-center rounded-full border bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:grid md:size-[46px] md:hover:bg-black/30"
        >
          <HelpIcon size={20.65} className="shrink-0" />
        </button>
        <NotificationBell />
      </div>
    </div>
  );
}
