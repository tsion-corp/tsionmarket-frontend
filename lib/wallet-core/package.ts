import { z } from "zod";
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  aadAccount,
  aadDevice,
  aadPassphrase,
  aadRecovery,
} from "./aad";
import { Argon2ParamsError, assertSafeArgon2Params } from "./argon2";
import type { Envelope } from "./envelope";

/**
 * The wallet package: everything the server stores for a wallet, and nothing
 * that opens it.
 *
 * Validation is strict because the package is untrusted input: unknown fields
 * are rejected, sizes are bounded, ids are unique, key stretching parameters
 * must sit inside the allowed range, and every stored associated-data string
 * must equal what the visible facts produce. The same code is meant to run
 * server-side before a package is accepted and client-side before one is used.
 */

export const MAX_PACKAGE_BYTES = 256 * 1024;

const id = z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/);
const b64 = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(8_192);
const aad = z.string().min(1).max(512);

const argon2Meta = z
  .strictObject({
    kind: z.literal("argon2id"),
    version: z.literal(19),
    salt: b64,
    memoryKiB: z.number().int(),
    iterations: z.number().int(),
    parallelism: z.number().int(),
    hashLength: z.literal(32),
  })
  .superRefine((meta, ctx) => {
    try {
      assertSafeArgon2Params(meta);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Argon2ParamsError ? error.message : "Unsafe key stretching",
      });
    }
  });

const base = { envelopeId: id, wrappedDek: b64, iv: b64, aad };

const passphraseEnvelope = z.strictObject({
  ...base,
  purpose: z.literal("passphrase"),
  methodVersion: z.literal(2),
  keyDerivationMetadata: argon2Meta,
});

const recoveryEnvelope = z.strictObject({
  ...base,
  purpose: z.literal("recovery"),
  methodVersion: z.literal(1),
  keyDerivationMetadata: z.strictObject({
    kind: z.literal("hkdf-sha256"),
    version: z.literal(1),
    source: z.literal("recovery-secret"),
  }),
  recoveryPublicKey: b64,
  verificationFingerprint: b64,
});

const deviceEnvelope = z.strictObject({
  ...base,
  purpose: z.literal("device"),
  methodVersion: z.literal(1),
  deviceId: id,
  keyDerivationMetadata: z.strictObject({
    kind: z.literal("hkdf-sha256"),
    version: z.literal(1),
    source: z.literal("device-secret"),
  }),
});

const account = z.strictObject({
  accountId: id,
  family: z.enum(["evm", "solana"]),
  algorithm: z.enum(["secp256k1", "ed25519"]),
  keyType: z.literal("private-key"),
  publicKey: b64,
  canonicalAddress: z.string().min(1).max(128),
  addresses: z
    .array(
      z.strictObject({
        networkId: id,
        address: z.string().min(1).max(128),
        isCanonical: z.boolean(),
      })
    )
    .min(1)
    .max(32),
  encryptedKeyMaterial: z.strictObject({
    ciphertext: b64,
    iv: b64,
    aad,
    dekVersion: z.literal(1),
    encoding: z.literal("base64url"),
  }),
});

const walletPackage = z.strictObject({
  format: z.literal(PACKAGE_FORMAT),
  formatVersion: z.literal(PACKAGE_VERSION),
  walletId: id,
  version: z.number().int().min(1),
  baseVersion: z.number().int().min(0),
  securityVersion: z.number().int().min(1),
  accounts: z.array(account).min(1).max(8),
  envelopes: z
    .array(z.discriminatedUnion("purpose", [passphraseEnvelope, recoveryEnvelope, deviceEnvelope]))
    .min(2)
    .max(16),
});

export type WalletPackage = z.infer<typeof walletPackage> & { envelopes: Array<Envelope> };
export type PackageAccount = z.infer<typeof account>;

export class PackageValidationError extends Error {
  constructor(readonly issues: Array<string>) {
    super("The wallet package is not valid.");
    this.name = "PackageValidationError";
  }
}

const NON_SECRET_PATH = (path: ReadonlyArray<PropertyKey>) => path.map(String).join(".");

export function validateWalletPackage(input: unknown): WalletPackage {
  // Size first, on the serialised form, before any parsing work.
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    throw new PackageValidationError(["not serialisable"]);
  }
  if (size > MAX_PACKAGE_BYTES) throw new PackageValidationError(["package is too large"]);

  const parsed = walletPackage.safeParse(input);
  if (!parsed.success) {
    // Paths and messages only; never echo values, which could be ciphertext.
    throw new PackageValidationError(
      parsed.error.issues.map((issue) => `${NON_SECRET_PATH(issue.path)}: ${issue.message}`)
    );
  }
  const pkg = parsed.data as WalletPackage;
  const issues: Array<string> = [];

  if (pkg.version !== pkg.baseVersion + 1) issues.push("version must follow baseVersion");
  const accountIds = new Set(pkg.accounts.map((a) => a.accountId));
  if (accountIds.size !== pkg.accounts.length) issues.push("duplicate account id");
  const families = new Set(pkg.accounts.map((a) => a.family));
  if (families.size !== pkg.accounts.length)
    issues.push("more than one account for a chain family");
  const envelopeIds = new Set(pkg.envelopes.map((e) => e.envelopeId));
  if (envelopeIds.size !== pkg.envelopes.length) issues.push("duplicate envelope id");
  if (!pkg.envelopes.some((e) => e.purpose === "passphrase"))
    issues.push("a passphrase envelope is required");
  if (!pkg.envelopes.some((e) => e.purpose === "recovery"))
    issues.push("a recovery envelope is required");

  for (const item of pkg.accounts) {
    const algorithm = item.family === "evm" ? "secp256k1" : "ed25519";
    if (item.algorithm !== algorithm)
      issues.push(`account ${item.accountId}: wrong algorithm for family`);
    if (item.encryptedKeyMaterial.aad !== aadAccount(pkg.walletId, item.accountId, item.family)) {
      issues.push(`account ${item.accountId}: associated data does not match`);
    }
    // One EVM address serves every EVM network, so several entries may be
    // canonical. What matters is that each canonical entry IS the account's
    // address, that there is at least one, and that no network is listed twice.
    const canonical = item.addresses.filter((a) => a.isCanonical);
    if (canonical.length === 0 || canonical.some((a) => a.address !== item.canonicalAddress)) {
      issues.push(`account ${item.accountId}: canonical address does not match`);
    }
    if (new Set(item.addresses.map((a) => a.networkId)).size !== item.addresses.length) {
      issues.push(`account ${item.accountId}: a network is listed twice`);
    }
  }

  for (const envelope of pkg.envelopes) {
    let expected: string;
    if (envelope.purpose === "passphrase") {
      expected = aadPassphrase(pkg.walletId, envelope.envelopeId, envelope.keyDerivationMetadata);
    } else if (envelope.purpose === "recovery") {
      expected = aadRecovery(pkg.walletId, envelope.envelopeId);
    } else {
      expected = aadDevice(pkg.walletId, envelope.deviceId, envelope.envelopeId);
    }
    if (envelope.aad !== expected)
      issues.push(`envelope ${envelope.envelopeId}: associated data does not match`);
  }

  if (issues.length > 0) throw new PackageValidationError(issues);
  return pkg;
}
