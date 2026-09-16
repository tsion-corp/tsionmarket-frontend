"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { DepositStatus } from "@/components/ui/deposit-status";
import { QrScanSheet } from "@/features/funds/components/qr-scan-sheet";
import { useSendToken } from "@/hooks/use-withdraw";
import { AssetIcon } from "@/components/ui/asset-icon";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  QrScanIcon,
  SearchIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { NetworkList } from "@/features/funds/components/network-list";
import {
  createWithdrawQuote,
  useDepositChains,
  useDepositStatus,
  useTerminalToast,
  useWithdrawDestinations,
  useWithdrawQuote,
  type WithdrawQuoteInput,
} from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import {
  quoteFee,
  SETTLE_CHAINS,
  txExplorerUrl,
  type AddressKind,
  type DepositToken,
  type QuoteResult,
  type WithdrawDestination,
} from "@/lib/deposit";
import {
  DETECTABLE_ADDRESS_KINDS,
  detectAddressKind,
  extractScannedAddress,
} from "@/lib/wallet-address";
import { friendlyError } from "@/lib/errors";
import { isSubmittedEvmOperationError } from "@/lib/trade/sponsor";
import { formatAmount, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";

const DECIMAL = /^\d*\.?\d*$/;
const QUOTE_DEBOUNCE_MS = 450;

// Payouts treated as dollars, so "amount in minus amount out" is a real fee.
const STABLE_PAYOUTS = new Set(["USDC", "USDT", "USDC.E", "DAI", "PYUSD", "USDG", "USDS"]);
function isStableSymbol(symbol: string): boolean {
  return STABLE_PAYOUTS.has(symbol.toUpperCase());
}

// The wallet balance is USDC on Base — everything deposited settles here, so
// it is the single source every withdrawal sends from. The screen never names
// the chain: the user withdraws "USDC", and where it sits is plumbing.
const SOURCE = SETTLE_CHAINS.base;

// Dextopus's solver omits the origin chain itself as a destination (a same-chain
// hop isn't a route), but sending USDC to an external address on that chain is a
// valid plain transfer (see isDirectSend). Inject it so the origin still appears
// as a "withdraw to" network. Parameterized and pure, so it stays testable
// against any settle chain even though only Base sends today.
export function sameChainDestination(
  source: (typeof SETTLE_CHAINS)[keyof typeof SETTLE_CHAINS]
): WithdrawDestination {
  return {
    destinationChainId: source.chainId,
    blockchain: source.chainName,
    currency: source.usdc,
    symbol: "USDC",
    decimals: source.decimals,
    addressKind: source.chainType === "solana" ? "solana" : "evm",
    logoUrl: null,
  };
}

const ADDRESS_KIND_LABEL: Record<AddressKind, string> = {
  evm: "EVM",
  near: "NEAR",
  solana: "Solana",
  tron: "Tron",
  bitcoin: "Bitcoin",
  litecoin: "Litecoin",
  stellar: "Stellar",
  sui: "Sui",
  ton: "TON",
  xrp: "XRP",
};

// Turn a raw Dextopus quote failure into something a user can act on. The
// provider reports an unroutable destination/recipient as the generic "No
// deposit quote available", so we translate rather than show it verbatim.
// Provider error messages we cannot classify pass through untranslated.
function quoteErrorMessage(error: unknown, t: (key: string) => string): string {
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  if (raw.includes("no deposit quote") || raw.includes("not supported")) {
    return t("quoteNoRoute");
  }
  if (raw.includes("minimum") || raw.includes("too low") || raw.includes("too small")) {
    return t("quoteBelowMinimum");
  }
  if (raw.includes("too many requests") || raw.includes("rate limit")) {
    return t("quoteRateLimited");
  }
  return error instanceof Error ? error.message : t("quoteFailed");
}

// Collapsed row a picker shrinks to after a selection: its glyph + label with
// a chevron affordance that reopens the full list. Two variants: "pill" for the
// compact network pill and "card" for the full-width asset selector.
function SelectedRow({
  glyph,
  title,
  subtitle,
  onChange,
  disabled,
  variant = "card",
}: {
  glyph: React.ReactNode;
  title: string;
  subtitle?: string;
  onChange: () => void;
  disabled?: boolean;
  variant?: "pill" | "card";
}) {
  if (variant === "pill") {
    return (
      <button
        onClick={onChange}
        disabled={disabled}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-[#1b1b1b] px-4 py-2 text-left transition-colors hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {glyph}
        <span className="truncate font-sans text-[13px] font-medium text-white">{title}</span>
        <ChevronDownIcon size={11} className="shrink-0 text-white/50" />
      </button>
    );
  }
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-[#1b1b1b] px-5 py-4 text-left transition-colors hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {glyph}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-[15px] font-bold text-white">{title}</span>
        {subtitle ? (
          <span className="block truncate font-sans text-[13px] font-normal text-white/50">
            {subtitle}
          </span>
        ) : null}
      </span>
      <ChevronDownIcon size={11} className="shrink-0 text-white/50" />
    </button>
  );
}

interface CryptoWithdrawScreenProps {
  onBack: () => void;
}

// Withdraw the wallet's USDC (on Base) to any external wallet. Pick the coin
// and network to receive, paste an address, enter an amount. Same-asset sends
// (USDC to USDC on Base) go out as a plain transfer; anything else routes
// through Dextopus, which converts and settles the destination token under the
// hood, auto-refunding to the wallet if it can't complete.
export function CryptoWithdrawScreen({ onBack }: CryptoWithdrawScreenProps) {
  const t = useTranslations("fundsFlow");
  const { user } = usePrivy();
  const { tokens } = usePortfolio();
  const { sendToken } = useSendToken();
  const allChains = useDepositChains();

  const [destSymbol, setDestSymbol] = useState<string | null>(null);
  const [destChainId, setDestChainId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [depositRequestId, setDepositRequestId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Debounce the amount that feeds the quote so we don't mint a fresh quote on
  // every keystroke; the submit button waits for this to catch up.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(amount), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [amount]);

  const source = SOURCE;
  const sourceNetwork = source.alchemyNetwork;
  const usdcHolding = tokens.find(
    (t) => t.network === sourceNetwork && t.symbol.toUpperCase() === "USDC"
  );
  const balance = usdcHolding?.balance ?? 0;
  // Dextopus validates the refund address against the ORIGIN chain family.
  const refundTo = getWalletAddress(user, source.chainType);

  // Where the USDC can go, per Dextopus's solver for USDC on the chosen source.
  const destinations = useWithdrawDestinations({
    chainId: source.chainId,
    address: source.usdc,
  });

  // Dextopus's destinations plus a Base-USDC row (which the solver omits), so
  // Base is offered for the plain same-chain send. Deduped in case the solver
  // ever starts returning it. Destinations whose address family
  // detectAddressKind can't verify are dropped: offering one would dead-end
  // the user at the address field with a mismatch no address can clear.
  const allDestinations = useMemo(() => {
    const solver = (destinations.data ?? []).filter((d) =>
      DETECTABLE_ADDRESS_KINDS.has(d.addressKind)
    );
    const hasSameChain = solver.some(
      (d) =>
        d.destinationChainId === source.chainId &&
        d.currency.toLowerCase() === source.usdc.toLowerCase()
    );
    return hasSameChain ? solver : [sameChainDestination(source), ...solver];
  }, [destinations.data, source]);

  // One row per destination symbol (e.g. "USDC" once, though it exists on many
  // chains) — pick the coin, then the network, reusing TokenList as-is.
  const symbolOptions = useMemo(() => {
    const list = allDestinations;
    const seen = new Map<string, WithdrawDestination>();
    for (const d of list) {
      if (!seen.has(d.symbol)) seen.set(d.symbol, d);
    }
    return [...seen.values()]
      .map((d): DepositToken => ({
        address: d.currency,
        symbol: d.symbol,
        name: d.symbol,
        decimals: d.decimals,
        chainId: d.destinationChainId,
        logoUrl: d.logoUrl,
        supportsStaticAddress: true,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [allDestinations]);
  const selectedSymbolOption = symbolOptions.find((o) => o.symbol === destSymbol) ?? null;

  const chainIdsForSymbol = useMemo(() => {
    const list = allDestinations;
    return new Set(list.filter((d) => d.symbol === destSymbol).map((d) => d.destinationChainId));
  }, [allDestinations, destSymbol]);

  const selectedDestination = useMemo(() => {
    const list = allDestinations;
    return (
      list.find((d) => d.symbol === destSymbol && d.destinationChainId === destChainId) ?? null
    );
  }, [allDestinations, destSymbol, destChainId]);

  const destChain = (allChains.data ?? []).find((c) => c.chainId === destChainId) ?? null;
  const destChainLabel = destChain?.name ?? selectedDestination?.blockchain ?? "";

  // Withdrawing USDC to USDC on Base is a plain transfer — no bridge, no fee,
  // no quote. Everything else routes through Dextopus.
  const isDirectSend =
    selectedDestination != null &&
    selectedDestination.destinationChainId === source.chainId &&
    selectedDestination.currency.toLowerCase() === source.usdc.toLowerCase();

  const detectedKind = useMemo(() => detectAddressKind(to), [to]);
  const requiredKind: AddressKind | null = selectedDestination?.addressKind ?? null;
  const addrOk = detectedKind !== null && detectedKind === requiredKind;

  const value = Number(amount) || 0;
  const overBalance = value > balance;
  const amountSettled = amount === debouncedAmount;

  // Price a routed withdrawal with a live quote once every field is valid, so
  // we never quote an incomplete form (which the provider rejects as "no quote
  // available" and would read as a spurious error). Direct sends need no quote.
  const quoteInput: WithdrawQuoteInput | null =
    selectedDestination &&
    !isDirectSend &&
    refundTo &&
    addrOk &&
    value > 0 &&
    !overBalance &&
    amountSettled
      ? {
          originChainId: source.chainId,
          originAsset: source.usdc,
          destinationChainId: selectedDestination.destinationChainId,
          destinationAsset: selectedDestination.currency,
          amount: toBaseUnits(debouncedAmount, source.decimals).toString(),
          recipient: to.trim(),
          refundTo,
        }
      : null;
  const quote = useWithdrawQuote(quoteInput);

  // What the recipient receives: the live quote's amountOut for a route, or the
  // amount itself for a same-asset send.
  const previewOut = isDirectSend
    ? `$${formatAmount(value)}`
    : quote.data && selectedDestination
      ? `${fromBaseUnits(BigInt(quote.data.amountOut), selectedDestination.decimals)} ${selectedDestination.symbol}`
      : null;

  // The fee the quote implies, only when the payout is dollar-priced so it
  // reconciles with the "recipient gets" figure. A direct send has no fee.
  const payoutUsd =
    !isDirectSend && quote.data && selectedDestination && isStableSymbol(selectedDestination.symbol)
      ? Number(fromBaseUnits(BigInt(quote.data.amountOut), selectedDestination.decimals))
      : null;
  const feeUsd = payoutUsd != null ? quoteFee(value, payoutUsd) : null;

  const busy = submitting;
  const ready =
    Boolean(selectedDestination) &&
    addrOk &&
    value > 0 &&
    !overBalance &&
    !busy &&
    amountSettled &&
    Boolean(refundTo) &&
    (isDirectSend || Boolean(quote.data));

  const status = useDepositStatus(depositRequestId, "withdrawal");
  useTerminalToast(status.data, depositRequestId, {
    settled: t("withdrawalSettled"),
    failed: t("withdrawalFailedRefunded"),
    refunded: t("withdrawalRefunded"),
  });

  // The immediate tx is the USDC send on whichever chain it left from.
  const originChain = (allChains.data ?? []).find((c) => c.chainId === source.chainId) ?? null;
  const originExplorerUrl = txHash
    ? txExplorerUrl(source.chainId, originChain?.blockExplorer ?? null, txHash)
    : null;

  // Once Dextopus settles a routed withdrawal, its status carries the
  // destination-chain tx — a different hash on a different chain.
  const destExplorerUrls =
    !isDirectSend && destChainId !== null
      ? (status.data?.destinationTransactionHashes ?? [])
          .map((hash) => txExplorerUrl(destChainId, destChain?.blockExplorer ?? null, hash))
          .filter((url): url is string => url !== null)
      : [];

  const submit = async () => {
    if (!selectedDestination) return;
    setError(null);
    setSubmitting(true);
    // One processing toast that resolves in place; dismissed if we bail on a
    // validation check before anything is actually sent.
    const toastId = toast.loading(t("sendingWithdrawal"));
    try {
      const sendAmount = toBaseUnits(amount, source.decimals);
      if (isDirectSend) {
        const hash = await sendToken({
          network: sourceNetwork,
          tokenAddress: source.usdc,
          decimals: source.decimals,
          to: to.trim(),
          amount: sendAmount,
        });
        setTxHash(hash);
        track("withdraw_completed", {
          method: "wallet",
          asset: "USDC",
          amount_usd: value,
          network: sourceNetwork,
          recipient_address: to.trim(),
        });
        toast.success(t("withdrewAmount", { amount: formatAmount(value) }), {
          id: toastId,
          sensitive: true,
        });
        return;
      }
      if (!refundTo) {
        setError(t("walletNotReady"));
        toast.dismiss(toastId);
        return;
      }
      // The preview was a dry quote; this is the one real quote of the
      // withdrawal, bound to the exact amount and recipient, with a full
      // unexpired window on its deposit address.
      if (!quoteInput) {
        setError(t("walletNotReady"));
        toast.dismiss(toastId);
        return;
      }
      let fresh: QuoteResult;
      try {
        fresh = await createWithdrawQuote(quoteInput);
      } catch (e) {
        setError(quoteErrorMessage(e, t));
        toast.dismiss(toastId);
        return;
      }
      const hash = await sendToken({
        network: sourceNetwork,
        tokenAddress: source.usdc,
        decimals: source.decimals,
        to: fresh.depositAddress,
        amount: sendAmount,
      });
      setTxHash(hash);
      setDepositRequestId(fresh.depositRequestId);
      track("withdraw_completed", {
        method: "wallet",
        asset: selectedDestination.symbol,
        amount_usd: value,
        network: sourceNetwork,
        recipient_address: to.trim(),
      });
      toast.success(
        t("sendingConversion", {
          amount: formatAmount(value),
          symbol: selectedDestination.symbol,
          chain: destChainLabel,
        }),
        { id: toastId }
      );
    } catch (e) {
      // Only the sponsored sender can prove that a request reached the
      // bundler: it wraps failures after eth_sendUserOperation returned a hash.
      // Validation, signing and pre-submission failures remain safe to retry.
      if (isSubmittedEvmOperationError(e)) {
        setError(t("withdrawalUnconfirmed"));
        toast.error(t("withdrawalUnconfirmedToast"), { id: toastId });
      } else {
        setError(friendlyError(e, t("withdrawalNotSentFallback")));
        toast.error(t("withdrawalNotSent"), { id: toastId });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Networks available for the selected token (must be before any return)
  const networksForToken = useMemo(() => {
    return (allChains.data ?? []).filter((c) => chainIdsForSymbol.has(c.chainId));
  }, [allChains.data, chainIdsForSymbol]);

  if (txHash) {
    return (
      <div className="flex flex-col items-center px-6 pb-8">
        {/* Success icon */}
        <div className="flex justify-center py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/market/withdrawal-success.svg" alt="" className="size-[101px]" />
        </div>

        {/* Title + amount */}
        <div className="flex flex-col items-center gap-2 text-center text-white">
          <p className="text-[22px] font-medium">Withdrawal Successful</p>
          <p className="text-[29px] font-semibold tracking-[-1.16px]">
            {formatAmount(Number(amount))}
          </p>
        </div>

        {/* Status tracker for routed withdrawals */}
        {depositRequestId && (
          <div className="mt-4 w-full">
            <DepositStatus
              status={status.data?.status ?? "waiting"}
              executionStatus={status.data?.executionStatus}
              isError={status.isError}
              onRetry={() => status.refetch()}
            />
          </div>
        )}

        {/* Explorer links */}
        {originExplorerUrl && (
          <a
            href={originExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tnum text-accent mt-3 text-[12px] font-normal break-all underline"
          >
            View transaction
          </a>
        )}
        {destExplorerUrls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {destExplorerUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="tnum text-accent text-[12px] font-normal break-all underline"
              >
                {t("viewOnChain", { chain: destChainLabel })}
              </a>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-9 flex w-full flex-col gap-3">
          <button
            onClick={onBack}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-[24px] bg-[#0ecb81] text-[15px] font-semibold tracking-[0.15px] text-white transition-opacity hover:opacity-90"
          >
            View Dashboard
          </button>
          <button
            onClick={onBack}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-[24px] border border-white/10 text-[15px] font-semibold tracking-[0.15px] text-white/50 transition-colors hover:bg-white/6"
          >
            Share Receipt
          </button>
        </div>
      </div>
    );
  }

  // Step: token → network → form. Same modal, content swaps.
  const showingNetworks = destSymbol !== null && destChainId === null;
  const showingForm = destSymbol !== null && destChainId !== null;

  return (
    <div className="flex h-[75vh] flex-col">
      {/* ── STICKY TOP ── */}
      <div className="shrink-0 pb-2">
        <div className="pt-2">
          <button
            onClick={() => {
              if (showingForm) {
                setDestChainId(null);
              } else if (showingNetworks) {
                setDestSymbol(null);
                setDestChainId(null);
              } else {
                onBack();
              }
            }}
            className="flex cursor-pointer items-center gap-[6px] text-[13px] font-normal text-white hover:text-white/80"
          >
            <ChevronLeftIcon size={14} />
            Back
          </button>
        </div>

        <div className="mt-3">
          <h2 className="text-[20px] leading-[26px] font-bold text-white">
            {showingForm
              ? t("withdrawCryptoTitle")
              : showingNetworks
                ? "Select Network"
                : "Token To Send"}
          </h2>
          {!showingNetworks && !showingForm && (
            <p className="mt-1.5 text-[13px] leading-[18px] font-normal text-white/60">
              {t("withdrawCryptoSubtitle")}
            </p>
          )}
          {showingNetworks && destSymbol && (
            <p className="mt-1.5 text-[13px] leading-[18px] font-normal text-white/60">
              for {destSymbol}
            </p>
          )}
          {showingForm && (
            <p className="mt-1.5 text-[13px] leading-[18px] font-normal text-white/60">
              {t("withdrawCryptoSubtitle")}
            </p>
          )}
        </div>

        {/* Search — only on token and network steps */}
        {!showingForm && (
          <div className="mt-3">
            <div className="flex h-[44px] items-center gap-2.5 rounded-full border border-white/8 bg-white/[0.04] px-4">
              <SearchIcon size={14} className="shrink-0 text-white/40" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-[-0.39px] text-white placeholder:text-white/40 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── SCROLLABLE BOTTOM ── */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {/* Step 1: Token list */}
        {!showingNetworks &&
          !showingForm &&
          (destinations.isPending ? (
            <div className="py-8 text-center text-[13px] text-white/40">Loading tokens…</div>
          ) : destinations.isError ? (
            <div className="py-8 text-center text-[13px] text-white/40">
              Couldn&apos;t load tokens.{" "}
              <button
                onClick={() => destinations.refetch()}
                className="text-accent cursor-pointer underline"
              >
                Try again
              </button>
            </div>
          ) : symbolOptions.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-white/40">No tokens available</div>
          ) : (
            <div className="flex flex-col">
              {symbolOptions.map((tk) => (
                <button
                  key={tk.symbol}
                  onClick={() => {
                    setDestSymbol(tk.symbol);
                    setDestChainId(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-1 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <AssetIcon sym={tk.symbol} bg="#26262b" size={32} logo={tk.logoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-[16px] font-semibold text-white">
                      {tk.symbol}
                    </span>
                    <span className="block truncate text-[11px] leading-[14px] font-normal text-white/50">
                      {tk.name}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}

        {/* Step 2: Network list for selected token */}
        {showingNetworks && (
          <NetworkList
            chains={networksForToken}
            selected={destChain}
            onSelect={(c) => {
              setDestChainId(c.chainId);
            }}
            loading={allChains.isPending}
          />
        )}

        {/* Step 3: Address + amount form */}
        {showingForm && selectedDestination && (
          <>
            {/* Select Network */}
            <div className="mt-5">
              <span className="mb-2 block text-[13px] font-normal text-white/50">
                Select Network
              </span>
              <SelectedRow
                variant="pill"
                glyph={
                  destChain?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={destChain.logoUrl}
                      alt=""
                      className="size-[18px] shrink-0 rounded-full"
                    />
                  ) : (
                    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-white/10 text-[8px] font-bold text-white/60">
                      {destChainLabel.charAt(0)}
                    </span>
                  )
                }
                title={destChainLabel}
                onChange={() => setDestChainId(null)}
                disabled={submitting}
              />
            </div>

            {/* Select Asset */}
            <div className="mt-4">
              <span className="mb-2 block text-[13px] font-normal text-white/50">Select Asset</span>
              <SelectedRow
                variant="card"
                glyph={
                  <AssetIcon
                    sym={selectedDestination.symbol}
                    bg="#26262b"
                    size={24}
                    logo={selectedSymbolOption?.logoUrl ?? null}
                  />
                }
                title={selectedDestination.symbol}
                subtitle={`Available: ${formatAmount(balance)} USDC`}
                onChange={() => {
                  setDestSymbol(null);
                  setDestChainId(null);
                }}
                disabled={submitting}
              />
            </div>

            {/* Amount */}
            <div className="mt-4">
              <span className="mb-2 block text-[13px] font-normal text-white/50">
                {t("amount")}
              </span>
              <div className="flex h-[54px] items-center rounded-xl border border-white/15 bg-[#1b1b1b] px-5">
                <input
                  inputMode="decimal"
                  placeholder="$0.00"
                  value={amount ? `$${amount}` : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/^\$/, "");
                    if (DECIMAL.test(raw)) setAmount(raw);
                  }}
                  disabled={submitting}
                  className="tnum min-w-0 flex-1 bg-transparent font-sans text-[18px] font-bold text-white outline-none placeholder:text-white/40 disabled:opacity-50"
                />
                <button
                  onClick={() =>
                    setAmount(
                      usdcHolding
                        ? fromBaseUnits(BigInt(usdcHolding.rawBalance), usdcHolding.decimals)
                        : "0"
                    )
                  }
                  disabled={submitting}
                  className="shrink-0 cursor-pointer rounded-full border border-white/20 px-3 py-1 font-sans text-[12px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
              {overBalance && (
                <div className="text-down mt-2 text-[13px] font-normal">{t("overBalanceUsdc")}</div>
              )}
            </div>

            {/* Destination Address */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-normal text-white/50">
                  {destChainLabel
                    ? t("destinationAddressWithChain", { chain: destChainLabel })
                    : t("destinationAddress")}
                </span>
                <button
                  onClick={() => setScanOpen(true)}
                  disabled={submitting}
                  className="text-accent flex shrink-0 cursor-pointer items-center gap-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <QrScanIcon size={14} />
                  {t("scanQrCode")}
                </button>
              </div>
              <div className="flex h-[54px] items-center gap-3 rounded-xl border border-white/15 bg-[#1b1b1b] px-5">
                <WalletIcon size={20} className="shrink-0 text-white/50" />
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={t("pasteAddress")}
                  spellCheck={false}
                  disabled={submitting}
                  className="tnum min-w-0 flex-1 bg-transparent font-sans text-[14px] text-white outline-none placeholder:text-white/40 disabled:opacity-50"
                />
              </div>
              {to.trim().length > 0 && (
                <div className="mt-1.5 text-[11px] font-normal text-white/45">
                  {detectedKind
                    ? t("detectedAddress", { kind: ADDRESS_KIND_LABEL[detectedKind] })
                    : t("unrecognizedAddress")}
                </div>
              )}
              {to.trim().length > 0 && !addrOk && (
                <div className="text-down mt-1 text-[12px] font-normal">
                  {requiredKind
                    ? t("addressKindMismatch", {
                        kind: ADDRESS_KIND_LABEL[requiredKind],
                        chain: destChainLabel,
                      })
                    : t("pickDestinationFirst")}
                </div>
              )}
            </div>

            {/* Summary */}
            {selectedDestination && value > 0 && addrOk && !overBalance && (
              <div className="mt-4">
                <span className="mb-2 block text-[13px] font-normal text-white/50">Summary</span>
                <div className="rounded-xl border border-white/15 bg-[#1b1b1b] px-5">
                  {feeUsd != null && feeUsd > 0 && (
                    <div className="flex items-center justify-between border-b border-white/8 py-3 text-[14px]">
                      <span className="text-white/50">{t("transactionFee")}</span>
                      <span className="tnum text-white/70">~${formatAmount(feeUsd)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-b border-white/8 py-3 text-[14px]">
                    <span className="text-white/50">Estimated Time</span>
                    <span className="text-white/70">{isDirectSend ? "~1 min" : "~2 min"}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 text-[14px]">
                    <span className="text-white/50">{t("recipientGets")}</span>
                    {isDirectSend ? (
                      <span className="tnum text-up font-medium">{previewOut}</span>
                    ) : quote.isError ? (
                      <span className="text-down">{t("unavailable")}</span>
                    ) : quote.isFetching || !quote.data ? (
                      <span className="text-white/45">{t("gettingRate")}</span>
                    ) : (
                      <span className="tnum text-up font-medium">{previewOut}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {quoteInput && quote.isError && (
              <div className="border-down/25 bg-down/10 mt-4 rounded-xl border px-5 py-4 text-[14px] font-normal text-white/75">
                {quoteErrorMessage(quote.error, t)}
              </div>
            )}

            {error && <div className="text-down mt-3 text-[13px] font-normal">{error}</div>}

            <button
              onClick={() => void submit()}
              disabled={!ready}
              className="mt-6 flex h-[52px] w-full cursor-pointer items-center justify-center rounded-full bg-[#ed2b07] font-sans text-[15px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t("sending")}
                </>
              ) : quoteInput && quote.isFetching ? (
                t("gettingRate")
              ) : (
                t("withdrawCryptoTitle")
              )}
            </button>
          </>
        )}
      </div>

      <QrScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(raw) => setTo(extractScannedAddress(raw))}
      />
    </div>
  );
}
