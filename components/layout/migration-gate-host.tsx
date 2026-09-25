"use client";

import { useEffect, useState } from "react";
import { MigrationGate } from "@/features/migrate/components/migration-gate";
import { useOfferMigrationState } from "@/features/migrate/hooks/use-offer-migration";
import { UpgradeSkeleton } from "@/features/migrate/components/upgrade-skeleton";
import { MIGRATION_ADAPTERS } from "@/components/layout/migration-adapters";

/**
 * The longest the skeleton may hold the screen while the offer is decided.
 * The answers it waits on are two small reads; past this, an outage is the
 * likelier explanation, and the dashboard must not be held for one.
 */
const DECIDING_CEILING_MS = 6_000;

/**
 * The migration gate with its adapter list bound, for the shell to load behind
 * next/dynamic. Same reasoning as update-balance-host: it mounts the whole
 * Privy SDK and reaches four feature barrels, which must not ride into every
 * signed-in route's first load.
 *
 * While the offer is still being decided, a skeleton of the upgrade card
 * holds the screen instead: the dashboard used to paint, and the gate then
 * dropped over it a beat later.
 */
export function MigrationGateHost() {
  const { deciding } = useOfferMigrationState();
  const [ceilingHit, setCeilingHit] = useState(false);
  useEffect(() => {
    if (!deciding) return;
    const timer = setTimeout(() => setCeilingHit(true), DECIDING_CEILING_MS);
    return () => clearTimeout(timer);
  }, [deciding]);

  if (deciding && !ceilingHit) return <UpgradeSkeleton />;
  return <MigrationGate adapters={MIGRATION_ADAPTERS} />;
}

export default MigrationGateHost;
