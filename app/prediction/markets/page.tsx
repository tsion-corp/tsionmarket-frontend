import {
  SportsbookShell,
  type SportsbookEventKind,
  type SportsbookGameState,
} from "@/features/prediction/sportsbook";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PredictionMarketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const value = (key: string) => {
    const candidate = query[key];
    return typeof candidate === "string" ? candidate : "";
  };
  const requestedState = value("state");
  const state: SportsbookGameState =
    requestedState === "live" || requestedState === "all" ? requestedState : "prematch";
  const requestedKind = value("kind");
  const eventKind: SportsbookEventKind =
    requestedKind === "virtual" || requestedKind === "esports" ? requestedKind : "sports";

  return (
    <SportsbookShell
      requestedSport={value("sport") || "football"}
      country={value("country")}
      league={value("league")}
      state={state}
      eventKind={eventKind}
      initialView={value("view") === "tickets" ? "tickets" : "markets"}
    />
  );
}
