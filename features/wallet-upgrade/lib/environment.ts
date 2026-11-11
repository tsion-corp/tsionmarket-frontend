/**
 * Which environment the wallet upgrade is running in, and what it may do there.
 *
 * Development and production are kept apart on purpose. They use different
 * Clerk instances (pk_test_ / pk_live_), and the upgrade moves real money out
 * of real Decane wallets, so a development build must never be able to touch
 * production users and a production build must never run on development keys.
 * Both mismatches fail CLOSED: the upgrade switches itself off and says why.
 *
 * Pure and side-effect free. `readUpgradeEnv` is the only place that touches
 * process.env, and it reads each NEXT_PUBLIC_ name literally because Next only
 * inlines those that way.
 *
 * docs/WALLET_UPGRADE_ENVIRONMENTS.md is the operator's view of the same rules.
 */

export type DeployTarget = "development" | "production";
export type ClerkInstanceKind = "development" | "production" | "none";

export interface UpgradeEnv {
  deployEnv?: string | undefined;
  nodeEnv?: string | undefined;
  clerkPublishableKey?: string | undefined;
  enabled?: string | undefined;
  dryRun?: string | undefined;
  moveFunds?: string | undefined;
  cryptoBackend?: string | undefined;
  linkService?: string | undefined;
}

export function readUpgradeEnv(): UpgradeEnv {
  return {
    deployEnv: process.env.NEXT_PUBLIC_DEPLOY_ENV,
    nodeEnv: process.env.NODE_ENV,
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    enabled: process.env.NEXT_PUBLIC_WALLET_UPGRADE_ENABLED,
    dryRun: process.env.NEXT_PUBLIC_WALLET_UPGRADE_DRY_RUN,
    moveFunds: process.env.NEXT_PUBLIC_WALLET_UPGRADE_MOVE_FUNDS,
    cryptoBackend: process.env.NEXT_PUBLIC_CRYPTO_BACKEND_ENABLED,
    linkService: process.env.NEXT_PUBLIC_WALLET_UPGRADE_LINK_ENABLED,
  };
}

export interface WalletUpgradeConfig {
  target: DeployTarget;
  clerk: ClerkInstanceKind;
  /** The upgrade page and flow are on. False whenever `blockedReason` is set. */
  enabled: boolean;
  /** Nothing real moves. Always true in development. */
  dryRun: boolean;
  /** The identity-link service is deployed and switched on. */
  linkAvailable: boolean;
  /** The custom-wallet backend is deployed and switched on. */
  walletAvailable: boolean;
  /** Move-funds is switched on (still simulated while `dryRun`). */
  moveFundsAvailable: boolean;
  /** Why the upgrade is switched off, when a safety rule did it. */
  blockedReason: string | null;
}

const on = (value: string | undefined) => value?.trim().toLowerCase() === "true";

export function clerkInstanceKind(publishableKey: string | undefined): ClerkInstanceKind {
  if (!publishableKey) return "none";
  if (publishableKey.startsWith("pk_live_")) return "production";
  if (publishableKey.startsWith("pk_test_")) return "development";
  return "none";
}

export function deployTarget(env: UpgradeEnv): DeployTarget {
  const explicit = env.deployEnv?.trim().toLowerCase();
  if (explicit === "production" || explicit === "development") return explicit;
  // No explicit setting: a production build is production, anything else is
  // development. Never the other way round.
  return env.nodeEnv === "production" ? "production" : "development";
}

export function walletUpgradeConfig(env: UpgradeEnv): WalletUpgradeConfig {
  const target = deployTarget(env);
  const clerk = clerkInstanceKind(env.clerkPublishableKey);

  let blockedReason: string | null = null;
  if (clerk === "none") {
    blockedReason = "Clerk is not configured for this deployment.";
  } else if (target === "production" && clerk === "development") {
    blockedReason = "Production is using Clerk development keys. Use the production instance.";
  } else if (target === "development" && clerk === "production") {
    blockedReason =
      "Development is using Clerk production keys, which would touch real users. Use the development instance.";
  }

  const requested = on(env.enabled);
  const enabled = requested && blockedReason === null;
  // Development is always a rehearsal. Production is real unless dry-run is
  // asked for explicitly (a staged rollout can start there).
  const dryRun = target === "development" || on(env.dryRun);

  return {
    target,
    clerk,
    enabled,
    dryRun,
    linkAvailable: enabled && on(env.linkService),
    walletAvailable: enabled && on(env.cryptoBackend),
    moveFundsAvailable: enabled && on(env.moveFunds) && on(env.cryptoBackend),
    blockedReason: requested ? blockedReason : null,
  };
}
