import { CasinoPage } from "@/features/casino/components/casino-page";
import { CheckersLearn } from "@/features/casino/components/draughts/checkers-learn";

export default function CheckersLearnPage() {
  return (
    <CasinoPage hideBackLink>
      <CheckersLearn />
    </CasinoPage>
  );
}
