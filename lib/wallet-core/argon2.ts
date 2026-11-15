import { argon2id } from "hash-wasm";
import { randomBytes } from "./encoding";

/**
 * Argon2id for turning a human secret into a key.
 *
 * Only human-chosen secrets (the passphrase, and the device PIN) go through
 * this. The recovery secret, the passkey output and the device secret are
 * already high entropy, so they use HKDF instead.
 *
 * Why these numbers: the stored ciphertext is an OFFLINE target, with no rate
 * limit to lean on, so each guess has to be expensive. 64 MiB at 3 passes is
 * RFC 9106's constrained-memory profile and well above OWASP's login-form
 * minimum (19 MiB, 2 passes). Parallelism is 1: this runs single-threaded in
 * WebAssembly, so extra lanes cost the user time without costing an attacker
 * anything.
 *
 * The parameters are stored beside the ciphertext and bound into it (see
 * aad.ts), and are range-checked on every read, so a package cannot be edited
 * to weaken them or to hang a device with an absurd request.
 */

export interface Argon2Params {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: 32;
}

export const DEFAULT_ARGON2: Argon2Params = {
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

/** Nothing below this is ever created or accepted. */
export const ARGON2_FLOORS = { memoryKiB: 32_768, iterations: 2, parallelism: 1 } as const;
/** Nothing above this is accepted: it is a request to freeze a device. */
export const ARGON2_CEILINGS = { memoryKiB: 262_144, iterations: 8, parallelism: 4 } as const;

export const ARGON2_SALT_BYTES = 16;
/** The Argon2 version number in the standard (0x13). */
export const ARGON2_VERSION = 19;

export class Argon2ParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Argon2ParamsError";
  }
}

/** Not enough memory (or no WebAssembly) to run the derivation at the floor. */
export class Argon2UnavailableError extends Error {
  constructor() {
    super("This device cannot run the wallet's key stretching.");
    this.name = "Argon2UnavailableError";
  }
}

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export function assertSafeArgon2Params(value: unknown): asserts value is Argon2Params {
  const p = value as Partial<Record<keyof Argon2Params, unknown>> | null;
  if (typeof p !== "object" || p === null) throw new Argon2ParamsError("Missing parameters");
  if (
    !isInt(p.memoryKiB) ||
    p.memoryKiB < ARGON2_FLOORS.memoryKiB ||
    p.memoryKiB > ARGON2_CEILINGS.memoryKiB
  ) {
    throw new Argon2ParamsError("Memory cost is outside the allowed range");
  }
  if (
    !isInt(p.iterations) ||
    p.iterations < ARGON2_FLOORS.iterations ||
    p.iterations > ARGON2_CEILINGS.iterations
  ) {
    throw new Argon2ParamsError("Iteration count is outside the allowed range");
  }
  if (
    !isInt(p.parallelism) ||
    p.parallelism < ARGON2_FLOORS.parallelism ||
    p.parallelism > ARGON2_CEILINGS.parallelism
  ) {
    throw new Argon2ParamsError("Parallelism is outside the allowed range");
  }
  if (p.hashLength !== 32) throw new Argon2ParamsError("Hash length must be 32");
}

/** True when a stored parameter set is weaker than today's defaults. */
export function isBelowDefault(params: Argon2Params): boolean {
  return (
    params.memoryKiB < DEFAULT_ARGON2.memoryKiB ||
    params.iterations < DEFAULT_ARGON2.iterations ||
    params.parallelism < DEFAULT_ARGON2.parallelism
  );
}

export function newSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(ARGON2_SALT_BYTES);
}

/**
 * The raw derivation, with NO range check. Exposed only so tests can compare
 * against known answers at tiny parameters. Production code calls
 * `deriveArgon2id`.
 */
export async function rawArgon2id(
  secret: string | Uint8Array,
  salt: Uint8Array,
  params: Argon2Params
): Promise<Uint8Array> {
  return argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: params.hashLength,
    outputType: "binary",
  });
}

/** Stretch a human secret into 32 bytes. Refuses unsafe parameters and short salts. */
export async function deriveArgon2id(
  secret: string | Uint8Array,
  salt: Uint8Array,
  params: Argon2Params
): Promise<Uint8Array> {
  assertSafeArgon2Params(params);
  if (salt.length < ARGON2_SALT_BYTES) throw new Argon2ParamsError("Salt is too short");
  return rawArgon2id(secret, salt, params);
}

export interface CalibrationOptions {
  /** How long one derivation may take, in milliseconds. */
  budgetMs?: number;
  /** Memory sizes to try, largest first. Never below the floor. */
  ladderKiB?: ReadonlyArray<number>;
  /** Injected for tests. */
  now?: () => number;
  derive?: (params: Argon2Params) => Promise<unknown>;
}

const DEFAULT_LADDER = [65_536, 49_152, 32_768] as const;

/**
 * Pick the strongest parameters this device can run comfortably.
 *
 * Tries the default first and steps down the ladder when a derivation is too
 * slow or cannot allocate. It never goes below the floor: if even that will
 * not allocate, creation is refused (`Argon2UnavailableError`) instead of
 * quietly weakening. If the floor merely runs slowly, the floor is used.
 */
export async function calibrateArgon2(options: CalibrationOptions = {}): Promise<Argon2Params> {
  const budgetMs = options.budgetMs ?? 1_500;
  const now = options.now ?? (() => performance.now());
  const derive =
    options.derive ??
    ((params: Argon2Params) => rawArgon2id("calibration", randomBytes(ARGON2_SALT_BYTES), params));
  const ladder = [...(options.ladderKiB ?? DEFAULT_LADDER)]
    .filter((memoryKiB) => memoryKiB >= ARGON2_FLOORS.memoryKiB)
    .sort((a, b) => b - a);
  if (ladder.length === 0) ladder.push(ARGON2_FLOORS.memoryKiB);

  let slowestWorking: Argon2Params | null = null;
  for (const memoryKiB of ladder) {
    const params: Argon2Params = { ...DEFAULT_ARGON2, memoryKiB };
    const started = now();
    try {
      await derive(params);
    } catch {
      continue; // would not allocate here; try something smaller
    }
    slowestWorking = params;
    if (now() - started <= budgetMs) return params;
  }
  if (slowestWorking === null) throw new Argon2UnavailableError();
  // Everything that ran was over budget: the smallest that worked, never lower.
  return slowestWorking;
}
