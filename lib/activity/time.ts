// How a timestamp reads on an activity row: a relative age, a clock time, and
// the full stamp behind the row's tooltip.
//
// These were unexported locals in features/activity/components/activity-row.tsx.
// Lifted here because the redesigned row, the day grouping and the coming
// activity endpoint all need them, and because a pure module is testable without
// mounting a component.
//
// `relativeTime` is the only one that needs copy, so the pure form returns the
// message key and its value. `resolveRelativeTime` applies a translator for
// callers that just want the string, which is what the row has always done.

import { messageLabel, type ActivityLabel } from "@/lib/activity/feed";

/**
 * The minimum a translator has to be. Declared structurally rather than imported
 * from next-intl, so lib/ keeps no framework dependency.
 */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

const MINUTE_SECONDS = 60;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;

/**
 * How long ago, as a catalogue key and its count: "Just now", "5m ago",
 * "3h ago", "2d ago". `now` is injectable so a test is deterministic.
 */
export function relativeTime(ms: number, now: number = Date.now()): ActivityLabel {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < MINUTE_SECONDS) return messageLabel("justNow");
  const minutes = Math.floor(seconds / MINUTE_SECONDS);
  if (minutes < HOUR_MINUTES) return messageLabel("minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / HOUR_MINUTES);
  if (hours < DAY_HOURS) return messageLabel("hoursAgo", { n: hours });
  return messageLabel("daysAgo", { n: Math.floor(hours / DAY_HOURS) });
}

/** `relativeTime` as the row has always rendered it, with the copy applied. */
export function resolveRelativeTime(ms: number, t: Translate, now: number = Date.now()): string {
  const label = relativeTime(ms, now);
  return label.type === "message" ? t(label.key, label.values) : label.text;
}

/**
 * The clock time, which is what someone checks a transfer against.
 *
 * Pinned to a 24-hour clock. The design reads 14:38 and 15:22 on every frame,
 * and the row has no room for a meridiem: the time shares an 11px line with a
 * dot and the product, and the phone row gives that line 322px against a right
 * aligned amount. Without `hourCycle` a US reader gets "2:38 PM" there. The
 * locale still drives the separator, and `relativeTime` and `fullTimestamp`
 * stay fully localised.
 */
export function clockTime(ms: number, locale?: string): string {
  return new Date(ms).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** The whole stamp, for the row's title attribute. */
export function fullTimestamp(ms: number, locale?: string): string {
  return new Date(ms).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
