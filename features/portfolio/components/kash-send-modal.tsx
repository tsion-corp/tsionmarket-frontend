"use client";

import Link from "next/link";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import { useEvmSend } from "@/hooks/use-evm-send";
import { useQuery } from "@tanstack/react-query";
import { resolveArkName, reverseResolveArkAddress } from "@/lib/bns/api";
import { parseKashRecipient } from "@/lib/bns/name";
import { BRAND } from "@/lib/brand";
import {
  useInvalidateKash,
  useKashAccount,
  useKashStatus,
} from "@/features/portfolio/hooks/use-kash";
import { isValidKashAmount } from "@/features/portfolio/lib/kash";
import { kashTransferData } from "@/features/portfolio/lib/kash-transfer";

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

  const { data: status } = useKashStatus();
  const { data: account, wallet } = useKashAccount();
  const sendEvm = useEvmSend();
  const invalidateKash = useInvalidateKash();

  const onChain = status?.chainMode === "ethers" && Boolean(status.chain);
  const balance = account?.balance ?? "0";

  const recipientInput = parseKashRecipient(recipient);
  const recipientName = recipientInput.kind === "name" ? recipientInput.name : null;
  const resolution = useQuery({
    queryKey: ["bns", "resolve", recipientName],
    queryFn: () => resolveArkName(recipientName as string),
    enabled: Boolean(recipientName),
    staleTime: 30_000,
    retry: false,
  });
  // An Ark ID and nothing else. A raw wallet address is refused even though it
  // is a perfectly good address: Kash is sent to a NAME, so the sender reads
  // back who they are paying instead of a hex string they cannot check. The
  // address still exists — it is what the name resolves to, and it is shown
  // before the send — but it is not something anyone types.
  const resolvedAddress =
    recipientInput.kind === "name" && resolution.data?.address ? resolution.data.address : null;
  const pastedAddress = recipientInput.kind === "address";
  // Whether the SENDER already owns an Ark ID. Once they do, they should not be
  // pitched to get one — no "buy now" reminder while sending. Shares the
  // ["bns","reverse",wallet] cache with the sidebar card, so it's one lookup.
  const senderReverse = useQuery({
    queryKey: ["bns", "reverse", wallet],
    queryFn: () => reverseResolveArkAddress(wallet as string),
    enabled: Boolean(wallet),
    staleTime: 60_000,
    retry: false,
  });
  const senderHasArkId = Boolean(
    senderReverse.data?.verified && senderReverse.data.name?.toLowerCase().endsWith(".ark")
  );
  const validRecipient = Boolean(resolvedAddress);
  const selfSend = Boolean(
    resolvedAddress && wallet?.toLowerCase() === resolvedAddress.toLowerCase()
  );
  const withinBalance = isValidKashAmount(amount) && Number(amount) <= Number(balance);
  const canSubmit =
    onChain && Boolean(wallet) && validRecipient && !selfSend && withinBalance && !sending;

  const close = () => {
    setDone(null);
    setRecipient("");
    setAmount("");
    onClose();
  };

  const submit = async () => {
    if (!canSubmit || !status?.chain) return;
    setSending(true);
    try {
      const txHash = await sendEvm({
        to: status.chain.tokenAddress as `0x${string}`,
        data: kashTransferData(resolvedAddress as string, amount),
        chainId: status.chain.chainId,
      });
      // The tokens have left the wallet; the card reads its balance from the
      // chain, so refresh rather than leave the pre-send figure on screen.
      invalidateKash();
      setDone({ kash: amount, to: resolvedAddress as string, txHash });
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
                {t("sendSubtitle", { brand: BRAND })}
              </p>
            </div>

            <div>
              <label
                htmlFor="kash-send-recipient"
                className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase"
              >
                {t("sendRecipient", { brand: BRAND })}
              </label>
              <input
                id="kash-send-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={t("sendRecipientPlaceholder", { brand: BRAND })}
                aria-describedby="kash-recipient-status"
                spellCheck={false}
                className="mt-1.5 w-full rounded-[14px] border border-white/12 bg-white/6 px-4 py-3 font-mono text-[14px] outline-none focus:border-amber-200/50"
              />
              <div id="kash-recipient-status" aria-live="polite">
                {pastedAddress || (recipient.trim() && recipientInput.kind === "invalid") ? (
                  <p className="mt-1.5 text-[12px] font-normal text-white/50">
                    {t("sendAddressRefused", { brand: BRAND })}
                  </p>
                ) : recipientName && resolution.isFetching ? (
                  <p className="mt-1.5 text-[12px] font-normal text-white/50">
                    {t("sendArkChecking", { name: recipientName })}
                  </p>
                ) : recipientName && resolvedAddress && selfSend ? (
                  <p className="text-down mt-1.5 text-[12px] font-normal">
                    {t("sendArkSelf", { brand: BRAND })}
                  </p>
                ) : recipientName && resolvedAddress ? (
                  <p className="text-up mt-1.5 text-[12px] font-normal">
                    {t("sendArkResolved", { name: recipientName })}{" "}
                    <span className="font-mono break-all">{resolvedAddress}</span>
                  </p>
                ) : recipientName && (resolution.isError || resolution.isSuccess) ? (
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1 text-[12px] font-normal">
                    <span className="text-down">
                      {t("sendArkInvalid", { name: recipientName })}
                    </span>
                    {senderHasArkId ? null : (
                      <Link
                        href="/ark-id"
                        onClick={onClose}
                        className="text-accent cursor-pointer font-semibold underline underline-offset-2"
                      >
                        {t("sendArkBuyNow")}
                      </Link>
                    )}
                  </div>
                ) : recipientName && !senderHasArkId ? (
                  <p className="mt-1.5 text-[12px] font-normal text-white/45">
                    {t("sendArkHint", { brand: BRAND })}{" "}
                    <Link
                      href="/ark-id"
                      onClick={onClose}
                      className="text-accent cursor-pointer font-semibold underline underline-offset-2"
                    >
                      {t("sendArkBuyNow")}
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="kash-send-amount"
                  className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase"
                >
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
                id="kash-send-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="tnum mt-1.5 w-full rounded-[14px] border border-white/12 bg-white/6 px-4 py-3 text-[17px] outline-none focus:border-amber-200/50"
              />
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
