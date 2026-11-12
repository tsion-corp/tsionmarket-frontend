"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { indexedDbDeviceStore } from "@/lib/wallet-device/store";
import { walletApi } from "../lib/wallet-api";
import {
  addressesOf,
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
  if (data.kind === "none") return <CreateWallet deps={deps} uid={uid} onCreated={refresh} />;
  if (data.kind === "locked") return <Locked uid={uid} state={data} onChange={refresh} />;
  return <Unlocked state={data} onChange={refresh} />;
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

function Unlocked({
  state,
  onChange,
}: {
  state: Extract<WalletState, { kind: "unlocked" }>;
  onChange: () => void;
}) {
  const addresses = addressesOf(state.wallet);

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
