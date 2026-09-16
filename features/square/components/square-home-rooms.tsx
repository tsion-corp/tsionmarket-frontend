"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { useSquareRooms, useSquareTopics } from "@/features/square/hooks/use-square-home";
import { SquareGistRoomCard } from "@/features/square/components/square-gist-room-card";
import {
  SquareHomeRail,
  SquareHomeSection,
} from "@/features/square/components/square-home-section";
import { SquareUpcomingRoomCard } from "@/features/square/components/square-upcoming-room-card";

/**
 * "Top GistRooms" and "Coming Soon": the two halves of the stream list, on
 * the two cards Home draws them with. Home puts people between them, so the
 * page mounts this once per status rather than once with two rails. Both
 * view more at the Square's rooms page, as Home's pills do.
 */
export function SquareHomeRooms({ status }: { status: "live" | "scheduled" }) {
  const t = useTranslations("square");
  const rooms = useSquareRooms(status);
  const topics = useSquareTopics();
  const items = rooms.data ?? [];
  const vocabulary = topics.data ?? [];
  const live = status === "live";

  return (
    <SquareHomeSection
      id={live ? "square-top-gist-rooms" : "square-coming-soon"}
      lead={live ? t("homeLiveLead") : t("homeComingSoon")}
      accent={live ? t("homeLiveAccent") : undefined}
      viewMore={{ label: t("viewMore"), href: squareLinks.gistRooms() }}
      loading={rooms.isPending}
      loadingLabel={t("loading")}
      error={rooms.error}
      errorSubject={t("roomsSubject")}
      unconfiguredDetail={t("unconfigured")}
      onRetry={() => void rooms.refetch()}
      empty={items.length === 0}
    >
      <SquareHomeRail gap={live ? 17 : 15.7}>
        {items.map((room) =>
          live ? (
            <SquareGistRoomCard key={room.id} room={room} topics={vocabulary} />
          ) : (
            <SquareUpcomingRoomCard key={room.id} room={room} topics={vocabulary} />
          )
        )}
      </SquareHomeRail>
    </SquareHomeSection>
  );
}
