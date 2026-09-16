import { CasinoPage } from "@/features/casino";
import { StudySection } from "@/features/casino/components/chess-app/learn/study-section";

export default async function ChessStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { id } = await params;
  const chapterId = (await searchParams).chapter ?? null;
  return (
    <CasinoPage hideBackLink>
      <StudySection studyId={id} chapterId={chapterId} />
    </CasinoPage>
  );
}
