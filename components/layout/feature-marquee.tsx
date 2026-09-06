"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import { liveEventsFrom, type LiveEvent } from "@/lib/dashboard-feed";
import type { SectionId } from "@/lib/sections";
import { playNotify } from "@/lib/notify-sound";
import { cn } from "@/lib/utils";

// The chrome strip under the topbar: every feature slides by as one-line
// marketing, and live games take priority as a pinned chip that never scrolls
// out of sight — Last Man to join, chess and checkers to watch. Items
// navigate; the bar is discovery, not decoration.

// Several live events share the pinned chip in turns.
const LIVE_CYCLE_MS = 4_000;
// How often the expiry sweep re-checks the wall clock, so a Last Man round
// also leaves the chip the moment its own timer runs out.
const LIVE_SWEEP_MS = 10_000;

type MarqueeAction =
  { kind: "section"; section: SectionId } | { kind: "funds" } | { kind: "invite" };

interface FeatureItem {
  key: string;
  emoji: string;
  action: MarqueeAction;
  isNew?: boolean;
}

// Every dashboard feature, in page order. Emoji are rationed: the standing
// catalogue shares one announcement marker, and only a NEW feature carries
// its own emoji, so the unique one actually means something. Section items
// render only when the section is in the caller's nav, so a hidden section
// (Earn today) drops out here too and returns by itself when its navlink
// does.
const MARKER = "\u{1F4E3}";

const FEATURES: FeatureItem[] = [
  { key: "portfolio", emoji: MARKER, action: { kind: "section", section: "portfolio" } },
  { key: "kash", emoji: MARKER, action: { kind: "section", section: "portfolio" } },
  { key: "funds", emoji: MARKER, action: { kind: "funds" } },
  { key: "spot", emoji: MARKER, action: { kind: "section", section: "spot" } },
  { key: "perps", emoji: MARKER, action: { kind: "section", section: "perps" } },
  { key: "meme", emoji: MARKER, action: { kind: "section", section: "meme" } },
  { key: "rwa", emoji: MARKER, action: { kind: "section", section: "rwa" } },
  { key: "prediction", emoji: MARKER, action: { kind: "section", section: "prediction" } },
  { key: "casino", emoji: MARKER, action: { kind: "section", section: "casino" } },
  { key: "earn", emoji: MARKER, action: { kind: "section", section: "earn" } },
  { key: "activity", emoji: MARKER, action: { kind: "section", section: "activity" } },
  { key: "invite", emoji: "\u{1F389}", action: { kind: "invite" }, isNew: true },
];

function sameEvents(a: LiveEvent[], b: LiveEvent[]): boolean {
  return a.length === b.length && a.every((e, i) => e.key === b[i].key && e.pot === b[i].pot);
}

// Everything live across the arcade, from the dashboard feed: Last Man
// rounds (richest pot first, joinable), then chess and checkers matches
// (watchable). The server composes the list once for everyone; this only
// re-checks the wall clock so a round leaves the chip the moment its own
// timer runs out, and re-runs when a fresh feed lands.
function useLiveEvents(): LiveEvent[] {
  const { data: feed } = useDashboardFeed();
  const live = feed?.live ?? null;

  const [events, setEvents] = useState<LiveEvent[]>([]);
  useEffect(() => {
    const sweep = () => {
      const next = liveEventsFrom(live, Math.floor(Date.now() / 1000));
      setEvents((prev) => (sameEvents(prev, next) ? prev : next));
    };
    sweep();
    const id = setInterval(sweep, LIVE_SWEEP_MS);
    return () => clearInterval(id);
  }, [live]);

  return events;
}

// The live chip's label. On a phone the chip is kept narrow, so the label gets
// a small box and its text is usually wider than that. Rather than hiding it
// (the old behaviour) or letting it stretch the chip, we clip it to the box and
// scroll it in place when, and only when, it overflows. The overflow distance
// is measured here and handed to the CSS animation as --ws-live-shift; a label
// that fits never animates. Above 420px the box is unconstrained and the label
// simply sits on one line.
function LiveLabel({ text }: { text: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    const inner = textRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const overflow = inner.scrollWidth - box.clientWidth;
      setShift(overflow > 1 ? overflow : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span
      ref={boxRef}
      className="tnum block max-w-[120px] min-w-0 overflow-hidden text-[12px] font-semibold min-[420px]:max-w-none"
    >
      <span
        ref={textRef}
        className={cn("inline-block whitespace-nowrap", shift > 0 && "ws-live-scroll")}
        style={shift > 0 ? ({ "--ws-live-shift": `-${shift}px` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </span>
  );
}

interface FeatureMarqueeProps {
  /** Section ids the current nav actually offers. */
  navIds: SectionId[];
  onNavigate: (section: SectionId) => void;
  onAddFunds: () => void;
  onInvite: () => void;
}

export function FeatureMarquee({ navIds, onNavigate, onAddFunds, onInvite }: FeatureMarqueeProps) {
  const t = useTranslations("marquee");
  const router = useRouter();
  const live = useLiveEvents();

  // A notification chime the moment a NEW live event enters the marquee (a game
  // just went live). The set of keys already present is seeded on the first
  // run, so existing games never chime on load — only something that appears
  // afterwards does.
  const seenLive = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(live.map((e) => e.key));
    if (seenLive.current === null) {
      seenLive.current = keys;
      return;
    }
    let isNew = false;
    for (const key of keys) {
      if (!seenLive.current.has(key)) isNew = true;
    }
    seenLive.current = keys;
    if (isNew) playNotify();
  }, [live]);

  // The pinned chip cycles through the live events in turns.
  const [liveIndex, setLiveIndex] = useState(0);
  useEffect(() => {
    if (live.length < 2) return;
    const id = setInterval(() => setLiveIndex((i) => i + 1), LIVE_CYCLE_MS);
    return () => clearInterval(id);
  }, [live.length]);
  const liveEvent = live.length > 0 ? live[liveIndex % live.length] : null;
  const liveLabel = liveEvent
    ? liveEvent.kind === "lastman"
      ? t("liveLastMan", { pot: liveEvent.pot ?? "" })
      : liveEvent.kind === "chess"
        ? t("liveChess")
        : t("liveCheckers")
    : "";

  const items = useMemo(
    () =>
      FEATURES.filter(
        (item) => item.action.kind !== "section" || navIds.includes(item.action.section)
      ),
    [navIds]
  );

  const run = (action: MarqueeAction) => {
    if (action.kind === "funds") onAddFunds();
    else if (action.kind === "invite") onInvite();
    else onNavigate(action.section);
  };

  return (
    <div
      className="ws-marquee relative flex h-9 items-stretch overflow-hidden border-b border-black/15"
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #ededf0 45%, #c9c9cf 82%, #f2f2f5 100%)",
      }}
    >
      {liveEvent ? (
        <button
          type="button"
          onClick={() => router.push(liveEvent.href)}
          className="relative z-[2] flex shrink-0 cursor-pointer items-center gap-2 bg-[#101012] px-3 text-white sm:px-3.5"
        >
          <span className="relative flex h-2 w-2">
            <span className="bg-down absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
            <span className="bg-down relative inline-flex h-2 w-2 rounded-full" />
          </span>
          <span className="text-[10px] font-bold tracking-[0.14em] uppercase">
            {t("liveLabel")}
          </span>
          <LiveLabel text={liveLabel} />
          <span className="text-ink rounded-full bg-white px-2.5 py-[3px] text-[10.5px] font-bold whitespace-nowrap">
            {liveEvent.kind === "lastman" ? t("liveJoin") : t("liveWatch")}
          </span>
        </button>
      ) : null}

      <div className="ws-marquee-viewport relative min-w-0 flex-1">
        {/* The glint that makes the silver read as metal. */}
        <span
          aria-hidden
          className="ws-marquee-sheen pointer-events-none absolute inset-y-0 left-0 z-[1] w-24 bg-[linear-gradient(105deg,transparent,rgba(255,255,255,0.9),transparent)]"
        />
        <div className="ws-marquee-track flex h-9 w-max items-center">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="flex items-center">
              {items.map((item) => (
                <button
                  key={`${copy}-${item.key}`}
                  type="button"
                  tabIndex={copy === 1 ? -1 : 0}
                  onClick={() => run(item.action)}
                  className="text-ink/80 hover:text-ink mx-4 flex shrink-0 cursor-pointer items-center gap-1.5 font-sans text-[12.5px] font-semibold whitespace-nowrap transition-colors"
                >
                  <span aria-hidden>{item.emoji}</span>
                  <span>{t(item.key)}</span>
                  {item.isNew ? (
                    <span className="rounded-full bg-[#0a0a0a] px-1.5 py-[1px] text-[9px] font-bold tracking-[0.08em] text-white uppercase">
                      {t("newBadge")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
