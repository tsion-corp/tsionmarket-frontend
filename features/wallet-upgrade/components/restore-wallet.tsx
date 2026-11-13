"use client";

import { useRef, useState } from "react";
import { BackupError, parseBackup, type WalletPackage } from "@/lib/wallet-core";
import { restoreFromBackup, type Deps } from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";
import { BODY, FIELD, LINK, NOTICE, PANEL, PRIMARY, SECONDARY, SMALL, TITLE, WELL } from "./ui";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

/**
 * Put a wallet back from a backup file. The file is opened here in the browser,
 * with the passphrase or the recovery secret, and never leaves it: only the
 * encrypted package and proofs go to the service.
 */
export function RestoreWallet({
  deps,
  uid,
  onRestored,
  onBack,
}: {
  deps: Deps;
  uid: string;
  onRestored: () => void;
  onBack: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<WalletPackage | null>(null);
  const [kind, setKind] = useState<"passphrase" | "secret">("passphrase");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    setError(null);
    setText(null);
    setPreview(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const content = await file.text();
      // Checked at once, so a wrong file is caught before any secret is typed.
      setPreview(parseBackup(content));
      setText(content);
    } catch (e) {
      setError(e instanceof BackupError ? e.message : walletErrorMessage(e));
    }
  }

  async function restore() {
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await restoreFromBackup(deps, uid, text, { kind, value });
      setValue("");
      onRestored();
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Restore your wallet" className={PANEL}>
      <div className="flex flex-col gap-2.5">
        <h2 className={TITLE}>Restore from a backup</h2>
        <p className={BODY}>
          Choose the backup file you downloaded. It&apos;s encrypted, so it only opens with your
          passphrase or your recovery secret, and it stays on this device.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          className="sr-only"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        <button type="button" className={SECONDARY} onClick={() => input.current?.click()}>
          {fileName ? "Choose a different file" : "Choose your backup file"}
        </button>
      </div>

      {preview ? (
        <div className={`${WELL} flex flex-col gap-1.5 px-4 py-3.5`} data-testid="backup-preview">
          <div className={SMALL}>
            {fileName} · version {preview.version}
          </div>
          {preview.accounts.map((account) => (
            <div key={account.accountId} className="font-mono text-[12.5px] text-white/80">
              {account.family === "evm" ? "Ethereum" : "Solana"}: {short(account.canonicalAddress)}
            </div>
          ))}
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="flex gap-2 text-[13px]" role="radiogroup" aria-label="Open it with">
            {(
              [
                ["passphrase", "My passphrase"],
                ["secret", "My recovery secret"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={kind === id}
                onClick={() => {
                  setKind(id);
                  setValue("");
                }}
                className={`flex-1 rounded-full border px-3 py-2 ${
                  kind === id
                    ? "border-white/60 bg-white/10 text-white"
                    : "border-white/15 text-white/55"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "passphrase" ? (
            <input
              type="password"
              autoComplete="current-password"
              aria-label="Passphrase"
              placeholder="Passphrase"
              className={FIELD}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <textarea
              aria-label="Recovery secret"
              rows={3}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-…"
              className={`${FIELD} font-mono`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          <button
            type="button"
            className={PRIMARY}
            disabled={!value.trim() || busy}
            onClick={restore}
          >
            {busy ? "Restoring… a few seconds" : "Restore my wallet"}
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className={NOTICE.error}>
          {error}
        </p>
      ) : null}

      <button type="button" className={LINK} onClick={onBack}>
        Make a new wallet instead
      </button>
    </section>
  );
}
