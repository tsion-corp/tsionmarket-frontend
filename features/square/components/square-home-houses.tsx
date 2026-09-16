"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { useSquareHouses } from "@/features/square/hooks/use-square-home";
import {
  SquareHomeRail,
  SquareHomeSection,
} from "@/features/square/components/square-home-section";
import { SquareHouseCard } from "@/features/square/components/square-house-card";

/** "Popular Houses": the directory, busiest first, as Home lists it. */
export function SquareHomeHouses() {
  const t = useTranslations("square");
  const houses = useSquareHouses();
  const items = houses.data ?? [];

  return (
    <SquareHomeSection
      id="square-popular-houses"
      lead={t("homeHousesLead")}
      accent={t("homeHousesAccent")}
      viewMore={{ label: t("viewMore"), href: squareLinks.houses() }}
      loading={houses.isPending}
      loadingLabel={t("loading")}
      error={houses.error}
      errorSubject={t("housesSubject")}
      unconfiguredDetail={t("unconfigured")}
      onRetry={() => void houses.refetch()}
      empty={items.length === 0}
    >
      <SquareHomeRail gap={15.7}>
        {items.map((house) => (
          <SquareHouseCard key={house.id} house={house} />
        ))}
      </SquareHomeRail>
    </SquareHomeSection>
  );
}
