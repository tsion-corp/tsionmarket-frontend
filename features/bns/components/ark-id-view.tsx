"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { formatUnits, parseUnits } from "viem";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ButtonSpinner } from "@/components/ui/button-spinner";
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

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// The check is debounced and the verdict waits on `lookupReady`, so a name is
// never called available before the answer for THAT name is in. A line of grey
// text was the only sign it was still working, which reads as nothing
// happening; this is the same wait, said out loud.
function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-white/25 border-t-white/80"
    />
  );
}

// The scattered names both Basenames and ENS lead with: real-looking names in
// pills, drifting around the search so the page shows what it sells before it
// asks for anything.
//
// Spread into two bands down the left and right, clear of the 620px column in
// the middle, so nothing ever sits under the headline or the field. Decorative
// and aria-hidden. Fixed positions rather than random, so the composition is
// the same on every render, and each pill carries its own duration, delay and
// resting angle so the group drifts rather than pulsing as one block.
//
// A few are gold: the Arkade's own warm colour, spent on a handful so the
// others stay quiet and the gold still reads as something worth having.
interface SampleName {
  name: string;
  top: string;
  left: string;
  rotate: number;
  dim: number;
  seconds: number;
  delay: number;
  gold?: boolean;
}

const SAMPLE_NAMES: SampleName[] = [
  { name: "ada.ark", top: "7%", left: "3%", rotate: -5, dim: 0.5, seconds: 7.5, delay: 0 },
  {
    name: "chidi.ark",
    top: "23%",
    left: "13%",
    rotate: 3,
    dim: 0.9,
    seconds: 6.4,
    delay: 0.8,
    gold: true,
  },
  { name: "zainab.ark", top: "41%", left: "2%", rotate: -2, dim: 0.62, seconds: 8.2, delay: 1.6 },
  { name: "kofi.ark", top: "61%", left: "11%", rotate: 4, dim: 0.75, seconds: 7, delay: 0.4 },
  { name: "ngozi.ark", top: "82%", left: "5%", rotate: -3, dim: 0.45, seconds: 9, delay: 2.2 },
  { name: "amaka.ark", top: "9%", left: "80%", rotate: 4, dim: 0.66, seconds: 8.6, delay: 1.1 },
  { name: "tunde.ark", top: "28%", left: "88%", rotate: -3, dim: 0.85, seconds: 6.8, delay: 0.2 },
  {
    name: "nia.ark",
    top: "48%",
    left: "78%",
    rotate: 2,
    dim: 0.95,
    seconds: 7.4,
    delay: 1.9,
    gold: true,
  },
  { name: "obi.ark", top: "68%", left: "89%", rotate: -4, dim: 0.55, seconds: 8, delay: 0.6 },
  { name: "sade.ark", top: "86%", left: "76%", rotate: 3, dim: 0.42, seconds: 9.4, delay: 2.6 },
];

function ScatteredNames() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {SAMPLE_NAMES.map((pill) => (
        <span
          key={pill.name}
          className={`ws-name-float absolute rounded-full border px-4 py-2 font-serif text-[15px] font-medium whitespace-nowrap ${
            // The far ones sit out of focus, which is what gives the group
            // depth instead of reading as a flat scatter.
            pill.dim < 0.6 ? "blur-[1.5px]" : ""
          } ${
            pill.gold
              ? "border-[#FFE178]/30 bg-[#FFE178]/10 text-[#FFE178]"
              : "border-white/10 bg-white/[0.04] text-white/70"
          }`}
          style={
            {
              top: pill.top,
              left: pill.left,
              opacity: pill.dim,
              "--ws-name-rot": `${pill.rotate}deg`,
              "--ws-name-dur": `${pill.seconds}s`,
              "--ws-name-delay": `${pill.delay}s`,
            } as CSSProperties
          }
        >
          {pill.name}
        </span>
      ))}
    </div>
  );
}

export function ArkIdView() {
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
    enabled: lookupLabel.length >= 3,
    staleTime: 15_000,
    retry: false,
  });
  const namePrice = useQuery({
    queryKey: ["bns", "label-price", lookupLabel],
    queryFn: () => getArkLabelPrice(lookupLabel),
    enabled: lookupLabel.length >= 3 && nameAvailability.data?.available === true,
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
    enabled: lookupLabel.length >= 3 && nameAvailability.data?.available === false,
    staleTime: 30_000,
    retry: false,
  });
  const reverse = useQuery({
    queryKey: ["bns", "reverse", evmAddress],
    queryFn: () => reverseResolveArkAddress(evmAddress as string),
    enabled: Boolean(evmAddress),
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
    enabled: ownedLabelValue.length >= 3,
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
    enabled: expiresSoon && ownedLabelValue.length >= 3,
    staleTime: 30_000,
    retry: false,
  });
  const walletBalances = useQuery({
    queryKey: ["bns", "wallet-balances", evmAddress],
    queryFn: () => readArkWalletBalances(evmAddress as string),
    enabled: Boolean(evmAddress),
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
    enabled: currentFunding !== null || Boolean(currentRegistration) || expiresSoon,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!pendingRegistration && !pendingFunding) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pendingRegistration, pendingFunding]);

  // Read the wall clock once the page mounts, so expiry math runs off state
  // rather than a Date.now() call in render (which the purity rule forbids).
  // Set from a timer callback, not the effect body, per the hooks rules.
  useEffect(() => {
    const id = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(id);
  }, []);

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

  // A page has nothing to close. Finishing returns it to its resting state,
  // which now shows the name the wallet just claimed.
  const reset = () => {
    if (working) return;
    setSearch("");
    setPendingRegistration(null);
    setPendingFunding(null);
    setError(null);
    setSuccessName(null);
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
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* The portfolio's own page frame: its width, its padding, and one
          rounded panel filling it, because this route renders inside the same
          shell and has to read as part of the app rather than a landing page
          that lost its chrome.
          The panel is where the Basenames/ENS idea lands: the search is the
          thing on it, and the names drift behind, clipped by the card. */}
      <div className="ws-card relative flex min-h-[520px] items-center justify-center overflow-hidden px-4 py-10 sm:px-8 md:min-h-[calc(100svh-150px)]">
        {/* The Arkade's gold, as a lamp behind the headline rather than a fill:
            the page stays dark and the warmth sits where the eye lands. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-[-18%] left-1/2 h-[420px] w-[820px] max-w-[130%] -translate-x-1/2 rounded-full bg-[#FFE178]/12 blur-[110px]"
        />
        <ScatteredNames />
        {/* Centred both ways inside the panel: the panel takes the height the
            shell leaves it (topbar plus this page's own padding), and the
            column sits in the middle of it rather than against the top. */}
        <div className="relative mx-auto w-full max-w-[620px]">
          {successName ? (
            <SuccessPanel title={t("successTitle", { brand: BRAND })} onDone={reset}>
              {t("successBody", { name: successName, brand: BRAND })}
            </SuccessPanel>
          ) : (
            <div className="flex flex-col gap-4" aria-busy={working}>
              <div className="text-center">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#FFE178] uppercase">
                  {t("cardLabel")}
                </p>
                <h1 className="ws-display ws-gold-ink mt-3 text-[clamp(30px,6vw,52px)] leading-[1.05] tracking-[-0.03em]">
                  {t("modalTitle", { brand: BRAND })}
                </h1>
                <p className="mx-auto mt-3 max-w-[46ch] text-[14.5px] leading-[1.5] text-white/55">
                  {t("modalSubtitle")}
                </p>
              </div>

              {ownedName ? (
                // The wallet already holds an Ark ID: a calm confirmation showing
                // the real expiry date. A paid renewal appears ONLY inside the
                // renewal window (see RENEWAL_WINDOW_DAYS) and behind a confirm, so
                // an active name never shows a pay button.
                <div className="rounded-[16px] border border-white/10 bg-white/4 p-3">
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
                        {expiryLabel
                          ? t("ownedExpiresOn", { date: expiryLabel })
                          : t("ownedActive")}
                      </p>
                    </div>
                    <span className="bg-accent/12 text-accent rounded-[14px] px-2 py-1 text-[10px] font-semibold">
                      {t("walletAttached")}
                    </span>
                  </div>

                  {expiresSoon ? (
                    confirmRenew ? (
                      <div className="mt-3 rounded-[14px] border border-white/10 bg-white/4 p-2.5">
                        <p className="text-[12px] leading-5 text-white/70">
                          {t("renewPrompt", { name: ownedName })}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={renewName}
                            disabled={working || !ownedPrice.data || !evmAddress}
                            className="bg-accent text-ink flex flex-1 items-center justify-center gap-2 rounded-[14px] px-3 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
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
                            className="rounded-[14px] border border-white/10 px-3 py-2 text-[12px] font-semibold text-white/60 transition-colors hover:text-white disabled:opacity-45"
                          >
                            {t("renewCancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRenew(true)}
                        className="mt-3 flex w-full items-center justify-between rounded-[14px] border border-white/10 bg-white/4 px-3 py-2 text-left text-[12px] font-semibold text-white transition-colors hover:bg-white/8"
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
                    <label htmlFor="ark-id-name" className="sr-only">
                      {t("nameLabel")}
                    </label>
                    <div className="flex items-center rounded-[14px] border border-white/12 bg-white/6 px-2 transition-colors focus-within:border-[#FFE178]/55 focus-within:shadow-[0_0_0_4px_rgba(255,225,120,0.10)]">
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
                        className="min-w-0 flex-1 bg-transparent px-4 py-4 text-[clamp(17px,2.6vw,21px)] text-white outline-none placeholder:text-white/25 sm:py-[18px]"
                      />
                      <span className="pl-1 text-[clamp(15px,2.2vw,18px)] font-medium text-white/40">
                        .ark
                      </span>
                      {/* Clearing the field is one tap, as it is on every name
                          search worth using; without it the only way back to an
                          empty field is holding backspace. */}
                      {search ? (
                        <button
                          type="button"
                          aria-label={t("clearName")}
                          onClick={() => {
                            setSearch("");
                            setPendingRegistration(null);
                            setPendingFunding(null);
                            setError(null);
                          }}
                          className="mx-2 grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                            <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" />
                          </svg>
                        </button>
                      ) : (
                        <span aria-hidden className="mx-2 size-7 shrink-0" />
                      )}
                    </div>
                    <div
                      id="ark-id-status"
                      aria-live="polite"
                      className="mt-2 overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04]"
                    >
                      {label.length < 3 ? (
                        <p className="px-4 py-3 text-[13px] text-white/40">{t("nameHint")}</p>
                      ) : !lookupReady || nameAvailability.isFetching ? (
                        <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-white/60">
                          <Spinner />
                          {t("checking")}
                        </p>
                      ) : nameAvailability.isError ? (
                        <p className="text-down px-4 py-3 text-[13px]">{t("availabilityFailed")}</p>
                      ) : nameAvailability.data?.available && namePrice.isFetching ? (
                        <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-white/60">
                          <Spinner />
                          {t("checkingPrice")}
                        </p>
                      ) : nameAvailability.data?.available && namePrice.isError ? (
                        <p className="text-down px-4 py-3 text-[13px]">{t("priceFailed")}</p>
                      ) : nameAvailability.data?.available && searchUsdcPrice ? (
                        // The row Basenames drops under its field: the name on
                        // the left, its price on the right, the whole row the
                        // answer rather than a sentence about it.
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="ws-display min-w-0 truncate text-[16px] text-white">
                            {currentName}
                          </span>
                          <span className="shrink-0 text-[13px] font-semibold text-[#FFE178]">
                            {t("perYear", { price: `$${searchUsdcPrice}` })}
                          </span>
                        </div>
                      ) : ownsSearchedName ? (
                        <p className="text-up px-4 py-3 text-[13px]">
                          {t("ownSearched", { name: currentName })}
                        </p>
                      ) : nameAvailability.data ? (
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="ws-display min-w-0 truncate text-[16px] text-white/40 line-through">
                            {currentName}
                          </span>
                          <span className="shrink-0 text-[13px] font-medium text-white/45">
                            {t("takenTag")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {currentRegistration ? (
                    <div className="border-accent/20 bg-accent/8 rounded-[16px] border p-3">
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
                      className="rounded-[16px] border border-white/10 bg-white/4 p-3"
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
                      className="text-down bg-down/10 rounded-[14px] px-3 py-2 text-[12px] leading-5"
                    >
                      {error ?? t("commitExpired")}
                    </p>
                  ) : null}

                  {insufficientUsdc && !currentFunding && !working ? (
                    <p className="text-down bg-down/10 rounded-[14px] px-3 py-2 text-[12px] leading-5">
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
                      className="bg-accent text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
                      className="bg-accent text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
                      className="bg-accent text-ink flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
                      {t("payingFrom", { wallet: shortenAddress(evmAddress) })} ·{" "}
                      {t("annualRenewal")}
                    </p>
                  ) : (
                    <p className="text-center text-[11px] text-white/50">{t("walletNeeded")}</p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
