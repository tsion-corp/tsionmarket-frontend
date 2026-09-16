"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { useSquarePeople } from "@/features/square/hooks/use-square-home";
import { SquareFriendsDeck } from "@/features/square/components/square-friends-deck";
import { SquareHomeSection } from "@/features/square/components/square-home-section";

/**
 * "Make some friends": Home's deck of people, busiest first, on the
 * Square's own fanned deck, with the reader left out of it. The reader is
 * not someone to meet, and offering them their own follow badge is the one
 * thing the card must never do. Views more at the Square's pals page, as
 * Home does; Home's filter pill acts on the Square's own directory facets
 * and is not here.
 */
export function SquareHomePeople({ meId }: { meId?: string }) {
  const t = useTranslations("square");
  const people = useSquarePeople();
  const items = useMemo(
    () => (people.data ?? []).filter((person) => meId === undefined || person.id !== meId),
    [people.data, meId]
  );

  return (
    <SquareHomeSection
      id="square-make-some-friends"
      lead={t("homeFriendsLead")}
      accent={t("homeFriendsAccent")}
      subtitle={t("homeFriendsBlurb")}
      viewMore={{ label: t("viewMore"), href: squareLinks.pals() }}
      loading={people.isPending}
      loadingLabel={t("loading")}
      error={people.error}
      errorSubject={t("peopleSubject")}
      unconfiguredDetail={t("unconfigured")}
      onRetry={() => void people.refetch()}
      empty={items.length === 0}
    >
      {/* The deck sits centred in the column, at Home's own width. */}
      <SquareFriendsDeck people={items} />
    </SquareHomeSection>
  );
}
