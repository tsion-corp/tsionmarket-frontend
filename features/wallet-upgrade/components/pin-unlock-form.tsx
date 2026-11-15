"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PinUnlockError, unlockWithPin, type Deps } from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";
import { BODY, FIELD, LINK, NOTICE, PRIMARY } from "./ui";

function pinProblem(error: unknown): string {
  if (error instanceof PinUnlockError) {
    if (error.reason === "wrong") {
      return error.triesLeft <= 5
        ? `That PIN is wrong. ${error.triesLeft} ${error.triesLeft === 1 ? "try" : "tries"} left before it is removed.`
        : "That PIN is wrong.";
    }
    if (error.reason === "wait") {
      const seconds = Math.ceil(error.waitMs / 1000);
      return seconds >= 120
        ? `Too many wrong PINs. Try again in ${Math.ceil(seconds / 60)} minutes, or use your passphrase.`
        : `Too many wrong PINs. Try again in ${seconds} seconds, or use your passphrase.`;
    }
    return error.message;
  }
  return walletErrorMessage(error);
}

/**
 * Unlock with the PIN set on this device. The passphrase is always still there: a link below
 * leads to it, and ten wrong PINs remove the PIN from this device.
 */
export function PinUnlockForm({
  uid,
  deps,
  onUnlocked,
  onUsePassphrase,
}: {
  uid: string;
  deps: Deps;
  onUnlocked: () => void;
  onUsePassphrase: () => void;
}) {
  const [pin, setPin] = useState("");
  const unlock = useMutation({
    mutationFn: () => unlockWithPin(deps, uid, pin),
    onSuccess: () => {
      setPin("");
      onUnlocked();
    },
    onError: (error) => {
      setPin("");
      // The last try is gone and so is the PIN: the passphrase is the way in.
      if (error instanceof PinUnlockError && error.reason === "wiped") onUsePassphrase();
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <p className={BODY}>Enter your PIN to open your wallet on this device.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{6,12}$/.test(pin)) unlock.mutate();
        }}
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          aria-label="PIN"
          placeholder="PIN"
          className={FIELD}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        <button
          type="submit"
          className={PRIMARY}
          disabled={!/^\d{6,12}$/.test(pin) || unlock.isPending}
        >
          {unlock.isPending ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      {unlock.error ? (
        <p role="alert" className={NOTICE.error}>
          {pinProblem(unlock.error)}
        </p>
      ) : null}
      <button type="button" className={LINK} onClick={onUsePassphrase}>
        Use my passphrase instead
      </button>
    </div>
  );
}
