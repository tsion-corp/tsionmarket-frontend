import { ArkBallSection } from "@/features/casino/components/arkball/arkball-section";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { ChessProfileBalance } from "@/features/casino/components/chess-app/chess-profile-balance";

export default function ArkBallPage() {
  return (
    <CasinoPage backActions={<ChessProfileBalance compact showArkadeLink={false} />}>
      <ArkBallSection />
    </CasinoPage>
  );
}
