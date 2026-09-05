import { notFound } from "next/navigation";
import { SportsbookShell } from "@/features/prediction/sportsbook";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PredictionMarketEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: SearchParams;
}) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();
  const query = await searchParams;
  const sport = typeof query.sport === "string" ? query.sport : "football";
  const country = typeof query.country === "string" ? query.country : "";
  const league = typeof query.league === "string" ? query.league : "";

  return (
    <SportsbookShell
      requestedSport={sport}
      country={country}
      league={league}
      state="all"
      eventKind="sports"
      eventId={eventId}
    />
  );
}
