"use client";

import { useEffect } from "react";
import { returningFromPrivyOAuth } from "@/features/migrate/lib/oauth-return";
import { openMigration } from "@/features/migrate/lib/migration-card-store";

/**
 * Google and X sign-in for the OLD account returns the whole page, with the
 * result in the query string, and only the card's provider can exchange it.
 * So the way back opens the one card, which completes the sign-in and puts
 * the person back where they were — about to move their money. Renders
 * nothing, on any page load.
 */
export function MigrationOAuthReturn() {
  useEffect(() => {
    if (returningFromPrivyOAuth) openMigration("account_modal");
  }, []);
  return null;
}
