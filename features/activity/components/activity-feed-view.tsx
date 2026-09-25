"use client";

import { useMemo, useState } from "react";
import { useLocale, useNow, useTranslations } from "next-intl";
import { ClockIcon } from "@/components/ui/icons";
import { ListPagination } from "@/components/ui/list-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaged } from "@/hooks/use-paged";
import { ActivityDetailSheet } from "@/features/activity/components/activity-detail-sheet";
import { ActivityFeedRow } from "@/features/activity/components/activity-feed-row";
import {
  ActivityFilters,
  rangeFloor,
  type ActivityFilterState,
} from "@/features/activity/components/activity-filters";
import { PnlCards } from "@/features/activity/components/pnl-cards";
import { useActivity, type ActivityEntry } from "@/features/activity/hooks/use-activity";
import { fromChainEntry, type ActivityFeedItem, type ActivityLabel } from "@/lib/activity/feed";
import { groupByDay } from "@/lib/activity/group";
import type { Translate } from "@/lib/activity/time";

// The All Activity screen (ADR-2026-09-23): a search box, two filter pills, a
// day grouped list and a pager, at both breakpoints from one tree.
//
// Not `useMarketHandoff` and not `useIsMobile`. Activity is a first class phone
// destination that the curved tab bar routes straight to, so a handoff to the
// phone Market page would break that seat, and both breakpoints read the same
// media query, so one tree with `md:` prefixes costs nothing.
//
// Figma: desktop 730:1288, phone 730:788.

const NO_GAMES: ActivityEntry[] = [];

// Rows per page. Matches what the screen this replaces paged at, so the feed
// does not suddenly get longer or shorter under a reader who knew it.
const PAGE_SIZE = 12;

// How long typing has to stop before the list narrows. The work is local, so
// this is about not reflowing the list under someone's fingers rather than
// about sparing a request.
const SEARCH_DEBOUNCE_MS = 180;

const INITIAL_FILTERS: ActivityFilterState = {
  query: "",
  product: "all",
  // The design draws the pill resting on "Last 30 Days", so that is the window
  // the screen opens on rather than the whole history. "All Time" is one press
  // away in the same menu.
  range: "30d",
};

/**
 * An `ActivityLabel` as the screen says it.
 *
 * The view model carries copy as a catalogue key plus its values so that
 * `lib/` stays free of a translator, which means the search box has to resolve
 * a label before it can match one. Matching the raw key instead would answer
 * an English question about a German screen.
 */
function labelText(label: ActivityLabel | undefined, t: Translate): string {
  if (!label) return "";
  return label.type === "message" ? t(label.key, label.values) : label.text;
}

/**
 * Whether a row answers the search box, compared against the words it actually
 * renders.
 *
 * The product is deliberately not searched: it has a pill of its own, and
 * matching it here would make "deposit" in the box quietly do what the pill
 * does, with no way to tell the two results apart.
 */
function matchesQuery(item: ActivityFeedItem, query: string, t: Translate): boolean {
  if (query === "") return true;
  const fields = [
    labelText(item.title, t),
    labelText(item.subtitle, t),
    labelText(item.caption.label, t),
    item.caption.detail ?? "",
    item.amount.symbol,
  ];
  return fields.some((field) => field.toLowerCase().includes(query));
}

interface ActivityFeedViewProps {
  /**
   * Off-chain arcade plays, merged into the on-chain feed. The route passes
   * them in because features may not import each other.
   */
  gameEntries?: ActivityEntry[];
}

export function ActivityFeedView({ gameEntries = NO_GAMES }: ActivityFeedViewProps = {}) {
  const t = useTranslations("activity");
  const { items: chainItems, loading, error, partial, refetch } = useActivity();
  const [filters, setFilters] = useState<ActivityFilterState>(INITIAL_FILTERS);
  const [opened, setOpened] = useState<ActivityFeedItem | null>(null);
  const query = useDebouncedValue(filters.query, SEARCH_DEBOUNCE_MS).trim().toLowerCase();
  // The clock the date filter measures from, taken once when the screen opens.
  // `Date.now()` cannot be read during render, and it should not be: a window
  // that slid on every render would drop the oldest row out from under a reader
  // who had done nothing but scroll.
  const now = useNow();

  // On-chain transfers and off-chain game plays are one timeline once merged.
  // Deduped by id so no source can put the same event on the feed twice.
  const entries = useMemo(() => {
    const seen = new Set<string>();
    const merged: ActivityEntry[] = [];
    for (const entry of [...chainItems, ...gameEntries]) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
    }
    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }, [chainItems, gameEntries]);

  // The screens render the view model, never the transfer. `useActivity` keeps
  // its shape because the notification bell shares its query key, so the
  // adapter sits here, above it.
  const items = useMemo(() => entries.map(fromChainEntry), [entries]);

  const filtered = useMemo(() => {
    const floor = rangeFloor(filters.range, now.getTime());
    return items.filter((item) => {
      if (filters.product !== "all" && item.product !== filters.product) return false;
      if (floor !== null && item.occurredAt < floor) return false;
      return matchesQuery(item, query, t);
    });
  }, [items, filters.product, filters.range, query, now, t]);

  // An incomplete read with nothing to show is not an empty history. Saying
  // "Nothing here yet" there tells the reader their account has no record when
  // the truth is that no record could be read, so it shows the error state and
  // its retry instead. An incomplete read that still has rows keeps them: one
  // chain being down must not blank a page the other four filled.
  const unreadable = error || (partial && items.length === 0);

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="mb-4 flex flex-col gap-4">
        {/* No screen title. The sidebar names it on desktop and the tab bar
            names it on the phone, so an "Arkivity" line above the search box
            was a third label for a screen the reader already knows they are
            on. The `activity.eyebrow` key stays in the catalogue: the screen
            this replaces still renders it. */}
        <ActivityFilters value={filters} onChange={setFilters} />
      </div>

      {loading ? (
        <div className="ws-card px-6 py-12 text-center text-[13.5px] font-normal text-white/45">
          {t("loading")}
        </div>
      ) : unreadable ? (
        <div className="ws-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="text-[13.5px] font-normal text-white/55">{t("errorBody")}</div>
          <button
            onClick={() => void refetch()}
            className="text-ink cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            {t("tryAgain")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="ws-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <ClockIcon size={22} />
          </div>
          <div className="ws-display text-[20px]">{t("emptyTitle")}</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">{t("emptyBody")}</p>
        </div>
      ) : (
        <>
          {partial ? (
            <div className="ws-card mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-[13px] font-normal text-white/60">{t("partialBody")}</p>
              <button
                onClick={() => void refetch()}
                className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-sans text-[12.5px] font-semibold text-white/80 hover:bg-white/10"
              >
                {t("tryAgain")}
              </button>
            </div>
          ) : null}
          {/* What the trades actually made, above the transactions that made
              it. Realised only, and scored over the whole history rather than
              the slice the pills are showing: a profit figure that moved when
              a date filter changed would read as a different profit. */}
          <PnlCards entries={entries} />
          {filtered.length === 0 ? (
            <div className="ws-card flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="ws-display text-[20px]">{t("filters.noMatchesTitle")}</div>
              <p className="max-w-[340px] text-[13.5px] font-normal text-white/55">
                {t("filters.noMatchesBody")}
              </p>
              <button
                onClick={() => setFilters(INITIAL_FILTERS)}
                className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-sans text-[12.5px] font-semibold text-white/80 hover:bg-white/10"
              >
                {t("filters.clear")}
              </button>
            </div>
          ) : (
            // Keyed on the filters, so narrowing the list puts the reader on
            // its first page. `usePaged` keeps page state internally and only
            // clamps, which is safe but would leave someone who filtered from
            // page 4 looking at the tail of a shorter result with no idea they
            // were not at the top of it.
            <ActivityFeedPages
              key={`${filters.product}|${filters.range}|${query}`}
              items={filtered}
              onOpen={setOpened}
            />
          )}
        </>
      )}

      {/* The row's chevron opens the detail as a sheet, not a route.
          Three reasons. The detail is two actions on one event, which is a
          sheet's size, not a page's. Activity is a phone tab destination, so a
          pushed route would put the bottom navigation on a screen that is not
          one of its seats, and returning would have to restore the filters, the
          page and the scroll position from the URL to avoid dumping the reader
          back at the top of an unfiltered list. And ModalShell is already the
          pattern this screen uses twice over, in both filter menus, so the
          detail opens the way the rest of the screen opens.
          The cost, stated plainly: a phone back press leaves the section rather
          than closing the sheet. Nothing can be linked to directly, so nobody
          lands inside it; the close button, the backdrop and Escape all return
          to exactly the list that was here. */}
      <ActivityDetailSheet item={opened} onClose={() => setOpened(null)} />
    </div>
  );
}

/**
 * One page of the feed, grouped by day.
 *
 * The page is sliced before it is grouped, so a day that straddles a page
 * boundary heads both halves. Deliberate: grouping first would make the page
 * length depend on how busy a day was, and a heading counts the rows under it
 * on this page, which is the honest number for what is drawn.
 */
function ActivityFeedPages({
  items,
  onOpen,
}: {
  items: ActivityFeedItem[];
  onOpen: (item: ActivityFeedItem) => void;
}) {
  const t = useTranslations("activity");
  // The heading interpolates a month name, which `groupByDay` formats through
  // Intl. Without the reader's locale it would come back in the runtime's.
  const locale = useLocale();
  // One clock for the whole grouping pass, so "Today" cannot become
  // "Yesterday" halfway down a list that midnight happened to cross.
  const now = useNow();
  const paged = usePaged(items, PAGE_SIZE);
  const groups = useMemo(
    () => groupByDay(paged.pageItems, { now: now.getTime(), locale }),
    [paged.pageItems, now, locale]
  );

  return (
    <>
      <div className="flex flex-col gap-6 md:gap-8">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-3 md:gap-6">
            <header className="flex items-center justify-between font-sans text-[11px] leading-[16.5px] font-semibold tracking-[-0.01em] text-[#9d9da8] md:text-[14px] md:leading-[17.191px]">
              <span>{labelText(group.label, t)}</span>
              <span className="tnum">{t("groupCount", { count: group.items.length })}</span>
            </header>
            {/* The phone row draws its own divider and no gap; the desktop row
                is a card and needs one. */}
            <div className="flex flex-col gap-0 md:gap-3">
              {group.items.map((item) => (
                <ActivityFeedRow key={item.id} item={item} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <ListPagination
        page={paged.page + 1}
        pages={paged.pageCount}
        onPage={(next) => (next > paged.page + 1 ? paged.goNext() : paged.goPrev())}
      />
    </>
  );
}
