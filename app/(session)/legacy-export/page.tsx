"use client";

import { useState } from "react";
import {
  usePrivy,
  useExportWallet,
  useWallets,
  useMigrateWallets,
  useGetWalletPrivateKey,
} from "@privy-io/react-auth";
import { useExportWallet as useExportSolanaWallet } from "@privy-io/react-auth/solana";
import { getWalletAddress } from "@/lib/user";

// TEMPORARY — a scratch page for seeing what Privy's export flow actually does.
// Delete app/(session)/legacy-export/ when you're finished.
//
// What the snippet you started from does, and two things it doesn't say:
//
//   1. usePrivy().exportWallet is DEPRECATED in the 3.35.1 we have installed.
//      The replacement is the useExportWallet hook, used below. Same modal.
//
//   2. It is ETHEREUM ONLY. Solana export is a different hook, from the
//      /solana subpath — which matters here because the legacy accounts hold
//      both, and calling the Ethereum one with a Solana address just errors.
//
// The `address` argument is optional only when the user has exactly one
// embedded wallet of that chain. These accounts have two wallets across two
// chains, so it is passed explicitly.
//
// Privy renders the key inside an iframe on their own domain — this app never
// sees it, and cannot. That is the whole point of the flow, and it is also why
// there is nothing here to log or capture: if you want to verify what the user
// gets, you have to look at the modal.

export default function LegacyExportPage() {
  const { ready, authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const { exportWallet: exportEvm } = useExportWallet();
  const { exportWallet: exportSolana } = useExportSolanaWallet();
  const { migrate } = useMigrateWallets();
  const { getWalletPrivateKey } = useGetWalletPrivateKey();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [probe, setProbe] = useState<string | null>(null);

  const evmAddress = getWalletAddress(user, "ethereum");
  const solAddress = getWalletAddress(user, "solana");

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      await fn();
      // The promise resolves when the user CLOSES the modal, not when they
      // copy anything — so this says nothing about whether they exported.
      setNote(`${label}: modal closed.`);
    } catch (err) {
      setError(`${label}: ${(err as Error)?.message ?? "failed"}`);
      console.error(`[legacy-export] ${label} failed:`, err);
    } finally {
      setBusy(null);
    }
  }

  // ── The two questions we'd otherwise email Privy about ───────────────────
  //
  // The wallet object reports client:"privy" (on-device, export unsupported),
  // but the export URL says v=1-unified (the exportable TEE kind). These two
  // buttons settle the contradiction by CALLING the sanctioned APIs rather than
  // guessing. Both are cheaper to run than to ask about.

  // Is TEE already switched on for this Privy app?
  //
  // migrate() is documented as a no-op when the app is not set up for TEEs, so
  // its return value IS the answer — no dashboard or support ticket needed.
  async function probeMigrate() {
    setBusy("migrate");
    setProbe(null);
    setError(null);
    try {
      const result = await migrate();
      setProbe(
        `migrate() → ${JSON.stringify(result)}\n` +
          (result.migrated
            ? "MIGRATED to TEEs. Re-open this page, confirm walletClientType is " +
              "now privy-v2, then run the key probe — export should work."
            : result.success
              ? "No-op: already migrated, OR this app has no TEE support. The " +
                "key probe below tells which."
              : "Reported failure — see console.")
      );
      console.log("[probe] migrate()", result);
    } catch (err) {
      setError(`migrate probe: ${(err as Error)?.message ?? "failed"}`);
      console.error("[probe] migrate()", err);
    } finally {
      setBusy(null);
    }
  }

  // Does programmatic export actually work, docs notwithstanding?
  //
  // Only the CALL is tested, not the HPKE decrypt — if ciphertext comes back,
  // the automatic import path exists and the rest is just work. A throw is the
  // documented on-device refusal.
  async function probePrivateKey() {
    setBusy("key");
    setProbe(null);
    setError(null);
    try {
      if (!evmAddress) throw new Error("No EVM address on this account");
      // Throwaway P-256 recipient key; Privy wants base64 SPKI.
      const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
        "deriveBits",
      ]);
      const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
      const recipientPublicKey = btoa(String.fromCharCode(...spki));
      const res = await getWalletPrivateKey({ address: evmAddress, recipientPublicKey });
      setProbe(
        `getWalletPrivateKey() SUCCEEDED — chainType ${res.chainType}, ` +
          `ciphertext ${res.ciphertext?.length} chars.\n` +
          "The automatic import path IS available. No email, no scraping."
      );
      console.log("[probe] getWalletPrivateKey ok (ciphertext withheld from UI)");
    } catch (err) {
      setProbe(
        `getWalletPrivateKey() threw: ${(err as Error)?.message ?? "unknown"}\n` +
          "If this is an 'unsupported'/on-device error, automatic export is out — " +
          "fall back to migrate(), manual paste, or the existing sweep."
      );
      console.error("[probe] getWalletPrivateKey", err);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <Shell>
        <p className="text-white/60">Loading Privy…</p>
      </Shell>
    );
  }

  if (!authenticated) {
    return (
      <Shell>
        <p className="mb-4 text-white/60">
          Sign in with the <strong>old</strong> account — the Privy one, not your Decane login.
          Export only works against wallets that account owns.
        </p>
        <button onClick={login} className={BTN}>
          Sign in with Privy
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="mb-5 text-white/60">
        Signed in as <span className="text-white">{user?.email?.address ?? user?.id}</span>
      </p>

      <Row
        label="Ethereum"
        address={evmAddress}
        busy={busy === "Ethereum"}
        disabled={busy !== null}
        onClick={() => run("Ethereum", () => exportEvm({ address: evmAddress! }))}
      />

      <Row
        label="Solana"
        address={solAddress}
        busy={busy === "Solana"}
        disabled={busy !== null}
        onClick={() => run("Solana", () => exportSolana({ address: solAddress! }))}
      />

      {note && <p className="mt-4 text-[13px] text-white/50">{note}</p>}
      {error && <p className="mt-4 text-[13px] text-red-400">{error}</p>}

      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-1 text-[14px] font-medium text-white">Can the automatic path work?</div>
        <p className="mb-3 text-[12px] text-white/45">
          The URL says <code>v=1-unified</code> but the wallet says{" "}
          <code>client:&quot;privy&quot;</code>. These call the real APIs to settle it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={probeMigrate} disabled={busy !== null} className={BTN}>
            {busy === "migrate" ? "Running…" : "Probe migrate()"}
          </button>
          <button onClick={probePrivateKey} disabled={busy !== null} className={BTN}>
            {busy === "key" ? "Running…" : "Probe getWalletPrivateKey()"}
          </button>
        </div>
        {probe && <pre className="mt-3 text-[12px] whitespace-pre-wrap text-white/70">{probe}</pre>}
      </div>

      <details className="mt-8 text-[13px] text-white/40">
        <summary className="cursor-pointer">All connected wallets ({wallets.length})</summary>
        <pre className="mt-2 overflow-x-auto text-[11px]">
          {JSON.stringify(
            wallets.map((w) => ({
              address: w.address,
              chain: w.chainId,
              client: w.walletClientType,
            })),
            null,
            2
          )}
        </pre>
      </details>
    </Shell>
  );
}

const BTN =
  "cursor-pointer rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-[14px] font-semibold text-white hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg p-6 font-sans">
      <h1 className="mb-1 text-[18px] font-semibold text-white">Legacy wallet export</h1>
      <p className="mb-6 text-[13px] text-white/40">Temporary scratch page — delete when done.</p>
      {children}
    </div>
  );
}

function Row({
  label,
  address,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  address: string | null;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium text-white">{label}</span>
        <code className="truncate text-[11px] text-white/40">
          {address ?? "none on this account"}
        </code>
      </div>
      <button onClick={onClick} disabled={disabled || !address} className={BTN}>
        {busy ? "Modal open…" : `Export ${label} key`}
      </button>
    </div>
  );
}
