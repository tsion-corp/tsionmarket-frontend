"use client";

import { useEffect, useRef } from "react";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import { useLpPositions, useMyMarkets } from "@/hooks/use-prediction-portfolio";
import { findReturnable } from "@/lib/prediction/lp-return";

// Returns a creator's seed liquidity to them once their market resolves, without
// them having to ask for it.
//
// The market page has no manual withdrawal any more, so this is what replaces
// it. It is best-effort by nature: nothing here can run while the creator is
// away, so the work happens the next time they open the prediction surface.
//
// Two rules keep it from misbehaving, both of which matter because it moves
// money on its own:
//
//   Once per market, per session. The read model lags a confirmed transaction
//   by a poll cycle, so a market that was just paid out still looks owed. The
//   id is recorded BEFORE the transaction is sent, so a re-render mid-flight
//   cannot start a second one.
//
//   Never retry a failure automatically. A failing withdrawal that retried on
//   every render would be a transaction loop against the user's own wallet. A
//   failed id stays recorded; the next session tries again.
//
// One at a time: each return is two sequential transactions, and firing several
// wallets-worth at once would have them competing for nonces.
export function useLpAutoReturn() {
  const actions = usePredictionActions();
  const { data: myMarkets } = useMyMarkets();
  const { data: lpPositions } = useLpPositions();

  // Ids handled this session, successfully or not. A ref, not state: it must be
  // readable and writable inside the effect without re-running it.
  const handledRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);

  useEffect(() => {
    if (!actions.wallet || !myMarkets || !lpPositions) return;
    if (runningRef.current) return;

    const next = findReturnable(myMarkets, lpPositions, handledRef.current)[0];
    if (!next) return;

    const key = next.market.marketId.toString();
    // Recorded before the await, so a re-render while the transaction is in
    // flight sees this market as already handled.
    handledRef.current.add(key);
    runningRef.current = true;

    void actions
      .returnLiquidity({ marketId: next.market.marketId, lpIn: next.lpShares, side: next.side })
      .finally(() => {
        runningRef.current = false;
      });
  }, [actions, myMarkets, lpPositions]);
}
