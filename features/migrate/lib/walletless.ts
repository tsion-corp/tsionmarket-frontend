// An old account that exists but holds no wallet.
//
// Some old-app accounts never got an embedded wallet (the wallet was created
// lazily, and not every sign-up reached that step). Signed in to one, the
// panel found no signer and read it as "an account that was never on the old
// app" — nothing to upgrade, switch accounts. But the ledgers keyed on the
// old identity rather than on a wallet — Kash points, the Square profile,
// referrals, chess — are still there, and the service re-keys them from the
// link alone; it needs no wallet for that. So such an account is linked, and
// the upgrade is complete the moment the link lands: there is no money to
// discover or move.
//
// The guard is the directory: Privy creates a user for any email typed into
// the old sign-in, and linking a brand-new one would bind this Market 2.0
// account to a junk identity and refuse the real old account later. Only an
// account the directory knows, or one the service already reports linked,
// is upgraded this way. Anything else keeps the "nothing to upgrade" answer.

export interface WalletlessInput {
  /** The inherited old-app session has been discarded; this sign-in is the user's. */
  fresh: boolean;
  ready: boolean;
  authenticated: boolean;
  hasUser: boolean;
  /** Embedded wallets on the old account, either chain. */
  embeddedWallets: number;
  /** The old account signed in is somebody else's (see useLegacyEmailMatch). */
  mismatch: boolean;
  /** The directory lists this account, or the service already reports it linked. */
  legacyAccountKnown: boolean;
}

export function isWalletlessLegacyAccount(input: WalletlessInput): boolean {
  return (
    input.fresh &&
    input.ready &&
    input.authenticated &&
    input.hasUser &&
    !input.mismatch &&
    input.embeddedWallets === 0 &&
    input.legacyAccountKnown
  );
}
