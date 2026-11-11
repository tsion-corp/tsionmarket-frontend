"use client";

import { useState } from "react";
import {
  NEW_PHRASE_WORDS,
  checkPassphrase,
  confirmPhraseWords,
  passphraseProblem,
  pickConfirmationPositions,
  wipeBytes,
  type CreatedWallet,
} from "@/lib/wallet-core";
import { prepareWallet, saveWallet, type Deps } from "../lib/wallet-flow";
import { walletErrorMessage } from "../lib/wallet-errors";

/**
 * Four short steps: choose a passphrase, see the recovery phrase, prove it was
 * copied down, then save. Nothing is sent anywhere until the last step, and the
 * phrase is dropped from memory as soon as the wallet is saved.
 */

type Step = "passphrase" | "phrase" | "confirm";

const field =
  "w-full rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-3 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/40";
const primary =
  "w-full rounded-full bg-white px-5 py-3 text-center text-[15px] font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "w-full rounded-full border border-white/20 px-5 py-3 text-[15px] text-white/80 hover:bg-white/5";

export function CreateWallet({
  deps,
  uid,
  onCreated,
}: {
  deps: Deps;
  uid: string;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<Step>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [wallet, setWallet] = useState<CreatedWallet | null>(null);
  const [wroteDown, setWroteDown] = useState(false);
  const [answers, setAnswers] = useState<Array<string>>(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Array<number>>([]);

  const check = checkPassphrase(passphrase);
  const problem = passphrase && !check.ok ? passphraseProblem(check.reason) : null;
  const mismatch = again.length > 0 && again !== passphrase;
  const ready = check.ok && again === passphrase;

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const made = await prepareWallet(passphrase);
      setPositions(pickConfirmationPositions(3, NEW_PHRASE_WORDS));
      setWallet(made);
      setPassphrase("");
      setAgain("");
      setStep("phrase");
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      await saveWallet(deps, uid, wallet);
      setWallet(null);
      setAnswers(["", "", ""]);
      onCreated();
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function abandon() {
    if (wallet) wipeBytes(wallet.dek);
    setWallet(null);
    setStep("passphrase");
    setWroteDown(false);
    setAnswers(["", "", ""]);
    setError(null);
  }

  const confirmed = wallet ? confirmPhraseWords(wallet.phrase, positions, answers) : false;

  return (
    <section
      aria-label="Create your wallet"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5"
    >
      {step === "passphrase" ? (
        <>
          <h2 className="text-lg font-semibold">Choose a passphrase</h2>
          <p className="text-[13px] leading-relaxed text-white/60">
            It locks your wallet on this device. We never see it and can&apos;t reset it, so pick
            something you will remember: a few ordinary words strung together works well.
          </p>
          <input
            type="password"
            autoComplete="new-password"
            aria-label="Passphrase"
            placeholder="Passphrase"
            className={field}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          {problem ? <p className="text-[12px] text-amber-200">{problem}</p> : null}
          <input
            type="password"
            autoComplete="new-password"
            aria-label="Repeat passphrase"
            placeholder="Repeat passphrase"
            className={field}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
          {mismatch ? (
            <p className="text-[12px] text-amber-200">These don&apos;t match yet.</p>
          ) : null}
          <button type="button" className={primary} disabled={!ready || busy} onClick={prepare}>
            {busy ? "Locking your keys… a few seconds" : "Create my wallet"}
          </button>
        </>
      ) : null}

      {step === "phrase" && wallet ? (
        <>
          <h2 className="text-lg font-semibold">Write down your recovery phrase</h2>
          <p className="text-[13px] leading-relaxed text-white/60">
            These {NEW_PHRASE_WORDS} words are the only way back in if you forget your passphrase or
            lose this device. Anyone who has them can take your funds. Write them on paper, in
            order, and keep them somewhere private. Don&apos;t screenshot them or store them online.
          </p>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="phrase-words">
            {wallet.phrase.map((word, index) => (
              <li
                key={index}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[14px]"
              >
                <span className="w-5 text-right text-[11px] text-white/40">{index + 1}</span>
                <span className="font-mono">{word}</span>
              </li>
            ))}
          </ol>
          <label className="flex items-start gap-2 text-[13px] text-white/70">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={wroteDown}
              onChange={(e) => setWroteDown(e.target.checked)}
            />
            I have written all {NEW_PHRASE_WORDS} words down, in order.
          </label>
          <button
            type="button"
            className={primary}
            disabled={!wroteDown}
            onClick={() => setStep("confirm")}
          >
            Continue
          </button>
          <button type="button" className={secondary} onClick={abandon}>
            Start over
          </button>
        </>
      ) : null}

      {step === "confirm" && wallet ? (
        <>
          <h2 className="text-lg font-semibold">Check your copy</h2>
          <p className="text-[13px] text-white/60">
            Type these words from what you wrote down, to be sure it&apos;s right.
          </p>
          {positions.map((position, i) => (
            <label key={position} className="flex flex-col gap-1 text-[13px] text-white/70">
              Word {position + 1}
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={field}
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((value, j) => (j === i ? e.target.value : value)))
                }
              />
            </label>
          ))}
          <button type="button" className={primary} disabled={!confirmed || busy} onClick={save}>
            {busy ? "Saving…" : "Save my wallet"}
          </button>
          <button
            type="button"
            className={secondary}
            disabled={busy}
            onClick={() => setStep("phrase")}
          >
            Show the words again
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
