"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockIcon } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { indexedDbDeviceStore } from "@/lib/wallet-device/store";
import { walletApi } from "../lib/wallet-api";
import { recoverOnThisDevice, unlockWallet, type Deps } from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";
import { useWalletState, walletStateKey } from "./wallet-panel";
import { BODY, FIELD, LINK, NOTICE, PRIMARY, SUBTITLE } from "./ui";

const deps: Deps = { api: walletApi, devices: indexedDbDeviceStore() };

/**
 * Unlocks the new wallet over whatever page the person is on, so the banner's button does
 * not have to take them to /upgrade. The wallet code is the same as the upgrade page's.
 */
export function UnlockWalletModal({
  open,
  onClose,
  uid,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
}) {
  return (
    <ModalShell open={open} onClose={onClose}>
      <UnlockBody uid={uid} onDone={onClose} />
    </ModalShell>
  );
}

function UnlockBody({ uid, onDone }: { uid: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const state = useWalletState(uid, true);
  const [passphrase, setPassphrase] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [secret, setSecret] = useState("");

  const finish = () => {
    setPassphrase("");
    setSecret("");
    void queryClient.invalidateQueries({ queryKey: walletStateKey(uid) });
    onDone();
  };
  const unlock = useMutation({
    mutationFn: () => unlockWallet(deps, uid, passphrase),
    onSuccess: finish,
  });
  const recover = useMutation({
    mutationFn: () => recoverOnThisDevice(deps, uid, secret),
    onSuccess: finish,
  });

  const notEnrolled = state.data?.kind === "locked" && !state.data.deviceEnrolled;

  return (
    <div className="flex flex-col gap-4 p-6 pt-12 md:pt-8">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70">
          <LockIcon size={16} />
        </span>
        <h2 className={SUBTITLE}>
          {recovering ? "Use your recovery secret" : "Unlock your wallet"}
        </h2>
      </div>

      {recovering ? (
        <>
          <p className={BODY}>
            Enter the 14 groups of four characters you saved when you made this wallet. This opens
            it and registers this browser.
          </p>
          <textarea
            aria-label="Recovery secret"
            rows={3}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-…"
            className={`${FIELD} font-mono`}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button
            type="button"
            className={PRIMARY}
            disabled={!secret.trim() || recover.isPending}
            onClick={() => recover.mutate()}
          >
            {recover.isPending ? "Checking…" : "Open my wallet"}
          </button>
          {recover.error ? (
            <p role="alert" className={NOTICE.error}>
              {walletErrorMessage(recover.error)}
            </p>
          ) : null}
          <button type="button" className={LINK} onClick={() => setRecovering(false)}>
            Use my passphrase instead
          </button>
        </>
      ) : (
        <>
          {notEnrolled ? (
            <p className={NOTICE.warn}>
              This browser isn&apos;t registered with your wallet yet. You can still unlock with
              your passphrase; use your recovery secret to register this browser.
            </p>
          ) : (
            <p className={BODY}>Enter your passphrase to open your wallet on this device.</p>
          )}
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (passphrase) unlock.mutate();
            }}
          >
            <input
              type="password"
              autoComplete="current-password"
              aria-label="Passphrase"
              placeholder="Passphrase"
              className={FIELD}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <button type="submit" className={PRIMARY} disabled={!passphrase || unlock.isPending}>
              {unlock.isPending ? "Unlocking…" : "Unlock"}
            </button>
          </form>
          {unlock.error ? (
            <p role="alert" className={NOTICE.error}>
              {walletErrorMessage(unlock.error)}
            </p>
          ) : null}
          <button type="button" className={LINK} onClick={() => setRecovering(true)}>
            Forgot your passphrase, or on a new device?
          </button>
        </>
      )}
    </div>
  );
}
