"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { LanguageSelect } from "@/components/ui/language-select";
import { NotificationBell } from "@/components/layout/notification-bell";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Avatar } from "@/components/ui/avatar";
import { useGlobalSearch, type SearchResult } from "@/components/layout/use-global-search";
import { truncateAddress } from "@/lib/format";
import { deriveProfile, getWalletAddress } from "@/lib/user";
import { requestTourReplay, startDashboardTour } from "@/features/tour";

interface TopbarProps {
  onOpenAccount: () => void;
  // Scrolls in-page on /dashboard, or navigates there first from any other
  // page (e.g. /casino) — same dispatcher the sidebar uses.
  onSelectSection: (id: string) => void;
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

const GROUPS: {
  key: "holdings" | "rwa" | "markets";
  labelKey: "groupHoldings" | "groupRwa" | "groupMarkets";
}[] = [
  { key: "holdings", labelKey: "groupHoldings" },
  { key: "rwa", labelKey: "groupRwa" },
  { key: "markets", labelKey: "groupMarkets" },
];

// The search-data hooks (portfolio + RWA + markets, all polling) live here so
// they only subscribe while the user is actively searching. Mounting this on the
// idle Topbar would re-render the sticky header on every poll tick.
function SearchResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (r: SearchResult) => void;
}) {
  const results = useGlobalSearch(query);
  const t = useTranslations("topbar");

  return (
    <div className="bg-panel absolute top-[48px] right-0 left-0 z-[70] max-h-[360px] overflow-auto rounded-xl border border-white/12 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
      {results.total === 0 ? (
        <div className="px-3 py-4 text-center text-[13px] font-normal text-white/45">
          {t("noMatches", { query: query.trim() })}
        </div>
      ) : (
        GROUPS.map(({ key, labelKey }) => {
          const items = results[key];
          if (items.length === 0) return null;
          return (
            <div key={key} className="mb-1 last:mb-0">
              <div className="px-2.5 pt-2 pb-1 text-[11px] tracking-[0.04em] text-white/35 uppercase">
                {t(labelKey)}
              </div>
              {items.map((r) => (
                <button
                  key={r.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(r)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-white/6"
                >
                  <AssetIcon sym={r.symbol} bg="#1c1c1e" size={26} logo={r.logo} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[13.5px] font-medium">
                      {r.symbol}
                    </span>
                    <span className="block truncate text-[11.5px] font-normal text-white/45">
                      {r.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-normal text-white/35">{r.sub}</span>
                </button>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

export function Topbar({ onOpenAccount, onSelectSection }: TopbarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  const address = getWalletAddress(user, "ethereum");
  const t = useTranslations("topbar");
  const tTour = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // A phone shows the account instead of the search field, and swaps to the
  // field only once the search button is pressed. From `md` up the field is
  // always there and this stays false.
  const [searching, setSearching] = useState(false);

  const open = focused && query.trim().length > 0;

  const select = (r: SearchResult) => {
    onSelectSection(r.sectionId);
    setQuery("");
    setFocused(false);
    setSearching(false);
  };

  const closeSearch = () => {
    setQuery("");
    setFocused(false);
    setSearching(false);
  };

  // Replays the walkthrough. The steps live on the dashboard, so any other
  // page parks a replay request and routes there first.
  const takeTour = () => {
    if (pathname === "/dashboard") {
      startDashboardTour(tTour);
    } else {
      requestTourReplay();
      router.push("/dashboard");
    }
  };

  return (
    <div className="relative z-[2] flex items-center gap-3 border-b border-white/7 bg-black/70 px-4 py-3.5 backdrop-blur-[14px] sm:px-5">
      {/* Who you are signed in as, and the wallet that holds the money. Tapping
          it opens the account modal, which is where the phone reaches settings
          now that the drawer is opened from the tab bar. */}
      {searching ? null : (
        <button
          type="button"
          data-tour="profile"
          onClick={onOpenAccount}
          aria-label={t("account")}
          className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left md:hidden"
        >
          <Avatar seed={profile.avatarSeed} size={38} />
          <span className="min-w-0">
            <span className="block truncate font-sans text-[14px] font-semibold text-white">
              {profile.name}
            </span>
            {address ? (
              <span className="tnum block truncate text-[11.5px] font-normal text-white/45">
                {truncateAddress(address)}
              </span>
            ) : null}
          </span>
        </button>
      )}

      <div
        className={`relative min-w-0 flex-1 md:block md:max-w-[420px] ${
          searching ? "block" : "hidden"
        }`}
      >
        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={t("searchPlaceholder")}
            autoFocus={searching}
            className="min-w-0 flex-1 border-none bg-transparent text-sm font-normal text-white outline-none"
          />
        </div>

        {open ? <SearchResults query={query} onSelect={select} /> : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {searching ? (
          <button
            type="button"
            onClick={closeSearch}
            aria-label={t("closeSearch")}
            className="grid size-[38px] cursor-pointer place-items-center rounded-full border border-white/14 bg-white/5 text-white/75 transition-colors hover:bg-white/10 md:hidden"
          >
            <CloseIcon />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSearching(true)}
              aria-label={t("search")}
              className="grid size-[38px] cursor-pointer place-items-center rounded-full border border-white/14 bg-white/5 text-white/75 transition-colors hover:bg-white/10 md:hidden"
            >
              <SearchIcon />
            </button>
            {/* Replay of the first-visit walkthrough: a labelled pill from
                sm up, just the compass on a phone. */}
            <button
              type="button"
              onClick={takeTour}
              aria-label={tTour("replayCta")}
              className="flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/14 bg-white/5 px-[10px] text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:px-3.5"
            >
              <CompassIcon />
              <span className="hidden font-sans text-[12.5px] font-medium whitespace-nowrap sm:block">
                {tTour("replayCta")}
              </span>
            </button>
            {/* The phone header is the account, search and the bell, as the
                mobile design has it. Language moves into the account modal
                rather than competing for the row. */}
            <span className="hidden md:block">
              <LanguageSelect />
            </span>
            <NotificationBell />
          </>
        )}
      </div>
    </div>
  );
}
