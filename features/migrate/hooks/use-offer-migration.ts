"use client";

import { useEffect } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
import { useLegacyAccount } from "@/features/migrate/hooks/use-legacy-account";
import { useLegacyWalletFunds } from "@/features/migrate/hooks/use-legacy-wallet-funds";
import { EMPTY_MIGRATION_STATUS } from "@/features/migrate/lib/api";
import {
  markAccountLinked,
  maskBalance,
  offerMigration,
  useAccountLinked,
  useFundsMoved,
  useLocalPrivyHistory,
  useMigrationCompleteFlag,
} from "@/features/migrate/lib/visibility";

// Whether to offer the move to Market 2.0, and mask the balance while it is
// pending. The test is "is this account still on the old identity", not "is
// there money in the old wallet": the re-key carries the profile, followers,
// posts, chess ledgers, kash points and tier, none of which a balance can see.
// A user with $0 and four years of history has the most to lose by never
// linking. Once linked, only money PROVEN to still sit on the old wallet
// brings the offer back — see offerMigration.
export function useOfferMigration(): boolean {
  return useOfferMigrationState().offer;
}

/**
 * The offer, and whether it is still being DECIDED.
 *
 * The decision needs the service's status and the directory's answer, and
 * both arrive after the page has painted. Until they do, `offer` reads as
 * "no" — so the dashboard showed for a moment and the upgrade then dropped
 * over it, and the product tour, which waits on the offer, had already
 * started underneath. `deciding` is what the gate's skeleton and the tour
 * wait on. Bounded by the caller: an outage must not hold the screen.
 */
export function useOfferMigrationState(): { offer: boolean; deciding: boolean } {
  const { ready, authenticated, profile, evmAddress } = useAuthSession();
  const email = profile.email;
  // The device's memory of a confirmed link. Written only once the service
  // has said `linked: true`, under the email and the address. From then on
  // the account is known linked before /status answers and the directory
  // lookup (a Privy management-API call) is skipped. The old wallet is still
  // probed, because proven money there is the one thing that re-opens the
  // offer. A live `linked: false` outranks the memory (an admin remap).
  const knownLinked = useAccountLinked({ email, evmAddress });

  const complete = useMigrationCompleteFlag(evmAddress);
  const localHistory = useLocalPrivyHistory();
  const status = useMigrationStatus();
  // Skip the directory call when we already know the account is linked — its
  // only job is to spot a legacy account we have NOT linked yet.
  const legacy = useLegacyAccount(!knownLinked);

  // A hard failure from the service (network, 5xx — the "not configured" case
  // is already mapped to the empty status) is "could not say", not "still
  // loading". Treating it as loading would hide the offer for as long as the
  // service is down, and take the door away from a legacy user for an outage
  // that is not theirs. As "could not say", the device's own signals still get
  // to decide, exactly as before the service existed.
  const statusData = status.isError ? EMPTY_MIGRATION_STATUS : status.data;
  const linked = statusData?.linked === true || (knownLinked && statusData?.linked !== false);
  // For a linked account, what is ACTUALLY on the old wallet. Only a complete
  // read that saw money WORTH MOVING re-opens the offer; anything less reads
  // as "not proven" (undefined = in flight, null = partial or failed read).
  // `hasFunds` is deliberately not the bar here: an unpriced sub-cent token
  // is "funds" to the sweep but not a reason to re-open the door on an
  // account that has already moved — seen live as "$0.00 left -> proven".
  const walletFunds = useLegacyWalletFunds(statusData?.legacy ?? null, linked);
  const walletFundsRead: boolean | null | undefined = walletFunds.isError
    ? null
    : walletFunds.data === undefined
      ? undefined
      : (walletFunds.data?.worthMoving ?? null);

  // The first time the service confirms this account is linked, remember it so
  // every later load short-circuits above. Only ever on a real `true`, never
  // on false or "could not say".
  useEffect(() => {
    if (status.data?.linked === true) markAccountLinked({ email, evmAddress });
  }, [status.data?.linked, email, evmAddress]);

  const offer = offerMigration({
    complete,
    localHistory,
    status: statusData,
    linked: knownLinked,
    legacyAccount: legacy.has,
    legacyKnownAbsent: legacy.certain && !legacy.has,
    walletFunds: walletFundsRead,
  });
  // Still deciding while the two answers the offer turns on are on their way
  // — unless one of the device's own signals has already settled it.
  const deciding =
    ready &&
    authenticated &&
    !complete &&
    !knownLinked &&
    !offer &&
    (status.isPending || legacy.pending);

  console.log(
    `[migrate] offer migrate-to-2.0: ${offer ? "YES" : "no"}${deciding ? " (deciding)" : ""}` +
      ` [linked: ${knownLinked ? "yes (remembered on this device)" : status.isError ? "service errored" : statusData === undefined ? "loading" : (statusData.linked ?? "service could not say")},` +
      ` done on this device: ${complete}, privy keys here: ${localHistory},` +
      ` service reports funds: ${statusData?.hasLegacyFunds ?? "unknown"},` +
      ` old wallet on chain: ${!linked ? "not read (not linked)" : walletFunds.isError ? "read failed" : walletFunds.data === undefined ? "probing" : walletFunds.data === null ? "partial read" : walletFunds.data.worthMoving ? `$${walletFunds.data.usd.toFixed(2)} left -> proven` : walletFunds.data.hasFunds ? `dust only ($${walletFunds.data.usd.toFixed(2)}) -> not proven` : "empty"},` +
      ` directory: ${knownLinked ? "skipped (known linked)" : legacy.has ? "legacy account found" : legacy.certain ? "definitely no legacy account" : "no legacy account (unconfirmed)"}]`
  );
  return { offer, deciding };
}

// Whether the balance card should hide the figure. Comes off as soon as a run
// moves anything, so a partial migration shows the money that has arrived
// while the button stays for whatever is left.
export function useMaskBalance(): boolean {
  const { evmAddress } = useAuthSession();
  return maskBalance({ offer: useOfferMigration(), moved: useFundsMoved(evmAddress) });
}
