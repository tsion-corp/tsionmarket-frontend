import Link from "next/link";
import type { DiscoveryCategory, DiscoveryMarketEvent } from "../api";
import { closingLabel, compactUsd, eventTopic } from "../discovery-presenter";
import { discoverySlipSelection, type MarketSlipSelection } from "../bet-slip";
import { DiscoveryMarketRow } from "./discovery-market-row";

interface DiscoveryEventCardProps {
  category: DiscoveryCategory;
  event: DiscoveryMarketEvent;
  selectedIds: ReadonlySet<string>;
  onSelect: (selection: MarketSlipSelection) => void;
}

export function DiscoveryEventCard({
  category,
  event,
  selectedIds,
  onSelect,
}: DiscoveryEventCardProps) {
  const visibleMarkets = event.markets.slice(0, 2);
  const hiddenMarkets = Math.max(0, event.marketCount - visibleMarkets.length);
  const href = `/prediction/markets/${event.id}?category=${category}`;

  return (
    <article className="relative overflow-hidden border-y border-white/8 bg-[linear-gradient(145deg,#15171b_0%,#101114_72%)] transition-colors hover:border-white/14 sm:rounded-[12px] sm:border sm:shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <Link href={href} aria-label={`Open ${event.title}`} className="absolute inset-0 z-0" />

      <header className="pointer-events-none relative z-[1] flex gap-2.5 border-b border-white/7 p-3 sm:gap-3 sm:p-4">
        <div className="size-10 shrink-0 overflow-hidden rounded-[9px] border border-white/10 bg-[#242428] sm:size-12">
          {event.imageUrl || event.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.imageUrl ?? event.iconUrl ?? ""}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full place-items-center text-[16px] font-black text-white/35">
              {category[0].toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0">
              <span className="text-[9px] font-extrabold tracking-[0.1em] text-white/35 uppercase">
                {eventTopic(event)}
              </span>
              <h2 className="mt-0.5 line-clamp-2 text-[13px] leading-[1.32] font-bold text-white/90 sm:text-[14px]">
                {event.title}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-white/9 bg-white/[0.045] px-2 py-1 text-[9px] font-bold text-white/45">
              {event.marketCount}
              <span className="hidden sm:inline">
                {event.marketCount === 1 ? " market" : " markets"}
              </span>
            </span>
          </div>
          <div className="mt-1.5 flex min-w-0 gap-x-2.5 overflow-hidden text-[9px] font-semibold whitespace-nowrap text-white/38 sm:mt-2 sm:flex-wrap sm:gap-x-3 sm:gap-y-1 sm:text-[10px]">
            <span>{compactUsd(event.volume24h)} 24h</span>
            <span>{compactUsd(event.liquidity)} liquidity</span>
            <span>{closingLabel(event.endDate)}</span>
          </div>
        </div>
      </header>

      <div className="px-3 sm:px-4">
        {visibleMarkets.map((market) => (
          <DiscoveryMarketRow
            key={market.id}
            market={market}
            selectedIds={selectedIds}
            onSelect={(selection) => onSelect(discoverySlipSelection(event, selection))}
          />
        ))}
      </div>

      <footer className="pointer-events-none relative z-[1] flex items-center justify-between border-t border-white/7 bg-black/15 px-3 py-2 text-[9px] font-bold text-white/38 sm:px-4 sm:py-2.5 sm:text-[10px]">
        <span>{hiddenMarkets > 0 ? `+${hiddenMarkets} more markets` : "View market details"}</span>
        <span aria-hidden="true">&rarr;</span>
      </footer>
    </article>
  );
}
