"use client";

import { MigrationOAuthReturn } from "@/features/migrate/components/migration-oauth-return";

/** The way back from the old provider's sign-in. Deep-imported, not the barrel. */
export function MigrationOAuthReturnHost() {
  return <MigrationOAuthReturn />;
}

export default MigrationOAuthReturnHost;
