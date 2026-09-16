import { CasinoPage } from "@/features/casino/components/casino-page";
import { PuzzleSection } from "@/features/casino/components/chess-app/puzzle/puzzle-section";

export default function ChessPuzzlesPage() {
  return (
    <CasinoPage hideBackLink>
      <PuzzleSection />
    </CasinoPage>
  );
}
