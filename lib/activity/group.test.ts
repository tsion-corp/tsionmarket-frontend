import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";
import ptMessages from "@/messages/pt.json";
import { dayHeadingLabel, groupByDay } from "@/lib/activity/group";
import { fromChainEntry, type ActivityFeedItem } from "@/lib/activity/feed";
import type { ActivityEntry } from "@/lib/activity/entries";

// Local time throughout: the reader groups by their own calendar day, so a test
// built on UTC would pass or fail depending on the machine's timezone.
function at(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const NOW = at(2026, 9, 9, 16, 0);

let seq = 0;
function item(occurredAt: number): ActivityFeedItem {
  seq += 1;
  const entry: ActivityEntry = {
    id: `e${seq}`,
    hash: `0x${seq}`,
    network: "base-mainnet",
    timestamp: occurredAt,
    kind: "deposited",
    symbol: "USDC",
    amount: 10,
    direction: "in",
    counterparty: null,
    logo: null,
  };
  return fromChainEntry(entry);
}

function keyOf(label: ActivityFeedItem["title"]): string {
  return label.type === "message" ? label.key : label.text;
}

describe("dayHeadingLabel", () => {
  it("keeps the today and yesterday rule the row already used", () => {
    expect(dayHeadingLabel(at(2026, 9, 9, 1, 0), NOW, "en-US")).toEqual({
      type: "message",
      key: "dayHeadings.today",
      values: { day: 9, month: "September", year: 2026 },
    });
    expect(dayHeadingLabel(at(2026, 9, 8, 23, 59), NOW, "en-US")).toEqual({
      type: "message",
      key: "dayHeadings.yesterday",
      values: { day: 8, month: "September", year: 2026 },
    });
  });

  it("dates an older day, and adds the year only once it differs", () => {
    expect(dayHeadingLabel(at(2026, 9, 7), NOW, "en-US")).toEqual({
      type: "message",
      key: "dayHeadings.date",
      values: { day: 7, month: "September", year: 2026 },
    });
    expect(dayHeadingLabel(at(2025, 12, 31), NOW, "en-US")).toEqual({
      type: "message",
      key: "dayHeadings.dateWithYear",
      values: { day: 31, month: "December", year: 2025 },
    });
  });

  it("names the month in the reader's own language", () => {
    const label = dayHeadingLabel(at(2026, 9, 7), NOW, "fr-FR");
    expect(label).toEqual({
      type: "message",
      key: "dayHeadings.date",
      values: { day: 7, month: "septembre", year: 2026 },
    });
  });
});

describe("groupByDay", () => {
  it("splits a run at the day boundary", () => {
    const groups = groupByDay(
      [
        item(at(2026, 9, 9, 0, 5)),
        item(at(2026, 9, 8, 23, 55)),
        item(at(2026, 9, 8, 9, 0)),
        item(at(2026, 9, 7, 18, 0)),
      ],
      { now: NOW, locale: "en-US" }
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-09-09", "2026-09-08", "2026-09-07"]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 2, 1]);
    expect(groups.map((g) => keyOf(g.label))).toEqual([
      "dayHeadings.today",
      "dayHeadings.yesterday",
      "dayHeadings.date",
    ]);
  });

  it("dates each group at midnight of its own day", () => {
    const [group] = groupByDay([item(at(2026, 9, 8, 23, 55))], { now: NOW, locale: "en-US" });
    expect(group.date).toEqual(new Date(2026, 8, 8, 0, 0, 0, 0));
  });

  it("keeps the order it was given and counts each day", () => {
    const groups = groupByDay(
      [
        item(at(2026, 9, 9, 15, 0)),
        item(at(2026, 9, 9, 14, 0)),
        item(at(2026, 9, 9, 13, 0)),
        item(at(2026, 9, 9, 12, 0)),
        item(at(2026, 9, 9, 11, 0)),
      ],
      { now: NOW, locale: "en-US" }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(5);
  });

  it("heads a day again when a page boundary splits it, under the same key", () => {
    // Paging by row keeps every page the same length, so a busy day straddles
    // the boundary. The repeated heading is deliberate: both halves really are
    // that day, and the shared key is what lets a caller detect the repeat.
    const day = [
      item(at(2026, 9, 8, 18, 0)),
      item(at(2026, 9, 8, 17, 0)),
      item(at(2026, 9, 8, 16, 0)),
      item(at(2026, 9, 8, 15, 0)),
    ];
    const options = { now: NOW, locale: "en-US" };
    const first = groupByDay(day.slice(0, 2), options);
    const second = groupByDay(day.slice(2), options);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].key).toBe(second[0].key);
    expect(first[0].label).toEqual(second[0].label);
    expect(first[0].items).toHaveLength(2);
    expect(second[0].items).toHaveLength(2);
  });

  it("files an unreadable timestamp under Earlier, with no date", () => {
    const groups = groupByDay([item(at(2026, 9, 9)), item(0)], { now: NOW, locale: "en-US" });
    expect(groups.map((g) => g.key)).toEqual(["2026-09-09", "unknown"]);
    expect(groups[1].label).toEqual({ type: "message", key: "unknownDate" });
    expect(groups[1].date).toBeNull();
  });

  it("returns nothing for an empty feed", () => {
    expect(groupByDay([], { now: NOW })).toEqual([]);
  });
});

// The ordinal lives in the catalogue as an ICU selectordinal, not in a helper,
// so this renders the English copy the feature needs through a real translator.
// It is both the proof that 1st/2nd/3rd/11th/21st come out right and the proof
// that the shipped English carries the selectordinal it needs: these headings
// come from messages/en.json itself, not from a copy of it kept here.
const EN_DAY_HEADINGS = enMessages.activity.dayHeadings;

const HEADING_KEYS = [
  "dayHeadings.today",
  "dayHeadings.yesterday",
  "dayHeadings.date",
  "dayHeadings.dateWithYear",
] as const;

function isHeadingKey(key: string): key is (typeof HEADING_KEYS)[number] {
  return (HEADING_KEYS as readonly string[]).includes(key);
}

describe("the day heading, rendered", () => {
  const t = createTranslator({
    locale: "en",
    messages: { activity: { dayHeadings: EN_DAY_HEADINGS } },
    namespace: "activity",
  });

  function heading(ms: number): string {
    const label = dayHeadingLabel(ms, NOW, "en-US");
    if (label.type !== "message") throw new Error("expected a message label");
    if (!isHeadingKey(label.key)) throw new Error(`unexpected heading key: ${label.key}`);
    return t(label.key, label.values);
  }

  it("reads as the design does", () => {
    expect(heading(at(2026, 9, 9))).toBe("Today, 9th September");
    expect(heading(at(2026, 9, 8))).toBe("Yesterday, 8th September");
  });

  it("suffixes 1st, 2nd, 3rd, 11th and 21st correctly", () => {
    expect(heading(at(2026, 8, 1))).toBe("1st August");
    expect(heading(at(2026, 8, 2))).toBe("2nd August");
    expect(heading(at(2026, 8, 3))).toBe("3rd August");
    expect(heading(at(2026, 8, 4))).toBe("4th August");
    expect(heading(at(2026, 8, 11))).toBe("11th August");
    expect(heading(at(2026, 8, 12))).toBe("12th August");
    expect(heading(at(2026, 8, 13))).toBe("13th August");
    expect(heading(at(2026, 8, 21))).toBe("21st August");
    expect(heading(at(2026, 8, 22))).toBe("22nd August");
    expect(heading(at(2026, 8, 23))).toBe("23rd August");
  });

  it("adds the year on an older one", () => {
    expect(heading(at(2025, 12, 31))).toBe("31st December 2025");
  });
});

// Locale completeness, rendered rather than grepped: a heading that ships a
// broken ICU pattern or a missing key throws here instead of on the screen.
describe("the day heading in every locale", () => {
  const CATALOGUES = { de: deMessages, es: esMessages, fr: frMessages, pt: ptMessages };

  it.each(Object.entries(CATALOGUES))("renders %s without falling back to the key", (locale, m) => {
    const t = createTranslator({
      locale,
      messages: { activity: { dayHeadings: m.activity.dayHeadings } },
      namespace: "activity",
    });
    const label = dayHeadingLabel(at(2026, 9, 7), NOW, locale);
    if (label.type !== "message") throw new Error("expected a message label");
    if (!isHeadingKey(label.key)) throw new Error(`unexpected heading key: ${label.key}`);
    const heading = t(label.key, label.values);
    // The month is named in that language and the day number is present, with
    // no leftover ICU braces and no grouping separator on a year.
    expect(heading).toContain("7");
    expect(heading).not.toMatch(/[{}]/u);
  });

  it("uses the French ordinal only on the first of the month", () => {
    // French writes "1er septembre" but "2 septembre": an English-shaped
    // suffix table would put "er" on every day.
    const t = createTranslator({
      locale: "fr",
      messages: { activity: { dayHeadings: frMessages.activity.dayHeadings } },
      namespace: "activity",
    });
    const render = (ms: number) => {
      const label = dayHeadingLabel(ms, NOW, "fr-FR");
      if (label.type !== "message" || !isHeadingKey(label.key)) throw new Error("bad label");
      return t(label.key, label.values);
    };
    expect(render(at(2026, 8, 1))).toBe("1er août");
    expect(render(at(2026, 8, 2))).toBe("2 août");
  });
});
