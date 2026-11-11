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
  showRecoveryPhrase,
  unlockWallet,
  type Deps,
  type WalletState,
} from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";
import { CreateWallet } from "./create-wallet";

const deps: Deps = { api: walletApi, devices: indexedDbDeviceStore() };

const field =
  "w-full rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-3 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/40";
const primary =
  "w-full rounded-full bg-white px-5 py-3 text-center text-[15px] font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50";
const link =
  "self-center text-[13px] text-white/50 underline underline-offset-4 hover:text-white/80";

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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
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
  const [phrase, setPhrase] = useState("");

  const unlock = useMutation({
    mutationFn: () => unlockWallet(deps, uid, passphrase),
    onSuccess: () => {
      setPassphrase("");
      onChange();
    },
  });
  const recover = useMutation({
    mutationFn: () => recoverOnThisDevice(deps, uid, phrase),
    onSuccess: () => {
      setPhrase("");
      onChange();
    },
  });

  if (recovering) {
    return (
      <Card title="Use your recovery phrase">
        <p className="text-[13px] leading-relaxed text-white/60">
          Enter your 24 words in order, separated by spaces. This opens your wallet and registers
          this device.
        </p>
        <textarea
          aria-label="Recovery phrase"
          rows={4}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${field} font-mono`}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
        />
        <button
          type="button"
          className={primary}
          disabled={!phrase.trim() || recover.isPending}
          onClick={() => recover.mutate()}
        >
          {recover.isPending ? "Checking…" : "Open my wallet"}
        </button>
        {recover.error ? (
          <p role="alert" className="text-sm text-red-200">
            {walletErrorMessage(recover.error)}
          </p>
        ) : null}
        <button type="button" className={link} onClick={() => setRecovering(false)}>
          Use my passphrase instead
        </button>
      </Card>
    );
  }

  return (
    <Card title="Unlock your wallet">
      {!state.deviceEnrolled ? (
        <p className="text-[13px] text-white/60">
          This browser isn&apos;t registered with your wallet yet. You can still unlock it with your
          passphrase; use your recovery phrase to register this browser.
        </p>
      ) : null}
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
          className={field}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <button type="submit" className={primary} disabled={!passphrase || unlock.isPending}>
          {unlock.isPending ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      {unlock.error ? (
        <p role="alert" className="text-sm text-red-200">
          {walletErrorMessage(unlock.error)}
        </p>
      ) : null}
      <button type="button" className={link} onClick={() => setRecovering(true)}>
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
  const [asking, setAsking] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [words, setWords] = useState<Array<string> | null>(null);
  const addresses = addressesOf(state.wallet);

  const reveal = useMutation({
    mutationFn: () => showRecoveryPhrase(deps, passphrase),
    onSuccess: (result) => {
      setPassphrase("");
      setWords(result);
    },
  });

  return (
    <Card title="Your wallet is ready">
      <ul className="flex flex-col gap-2">
        {addresses.map((item) => (
          <li
            key={item.family}
            className="rounded-xl border border-white/10 bg-black/30 px-3.5 py-3"
          >
            <div className="text-[11px] tracking-wide text-white/40 uppercase">
              {item.family === "evm" ? "EVM chains (one address)" : "Solana"}
            </div>
            <div className="font-mono text-[13px] break-all">{item.address}</div>
          </li>
        ))}
      </ul>

      {words ? (
        <div className="flex flex-col gap-3">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((word, index) => (
              <li
                key={index}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[14px]"
              >
                <span className="w-5 text-right text-[11px] text-white/40">{index + 1}</span>
                <span className="font-mono">{word}</span>
              </li>
            ))}
          </ol>
          <button type="button" className={link} onClick={() => setWords(null)}>
            Hide the words
          </button>
        </div>
      ) : asking ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (passphrase) reveal.mutate();
          }}
        >
          <input
            type="password"
            autoComplete="current-password"
            aria-label="Passphrase to show the recovery phrase"
            placeholder="Enter your passphrase to continue"
            className={field}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <button type="submit" className={primary} disabled={!passphrase || reveal.isPending}>
            {reveal.isPending ? "Checking…" : "Show my recovery phrase"}
          </button>
          {reveal.error ? (
            <p role="alert" className="text-sm text-red-200">
              {walletErrorMessage(reveal.error)}
            </p>
          ) : null}
        </form>
      ) : (
        <button type="button" className={link} onClick={() => setAsking(true)}>
          Show my recovery phrase
        </button>
      )}

      <button
        type="button"
        className={link}
        onClick={() => {
          lockWallet();
          setWords(null);
          onChange();
        }}
      >
        Lock wallet
      </button>
    </Card>
  );
}
