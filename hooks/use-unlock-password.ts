"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocialWallet } from "decane-connect-kit";
import { promptUnlockPassword } from "@/lib/decane-recovery";

/**
 * "Set an unlock password" for the signed-in device.
 *
 * The password replaced the PIN, and the difference is the whole point: a PIN
 * wrapped only the device share — one of three, which opens nothing alone — so
 * it could never do more than unwrap, and every unlock still needed a full
 * sign-in to obtain a JWT. The password additionally encrypts an unlock token
 * that buys that JWT, so a device holding one opens a session by itself.
 *
 * That is also why the kit demands a real password (12+ characters, never
 * digits-only) rather than reusing the PIN rules: this secret now carries the
 * weight the second factor used to.
 *
 * Offered only where it adds something — a device with a passkey already has a
 * better one-tap path and does not need this.
 */
export function useUnlockPassword(): {
  /** Null until known. True when this device could hold an unlock password. */
  canSet: boolean | null;
  /** True when one is already set, so the action reads as "change". */
  isSet: boolean;
  saving: boolean;
  error: string | null;
  setPassword: () => Promise<void>;
} {
  const wallet = useSocialWallet() as ReturnType<typeof useSocialWallet> & {
    hasPasskey?: () => Promise<boolean>;
    canUnlockWithPassword?: () => Promise<boolean>;
    setUnlockPassword?: (password: string) => Promise<void>;
  };
  const [canSet, setCanSet] = useState<boolean | null>(null);
  const [isSet, setIsSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = typeof wallet.setUnlockPassword === "function";

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!wallet.isConnected || !supported) {
        if (live) setCanSet(false);
        return;
      }
      try {
        const [hasPasskey, hasPassword] = await Promise.all([
          wallet.hasPasskey?.() ?? Promise.resolve(false),
          wallet.canUnlockWithPassword?.() ?? Promise.resolve(false),
        ]);
        if (!live) return;
        setIsSet(hasPassword);
        // A passkey is strictly the better path — one biometric versus typing
        // twelve characters — so this is only offered where there isn't one.
        setCanSet(!hasPasskey);
      } catch {
        if (live) setCanSet(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [wallet, wallet.isConnected, supported]);

  const setPassword = useCallback(async () => {
    if (!wallet.setUnlockPassword) return;
    setError(null);
    // Collected by the same dialog host the kit uses, so the secret never
    // passes through a component's state.
    const password = await promptUnlockPassword({ kind: "set" });
    setSaving(true);
    try {
      await wallet.setUnlockPassword(password);
      setIsSet(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not set an unlock password.");
      throw e;
    } finally {
      setSaving(false);
    }
  }, [wallet]);

  return { canSet, isSet, saving, error, setPassword };
}
