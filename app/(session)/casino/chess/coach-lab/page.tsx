import { notFound } from "next/navigation";
import { CasinoPage } from "@/features/casino";
import { PuzzleCoachLab } from "@/features/casino/components/chess/puzzle-coach-lab";

export const dynamic = "force-dynamic";

export default function ChessCoachLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <CasinoPage hideBackLink>
      <PuzzleCoachLab />
    </CasinoPage>
  );
}
