"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
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
import { PhraseGrid } from "./phrase-grid";
import { BODY, FIELD, LINK, NOTICE, PANEL, PRIMARY, SECONDARY, TITLE } from "./ui";

/**
 * Three short stages: choose a passphrase, write the recovery phrase down, prove
 * it was copied right. Nothing is sent anywhere until the last button, and the
 * phrase is dropped from memory as soon as the wallet is saved.
 */

type Step = "passphrase" | "phrase" | "confirm";
const STAGES: ReadonlyArray<{ id: Step; label: string }> = [
  { id: "passphrase", label: "Passphrase" },
  { id: "phrase", label: "Write it down" },
  { id: "confirm", label: "Check" },
];

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
  const stageIndex = STAGES.findIndex((stage) => stage.id === step);

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
    <section aria-label="Create your wallet" className={PANEL}>
      <ol className="flex items-center gap-2 text-[12px]" aria-label="Wallet creation stages">
        {STAGES.map((stage, index) => (
          <li key={stage.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold",
                index < stageIndex && "bg-upgrade text-ink",
                index === stageIndex && "text-ink bg-white",
                index > stageIndex && "border border-white/15 text-white/40"
              )}
            >
              {index < stageIndex ? <CheckIcon size={11} /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate",
                index === stageIndex ? "font-medium text-white" : "text-white/40"
              )}
            >
              {stage.label}
            </span>
            {index < STAGES.length - 1 ? <span className="h-px flex-1 bg-white/10" /> : null}
          </li>
        ))}
      </ol>

      {step === "passphrase" ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h2 className={TITLE}>Choose a passphrase</h2>
            <p className={BODY}>
              It locks your wallet on this device. We never see it and can&apos;t reset it, so pick
              something you will remember: a few ordinary words strung together works well.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              autoComplete="new-password"
              aria-label="Passphrase"
              placeholder="Passphrase"
              className={FIELD}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            {problem ? <p className="px-1 text-[12.5px] text-amber-200">{problem}</p> : null}
            <input
              type="password"
              autoComplete="new-password"
              aria-label="Repeat passphrase"
              placeholder="Repeat passphrase"
              className={FIELD}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
            {mismatch ? (
              <p className="px-1 text-[12.5px] text-amber-200">These don&apos;t match yet.</p>
            ) : null}
          </div>
          <button type="button" className={PRIMARY} disabled={!ready || busy} onClick={prepare}>
            {busy ? "Locking your keys… a few seconds" : "Create my wallet"}
          </button>
        </>
      ) : null}

      {step === "phrase" && wallet ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h2 className={TITLE}>Write down your recovery phrase</h2>
            <p className={BODY}>
              These {NEW_PHRASE_WORDS} words are the only way back in if you forget your passphrase
              or lose this device. Anyone who has them can take your funds.
            </p>
          </div>
          <p className={NOTICE.warn}>
            Write them on paper, in order, and keep them somewhere private. Don&apos;t screenshot
            them or store them online.
          </p>
          <PhraseGrid words={wallet.phrase} testId="phrase-words" />
          <label className="flex cursor-pointer items-start gap-3 text-[14px] text-white/75">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-white"
              checked={wroteDown}
              onChange={(e) => setWroteDown(e.target.checked)}
            />
            I have written all {NEW_PHRASE_WORDS} words down, in order.
          </label>
          <button
            type="button"
            className={PRIMARY}
            disabled={!wroteDown}
            onClick={() => setStep("confirm")}
          >
            Continue
          </button>
          <button type="button" className={LINK} onClick={abandon}>
            Start over
          </button>
        </>
      ) : null}

      {step === "confirm" && wallet ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h2 className={TITLE}>Check your copy</h2>
            <p className={BODY}>
              Type these words from what you wrote down, to be sure it&apos;s right.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {positions.map((position, i) => (
              <label key={position} className="flex flex-col gap-1.5 text-[13px] text-white/60">
                Word {position + 1}
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                  value={answers[i] ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => prev.map((value, j) => (j === i ? e.target.value : value)))
                  }
                />
              </label>
            ))}
          </div>
          <button type="button" className={PRIMARY} disabled={!confirmed || busy} onClick={save}>
            {busy ? "Saving…" : "Save my wallet"}
          </button>
          <button
            type="button"
            className={SECONDARY}
            disabled={busy}
            onClick={() => setStep("phrase")}
          >
            Show the words again
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className={NOTICE.error}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
