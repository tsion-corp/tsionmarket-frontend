import type { ComboEvent } from "../api";
import { ProviderArtwork } from "./provider-artwork";

interface EventDetailHeaderProps {
  event: ComboEvent;
}

function startLabel(startTime: string | null, live: boolean): string {
  if (live) return "Live now";
  if (!startTime) return "Start time to be confirmed";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(startTime));
}

function compactUsd(value: number | null): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function EventDetailHeader({ event }: EventDetailHeaderProps) {
  const home = event.teams.find((team) => team.ordering === "home") ?? event.teams[0];
  const away = event.teams.find((team) => team.ordering === "away") ?? event.teams[1];

  return (
    <section className="overflow-hidden rounded-[12px] border border-white/9 bg-[#111114] shadow-[0_22px_60px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-2 border-b border-white/8 bg-[linear-gradient(180deg,#1c1c20_0%,#151518_100%)] px-4 py-3">
        <ProviderArtwork
          src={event.league.imageUrl}
          alt={`${event.league.name} logo`}
          initials={event.league.name}
          size="league"
        />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold text-white/72">{event.league.name}</p>
          <p
            className={`mt-0.5 text-[10px] font-semibold ${event.live ? "text-red-400" : "text-white/38"}`}
          >
            {startLabel(event.startTime, event.live)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-7 sm:gap-8 sm:px-8">
        <div className="flex min-w-0 flex-col items-center gap-3 text-center">
          <ProviderArtwork
            src={home?.logoUrl ?? null}
            alt={`${home?.name ?? "Home"} logo`}
            initials={home?.name ?? "Home"}
            color={home?.color}
            size="league"
          />
          <h1 className="max-w-full truncate text-[14px] font-extrabold text-white sm:text-[17px]">
            {home?.name ?? "Home"}
          </h1>
        </div>
        <span className="rounded-full border border-white/10 bg-black px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-white/35 uppercase">
          vs
        </span>
        <div className="flex min-w-0 flex-col items-center gap-3 text-center">
          <ProviderArtwork
            src={away?.logoUrl ?? null}
            alt={`${away?.name ?? "Away"} logo`}
            initials={away?.name ?? "Away"}
            color={away?.color}
            size="league"
          />
          <h2 className="max-w-full truncate text-[14px] font-extrabold text-white sm:text-[17px]">
            {away?.name ?? "Away"}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-white/8 bg-black/20 text-center">
        <div className="border-r border-white/8 px-3 py-3">
          <p className="text-[9px] font-bold tracking-[0.09em] text-white/30 uppercase">Volume</p>
          <p className="mt-1 text-[12px] font-extrabold text-white/68">
            {compactUsd(event.volume)}
          </p>
        </div>
        <div className="px-3 py-3">
          <p className="text-[9px] font-bold tracking-[0.09em] text-white/30 uppercase">
            Liquidity
          </p>
          <p className="mt-1 text-[12px] font-extrabold text-white/68">
            {compactUsd(event.liquidity)}
          </p>
        </div>
      </div>
    </section>
  );
}
