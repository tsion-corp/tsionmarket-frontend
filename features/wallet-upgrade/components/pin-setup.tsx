"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDevicePin } from "../hooks/use-device-pin";
import { removeDevicePin, setDevicePin } from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";
import { BODY, FIELD, LINK, NOTICE, PRIMARY, SECONDARY, SMALL, WELL } from "./ui";

/**
 * Set, or remove, a PIN for this device, so a reload or a lock asks for a short PIN instead of
 * the long passphrase. It lives on this device only; the passphrase and recovery secret are
 * unchanged and always work.
 */
export function PinSetup({ uid, walletId }: { uid: string; walletId: string }) {
  const pinState = useDevicePin(uid, walletId);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");

  const save = useMutation({
    mutationFn: () => setDevicePin(uid, walletId, pin),
    onSuccess: () => {
      setPin("");
      setAgain("");
      setOpen(false);
      void pinState.refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => removeDevicePin(uid),
    onSuccess: () => void pinState.refresh(),
  });

  const valid = /^\d{6,12}$/.test(pin) && pin === again;

  if (pinState.loading) return null;
  if (pinState.enabled) {
    return (
      <div className={`${WELL} flex flex-col gap-2 px-4 py-4`}>
        <p className={BODY}>
          A PIN is set on this device. Use it to unlock instead of your passphrase.
        </p>
        <button
          type="button"
          className={LINK}
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Remove the PIN from this device
        </button>
        {remove.error ? (
          <p role="alert" className={NOTICE.error}>
            {walletErrorMessage(remove.error)}
          </p>
        ) : null}
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className={SECONDARY} onClick={() => setOpen(true)}>
        Unlock with a PIN on this device
      </button>
    );
  }
  return (
    <form
      className={`${WELL} flex flex-col gap-3 px-4 py-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <p className={BODY}>
        Choose a PIN of 6 to 12 digits. It works on this device only and never leaves it. Your
        passphrase and recovery secret still work everywhere. Ten wrong PINs remove it.
      </p>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        aria-label="New PIN"
        placeholder="PIN"
        className={FIELD}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
      />
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        aria-label="Repeat PIN"
        placeholder="Repeat PIN"
        className={FIELD}
        value={again}
        onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))}
      />
      {again && pin !== again ? <p className={SMALL}>The two PINs don&apos;t match.</p> : null}
      <button type="submit" className={PRIMARY} disabled={!valid || save.isPending}>
        {save.isPending ? "Saving…" : "Save PIN"}
      </button>
      {save.error ? (
        <p role="alert" className={NOTICE.error}>
          {walletErrorMessage(save.error)}
        </p>
      ) : null}
      <button type="button" className={LINK} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
