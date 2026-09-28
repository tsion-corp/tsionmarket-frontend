"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { formatUnits, parseUnits } from "viem";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { useAuthSession } from "@/hooks/use-auth-session";
import { fetchDepositStatus } from "@/hooks/use-deposit";
import { useEvmSend } from "@/hooks/use-evm-send";
import { usePrices } from "@/hooks/use-prices";
import { useSendUsdc } from "@/hooks/use-withdraw";
import {
  getArkLabelAvailability,
  getArkLabelExpiry,
  getArkLabelPrice,
  renewArkName,
  resolveArkName,
} from "@/lib/bns/api";
import {
  ARK_NAME_DURATION_SECONDS,
  buildArkRegistrationTx,
  createArkCommitment,
} from "@/lib/bns/api";
import {
  arkAddressRecordCalldata,
  ARK_DEFAULT_REVERSE_REGISTRAR,
  ARK_PUBLIC_RESOLVER_ADDRESS,
  arkSetPrimaryNameCalldata,
  parseKashRecipient,
} from "@/lib/bns/name";
import { secondsUntil } from "@/lib/bns/format";
import { fetchArkEthRoute, formatUsdcForNativeEth, quoteArkEthFunding } from "@/lib/bns/dextopus";
import { readArkWalletBalances } from "@/lib/bns/wallet";
import { BRAND } from "@/lib/brand";
import {
  clearPendingArkFunding,
  clearPendingArkRegistration,
  getPendingArkFunding,
  getPendingArkRegistration,
  savePendingArkFunding,
  savePendingArkRegistration,
  type PendingArkFunding,
  type PendingArkRegistration,
} from "@/lib/bns/registration-storage";
import { depositProgress, SETTLE_CHAINS } from "@/lib/deposit";
import { reverseResolveArkAddress } from "@/lib/bns/api";

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

// Renewal is offered only inside this window before expiry. A name is paid for
// a full year at purchase, so a renew action any earlier just charges a year no
// one needs — the defect that cost a user real money.
const RENEWAL_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ArkIdModalProps {
  open: boolean;
  onClose: () => void;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ArkIdModal({ open, onClose }: ArkIdModalProps) {
  const t = useTranslations("bns");
  const format = useFormatter();
  const { evmAddress } = useAuthSession();
  const queryClient = useQueryClient();
  const sendEvm = useEvmSend();
  const { sendUsdc } = useSendUsdc();
  const ethPriceUsd = usePrices(["ETH"]).ETH ?? 0;
  const [search, setSearch] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState<PendingArkRegistration | null>(
    null
  );
  const [pendingFunding, setPendingFunding] = useState<PendingArkFunding | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successName, setSuccessName] = useState<string | null>(null);
  // Renewal is deliberately two-step: the button reveals a confirm, so it can
  // never charge on a single tap.
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [now, setNow] = useState(0);
  const [paymentStep, setPaymentStep] = useState<"preparing" | "processing" | "signing" | null>(
    null
  );

  const parsedSearch = parseKashRecipient(search);
  const label = parsedSearch.kind === "name" ? parsedSearch.label : "";
  const lookupLabel = useDebouncedValue(label, 300);
  const lookupReady = label === lookupLabel;
  const nameAvailability = useQuery({
    queryKey: ["bns", "label-availability", lookupLabel],
    queryFn: () => getArkLabelAvailability(lookupLabel),
    enabled: open && lookupLabel.length >= 3,
    staleTime: 15_000,
    retry: false,
  });
  const namePrice = useQuery({
    queryKey: ["bns", "label-price", lookupLabel],
    queryFn: () => getArkLabelPrice(lookupLabel),
    enabled: open && lookupLabel.length >= 3 && nameAvailability.data?.available === true,
    staleTime: 30_000,
    retry: false,
  });
  // A taken name might be the user's OWN: resolve it to read its owner. If it's
  // their wallet they already own it (registration doesn't set the reverse, so
  // /reverse can't tell them) — offer to set it as their primary name instead
  // of showing "unavailable".
  const searchResolve = useQuery({
    queryKey: ["bns", "resolve", `${lookupLabel}.ark`],
    queryFn: () => resolveArkName(`${lookupLabel}.ark`),
    enabled: open && lookupLabel.length >= 3 && nameAvailability.data?.available === false,
    staleTime: 30_000,
    retry: false,
  });
  const reverse = useQuery({
    queryKey: ["bns", "reverse", evmAddress],
    queryFn: () => reverseResolveArkAddress(evmAddress as string),
    enabled: open && Boolean(evmAddress),
    staleTime: 60_000,
    retry: false,
  });
  const ownedName =
    reverse.data?.verified && reverse.data.name?.toLowerCase().endsWith(".ark")
      ? reverse.data.name
      : null;
  const ownedParsed = ownedName ? parseKashRecipient(ownedName) : null;
  const ownedLabelValue = ownedParsed?.kind === "name" ? ownedParsed.label : "";
  // The owned name's on-chain expiry, the one signal that says whether renewal
  // is due. Read only for a name the wallet holds.
  const ownedExpiry = useQuery({
    queryKey: ["bns", "label-expires", ownedLabelValue],
    queryFn: () => getArkLabelExpiry(ownedLabelValue),
    enabled: open && ownedLabelValue.length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const expiryMs = ownedExpiry.data ? Number(ownedExpiry.data.expires) * 1000 : null;
  // `now` is read from state (set in an effect on open), never Date.now() in
  // render. Until it loads (now === 0) the window reads as "not soon", so the
  // renewal button can never flash before the real clock is known.
  const daysUntilExpiry =
    expiryMs !== null && now > 0 ? Math.floor((expiryMs - now) / DAY_MS) : null;
  const expiresSoon = daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_WINDOW_DAYS;
  const expiryLabel =
    expiryMs !== null ? format.dateTime(new Date(expiryMs), { dateStyle: "medium" }) : null;
  // Priced only when renewal is actually on the table, so an active name never
  // fires a price read it has no button for.
  const ownedPrice = useQuery({
    queryKey: ["bns", "label-price", ownedLabelValue],
    queryFn: () => getArkLabelPrice(ownedLabelValue),
    enabled: open && expiresSoon && ownedLabelValue.length >= 3,
    staleTime: 30_000,
    retry: false,
  });
  const walletBalances = useQuery({
    queryKey: ["bns", "wallet-balances", evmAddress],
    queryFn: () => readArkWalletBalances(evmAddress as string),
    enabled: open && Boolean(evmAddress),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const refetchWalletBalances = walletBalances.refetch;
  const registrationExpired = Boolean(
    pendingRegistration &&
    now >= new Date(pendingRegistration.commitment.timing.expiresAt).getTime()
  );
  const currentRegistration = registrationExpired ? null : pendingRegistration;
  const currentFunding = pendingFunding;
  const fundingRoute = useQuery({
    queryKey: ["bns", "dextopus", "base-native-eth"],
    queryFn: fetchArkEthRoute,
    enabled: open && (currentFunding !== null || Boolean(currentRegistration) || expiresSoon),
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!pendingRegistration && !pendingFunding) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pendingRegistration, pendingFunding]);

  // Read the wall clock once the modal opens, so expiry math runs off state
  // rather than a Date.now() call in render (which the purity rule forbids).
  // Set from a timer callback, not the effect body, per the hooks rules.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!currentFunding?.requestId) return;
    void refetchWalletBalances();
  }, [currentFunding?.requestId, refetchWalletBalances]);

  useEffect(() => {
    if (!registrationExpired || !evmAddress || !pendingRegistration) return;
    clearPendingArkRegistration(evmAddress, pendingRegistration.label);
  }, [registrationExpired, evmAddress, pendingRegistration]);

  const registeredForWallet = Boolean(
    currentRegistration && currentRegistration.wallet.toLowerCase() === evmAddress?.toLowerCase()
  );
  const available = lookupReady && nameAvailability.data?.available === true;
  // The searched name is taken by the user's OWN wallet — they own it but the
  // reverse (primary name) was never set, so the app can't see it. Offer to set
  // it rather than showing "unavailable".
  const ownsSearchedName = Boolean(
    evmAddress &&
    searchResolve.data?.owner &&
    searchResolve.data.owner.toLowerCase() === evmAddress.toLowerCase()
  );
  const revealAt = currentRegistration
    ? new Date(currentRegistration.commitment.timing.readyAt).getTime() + 3_000
    : 0;
  const revealSeconds = currentRegistration
    ? secondsUntil(new Date(revealAt).toISOString(), now)
    : 0;
  const canReveal = registeredForWallet && revealSeconds === 0 && !working;

  const refreshBalances = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bns", "wallet-balances", evmAddress] });
    return walletBalances.refetch();
  };

  const startFunding = async (amountWei: string, fundingLabel = label) => {
    if (!evmAddress || !fundingRoute.data) throw new Error(t("paymentUnavailable"));
    if (ethPriceUsd <= 0) throw new Error(t("rateUnavailable"));
    setPaymentStep("preparing");
    const { amount, quote } = await quoteArkEthFunding({
      route: fundingRoute.data,
      requiredWei: BigInt(amountWei),
      ethPriceUsd,
      recipient: evmAddress,
    });
    const balances = (await refreshBalances()).data;
    if (!balances || BigInt(balances.usdcAtomic) < amount) throw new Error(t("notEnoughUsdc"));
    setPaymentStep("signing");
    const transactionHash = await sendUsdc({
      chainType: "ethereum",
      to: quote.depositAddress,
      amount,
      settle: SETTLE_CHAINS.base,
    });
    const nextFunding: PendingArkFunding = {
      label: fundingLabel,
      requestId: quote.requestId,
      transactionHash,
      requiredWei: amountWei,
      minimumOutput: quote.minOutput.toString(),
      usdcAmount: amount.toString(),
    };
    savePendingArkFunding(evmAddress, fundingLabel, nextFunding);
    setPendingFunding(nextFunding);
    setPaymentStep("processing");
    return nextFunding;
  };

  const waitForUsdcPayment = async (funding: PendingArkFunding) => {
    setPaymentStep("processing");
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const status = await fetchDepositStatus(funding.requestId, "trade");
      if (status.providerUnavailable) {
        await delay(Math.min(status.retryAfterMs ?? 30_000, 30_000));
        continue;
      }
      const stage = depositProgress(status.status, status.executionStatus).stage;
      if (stage === "failed" || stage === "refunded") {
        if (evmAddress) clearPendingArkFunding(evmAddress, funding.label);
        setPendingFunding(null);
        throw new Error(t("paymentFailed"));
      }
      if (stage === "settled") break;
      await delay(4_000);
      if (attempt === 149) throw new Error(t("paymentTakingLonger"));
    }

    const requiredWei = BigInt(funding.requiredWei);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const balances = await readArkWalletBalances(evmAddress as string);
      queryClient.setQueryData(["bns", "wallet-balances", evmAddress], balances);
      if (BigInt(balances.nativeEthWei) >= requiredWei) return;
      await delay(3_000);
    }
    throw new Error(t("paymentTakingLonger"));
  };

  const payWithUsdc = async (amountWei: string, paymentLabel: string) => {
    if (!evmAddress) throw new Error(t("walletNeeded"));
    const saved = getPendingArkFunding(evmAddress, paymentLabel);
    const funding = saved ?? (await startFunding(amountWei, paymentLabel));
    if (saved) setPendingFunding(saved);
    await waitForUsdcPayment(funding);
    return funding;
  };

  const reserveName = async () => {
    if (!evmAddress || !label || !lookupReady || !nameAvailability.data?.available) return;
    setWorking(true);
    setError(null);
    try {
      let pending = getPendingArkRegistration(evmAddress, label);
      if (pending && Date.now() >= new Date(pending.commitment.timing.expiresAt).getTime()) {
        clearPendingArkRegistration(evmAddress, label);
        pending = null;
      }
      if (!pending) {
        const commitment = await createArkCommitment(label, {
          owner: evmAddress,
          resolver: ARK_PUBLIC_RESOLVER_ADDRESS,
          data: [arkAddressRecordCalldata(label, evmAddress)],
          setDefaultReverseRecord: true,
          duration: ARK_NAME_DURATION_SECONDS,
        });
        pending = {
          label,
          name: `${label}.ark`,
          wallet: evmAddress,
          commitment,
          commitTxHash: null,
        };
        savePendingArkRegistration(pending);
        setPendingRegistration(pending);
      }
      if (!pending.commitTxHash) {
        const hash = await sendEvm({
          to: pending.commitment.tx.to as `0x${string}`,
          data: pending.commitment.tx.data as `0x${string}`,
          value: BigInt(pending.commitment.tx.value),
          chainId: 8453,
          address: evmAddress,
        });
        pending = { ...pending, commitTxHash: hash };
        savePendingArkRegistration(pending);
        setPendingRegistration(pending);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("purchaseFailed", { brand: BRAND }));
    } finally {
      setWorking(false);
    }
  };

  const completeRegistration = async () => {
    if (!currentRegistration || !evmAddress || !canReveal) return;
    setWorking(true);
    setError(null);
    try {
      const result = await buildArkRegistrationTx(currentRegistration.commitment.registration);
      await payWithUsdc(result.tx.value, currentRegistration.label);
      setPaymentStep("signing");
      await sendEvm({
        to: result.tx.to as `0x${string}`,
        data: result.tx.data as `0x${string}`,
        value: BigInt(result.tx.value),
        chainId: 8453,
        address: evmAddress,
      });
      // Registration does NOT set the reverse/primary name (its flag writes to a
      // different registrar than /reverse reads), so set it now with an explicit
      // DefaultReverseRegistrar.setName. Best-effort: the name is registered
      // regardless, so a hiccup here must not fail the purchase — the wallet
      // still owns it and can set the primary name from the owned state.
      try {
        await sendEvm({
          to: ARK_DEFAULT_REVERSE_REGISTRAR as `0x${string}`,
          data: arkSetPrimaryNameCalldata(currentRegistration.name),
          chainId: 8453,
          address: evmAddress,
        });
      } catch {
        // Reverse unset — name is owned; the "set as primary" path recovers it.
      }
      clearPendingArkRegistration(evmAddress, currentRegistration.label);
      clearPendingArkFunding(evmAddress, currentRegistration.label);
      setPendingRegistration(null);
      setPendingFunding(null);
      setSuccessName(currentRegistration.name);
      await queryClient.invalidateQueries({ queryKey: ["bns", "reverse", evmAddress] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("purchaseFailed", { brand: BRAND }));
    } finally {
      setPaymentStep(null);
      setWorking(false);
    }
  };

  // Extend the owned name by one year. Reachable only inside the renewal
  // window and behind the confirm step, so it can never fire on an active name.
  // Same USDC->ETH funding path as a purchase; the value is one year's price.
  const renewName = async () => {
    if (!ownedLabelValue || !evmAddress || !ownedPrice.data) return;
    setWorking(true);
    setError(null);
    try {
      const result = await renewArkName(ownedLabelValue);
      await payWithUsdc(result.tx.value, ownedLabelValue);
      setPaymentStep("signing");
      await sendEvm({
        to: result.tx.to as `0x${string}`,
        data: result.tx.data as `0x${string}`,
        value: BigInt(result.tx.value),
        chainId: 8453,
        address: evmAddress,
      });
      clearPendingArkFunding(evmAddress, ownedLabelValue);
      setPendingFunding(null);
      setConfirmRenew(false);
      await queryClient.invalidateQueries({ queryKey: ["bns", "label-expires", ownedLabelValue] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("renewFailed"));
    } finally {
      setPaymentStep(null);
      setWorking(false);
    }
  };

  // Set a name the wallet already owns as its primary/reverse — the record
  // registration skipped. Sponsored, no value; makes /reverse verify so the
  // app recognises the Ark ID everywhere.
  const setPrimaryName = async (name: string) => {
    if (!evmAddress || !name) return;
    setWorking(true);
    setError(null);
    try {
      await sendEvm({
        to: ARK_DEFAULT_REVERSE_REGISTRAR as `0x${string}`,
        data: arkSetPrimaryNameCalldata(name),
        chainId: 8453,
        address: evmAddress,
      });
      setSuccessName(name);
      await queryClient.invalidateQueries({ queryKey: ["bns", "reverse", evmAddress] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("purchaseFailed", { brand: BRAND }));
    } finally {
      setWorking(false);
    }
  };

  const close = () => {
    if (working) return;
    setSearch("");
    setPendingRegistration(null);
    setPendingFunding(null);
    setError(null);
    setSuccessName(null);
    onClose();
  };

  const currentName = parsedSearch.kind === "name" ? parsedSearch.name : "";
  const searchPrice = lookupReady ? namePrice.data?.total : undefined;
  const searchUsdcPrice =
    searchPrice && ethPriceUsd > 0
      ? formatUsdcForNativeEth(BigInt(searchPrice), ethPriceUsd)
      : null;
  const ownedUsdcPrice =
    ownedPrice.data && ethPriceUsd > 0
      ? formatUsdcForNativeEth(BigInt(ownedPrice.data.total), ethPriceUsd)
      : null;

  // Ascertain the wallet can cover the name BEFORE committing or paying. The
  // price is charged in USDC (swapped to ETH for the on-chain value), so the
  // gate is the USDC balance against the quoted price — not left to fail
  // mid-payment. Only decided once the balance has loaded, so a pending read
  // never blocks a wallet that can in fact afford it.
  const requiredUsdcAtomic = searchUsdcPrice ? parseUnits(searchUsdcPrice, 6) : null;
  const usdcBalanceAtomic = walletBalances.data ? BigInt(walletBalances.data.usdcAtomic) : null;
  const insufficientUsdc =
    requiredUsdcAtomic !== null &&
    usdcBalanceAtomic !== null &&
    usdcBalanceAtomic < requiredUsdcAtomic;
  const usdcBalanceLabel = usdcBalanceAtomic !== null ? formatUnits(usdcBalanceAtomic, 6) : "0";

  return (
    <ModalShell open={open} onClose={close} size="md">
      <div className="p-1 pb-2">
        {successName ? (
          <SuccessPanel title={t("successTitle", { brand: BRAND })} onDone={close}>
            {t("successBody", { name: successName, brand: BRAND })}
          </SuccessPanel>
        ) : (
          <div className="flex flex-col gap-4" aria-busy={working}>
            <div className="pr-9">
              <p className="text-accent text-[10px] font-semibold tracking-[0.09em] uppercase">
                {t("cardLabel")}
              </p>
              <h2 className="mt-1 font-sans text-[21px] leading-7 font-semibold text-white">
                {t("modalTitle", { brand: BRAND })}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-white/55">{t("modalSubtitle")}</p>
            </div>

            {ownedName ? (
              // The wallet already holds an Ark ID: a calm confirmation showing
              // the real expiry date. A paid renewal appears ONLY inside the
              // renewal window (see RENEWAL_WINDOW_DAYS) and behind a confirm, so
              // an active name never shows a pay button.
              <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.06em] text-white/45 uppercase">
                      {t("ownedNameLabel")}
                    </p>
                    <p className="mt-1 truncate text-[15px] font-semibold text-white">
                      {ownedName}
                    </p>
                    <p
                      className={`mt-1 text-[11px] font-medium ${expiresSoon ? "text-down" : "text-up"}`}
                    >
                      {expiryLabel ? t("ownedExpiresOn", { date: expiryLabel }) : t("ownedActive")}
                    </p>
                  </div>
                  <span className="bg-accent/12 text-accent rounded-md px-2 py-1 text-[10px] font-semibold">
                    {t("walletAttached")}
                  </span>
                </div>

                {expiresSoon ? (
                  confirmRenew ? (
                    <div className="mt-3 rounded-md border border-white/10 bg-white/4 p-2.5">
                      <p className="text-[12px] leading-5 text-white/70">
                        {t("renewPrompt", { name: ownedName })}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={renewName}
                          disabled={working || !ownedPrice.data || !evmAddress}
                          className="bg-accent text-ink flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {working ? (
                            <>
                              <ButtonSpinner />
                              {t("paymentWorking")}
                            </>
                          ) : (
                            t("renewConfirmCta", { amount: ownedUsdcPrice ?? "…" })
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRenew(false)}
                          disabled={working}
                          className="rounded-md border border-white/10 px-3 py-2 text-[12px] font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-45"
                        >
                          {t("renewCancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRenew(true)}
                      className="mt-3 flex w-full items-center justify-between rounded-md border border-white/10 bg-white/4 px-3 py-2 text-left text-[12px] font-semibold text-white transition-colors hover:bg-white/8"
                    >
                      <span>{t("renewCta")}</span>
                      <span className="text-accent">
                        {ownedUsdcPrice ? `$${ownedUsdcPrice} USDC` : "…"}
                      </span>
                    </button>
                  )
                ) : null}
              </div>
            ) : null}

            {/* One Ark ID per wallet: the search-and-buy flow is shown only to
                a wallet that does not already hold a name. An owner sees their
                confirmation above and no path to a second purchase. */}
            {!ownedName ? (
              <>
                <div>
                  <label htmlFor="ark-id-name" className="text-[11px] font-medium text-white/55">
                    {t("nameLabel")}
                  </label>
                  <div className="focus-within:border-accent/55 mt-1.5 flex items-center rounded-lg border border-white/12 bg-white/5">
                    <input
                      id="ark-id-name"
                      value={search}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\.ark$/i, "");
                        const parsed = parseKashRecipient(value);
                        setSearch(value);
                        setNow(Date.now());
                        if (evmAddress && parsed.kind === "name") {
                          setPendingRegistration(
                            getPendingArkRegistration(evmAddress, parsed.label)
                          );
                          setPendingFunding(getPendingArkFunding(evmAddress, parsed.label));
                        } else {
                          setPendingRegistration(null);
                          setPendingFunding(null);
                        }
                        setError(null);
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t("namePlaceholder")}
                      aria-describedby="ark-id-status"
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/25"
                    />
                    <span className="px-3 text-[13px] font-medium text-white/45">.ark</span>
                  </div>
                  <div id="ark-id-status" aria-live="polite" className="mt-2 min-h-5 text-[12px]">
                    {label.length < 3 ? (
                      <span className="text-white/40">{t("nameHint")}</span>
                    ) : !lookupReady || nameAvailability.isFetching ? (
                      <span className="text-white/50">{t("checking")}</span>
                    ) : nameAvailability.isError ? (
                      <span className="text-down">{t("availabilityFailed")}</span>
                    ) : nameAvailability.data?.available && namePrice.isFetching ? (
                      <span className="text-white/50">{t("checking")}</span>
                    ) : nameAvailability.data?.available && namePrice.isError ? (
                      <span className="text-down">{t("priceFailed")}</span>
                    ) : nameAvailability.data?.available && searchUsdcPrice ? (
                      <span className="text-up">
                        {t("available", { name: currentName })} · ${searchUsdcPrice} USDC / year
                      </span>
                    ) : ownsSearchedName ? (
                      <span className="text-up">{t("ownSearched", { name: currentName })}</span>
                    ) : nameAvailability.data ? (
                      <span className="text-white/50">{t("taken", { name: currentName })}</span>
                    ) : null}
                  </div>
                </div>

                {currentRegistration ? (
                  <div className="border-accent/20 bg-accent/8 rounded-lg border p-3">
                    <p className="text-[13px] font-semibold text-white">
                      {t("reserved", { name: currentRegistration.name })}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-white/60">
                      {revealSeconds > 0
                        ? t("revealWait", { seconds: revealSeconds })
                        : t("revealReady")}
                    </p>
                    {currentRegistration.commitTxHash ? (
                      <a
                        href={`https://basescan.org/tx/${currentRegistration.commitTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent mt-1 inline-block text-[11px] underline underline-offset-2"
                      >
                        {t("viewCommit")}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={reserveName}
                        disabled={working}
                        className="text-accent mt-2 cursor-pointer text-[11px] font-semibold"
                      >
                        {t("retryReservation")}
                      </button>
                    )}
                  </div>
                ) : null}

                {currentFunding || paymentStep ? (
                  <div
                    className="rounded-lg border border-white/10 bg-white/4 p-3"
                    aria-live="polite"
                  >
                    <p className="text-[12px] font-medium text-white">
                      {paymentStep === "preparing"
                        ? t("paymentPreparing")
                        : paymentStep === "signing"
                          ? t("paymentSigning")
                          : paymentStep === "processing"
                            ? t("paymentProcessing", { brand: BRAND })
                            : t("paymentResume")}
                    </p>
                  </div>
                ) : null}

                {currentRegistration &&
                canReveal &&
                !currentFunding &&
                !fundingRoute.isPending &&
                !fundingRoute.data ? (
                  <p className="text-[12px] leading-5 text-white/50">{t("paymentUnavailable")}</p>
                ) : null}

                {error || registrationExpired ? (
                  <p
                    role="alert"
                    className="text-down bg-down/10 rounded-md px-3 py-2 text-[12px] leading-5"
                  >
                    {error ?? t("commitExpired")}
                  </p>
                ) : null}

                {insufficientUsdc && !currentFunding && !working ? (
                  <p className="text-down bg-down/10 rounded-md px-3 py-2 text-[12px] leading-5">
                    {t("insufficientUsdc", {
                      price: searchUsdcPrice ?? "",
                      balance: usdcBalanceLabel,
                    })}
                  </p>
                ) : null}

                {ownsSearchedName && !currentRegistration ? (
                  <button
                    type="button"
                    onClick={() => setPrimaryName(currentName)}
                    disabled={working || !evmAddress}
                    className="bg-accent text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {working ? <ButtonSpinner /> : null}
                    {working ? t("settingPrimary") : t("setPrimaryCta")}
                  </button>
                ) : !currentRegistration ? (
                  <button
                    type="button"
                    onClick={reserveName}
                    disabled={
                      !available ||
                      !searchUsdcPrice ||
                      !evmAddress ||
                      working ||
                      insufficientUsdc ||
                      Boolean(currentFunding)
                    }
                    className="bg-accent text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {working ? <ButtonSpinner /> : null}
                    {working ? t("reserving") : t("reserveCta")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={completeRegistration}
                    disabled={
                      !canReveal ||
                      !searchUsdcPrice ||
                      working ||
                      (!currentFunding && insufficientUsdc) ||
                      (!currentFunding && (fundingRoute.isPending || !fundingRoute.data))
                    }
                    className="bg-accent text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {working ? (
                      <>
                        <ButtonSpinner />
                        {paymentStep === "signing" ? t("paymentSigning") : t("paymentWorking")}
                      </>
                    ) : currentFunding ? (
                      t("continuePaymentCta", { amount: searchUsdcPrice ?? "…" })
                    ) : (
                      t("payRegisterCta", {
                        amount: searchUsdcPrice ?? "…",
                        name: currentRegistration?.name ?? currentName,
                      })
                    )}
                  </button>
                )}

                {evmAddress ? (
                  <p className="text-center text-[10px] text-white/35">
                    {t("payingFrom", { wallet: shortenAddress(evmAddress) })} · {t("annualRenewal")}
                  </p>
                ) : (
                  <p className="text-center text-[11px] text-white/50">{t("walletNeeded")}</p>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
