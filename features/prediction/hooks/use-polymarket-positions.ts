"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import {
  readUnsettledUsdcUsd,
  readWalletPusdUsd,
  refreshCollateralUsd,
} from "@/features/prediction/lib/polymarket/collateral";
import { getWalletAddress } from "@/lib/user";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";

type PositionsPage = Awaited<ReturnType<ReturnType<SecureClient["listPositions"]>["firstPage"]>>;
export type PolymarketPosition = PositionsPage["items"][number];

// Loads the user's open Polymarket positions on demand. Deliberately not
// auto-fetched: reading requires the trading session, and we don't want to
// trigger onboarding just from viewing the section. Also reports spendable pUSD
// (the balance funded bets draw from) so the user can see funds not yet in a
// position.
export function usePolymarketPositions() {
  const { ensureReady } = usePolymarketSession();
  const { user } = usePrivy();
  const [positions, setPositions] = useState<PolymarketPosition[]>([]);
  const [available, setAvailable] = useState<number | null>(null);
  const [cashable, setCashable] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await ensureReady();
      const eoa = getWalletAddress(user, "ethereum");
      const [page, collateral, walletPusd, unsettled] = await Promise.all([
        client.listPositions().firstPage(),
        refreshCollateralUsd(client).catch(() => 0),
        eoa ? readWalletPusdUsd(eoa) : Promise.resolve(0),
        eoa ? readUnsettledUsdcUsd(eoa) : Promise.resolve(0),
      ]);
      setPositions(page.items);
      setAvailable(collateral);
      // Include both recovery states from an incomplete cash-out: pUSD already
      // transferred to the EOA and USDC.e already unwrapped there.
      setCashable(collateral + walletPusd + unsettled);
      setLoaded(true);
    } catch (e) {
      setError(friendlyError(e, "Couldn't load your positions. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [ensureReady, user]);

  return { positions, available, cashable, loading, loaded, error, refresh };
}
