"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import {
  GoldCard,
  RealEstateCard,
  StocksCard,
  TreasuriesCard,
} from "@/features/discovery/components/real-assets-cards";
import type { RwaSpot } from "@/features/discovery/types";
import { useRotatingIndex } from "@/hooks/use-rotating-index";
import { interestToSection } from "@/lib/sections";

export interface RealAssetsRowProps {
  spots: { gold: RwaSpot[]; treasuries: RwaSpot[]; realEstate: RwaSpot[]; stocks: RwaSpot[] };
  /**
   * Open the trade sheet on the tapped spot instead of sending the reader to
   * the desk. Left undefined, every pill keeps its current `href` behaviour;
   * a card still falls back to its own placeholder link when its featured
   * spot has no `chain`/`address` to trade.
   */
  onBuy?: (spot: RwaSpot) => void;
}

/**
 * Whether the shelf leads the discovery area for this reader.
 *
 * The shelf is for everyone: a reader from before onboarding asked for an
 * interest has none saved and must still find real assets. The saved interest
 * only decides where it sits: first for the reader who said at onboarding
 * that stocks, gold, yield, real estate or treasuries are what they came for,
 * last for everyone else.
 */
export function realAssetsLead(interest: string | null): boolean {
  return interestToSection(interest) === "rwa";
}

// "Own the Real World": tokenised gold, treasuries, property and stocks, one
// card each. The heading leads to the desk; every card's action does too.
//
// The stocks card rotates through the tokenised stocks every ten seconds. The
// rotation is owned here because the carousel draws each slide more than once
// and every copy must show the same stock.
export function RealAssetsRow({ spots, onBuy }: RealAssetsRowProps) {
  const t = useTranslations("discovery");
  const [holds, setHolds] = useState(0);
  const hold = useCallback((held: boolean) => setHolds((n) => n + (held ? 1 : -1)), []);
  const stockIndex = useRotatingIndex(spots.stocks.length, { paused: holds > 0 });

  return (
    <DiscoveryRow
      title={t.rich("realAssetsTitle", {
        accent: (chunks) => <span className="text-[#f6d37a]">{chunks}</span>,
      })}
      href="/market?tab=rwa"
    >
      <Carousel label={t("realAssetsCarousel")} trimPx={50}>
        <GoldCard spots={spots.gold} onBuy={onBuy} />
        <TreasuriesCard spots={spots.treasuries} onBuy={onBuy} />
        <RealEstateCard spots={spots.realEstate} onBuy={onBuy} />
        <StocksCard spots={spots.stocks} index={stockIndex} onHold={hold} onBuy={onBuy} />
      </Carousel>
    </DiscoveryRow>
  );
}
