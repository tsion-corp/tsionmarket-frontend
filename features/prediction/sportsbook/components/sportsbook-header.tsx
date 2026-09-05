import type { SportNavigation, SportsbookEventKind, SportsbookGameState } from "../api";
import { LeaguesRail } from "./leagues-rail";
import { SportsRail } from "./sports-rail";
import { SportsbookTopNav } from "./sportsbook-top-nav";

interface SportsbookHeaderProps {
  sports: SportNavigation[];
  activeSport: string;
  activeCountry: string;
  activeLeague: string;
  state: SportsbookGameState;
  eventKind: SportsbookEventKind;
  onLeagueSearch: (value: string) => void;
}

function hrefFor(
  sport: string,
  league = "",
  state: SportsbookGameState = "prematch",
  eventKind: SportsbookEventKind = "sports",
  country = ""
) {
  const query = new URLSearchParams({ sport, state });
  if (country) query.set("country", country);
  if (league) query.set("league", league);
  if (eventKind !== "sports") query.set("kind", eventKind);
  return `/prediction/markets?${query}`;
}

export function SportsbookHeader({
  sports,
  activeSport,
  activeCountry,
  activeLeague,
  state,
  eventKind,
  onLeagueSearch,
}: SportsbookHeaderProps) {
  const active = sports.find(({ sport }) => sport.slug === activeSport);

  return (
    <>
      <SportsbookTopNav />

      <SportsRail sports={sports} activeSport={activeSport} state={state} eventKind={eventKind} />
      <div className="mx-auto max-w-[1440px]">
        <LeaguesRail
          countries={active?.countries ?? []}
          activeSport={activeSport}
          activeSportName={active?.sport.name ?? activeSport}
          activeCountry={activeCountry}
          activeLeague={activeLeague}
          state={state}
          eventKind={eventKind}
          onSearch={onLeagueSearch}
        />
      </div>
    </>
  );
}

export { hrefFor as sportsbookHref };
