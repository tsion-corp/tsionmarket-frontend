"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { indexedDbDeviceStore } from "@/lib/wallet-device/store";
import { walletApi } from "../lib/wallet-api";
import {
  addressesOf,
  backupFile,
  loadWalletState,
  lockWallet,
  recoverOnThisDevice,
  unlockWallet,
  type Deps,
  type WalletState,
} from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";
import { CopyButton } from "@/components/ui/copy-button";
import { LockIcon } from "@/components/ui/icons";
import { NetworkIcon } from "@/components/ui/network-icon";
import { CreateWallet } from "./create-wallet";
import {
  getActiveWalletKind,
  setActiveWalletKind,
  subscribeActiveWalletKind,
  walletSwitchEnabled,
} from "@/lib/signer/preference";
import { RestoreWallet } from "./restore-wallet";
import { BODY, FIELD, LINK, NOTICE, PANEL, PRIMARY, SECONDARY, SMALL, TITLE, WELL } from "./ui";

const deps: Deps = { api: walletApi, devices: indexedDbDeviceStore() };

export const walletStateKey = (uid: string) => ["walletState", uid] as const;

export function useWalletState(uid: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: walletStateKey(uid ?? ""),
    queryFn: () => loadWalletState(deps, uid as string),
    enabled: enabled && Boolean(uid),
    staleTime: 0,
    retry: false,
  });
}

export function WalletPanel({ uid }: { uid: string }) {
  const queryClient = useQueryClient();
  const state = useWalletState(uid, true);
  const refresh = () => queryClient.invalidateQueries({ queryKey: walletStateKey(uid) });

  if (state.isPending)
    return <p className="text-center text-sm text-white/50">Checking your wallet…</p>;
  if (state.isError) {
    return (
      <p role="alert" className="text-center text-sm text-red-200">
        {walletErrorMessage(state.error)}
      </p>
    );
  }
  const data: WalletState = state.data;
  if (data.kind === "none") return <NoWallet uid={uid} onChange={refresh} />;
  if (data.kind === "locked") return <Locked uid={uid} state={data} onChange={refresh} />;
  return <Unlocked uid={uid} state={data} onChange={refresh} />;
}

/** No wallet yet: make a new one, or put one back from a backup file. */
function NoWallet({ uid, onChange }: { uid: string; onChange: () => void }) {
  const [restoring, setRestoring] = useState(false);
  if (restoring) {
    return (
      <RestoreWallet
        deps={deps}
        uid={uid}
        onRestored={onChange}
        onBack={() => setRestoring(false)}
      />
    );
  }
  return (
    <>
      <CreateWallet deps={deps} uid={uid} onCreated={onChange} />
      <button type="button" className={`${LINK} self-center`} onClick={() => setRestoring(true)}>
        I already have a backup file
      </button>
    </>
  );
}

function Card({
  title,
  children,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={PANEL}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={TITLE}>{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Locked({
  uid,
  state,
  onChange,
}: {
  uid: string;
  state: Extract<WalletState, { kind: "locked" }>;
  onChange: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [secret, setSecret] = useState("");

  const unlock = useMutation({
    mutationFn: () => unlockWallet(deps, uid, passphrase),
    onSuccess: () => {
      setPassphrase("");
      onChange();
    },
  });
  const recover = useMutation({
    mutationFn: () => recoverOnThisDevice(deps, uid, secret),
    onSuccess: () => {
      setSecret("");
      onChange();
    },
  });

  if (recovering) {
    return (
      <Card title="Use your recovery secret">
        <p className={BODY}>
          Enter the recovery secret you saved when you made this wallet: 14 groups of four
          characters. This opens your wallet and registers this device.
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
      </Card>
    );
  }

  return (
    <Card
      title="Unlock your wallet"
      badge={
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70">
          <LockIcon size={15} />
        </span>
      }
    >
      {!state.deviceEnrolled ? (
        <p className={NOTICE.warn}>
          This browser isn&apos;t registered with your wallet yet. You can still unlock it with your
          passphrase; use your recovery secret to register this browser.
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
    </Card>
  );
}

/**
 * Choose which wallet the whole app uses. Off unless the switch is built in. Switching is
 * a real change (what the app shows and spends from), so it is asked for plainly, and it
 * can be undone from here at any time.
 */
function UseInApp({ uid }: { uid: string }) {
  const kind = useSyncExternalStore(
    subscribeActiveWalletKind,
    () => getActiveWalletKind(uid),
    () => "decane" as const
  );
  const [confirming, setConfirming] = useState(false);
  if (!walletSwitchEnabled()) return null;

  if (kind === "custom") {
    return (
      <div className={`${WELL} flex flex-col gap-3 px-4 py-4`}>
        <p className={BODY}>The app is using this wallet.</p>
        <button
          type="button"
          className={SECONDARY}
          onClick={() => setActiveWalletKind(uid, "decane")}
        >
          Go back to my old wallet
        </button>
      </div>
    );
  }
  if (!confirming) {
    return (
      <button type="button" className={SECONDARY} onClick={() => setConfirming(true)}>
        Use this wallet in the app
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className={NOTICE.warn}>
        The app will show and spend from this wallet instead of your old one. Money you haven&apos;t
        moved across stays in the old wallet, and balances the app keeps in its own accounts (game
        credits, rewards) stay with it until they are carried over. You can switch back any time.
      </p>
      <button
        type="button"
        className={PRIMARY}
        onClick={() => {
          setActiveWalletKind(uid, "custom");
          setConfirming(false);
        }}
      >
        Switch to this wallet
      </button>
      <button type="button" className={LINK} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}

function Unlocked({
  uid,
  state,
  onChange,
}: {
  uid: string;
  state: Extract<WalletState, { kind: "unlocked" }>;
  onChange: () => void;
}) {
  const addresses = addressesOf(state.wallet);
  const backup = useMutation({
    mutationFn: async () => {
      const { filename, text } = await backupFile(deps);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  return (
    <Card
      title="Your wallet is ready"
      badge={
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-200">
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-300" />
          Unlocked
        </span>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {addresses.map((item) => (
          <li key={item.family} className={`${WELL} flex items-center gap-3.5 px-4 py-3.5`}>
            <NetworkIcon
              network={item.family === "evm" ? "eth-mainnet" : "solana-mainnet"}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <div className={SMALL}>
                {item.family === "evm" ? "Ethereum and other EVM chains" : "Solana"}
              </div>
              <div className="truncate font-mono text-[13px] text-white" title={item.address}>
                {item.address}
              </div>
            </div>
            <CopyButton value={item.address} />
          </li>
        ))}
      </ul>

      <p className={SMALL}>
        Your recovery secret was shown once, when you made this wallet. It can&apos;t be shown
        again, so keep what you saved.
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={`${SECONDARY} sm:w-auto sm:self-center sm:px-8`}
          disabled={backup.isPending}
          onClick={() => backup.mutate()}
        >
          {backup.isPending ? "Preparing…" : "Download an encrypted backup"}
        </button>
        <p className={`${SMALL} text-center`}>
          A file that only opens with your passphrase or recovery secret. Keep a copy somewhere
          other than this device: it&apos;s how you get your wallet back if this account is ever
          reset.
        </p>
        {backup.error ? (
          <p role="alert" className={NOTICE.error}>
            {walletErrorMessage(backup.error)}
          </p>
        ) : null}
      </div>

      <UseInApp uid={uid} />

      <button
        type="button"
        className={`${SECONDARY} sm:w-auto sm:self-center sm:px-8`}
        onClick={() => {
          lockWallet();
          onChange();
        }}
      >
        Lock wallet
      </button>
    </Card>
  );
}
