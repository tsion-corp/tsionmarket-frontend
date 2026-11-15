"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { useIntertrainAccount } from "@/hooks/use-intertrain-account";
import { useWskBalance, wskBalanceKey } from "@/hooks/use-wsk-balance";
import { formatWsk, INTERTRAIN_EXPLORER } from "@/lib/intertrain/bridge";
import { sendKash, transferConfirmed, transferFee } from "@/lib/intertrain/transfer";
import { getCustomWalletSession } from "@/lib/signer/session";
import { requestWalletUnlock } from "@/lib/signer/unlock-request";
import { normalizeIntertrainAddress } from "@/lib/wallet-core/intertrain";
import { getUnlockedKey } from "@/lib/wallet-core/unlock-state";

/**
 * Send Kash out: a native Intertrain transfer from the new wallet's own account, signed here in
 * the browser. Kash and WSK are one asset; one KASH is one USDC.
 */

type Phase = "form" | "sending" | "done";

function parseKash(text: string): bigint {
  const s = text.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error("Enter an amount with up to 6 decimals.");
  const [whole = "0", fraction = ""] = s.split(".");
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (value <= 0n) throw new Error("Amount must be greater than zero.");
  return value;
}

export function KashSendIntertrainModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ModalShell open={open} onClose={onClose}>
      <Body onClose={onClose} />
    </ModalShell>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const account = useIntertrainAccount();
  const balance = useWskBalance(account.address);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState<bigint>(1n);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    void transferFee()
      .then((f) => alive.current && setFee(f))
      .catch(() => undefined);
  }, []);

  let to: string | null = null;
  let toProblem = "";
  if (recipient.trim()) {
    try {
      to = normalizeIntertrainAddress(recipient);
      if (account.address && to === normalizeIntertrainAddress(account.address)) {
        to = null;
        toProblem = "That is your own address.";
      }
    } catch {
      toProblem = "That is not a valid Intertrain address (it starts with wsk1).";
    }
  }
  let value: bigint | null = null;
  let amountProblem = "";
  if (amount.trim()) {
    try {
      value = parseKash(amount);
      if (balance.data !== undefined && value + fee > balance.data) {
        amountProblem = `You have ${formatWsk(balance.data)} Kash; the network fee is ${formatWsk(fee)}.`;
      }
    } catch (e) {
      amountProblem = e instanceof Error ? e.message : "Enter an amount.";
    }
  }
  const ready = to !== null && value !== null && !amountProblem && account.unlocked;

  async function send() {
    const session = getCustomWalletSession();
    if (!session || !account.address || !to || value === null) return;
    setError("");
    setPhase("sending");
    try {
      const dek = getUnlockedKey(session.uid, session.pkg.walletId);
      if (!dek) throw new Error("Your wallet is locked. Unlock it to continue.");
      const { withIntertrainKey } = await import("@/lib/wallet-core/intertrain");
      const sent = await withIntertrainKey(session.pkg, dek, (key) =>
        sendKash({ account: key, to, amount: value })
      );
      if (!alive.current) return;
      setHash(sent.hash);
      for (let i = 0; i < 30 && alive.current; i++) {
        if (await transferConfirmed(sent.hash)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      void queryClient.invalidateQueries({ queryKey: wskBalanceKey(account.address) });
      if (alive.current) setPhase("done");
    } catch (e) {
      if (!alive.current) return;
      setPhase("form");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6 pt-12 md:pt-8">
      <div>
        <div className="ws-display text-[24px] tracking-[-0.01em]">Send Kash</div>
        <p className="mt-2 text-[13.5px] leading-normal text-white/65">
          Send Kash to another Intertrain address. 1 Kash = $1.
        </p>
      </div>

      {phase === "done" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#5dd9a3]/15 text-[#5dd9a3]">
            <CheckIcon size={22} />
          </span>
          <p className="text-[15px] font-medium text-white">Sent {amount} Kash</p>
          <a
            className="text-[13px] text-white/55 underline underline-offset-2"
            href={`${INTERTRAIN_EXPLORER}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on the Intertrain explorer
          </a>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 cursor-pointer rounded-full border border-white/14 bg-white/6 px-6 py-2.5 text-[14px] text-white"
          >
            Done
          </button>
        </div>
      ) : phase === "sending" ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          <p className="text-[13.5px] text-white/65">
            {hash ? "Waiting for Intertrain to confirm…" : "Signing and sending…"}
          </p>
        </div>
      ) : !account.hasWallet ? (
        <p className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[13.5px] text-amber-100">
          Sending Kash needs your new wallet.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-[12.5px] text-white/55">
            To
            <input
              autoComplete="off"
              spellCheck={false}
              placeholder="wsk1…"
              aria-label="Recipient address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="rounded-2xl border border-white/12 bg-black/40 px-4 py-3.5 font-mono text-[14px] text-white outline-none focus:border-white/50"
            />
            {toProblem ? <span className="text-red-300">{toProblem}</span> : null}
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-white/55">
            <span className="flex justify-between">
              <span>Amount (Kash)</span>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() =>
                  balance.data !== undefined && balance.data > fee
                    ? setAmount(formatWsk(balance.data - fee))
                    : undefined
                }
              >
                Available {balance.data !== undefined ? formatWsk(balance.data) : "…"}
              </button>
            </span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-label="Amount in Kash"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-2xl border border-white/12 bg-black/40 px-4 py-3.5 text-[18px] text-white outline-none focus:border-white/50"
            />
            {amountProblem ? <span className="text-red-300">{amountProblem}</span> : null}
          </label>
          <p className="text-[12.5px] text-white/45">Network fee: {formatWsk(fee)} Kash</p>
          {error ? (
            <p
              role="alert"
              className="rounded-2xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-[13px] text-red-100"
            >
              {error}
            </p>
          ) : null}
          {!account.unlocked ? (
            <button
              type="button"
              onClick={requestWalletUnlock}
              className="cursor-pointer rounded-full bg-white py-3.5 text-[14.5px] font-semibold text-black"
            >
              Unlock your wallet to send
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready}
              onClick={() => void send()}
              className="cursor-pointer rounded-full bg-[#5dd9a3] py-3.5 text-[14.5px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send Kash
            </button>
          )}
        </div>
      )}
    </div>
  );
}
