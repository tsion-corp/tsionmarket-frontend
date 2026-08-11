"use client";

import { useCallback, useState } from "react";

// Remembers what has been claimed in this session, so a claim button retires the
// moment it succeeds.
//
// Every claim surface reads its "still claimable?" answer from something that
// lags the transaction: an indexer, a backend flag, or a list that has no
// claimed field at all. Between the success and the source catching up, the
// button comes back armed on money that is already paid out, and a second tap
// either reverts on-chain or sweeps nothing. This closes that window.
//
// Deliberately session-scoped and not persisted: it is a display guard over a
// slow read, not a record of truth. Once the real source reports the claim, it
// takes over and this is irrelevant.
export function useClaimedOnce() {
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(() => new Set());

  const markClaimed = useCallback((id: string) => {
    setClaimed((previous) => new Set(previous).add(id));
  }, []);

  const hasClaimed = useCallback((id: string) => claimed.has(id), [claimed]);

  return { hasClaimed, markClaimed };
}
