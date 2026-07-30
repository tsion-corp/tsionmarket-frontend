"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { SearchIcon } from "@/components/ui/icons";
import { TsionMark } from "@/components/ui/tsion-mark";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Avatar } from "@/components/dashboard/avatar";
import { useGlobalSearch, type SearchResult } from "@/hooks/use-global-search";
import { deriveProfile } from "@/lib/user";

interface TopbarProps {
  onOpenAccount: () => void;
  // Scrolls in-page on /dashboard, or navigates there first from any other
  // page (e.g. /casino) — same dispatcher the sidebar uses.
  onSelectSection: (id: string) => void;
}

const GROUPS: { key: "holdings" | "rwa" | "markets"; label: string }[] = [
  { key: "holdings", label: "Your holdings" },
  { key: "rwa", label: "Real-world assets" },
  { key: "markets", label: "Markets" },
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

  return (
    <div className="bg-panel absolute top-[48px] right-0 left-0 z-[70] max-h-[360px] overflow-auto rounded-xl border border-white/12 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
      {results.total === 0 ? (
        <div className="px-3 py-4 text-center text-[13px] font-normal text-white/45">
          No matches for “{query.trim()}”
        </div>
      ) : (
        GROUPS.map(({ key, label }) => {
          const items = results[key];
          if (items.length === 0) return null;
          return (
            <div key={key} className="mb-1 last:mb-0">
              <div className="px-2.5 pt-2 pb-1 text-[11px] tracking-[0.04em] text-white/35 uppercase">
                {label}
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
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const open = focused && query.trim().length > 0;

  const select = (r: SearchResult) => {
    onSelectSection(r.sectionId);
    setQuery("");
    setFocused(false);
  };

  return (
    <div className="flex items-center gap-3 border-b border-white/7 bg-black/70 px-4 py-3.5 backdrop-blur-[14px] sm:px-5">
      <Link href="/dashboard" className="flex items-center text-white md:hidden">
        <TsionMark size={34} />
      </Link>

      <div className="relative max-w-[420px] flex-1">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Search assets, markets, tickers"
            className="min-w-0 flex-1 border-none bg-transparent text-sm font-normal text-white outline-none"
          />
        </div>

        {open ? <SearchResults query={query} onSelect={select} /> : null}
      </div>

      <button
        onClick={onOpenAccount}
        aria-label="Account"
        className="ml-auto cursor-pointer rounded-full border border-white/14 md:hidden"
      >
        <Avatar seed={profile.avatarSeed} size={34} />
      </button>
    </div>
  );
}
