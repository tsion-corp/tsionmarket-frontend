"use client";

import type { BrowseQuery, BrowseSort, BrowseTab, ListingStatus } from "@/lib/earn/api/types";

const TABS: { id: BrowseTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bounties", label: "Bounties" },
  { id: "projects", label: "Projects" },
  { id: "grants", label: "Grants" },
];

const STATUSES: { id: ListingStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "review", label: "In review" },
  { id: "completed", label: "Completed" },
];

const SORTS: { id: BrowseSort; label: string }[] = [
  { id: "Date", label: "Newest" },
  { id: "Prize", label: "Reward" },
  { id: "Submissions", label: "Entries" },
];

// There is no Tabs primitive in this app, so a filter row is a row of buttons
// with the active one inverted. Same treatment as the casino hub's categories.
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[12.5px] transition-colors ${
        active
          ? "border-accent bg-accent text-ink font-semibold"
          : "border-white/10 font-medium text-white/55 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// Two unlabeled chip rows read as one soup, so each group carries its name and
// the status row uses the quieter treatment: type is the primary filter,
// status refines it.
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-[52px] shrink-0 text-[10.5px] font-normal tracking-[0.08em] text-white/40 uppercase">
      {children}
    </span>
  );
}

export function ListingFilters({
  query,
  onChange,
}: {
  query: BrowseQuery;
  onChange: (next: BrowseQuery) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <GroupLabel>Type</GroupLabel>
        {TABS.map((tab) => (
          <Chip
            key={tab.id}
            active={query.tab === tab.id}
            onClick={() => onChange({ ...query, tab: tab.id })}
          >
            {tab.label}
          </Chip>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <label htmlFor="earn-sort" className="font-sans text-[12px] font-normal text-white/45">
            Sort
          </label>
          <select
            id="earn-sort"
            value={query.sortBy}
            onChange={(event) => onChange({ ...query, sortBy: event.target.value as BrowseSort })}
            className="ws-inset cursor-pointer rounded-full px-3 py-1.5 font-sans text-[12.5px] font-medium text-white outline-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.id} value={sort.id} className="bg-sheet">
                {sort.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <GroupLabel>Status</GroupLabel>
        {STATUSES.map((status) => (
          <button
            key={status.id}
            type="button"
            onClick={() => onChange({ ...query, status: status.id })}
            aria-pressed={query.status === status.id}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[12px] transition-colors ${
              query.status === status.id
                ? "border-white/35 bg-white/10 font-semibold text-white"
                : "border-white/10 font-medium text-white/50 hover:text-white"
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>
    </div>
  );
}
