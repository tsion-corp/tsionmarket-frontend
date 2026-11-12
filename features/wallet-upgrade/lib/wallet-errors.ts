import {
  Argon2UnavailableError,
  OpenError,
  RecoverySecretFormatError,
  WeakPassphraseError,
  passphraseProblem,
} from "@/lib/wallet-core";

/** What a person reads when a wallet step fails. Server text is never shown as it came. */
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Your sign-in has expired. Sign in again, then try once more.",
  WALLET_NOT_FOUND: "This account has no wallet yet.",
  WALLET_EXISTS: "This account already has a wallet. Reload the page to open it.",
  ADDRESS_TAKEN:
    "A wallet with these keys already belongs to another account. Nothing was created. Contact support.",
  RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
  VERSION_CONFLICT: "Your wallet changed somewhere else. Reload the page and try again.",
  CHALLENGE_INVALID: "That took too long. Nothing was changed. Try again.",
  PROOF_INVALID: "We couldn't confirm the keys. Nothing was created. Try again.",
  NOT_AUTHORIZED: "This device isn't allowed to do that.",
  DEVICE_EXISTS: "This device is already registered.",
  TOO_MANY_DEVICES: "Too many devices are registered. Remove one first.",
  NOT_CONFIGURED: "The wallet service isn't set up in this environment.",
  NOT_AVAILABLE: "The wallet service isn't available in this environment.",
  SERVICE_UNAVAILABLE:
    "We couldn't reach the wallet service. Nothing was changed. Try again shortly.",
  UPSTREAM_ERROR: "We couldn't reach the wallet service. Nothing was changed. Try again shortly.",
  INVALID_PACKAGE: "The wallet data wasn't accepted. Nothing was changed.",
};

const GENERIC = "Something went wrong and nothing was changed. Please try again.";

export function walletErrorMessage(error: unknown): string {
  if (error instanceof OpenError) return "That doesn't match. Check it and try again.";
  if (error instanceof WeakPassphraseError) return passphraseProblem(error.reason);
  if (error instanceof RecoverySecretFormatError) return error.message;
  if (error instanceof Argon2UnavailableError) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === "string" && MESSAGES[code]) || GENERIC;
}
