"use client";

import { useLocale, useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { startsIn } from "@/lib/square/starts-in";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { IconSpark, TOPIC_ICONS } from "@/features/square/components/square-home-icons";
import type { MarketSquareRoom, MarketSquareTopic } from "@/lib/api/market-square";

/**
 * A design unit of the 479-wide card, as a share of the card's real width.
 * The Square draws this card in container units so it scales as one piece
 * on a narrow column rather than reflowing; `--u` is set on the card.
 */
const u = (n: number) => `calc(var(--u) * ${n})`;

/** "Sun, 14 Sep" in the reader's locale. */
function dateLabel(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "09:00" in the reader's locale. */
function clockLabel(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * A room that has not opened yet, the Square's own card
 * (market-square-frontend/components/layout/upcoming-room-card.tsx, node
 * 1373:3979) carried over: the purple bar down the left, the cover tile,
 * the gist mark, the title and its topic chip, the host's line, then the
 * rule, the date, the clock and how far off it is. "Remind me" is the
 * Square's, so the pill leaves for the room there, where the reminder is
 * set; the Square's share sheet is not here.
 */
export function SquareUpcomingRoomCard({
  room,
  topics,
}: {
  room: MarketSquareRoom;
  topics: MarketSquareTopic[];
}) {
  const t = useTranslations("square");
  const locale = useLocale();
  const topicKey = room.topics[0];
  const topicLabel = topicKey
    ? (topics.find((topic) => topic.key === topicKey)?.label ?? topicKey)
    : null;
  const TopicIcon = topicKey ? (TOPIC_ICONS[topicKey] ?? IconSpark) : null;
  const host = room.owner;
  const startsAt = room.scheduledAt;
  const ahead = startsAt ? startsIn(startsAt) : null;
  const href = squareLinks.live(room.id);

  const aheadLabel = ahead
    ? ahead.unit === "now"
      ? t("startsNow")
      : ahead.unit === "day"
        ? t("startsInDays", { count: ahead.count })
        : ahead.unit === "hour"
          ? t("startsInHours", { count: ahead.count })
          : t("startsInMinutes", { count: ahead.count })
    : null;

  return (
    <article
      aria-label={room.title}
      className="@container w-full max-w-[479px] shrink-0 snap-start"
    >
      <div
        className="relative overflow-hidden bg-[rgba(16,16,18,0.62)]"
        style={
          {
            "--u": "calc(100cqw / 479)",
            height: u(147),
            borderRadius: u(20),
            boxShadow: `inset 0 0 0 ${u(1)} rgba(255,255,255,0.18)`,
            backdropFilter: `blur(${u(7)})`,
          } as React.CSSProperties
        }
      >
        <span
          aria-hidden
          className="absolute left-0 bg-[#7E3BEB]"
          style={{ top: u(-7), width: u(12), height: u(169) }}
        />

        <span
          className="absolute flex items-center justify-center overflow-hidden bg-[#D8D8D8]"
          style={{
            left: u(21),
            top: u(21),
            width: u(97.78),
            height: u(106.24),
            borderRadius: u(20),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
          <img
            src="/square-home/card-default-cover.svg"
            alt=""
            aria-hidden
            style={{ width: u(64.24), height: u(47.04) }}
          />
        </span>

        {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
        <img
          src="/square-home/card-mark.svg"
          alt=""
          aria-hidden
          className="absolute"
          style={{ left: u(131), top: u(21), width: u(24), height: u(24) }}
        />

        <span
          className="absolute flex flex-col justify-center overflow-hidden font-semibold text-white"
          style={{ left: u(162), top: u(17), width: u(185), height: u(39) }}
        >
          <span className="line-clamp-2" style={{ fontSize: u(16.677), lineHeight: u(16.38) }}>
            {room.title}
          </span>
        </span>

        {topicLabel ? (
          <span
            className="absolute flex items-center rounded-full bg-white/10 font-bold text-[#F4F4F4]"
            style={{
              left: u(164),
              top: u(63),
              gap: u(1.778),
              padding: `${u(4.444)} ${u(5.334)}`,
              fontSize: u(5.334),
              lineHeight: u(7.11),
            }}
          >
            {TopicIcon ? (
              <span
                className="flex shrink-0 items-center justify-center"
                style={{ width: u(7.11), height: u(7.11) }}
              >
                <TopicIcon className="h-full w-full" />
              </span>
            ) : null}
            {topicLabel}
          </span>
        ) : null}

        <span
          className="absolute flex items-center"
          style={{ left: u(162), top: u(104), gap: u(3), maxWidth: u(185) }}
        >
          <span
            className="shrink-0 overflow-hidden rounded-[25%] bg-[#DCDAD5]"
            style={{
              width: u(20),
              height: u(20),
              boxShadow: `0 0 0 ${u(1)} #FFFFFF, 0 ${u(4)} ${u(15)} rgba(147,147,147,0.25)`,
            }}
          >
            <SquareAvatar
              src={host?.avatarUrl ?? null}
              seed={host?.id ?? room.id}
              name={host?.displayName}
              size={20}
              shape="fill"
            />
          </span>
          <span className="truncate font-medium" style={{ fontSize: u(8), lineHeight: u(10.4) }}>
            <span className="text-[#5A5A5A]">{t("hostedBy")} </span>
            <span className="text-white">{host?.displayName || host?.username || t("aHost")}</span>
          </span>
        </span>

        <span
          aria-hidden
          className="absolute bg-[#3C3C3C]"
          style={{ left: u(359), top: u(20), width: u(1), height: u(106) }}
        />

        {startsAt ? (
          <>
            <span
              className="absolute flex items-center font-normal text-[#D9D9D9]"
              style={{ left: u(396), top: u(20), gap: u(5), fontSize: u(8), lineHeight: u(10.4) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the Square's own export */}
              <img
                src="/square-home/card-calendar.svg"
                alt=""
                aria-hidden
                className="shrink-0"
                style={{ width: u(10), height: u(10) }}
              />
              {dateLabel(startsAt, locale)}
            </span>

            <span
              className="tnum absolute font-semibold text-white"
              style={{ left: u(379), top: u(41), fontSize: u(20), lineHeight: u(14) }}
            >
              {clockLabel(startsAt, locale)}
            </span>

            {aheadLabel ? (
              <span
                className="absolute font-medium text-[#9F65FD]"
                style={{
                  left: u(396),
                  top: u(67),
                  padding: u(4),
                  borderRadius: u(2),
                  background: "rgba(159,90,255,0.09)",
                  fontSize: u(6),
                  lineHeight: u(7.8),
                }}
              >
                {aheadLabel}
              </span>
            ) : null}
          </>
        ) : null}

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="ws-pressable absolute flex items-center font-medium text-white transition-opacity hover:opacity-90"
            style={{
              left: u(287),
              top: u(94),
              gap: u(4),
              padding: `${u(8)} ${u(10)}`,
              borderRadius: u(100),
              background: "rgba(255,255,255,0.05)",
              boxShadow: `inset 0 0 0 ${u(1)} rgba(255,255,255,0.2)`,
              fontSize: u(9),
              lineHeight: u(12),
            }}
          >
            {t("remindMe")}
          </a>
        ) : null}
      </div>
    </article>
  );
}
