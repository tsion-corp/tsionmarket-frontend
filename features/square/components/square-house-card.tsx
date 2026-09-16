"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import type { MarketSquareHouse } from "@/lib/api/market-square";

/** A design unit of the 356-wide card, as a share of its real width. */
const u = (n: number) => `calc(var(--u) * ${n})`;

/**
 * A house from "Popular Houses", the Square's own Home card carried over
 * (market-square-frontend/components/layout/popular-houses.tsx, node
 * 1305:149178): 356 by 120 of the Square's glass, the cover tile, the name
 * over the members line of faces and a count, the description, and "Join
 * House" on the purple ramp. Joining is the Square's, so the pill opens the
 * house there.
 *
 * Neither the count nor the faces are invented: an absent count prints
 * nothing rather than "0 members", the Square's own rule for this line.
 */
export function SquareHouseCard({ house }: { house: MarketSquareHouse }) {
  const t = useTranslations("square");
  const title = house.title?.trim() || t("houseFallback");
  const href = squareLinks.house(house.id);

  return (
    <article
      aria-label={title}
      className="@container relative w-[356px] max-w-full shrink-0 snap-start"
    >
      <div
        className="relative overflow-hidden bg-[rgba(16,16,18,0.62)]"
        style={
          {
            "--u": "calc(100cqw / 356)",
            height: u(120),
            borderRadius: u(22),
            boxShadow: `inset 0 0 0 ${u(1)} rgba(255,255,255,0.18)`,
            backdropFilter: `blur(${u(7)})`,
          } as React.CSSProperties
        }
      >
        <span
          className="absolute overflow-hidden bg-white"
          style={{
            left: u(19.6),
            top: u(30),
            width: u(65.1),
            height: u(70.7),
            borderRadius: u(16.08),
          }}
        >
          {house.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- member-supplied host is unknown
            <img
              src={house.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-[#DCDAD5]">
              <SquareAvatar src={null} seed={house.id} name={title} size={71} shape="fill" />
            </span>
          )}
        </span>

        <div
          className="absolute flex flex-col"
          style={{ left: u(97.5), top: u(30.3), width: u(166.4), gap: u(6.43) }}
        >
          <div className="flex flex-col" style={{ gap: u(3.22) }}>
            <p
              className="truncate font-semibold text-white"
              style={{ fontSize: u(9.65), lineHeight: u(11.25) }}
            >
              {title}
            </p>
            <div className="flex items-center" style={{ gap: u(3.22) }}>
              {house.members.length > 0 ? (
                <span aria-hidden className="flex items-center" style={{ marginRight: u(3.22) }}>
                  {house.members.slice(0, 3).map((member, index) => (
                    <span
                      key={member.id}
                      className="flex items-center justify-center overflow-hidden rounded-[25%] bg-[#DCDAD5]"
                      style={{
                        width: u(16.07),
                        height: u(16.07),
                        marginLeft: index === 0 ? 0 : u(-6.43),
                        boxShadow: `inset 0 0 0 ${u(0.8)} #FFFFFF, 0 ${u(3.2)} ${u(12)} rgba(147,147,147,0.25)`,
                      }}
                    >
                      <SquareAvatar
                        src={member.avatarUrl}
                        seed={member.id}
                        name={member.displayName}
                        size={16}
                        shape="fill"
                      />
                    </span>
                  ))}
                </span>
              ) : null}
              {house.memberCount !== null ? (
                <span className="tnum font-medium text-white" style={{ fontSize: u(6.43) }}>
                  {t("membersCount", { count: house.memberCount })}
                </span>
              ) : null}
            </div>
          </div>
          {house.description ? (
            <p
              className="line-clamp-2 font-normal text-white"
              style={{ fontSize: u(9.65), lineHeight: u(16.07) }}
            >
              {house.description}
            </p>
          ) : null}
        </div>

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="ws-pressable absolute flex items-center font-medium text-white transition-opacity hover:opacity-90"
            style={{
              left: u(276.8),
              top: u(55),
              padding: `${u(6.43)} ${u(12.86)}`,
              borderRadius: u(80),
              background: "linear-gradient(90deg,#9F65FD 0%,#5B05E6 100%), #7E3BEB",
              fontSize: u(6.43),
            }}
          >
            {t("joinHouse")}
          </a>
        ) : null}
      </div>
    </article>
  );
}
