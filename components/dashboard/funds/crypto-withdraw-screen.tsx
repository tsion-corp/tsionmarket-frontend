"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { DepositStatus } from "@/components/dashboard/funds/deposit-status";
import { NetworkTabs } from "@/components/dashboard/funds/network-tabs";
import { TokenList } from "@/components/dashboard/funds/token-list";
import { useSendToken } from "@/hooks/use-withdraw";
import { AssetIcon } from "@/components/ui/asset-icon";
import { CoinBadge } from "@/components/ui/coin-badge";
import {
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
  BASE_CHAIN_ID,
  SETTLE_CHAINS,
  txExplorerUrl,
  type AddressKind,
  type DepositToken,
  type WithdrawDestination,
} from "@/lib/deposit";
import { DETECTABLE_ADDRESS_KINDS, detectAddressKind } from "@/lib/wallet-address";
import { friendlyError } from "@/lib/errors";
import { formatAmount, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";

const DECIMAL = /^\d*\.?\d*$/;
const QUOTE_DEBOUNCE_MS = 450;

// The wallet balance is USDC on Base — everything deposited settles here, so
// it's the single source every withdrawal sends from.
const SOURCE = SETTLE_CHAINS.base;
const SOURCE_NETWORK = SOURCE.alchemyNetwork; // "base-mainnet"

// Dextopus's solver omits Base as a withdrawal destination (bridging Base->Base
// isn't a cross-chain route), but sending USDC-on-Base to an external Base
// address is a valid plain same-chain transfer (see isDirectSend). Inject it so
// Base still appears as a "withdraw to" network.
const BASE_USDC_DESTINATION: WithdrawDestination = {
  destinationChainId: BASE_CHAIN_ID,
  blockchain: "Base",
  currency: SOURCE.usdc,
  symbol: "USDC",
  decimals: SOURCE.decimals,
  addressKind: "evm",
  logoUrl: null,
};

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
// a "Change" affordance that reopens the full list.
function SelectedRow({
  glyph,
  title,
  onChange,
  disabled,
}: {
  glyph: React.ReactNode;
  title: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("fundsFlow");
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="ws-inset flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/4 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {glyph}
      <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-medium text-white">
        {title}
      </span>
      <span className="text-accent shrink-0 text-[12.5px] font-medium">{t("change")}</span>
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
  // Each picker collapses to its selected row once chosen, and reopens on
  // "Change". They start open so the first choice is one tap away.
  const [tokenOpen, setTokenOpen] = useState(true);
  const [networkOpen, setNetworkOpen] = useState(true);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [depositRequestId, setDepositRequestId] = useState<string | null>(null);

  // Debounce the amount that feeds the quote so we don't mint a fresh quote on
  // every keystroke; the submit button waits for this to catch up.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(amount), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [amount]);

  const usdc = tokens.find(
    (t) => t.network === SOURCE_NETWORK && t.symbol.toUpperCase() === "USDC"
  );
  const balance = usdc?.balance ?? 0;
  const refundTo = getWalletAddress(user, "ethereum");

  // Where the USDC can go, per Dextopus's solver for USDC-on-Base.
  const destinations = useWithdrawDestinations({
    chainId: BASE_CHAIN_ID,
    address: SOURCE.usdc,
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
    const hasBaseUsdc = solver.some(
      (d) =>
        d.destinationChainId === BASE_CHAIN_ID &&
        d.currency.toLowerCase() === SOURCE.usdc.toLowerCase()
    );
    return hasBaseUsdc ? solver : [BASE_USDC_DESTINATION, ...solver];
  }, [destinations.data]);

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
    selectedDestination.destinationChainId === BASE_CHAIN_ID &&
    selectedDestination.currency.toLowerCase() === SOURCE.usdc.toLowerCase();

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
          originChainId: BASE_CHAIN_ID,
          originAsset: SOURCE.usdc,
          destinationChainId: selectedDestination.destinationChainId,
          destinationAsset: selectedDestination.currency,
          amount: toBaseUnits(debouncedAmount, SOURCE.decimals).toString(),
          recipient: to.trim(),
          refundTo,
        }
      : null;
  const quote = useWithdrawQuote(quoteInput);

  // What the recipient receives: the live quote's amountOut for a route, or the
  // amount itself for a same-asset send.
  const previewOut = isDirectSend
    ? `${formatAmount(value)} USDC`
    : quote.data && selectedDestination
      ? `${fromBaseUnits(BigInt(quote.data.amountOut), selectedDestination.decimals)} ${selectedDestination.symbol}`
      : null;

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

  const status = useDepositStatus(depositRequestId);
  useTerminalToast(status.data, depositRequestId, {
    settled: t("withdrawalSettled"),
    failed: t("withdrawalFailedRefunded"),
    refunded: t("withdrawalRefunded"),
  });

  // The immediate tx is always the USDC send on Base.
  const baseChain = (allChains.data ?? []).find((c) => c.chainId === BASE_CHAIN_ID) ?? null;
  const originExplorerUrl = txHash
    ? txExplorerUrl(BASE_CHAIN_ID, baseChain?.blockExplorer ?? null, txHash)
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
      const sendAmount = toBaseUnits(amount, SOURCE.decimals);
      if (isDirectSend) {
        const hash = await sendToken({
          network: SOURCE_NETWORK,
          tokenAddress: SOURCE.usdc,
          decimals: SOURCE.decimals,
          to: to.trim(),
          amount: sendAmount,
        });
        setTxHash(hash);
        toast.success(t("withdrewAmount", { amount: formatAmount(value) }), { id: toastId });
        return;
      }
      if (!refundTo) {
        setError(t("baseWalletNotReady"));
        toast.dismiss(toastId);
        return;
      }
      // Refetch so we send to a deposit address with a full, unexpired window,
      // bound to the exact amount we're about to send.
      const fresh = await quote.refetch();
      if (fresh.isError || !fresh.data) {
        setError(quoteErrorMessage(fresh.error, t));
        toast.dismiss(toastId);
        return;
      }
      const hash = await sendToken({
        network: SOURCE_NETWORK,
        tokenAddress: SOURCE.usdc,
        decimals: SOURCE.decimals,
        to: fresh.data.depositAddress,
        amount: sendAmount,
      });
      setTxHash(hash);
      setDepositRequestId(fresh.data.depositRequestId);
      toast.success(
        t("sendingConversion", {
          amount: formatAmount(value),
          symbol: selectedDestination.symbol,
          chain: destChainLabel,
        }),
        { id: toastId }
      );
    } catch (e) {
      setError(friendlyError(e, t("withdrawalNotSentFallback")));
      toast.error(t("withdrawalNotSent"), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  if (txHash) {
    return (
      <div>
        <SheetNav
          title={t("withdrawalSentTitle")}
          subtitle={t("withdrawalSentSubtitle", { amount })}
          onBack={onBack}
        />
        <div className="border-accent/20 bg-accent/8 mt-1 rounded-[14px] border px-4 py-4 text-[13px] leading-normal font-normal text-white/80">
          {isDirectSend
            ? t("directSendNote", { chain: destChainLabel })
            : t("convertSendNote", {
                symbol: selectedDestination?.symbol ?? "",
                chain: destChainLabel,
              })}
        </div>
        {originExplorerUrl ? (
          <a
            href={originExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tnum text-accent mt-3 block text-[12px] font-normal break-all underline"
          >
            {t("txLabel", { hash: txHash })}
          </a>
        ) : (
          <p className="tnum mt-3 text-[12px] font-normal break-all text-white/45">
            {t("txLabel", { hash: txHash })}
          </p>
        )}
        {depositRequestId ? (
          <DepositStatus
            status={status.data?.status ?? "waiting"}
            executionStatus={status.data?.executionStatus}
            isError={status.isError}
            onRetry={() => status.refetch()}
          />
        ) : null}
        {destExplorerUrls.length > 0 ? (
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
        ) : null}
        <button
          onClick={onBack}
          className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
        >
          {t("done")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav
        title={t("withdrawCryptoTitle")}
        subtitle={t("withdrawCryptoSubtitle")}
        onBack={onBack}
      />

      <div className="ws-inset mt-1 flex items-center justify-between px-4 py-3.5">
        <span className="text-[13px] font-normal text-white/55">{t("availableBalance")}</span>
        <span className="ws-display tnum text-[20px] text-white">
          {formatAmount(balance)} <span className="text-[14px] text-white/60">USDC</span>
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-xs font-normal text-white/55">{t("withdrawAs")}</div>
        {destSymbol && !tokenOpen ? (
          <SelectedRow
            glyph={
              <AssetIcon
                sym={destSymbol}
                bg="#26262b"
                size={28}
                logo={selectedSymbolOption?.logoUrl}
              />
            }
            title={destSymbol}
            onChange={() => setTokenOpen(true)}
            disabled={submitting}
          />
        ) : (
          <TokenList
            tokens={symbolOptions}
            selected={selectedSymbolOption}
            onSelect={(t) => {
              // A picker can sit open while a submit runs; changing the
              // destination mid-send would diverge from the quoted route.
              if (submitting) return;
              setDestSymbol(t.symbol);
              setDestChainId(null);
              setTokenOpen(false);
              setNetworkOpen(true);
            }}
            loading={destinations.isPending}
            error={destinations.isError}
            onRetry={() => destinations.refetch()}
          />
        )}
      </div>

      {destSymbol ? (
        <div className="mt-3">
          <div className="mb-2 text-xs font-normal text-white/55">{t("onNetwork")}</div>
          {destChainId !== null && !networkOpen ? (
            <SelectedRow
              glyph={
                destChain?.logoUrl ? (
                  // Dextopus serves logos from varied hosts; next/image would reject them.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={destChain.logoUrl}
                    alt={destChainLabel}
                    width={26}
                    height={26}
                    loading="lazy"
                    className="shrink-0 rounded-md bg-white/6 object-cover"
                    style={{ width: 26, height: 26 }}
                  />
                ) : (
                  <CoinBadge
                    sym={destChainLabel.slice(0, 2).toUpperCase()}
                    bg="#26262b"
                    size={26}
                  />
                )
              }
              title={destChainLabel}
              onChange={() => setNetworkOpen(true)}
              disabled={submitting}
            />
          ) : (
            <NetworkTabs
              chains={allChains.data ?? []}
              eligibleChainIds={chainIdsForSymbol}
              filterOrigin={false}
              selectedId={destChainId}
              onSelect={(c) => {
                if (submitting) return;
                setDestChainId(c.chainId);
                setNetworkOpen(false);
              }}
              loading={allChains.isPending}
              error={allChains.isError}
              onRetry={() => allChains.refetch()}
            />
          )}
        </div>
      ) : null}

      {selectedDestination ? (
        <div className="ws-inset mt-3 p-[15px]">
          <div className="mb-2 text-xs font-normal text-white/55">
            {destChainLabel
              ? t("destinationAddressWithChain", { chain: destChainLabel })
              : t("destinationAddress")}
          </div>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("pasteAddress")}
            spellCheck={false}
            disabled={submitting}
            className="tnum w-full border-none bg-transparent text-[14px] break-all text-white outline-none disabled:opacity-50"
          />
          {to.trim().length > 0 ? (
            <div className="mt-1.5 text-[11px] font-normal text-white/45">
              {detectedKind
                ? t("detectedAddress", { kind: ADDRESS_KIND_LABEL[detectedKind] })
                : t("unrecognizedAddress")}
            </div>
          ) : null}
          {to.trim().length > 0 && !addrOk ? (
            <div className="text-down mt-1 text-[12px] font-normal">
              {requiredKind
                ? t("addressKindMismatch", {
                    kind: ADDRESS_KIND_LABEL[requiredKind],
                    chain: destChainLabel,
                  })
                : t("pickDestinationFirst")}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedDestination ? (
        <div className="ws-inset mt-2 p-[15px]">
          <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
            <span>{t("amount")}</span>
            <button
              // Fill from the exact base-unit balance: `balance` is a lossy
              // display float, and a max built from it can round above what
              // the wallet actually holds.
              onClick={() =>
                setAmount(usdc ? fromBaseUnits(BigInt(usdc.rawBalance), usdc.decimals) : "0")
              }
              disabled={submitting}
              className="tnum cursor-pointer text-white/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("maxBalance", { amount: formatAmount(balance) })}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
              disabled={submitting}
              className="ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30 disabled:opacity-50"
            />
            <span className="shrink-0 font-sans text-[14px] font-medium text-white/70">USDC</span>
          </div>
          {overBalance ? (
            <div className="text-down mt-1.5 text-[12px] font-normal">{t("overBalanceUsdc")}</div>
          ) : null}
        </div>
      ) : null}

      {/* Live conversion preview. */}
      {selectedDestination && value > 0 && addrOk && !overBalance ? (
        <div className="ws-inset mt-2 flex items-center justify-between px-4 py-3 text-[12.5px] font-normal">
          <span className="text-white/55">{t("recipientGets")}</span>
          {isDirectSend ? (
            <span className="tnum text-white/85">≈ {previewOut}</span>
          ) : quote.isError ? (
            <span className="text-down">{t("unavailable")}</span>
          ) : quote.isFetching || !quote.data ? (
            <span className="text-white/45">{t("gettingRate")}</span>
          ) : (
            <span className="tnum text-white/85">≈ {previewOut}</span>
          )}
        </div>
      ) : null}

      {quoteInput && quote.isError ? (
        <div className="border-down/25 bg-down/10 mt-2 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/75">
          {quoteErrorMessage(quote.error, t)}
        </div>
      ) : null}

      {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}

      <button
        onClick={() => void submit()}
        disabled={!ready}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? t("sending")
          : quoteInput && quote.isFetching
            ? t("gettingRate")
            : t("withdrawUsdc")}
      </button>
    </div>
  );
}
