import { errorStatus } from "@/lib/api/envelope";
import type { DiscoveryFailure } from "@/lib/migration/types";

/**
 * Whether the upgrade stopped because the sign-in is no longer valid.
 *
 * A Decane session lasts two hours and does not refresh; when it lapses,
 * every call the card makes answers 401 — discovery, the link, the status.
 * Discovery folds a thrown error into "that venue did not answer", which is
 * how an expired session used to read as "Wallet, Perpetuals and Kash
 * haven't upgraded yet, check back later": true of nothing, and no amount of
 * checking back fixes it. A 401 anywhere means one thing, and the card says
 * that thing and sends the person back to sign in.
 */
export function isSessionExpired(
  failures: readonly DiscoveryFailure[] | undefined,
  ...errors: unknown[]
): boolean {
  if (failures?.some((f) => f.status === 401)) return true;
  return errors.some((error) => errorStatus(error) === 401);
}
