import { CasinoPage } from "@/features/casino";
import { StudyListSection } from "@/features/casino/components/chess-app/learn/study-section";

export default async function ChessStudiesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; order?: string }>;
}) {
  const query = await searchParams;
  const view = query.view === "mine" ? "mine" : "all";
  const order = query.order === "newest" || query.order === "popular" ? query.order : "updated";
  return (
    <CasinoPage hideBackLink>
      <StudyListSection view={view} search={query.q ?? ""} order={order} />
    </CasinoPage>
  );
}
