import { CasinoPage } from "@/features/casino";
import { PracticeSection } from "@/features/casino/components/chess-app/learn/practice-section";

export default async function ChessPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const lessonKey = (await searchParams).lesson ?? null;
  return (
    <CasinoPage hideBackLink>
      <PracticeSection lessonKey={lessonKey} />
    </CasinoPage>
  );
}
