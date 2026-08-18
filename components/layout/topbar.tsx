"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/ui/icons";
import { LanguageSelect } from "@/components/ui/language-select";
import { NotificationBell } from "@/components/layout/notification-bell";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Avatar } from "@/components/ui/avatar";
import { useGlobalSearch, type SearchResult } from "@/components/layout/use-global-search";
import { deriveProfile } from "@/lib/user";

interface TopbarProps {
  onOpenAccount: () => void;
  // Scrolls in-page on /dashboard, or navigates there first from any other
  // page (e.g. /casino) — same dispatcher the sidebar uses.
  onSelectSection: (id: string) => void;
  /** The phone drawer: whether it is open, and the button that flips it. */
  menuOpen: boolean;
  onToggleMenu: () => void;
}

// The phone menu button: three bars that fold into a cross while the drawer is
// open, so the same control reads as "open" and "close". Pure CSS transitions,
// no icon swap.
function MenuToggle({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  const bar = "block h-[2px] rounded-full bg-white/85 transition-all duration-200 ease-in-out";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-controls="app-sidebar"
      aria-expanded={open}
      className="grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-full border border-white/14 bg-white/5 text-white/85 transition-colors hover:bg-white/10 md:hidden"
    >
      <span className="relative block h-[14px] w-[18px]">
        {/* The three bars, which shrink to nothing as the cross grows. */}
        <span
          className={`${bar} absolute top-0 left-0 ${open ? "w-0 delay-0" : "w-full delay-300"}`}
        />
        <span
          className={`${bar} absolute top-[6px] left-0 ${open ? "w-0 delay-75" : "w-full delay-[350ms]"}`}
        />
        <span
          className={`${bar} absolute top-[12px] left-0 ${open ? "w-0 delay-150" : "w-full delay-[400ms]"}`}
        />
        {/* The cross, drawn as two rotated bars from the centre. */}
        <span
          className={`${bar} absolute top-[6px] left-0 origin-center rotate-45 ${open ? "w-full delay-300" : "w-0 delay-0"}`}
        />
        <span
          className={`${bar} absolute top-[6px] left-0 origin-center -rotate-45 ${open ? "w-full delay-[400ms]" : "w-0 delay-100"}`}
        />
      </span>
    </button>
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

export function Topbar({ onOpenAccount, onSelectSection, menuOpen, onToggleMenu }: TopbarProps) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  const t = useTranslations("topbar");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const open = focused && query.trim().length > 0;

  const select = (r: SearchResult) => {
    onSelectSection(r.sectionId);
    setQuery("");
    setFocused(false);
  };

  return (
    <div className="relative z-[2] flex items-center gap-3 border-b border-white/7 bg-black/70 px-4 py-3.5 backdrop-blur-[14px] sm:px-5">
      {/* On a phone the menu opens the drawer, which is where the logo lives;
          the bar itself is search, notifications and the account. */}
      <MenuToggle open={menuOpen} onClick={onToggleMenu} label={t("menu")} />

      <div className="relative min-w-0 flex-1 md:max-w-[420px]">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 border-none bg-transparent text-sm font-normal text-white outline-none"
          />
        </div>

        {open ? <SearchResults query={query} onSelect={select} /> : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Language is the least urgent control, so it yields first on a phone;
            the bell stays at every width. */}
        <span className="hidden min-[400px]:block">
          <LanguageSelect />
        </span>
        <NotificationBell />
        <button
          onClick={onOpenAccount}
          aria-label={t("account")}
          className="cursor-pointer rounded-full border border-white/14 md:hidden"
        >
          <Avatar seed={profile.avatarSeed} size={34} />
        </button>
      </div>
    </div>
  );
}
