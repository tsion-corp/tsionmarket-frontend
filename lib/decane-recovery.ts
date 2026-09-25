"use client";

import { useSyncExternalStore } from "react";
import type { RecoveryShareFile } from "decane-connect-kit";

// Bridges Decane's wallet-recovery callbacks to React UI. The callbacks are
// configured on the DecaneKit provider (a plain config object, no React
// context), so they cannot render anything themselves: each one enqueues a
// request here and awaits it, and DecaneRecoveryHost renders the matching
// dialog and settles the promise with what the user chose.
//
// Why these exist at all: recovering a wallet on a new device rotates the
// Shamir share set, which invalidates the user's previous recovery file. The
// kit refuses to run recovery unless the app can collect a new password
// (onRecoveryRotated), deliver the replacement file (onRecoveryFileReady),
// and, on a device with neither share nor passkey, take the saved file back
// in (promptForRecoveryFile). There is no signup-time offer: since 2.7.4
// server-assisted provisioning covers new devices, and the kit no longer
// calls onRecoveryShareOffer unless offerRecoveryAtSignup is set explicitly.

export interface RecoveryAddresses {
  evmAddress: string;
  solanaAddress: string;
}

export interface RecoveryPasswordChoice {
  password: string;
  passwordHint?: string;
}

export type RecoveryRequest =
  | {
      kind: "rotated";
      addresses: RecoveryAddresses;
      resolve: (choice: RecoveryPasswordChoice) => void;
    }
  | {
      kind: "file";
      file: RecoveryShareFile;
      filename: string;
      resolve: () => void;
    }
  | {
      // A new device with no passkey: the user supplies the recovery file they
      // saved, plus its password. null means they cancelled, which the kit
      // reports as NewDeviceError.
      kind: "restore";
      resolve: (supplied: RecoveryFileSupply | null) => void;
    }
  | {
      // This device cannot use a passkey, so the device share is wrapped with a
      // PIN instead. `setup` is true the first time one is chosen here, which is
      // the only moment a typo can lock the wallet — the PIN is never stored and
      // cannot be recovered, so that path asks for it twice.
      kind: "pin";
      setup: boolean;
      resolve: (pin: string) => void;
    }
  | {
      // The device unlock password. Unlike a PIN it can open a session on its
      // own — it decrypts an unlock token that buys a JWT — so `setup` asks
      // twice and the dialog states what it protects.
      kind: "password";
      setup: boolean;
      // null = the user backed out. Offered on unlock only: a device being set
      // up has no working state to return to, so that one must be completed.
      resolve: (password: string | null) => void;
    };

export interface RecoveryFileSupply {
  value: unknown;
  getPassword: () => Promise<string | null>;
}

const queue: RecoveryRequest[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function enqueue(request: RecoveryRequest): void {
  queue.push(request);
  notify();
}

// Called by the host once a dialog's promise is settled.
export function completeRecoveryRequest(request: RecoveryRequest): void {
  const index = queue.indexOf(request);
  if (index >= 0) queue.splice(index, 1);
  notify();
}

function currentRequest(): RecoveryRequest | null {
  return queue[0] ?? null;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useRecoveryRequest(): RecoveryRequest | null {
  return useSyncExternalStore(subscribe, currentRequest, () => null);
}

// The three callbacks DecaneKit's social config is wired to.

export function collectRotatedRecoveryPassword(
  addresses: RecoveryAddresses
): Promise<RecoveryPasswordChoice> {
  return new Promise((resolve) => enqueue({ kind: "rotated", addresses, resolve }));
}

export function deliverRecoveryFile(file: RecoveryShareFile, filename: string): Promise<void> {
  return new Promise((resolve) => enqueue({ kind: "file", file, filename, resolve }));
}

export function promptForRecoveryFile(): Promise<RecoveryFileSupply | null> {
  return new Promise((resolve) => enqueue({ kind: "restore", resolve }));
}

// The kit's storage key prefix for a remembered identity. Reused here only to
// tell "choosing a PIN for the first time on this device" from "entering the
// one already set", which decides whether the dialog asks twice. Coupled to the
// kit's storage layout on purpose (see hooks/use-auth-session); a wrong guess
// costs an extra field, never a lockout, because the setup path is the default.
const DECANE_IDENTITY_KEY_PREFIX = "decane:social:";

function looksLikeFirstPinOnThisDevice(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DECANE_IDENTITY_KEY_PREFIX) && localStorage.getItem(key)) return false;
    }
  } catch {
    // Storage blocked: assume setup, so the user is asked to confirm.
  }
  return true;
}

/**
 * Decane's `promptPin`. Called when this device has no usable passkey — an
 * unreachable password manager, a browser without WebAuthn PRF, or a user who
 * declined the prompt — either to choose the PIN that wraps the device share,
 * or to re-enter it on unlock.
 *
 * The kit gives no argument distinguishing the two, so the dialog infers it and
 * defaults to the safer reading.
 */
/**
 * Decane's `promptUnlockPassword`. Called to choose the device unlock password
 * (`set`) and to enter it (`unlock`).
 *
 * Kept distinct from promptPin even though both collect a secret: this one can
 * open a session by itself, so a typo at setup time and a wrong entry later
 * have very different consequences and deserve different wording.
 */
/** Thrown when the user dismisses the unlock-password dialog. */
export class UnlockPasswordCancelledError extends Error {
  constructor() {
    super("Unlock cancelled");
    this.name = "UnlockPasswordCancelledError";
  }
}

export function promptUnlockPassword(ctx: { kind: "set" | "unlock" }): Promise<string> {
  return new Promise((resolve, reject) =>
    enqueue({
      kind: "password",
      setup: ctx.kind === "set",
      resolve: (password) =>
        password === null ? reject(new UnlockPasswordCancelledError()) : resolve(password),
    })
  );
}

export function promptPin(): Promise<string> {
  return new Promise((resolve) =>
    enqueue({ kind: "pin", setup: looksLikeFirstPinOnThisDevice(), resolve })
  );
}
