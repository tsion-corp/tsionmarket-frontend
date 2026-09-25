// Day grouping for the activity list.
//
// `dayHeading` in features/activity/components/activity-row.tsx returned a bare
// string, "Today" or "12 Sep". The redesign heads each group with a date beside
// the word and a count beside that ("Today, 9th September" … "5 Activities"),
// and a string carries neither. A group carries its own identity, its heading
// label and the day itself instead, so the caller can count its rows and format
// the date its own way.
//
// The today/yesterday rule is the one the row already used, unchanged: the same
// calendar day is "Today", the one before it is "Yesterday", everything else is
// its date, and the year only appears once it differs from the current one.
//
// The ordinal ("9th") is not built here. See ORDINAL below.

import { messageLabel, type ActivityFeedItem, type ActivityLabel } from "@/lib/activity/feed";

// ORDINAL. "9th" is English. German writes "9.", French writes "9" but "1er"
// for the first of the month, and a suffix table in TypeScript would be five
// locales of copy living outside the catalogue. Intl cannot help either: no
// DateTimeFormat option produces an ordinal day, so `Intl.DateTimeFormat` gives
// "September 9" and never "9th September".
//
// So neither: features/earn/lib/ordinal.ts is not lifted, and no ordinal runs in
// this module. The heading is one ICU message per case holding a `selectordinal`
// over the day number, which is the only form that is correct in all five
// catalogues and the only one a translator can reorder. This module supplies the
// two values that message interpolates.
const HEADING_KEYS = {
  today: "dayHeadings.today",
  yesterday: "dayHeadings.yesterday",
  thisYear: "dayHeadings.date",
  otherYear: "dayHeadings.dateWithYear",
} as const;

/** The key a timestamp with no readable date falls back to. */
const UNKNOWN_KEY = "unknownDate";
const UNKNOWN_GROUP_KEY = "unknown";

export interface ActivityDayGroup {
  /**
   * Stable identity for the day, "2026-09-09" in the reader's own timezone, or
   * "unknown". Two pages of the same feed give the same day the same key, which
   * is how a caller can tell a repeated heading from a new one.
   */
  readonly key: string;
  /** "Today, 9th September". A label, so the component resolves the copy. */
  readonly label: ActivityLabel;
  /** Midnight of the day, for a caller that wants to format it itself. Null on
   *  the "Earlier" group, which has no date to stand for. */
  readonly date: Date | null;
  readonly items: ActivityFeedItem[];
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** "2026-09-09" from the local calendar fields, not from UTC. */
function dayKey(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/**
 * The heading for a day: which case it is, and the day number and month name the
 * message interpolates.
 */
export function dayHeadingLabel(
  ms: number,
  now: number = Date.now(),
  locale?: string
): ActivityLabel {
  const day = new Date(ms);
  const today = new Date(now);
  const values = {
    day: day.getDate(),
    month: new Intl.DateTimeFormat(locale, { month: "long" }).format(day),
    year: day.getFullYear(),
  };
  if (sameDay(day, today)) return messageLabel(HEADING_KEYS.today, values);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(day, yesterday)) return messageLabel(HEADING_KEYS.yesterday, values);
  const key =
    day.getFullYear() === today.getFullYear() ? HEADING_KEYS.thisYear : HEADING_KEYS.otherYear;
  return messageLabel(key, values);
}

/**
 * Consecutive items of the same day, in the order they were given.
 *
 * Runs of a day, not a bucket per day: the feed is already sorted newest first,
 * and grouping a sorted list by runs keeps the order the caller chose instead of
 * imposing one. An item with no readable timestamp falls into its own "Earlier"
 * run, which is what the list has always shown.
 *
 * PAGE BOUNDARIES. A day split across two pages heads both of them. That is kept
 * deliberately. Paging by row keeps every page the same length, where paging by
 * day would make one busy day an unbounded page, and the second heading is not
 * wrong: those rows really are from that day. The group's `key` is stable across
 * pages, so a caller that later wants to mark the second one as continued can
 * compare it with the last key of the page before without this module changing.
 */
export function groupByDay(
  items: readonly ActivityFeedItem[],
  { now = Date.now(), locale }: { now?: number; locale?: string } = {}
): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  for (const item of items) {
    const day = new Date(item.occurredAt);
    const readable = item.occurredAt > 0 && !Number.isNaN(day.getTime());
    const key = readable ? dayKey(day) : UNKNOWN_GROUP_KEY;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    groups.push({
      key,
      label: readable ? dayHeadingLabel(item.occurredAt, now, locale) : messageLabel(UNKNOWN_KEY),
      // Midnight, so the date stands for the day and not for one row's time.
      date: readable ? new Date(day.getFullYear(), day.getMonth(), day.getDate()) : null,
      items: [item],
    });
  }
  return groups;
}
