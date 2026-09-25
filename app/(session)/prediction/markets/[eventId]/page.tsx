import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import {
  isPredictionMarketCategory,
  parsePredictionCategory,
} from "@/features/prediction/categories";
import { SportsbookShell } from "@/features/prediction/sportsbook";

const CategoryEventDetail = dynamic(() =>
  import("@/features/prediction/components/category-event-detail").then(
    (module) => module.CategoryEventDetail
  )
);

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
  const category = parsePredictionCategory(
    typeof query.category === "string" ? query.category : undefined
  );
  // This path serves two products off one id, and the id cannot tell them
  // apart: Polymarket numbers its events and so does the sportsbook. The link
  // says which. `source=markets` is stamped by categoryEventHref, so every link
  // built from the Polymarket desk lands on the discovery detail, sports
  // included. Older links carry only a category, so a non-sports one is still
  // read as Polymarket's; a bare id, or anything with the sportsbook's own
  // sport/country/league, falls through to the sportsbook as it always did.
  if (query.source === "markets" || isPredictionMarketCategory(category)) {
    return <CategoryEventDetail category={category} eventId={eventId} />;
  }
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
