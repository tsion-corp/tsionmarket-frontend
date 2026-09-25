// Every venue the migration drains, composed here because features never
// import each other: each feature exports its adapter from its barrel and the
// layout hands the list to the migrate feature's components as a prop.

import type { VenueAdapter } from "@/lib/migration/types";
import { onrampAdapter, walletAdapter } from "@/features/migrate";
import { perpsMigrationAdapter } from "@/features/trade";
import { cpmmMigrationAdapter, polymarketMigrationAdapter } from "@/features/prediction";
import { cashierMigrationAdapter, vaultMigrationAdapter } from "@/features/casino";
import { kashMigrationAdapter } from "@/features/portfolio";

export const MIGRATION_ADAPTERS: readonly VenueAdapter[] = [
  walletAdapter,
  perpsMigrationAdapter,
  polymarketMigrationAdapter,
  cpmmMigrationAdapter,
  cashierMigrationAdapter,
  vaultMigrationAdapter,
  kashMigrationAdapter,
  onrampAdapter,
];
