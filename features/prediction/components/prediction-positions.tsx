"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import { PositionsPanel } from "@/features/prediction/components/positions-panel";
import { BetSlipSheet } from "@/features/prediction/components/bet-slip-sheet";
import type { PolymarketPositionsController } from "@/features/prediction/hooks/use-polymarket-positions-controller";

type PositionsState = PolymarketPositionsController["positions"];

export function shouldShowPolymarketPositions(
  positions: Pick<PositionsState, "available" | "cashable" | "loaded" | "positions">
) {
  if (!positions.loaded) return true;
  return (
    positions.positions.length > 0 ||
    (positions.available ?? 0) > 0 ||
    (positions.cashable ?? 0) > 0
  );
}

// "Your positions": the Load-positions button and, once loaded, the open bets
// with claim, sell and cash-out. Presentational only. The controller (state and
// money handlers) is created by the host with usePolymarketPositionsController,
// so the host can also refresh it when a bet is placed. The desktop prediction
// view and the phone Market prediction tab both render this.
export function PredictionPositions({ controller }: { controller: PolymarketPositionsController }) {
  const { positions, slip, setSlip } = controller;
  if (!shouldShowPolymarketPositions(positions)) return null;

  return (
    <>
      <PositionsPanel
        positions={positions.positions}
        available={positions.available}
        cashable={positions.cashable}
        loading={positions.loading}
        loaded={positions.loaded}
        error={positions.error}
        onRefresh={positions.refresh}
        onOpenSlip={setSlip}
        onRedeem={controller.onRedeem}
        redeemingId={controller.redeemingId}
        claimedConditionIds={controller.claimedConditionIds}
        onCashOut={controller.onCashOut}
        cashingOut={controller.cashingOut}
      />

      <ModalShell open={slip !== null} onClose={() => setSlip(null)}>
        {slip ? (
          <BetSlipSheet
            position={slip}
            onClaim={controller.onRedeem}
            claiming={controller.claiming}
            onSell={controller.onSellPosition}
            selling={controller.selling}
          />
        ) : null}
      </ModalShell>
    </>
  );
}
