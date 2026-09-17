"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useEvmSend } from "@/hooks/use-evm-send";
import {
  useInvalidateKash,
  useKashAccount,
  useKashStatus,
} from "@/features/portfolio/hooks/use-kash";
import { isValidKashAmount, kashToUsd } from "@/features/portfolio/lib/kash";
import { isEvmAddress, kashTransferData } from "@/features/portfolio/lib/kash-transfer";
import { resolveArkName, type ArkNameResolution } from "@/features/portfolio/lib/ark-names";

interface KashSendModalProps {
  open: boolean;
  onClose: () => void;
}

// Send KSH to another wallet: a plain ERC-20 transfer from the holder's own
// wallet, gas-sponsored on Base. Real tokens exist only in ethers mode; in
// mock mode balances are ledger entries with nothing on-chain to move, so the
// form stays visible but disabled with an honest explanation.
export function KashSendModal({ open, onClose }: KashSendModalProps) {
  const t = useTranslations("kash");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ kash: string; to: string; txHash: string } | null>(null);

  // Ark-name resolution: a typed name like "dave" is looked up in the local
  // registry once the field goes quiet for a second. A pasted 0x address skips
  // the lookup and sends exactly as before. The result is tagged with the input
  // it was resolved for, so a stale result never shows against a newer input.
  const [lookup, setLookup] = useState<{
    input: string;
    result: ArkNameResolution | null;
  } | null>(null);
  // The "unknown name" error is transient: it clears a few seconds after it
  // shows, keyed by the input it was shown for so a fresh miss shows again.
  const [dismissedMiss, setDismissedMiss] = useState<string | null>(null);
  const debouncedRecipient = useDebouncedValue(recipient, 1000);

  const { data: status } = useKashStatus();
  const { data: account, wallet } = useKashAccount();
  const sendEvm = useEvmSend();
  const invalidateKash = useInvalidateKash();

  const onChain = status?.chainMode === "ethers" && Boolean(status.chain);
  const balance = account?.balance ?? "0";
  // Dollar value of the KSH amount at the live price, shown as orientation only.
  const usdEquivalent = kashToUsd(amount, status?.price?.kashPriceUsd);

  const trimmedRecipient = recipient.trim();
  const isAddressInput = isEvmAddress(trimmedRecipient);
  const looksLikeAddressAttempt = !isAddressInput && trimmedRecipient.startsWith("0x");
  const isNameQuery = trimmedRecipient !== "" && !isAddressInput && !looksLikeAddressAttempt;

  useEffect(() => {
    const value = debouncedRecipient.trim();
    // Only a settled, name-shaped input triggers a lookup.
    if (value === "" || isEvmAddress(value) || value.startsWith("0x")) return;
    let cancelled = false;
    resolveArkName(value).then((result) => {
      if (!cancelled) setLookup({ input: value, result });
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedRecipient]);

  // A resolved result counts only when it matches what is in the field right
  // now. undefined means we are still settling or resolving the current input.
  const settled = lookup?.input === trimmedRecipient ? lookup.result : undefined;
  const nameInFlight = isNameQuery && settled === undefined;
  const arkName = isNameQuery && settled ? settled : null;
  const unknownName = isNameQuery && settled === null;
  const showUnknownName = unknownName && dismissedMiss !== trimmedRecipient;

  // Auto-clear the unknown-name error a few seconds after it appears. Only the
  // setState inside the timer runs, so nothing fires synchronously in render.
  useEffect(() => {
    if (!unknownName) return;
    const missed = trimmedRecipient;
    const timer = setTimeout(() => setDismissedMiss(missed), 4000);
    return () => clearTimeout(timer);
  }, [unknownName, trimmedRecipient]);

  // The address the send actually targets: a pasted address, or a resolved name.
  const resolvedAddress = isAddressInput ? trimmedRecipient : (arkName?.address ?? null);
  const selfSend =
    resolvedAddress !== null && wallet?.toLowerCase() === resolvedAddress.toLowerCase();
  const withinBalance = isValidKashAmount(amount) && Number(amount) <= Number(balance);
  const canSubmit =
    onChain &&
    Boolean(wallet) &&
    resolvedAddress !== null &&
    !nameInFlight &&
    !selfSend &&
    withinBalance &&
    !sending;

  const close = () => {
    setDone(null);
    setRecipient("");
    setAmount("");
    setLookup(null);
    setDismissedMiss(null);
    onClose();
  };

  const submit = async () => {
    if (!canSubmit || !status?.chain || resolvedAddress === null) return;
    setSending(true);
    try {
      const txHash = await sendEvm({
        to: status.chain.tokenAddress as `0x${string}`,
        data: kashTransferData(resolvedAddress, amount),
        chainId: status.chain.chainId,
      });
      // The tokens have left the wallet; the card reads its balance from the
      // chain, so refresh rather than leave the pre-send figure on screen.
      invalidateKash();
      setDone({ kash: amount, to: resolvedAddress, txHash });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const shortTo = done ? `${done.to.slice(0, 6)}…${done.to.slice(-4)}` : "";

  return (
    <ModalShell open={open} onClose={sending ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {done ? (
          <SuccessPanel title={t("sendSuccessTitle")} onDone={close}>
            {t("sendSuccessBody", { kash: done.kash, to: shortTo })}{" "}
            <a
              href={`https://basescan.org/tx/${done.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-200 underline hover:text-amber-100"
            >
              {t("viewOnBasescan")}
            </a>
          </SuccessPanel>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="ws-display text-[22px]">{t("sendTitle")}</div>
              <p className="mt-1 text-[13px] leading-[1.5] font-normal text-white/60">
                {t("sendSubtitle")}
              </p>
            </div>

            <div>
              <label className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                {t("sendRecipient")}
              </label>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="dave.ark or 0x…"
                spellCheck={false}
                className="mt-1.5 w-full rounded-[14px] border border-white/12 bg-white/6 px-4 py-3 font-mono text-[14px] outline-none focus:border-amber-200/50"
              />
              {looksLikeAddressAttempt && (
                <p className="mt-1.5 text-[12px] font-normal text-white/50">
                  {t("sendBadAddress")}
                </p>
              )}
              {!looksLikeAddressAttempt && nameInFlight && (
                <p className="mt-1.5 text-[12px] font-normal text-white/50">{t("sendLookingUp")}</p>
              )}
              {!looksLikeAddressAttempt && !nameInFlight && arkName && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-amber-200">{arkName.name}</span>
                  <span className="font-mono text-[12px] break-all text-white/55">
                    {arkName.address}
                  </span>
                </div>
              )}
              {!looksLikeAddressAttempt && !nameInFlight && showUnknownName && (
                <p className="mt-1.5 text-[12px] font-normal text-red-400">
                  {t("sendUnknownName")}
                </p>
              )}
              {selfSend && (
                <p className="mt-1.5 text-[12px] font-normal text-white/50">{t("sendToSelf")}</p>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("amountKash")}
                </label>
                <button
                  onClick={() => setAmount(balance)}
                  className="tnum cursor-pointer text-[12px] font-medium text-amber-200/80 hover:text-amber-200"
                >
                  {t("maxConvertible", { amount: balance })}
                </button>
              </div>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="tnum mt-1.5 w-full rounded-[14px] border border-white/12 bg-white/6 px-4 py-3 text-[17px] outline-none focus:border-amber-200/50"
              />
              {usdEquivalent && (
                <p className="tnum mt-1.5 text-[12px] font-normal text-white/40">{`≈ $${usdEquivalent}`}</p>
              )}
              {isValidKashAmount(amount) && !withinBalance && (
                <p className="mt-1.5 text-[12px] font-normal text-white/50">
                  {t("exceedsConvertible", { amount: balance })}
                </p>
              )}
            </div>

            {!onChain && (
              <p className="text-[12.5px] leading-[1.5] font-normal text-amber-200/80">
                {t("sendUnavailableOffchain")}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? (
                <>
                  <ButtonSpinner />
                  {t("sendingKash")}
                </>
              ) : (
                t("sendCta")
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
