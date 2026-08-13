"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/ui/sheet-nav";
import { DepositStatus } from "@/components/ui/deposit-status";
import { NetworkTabs } from "@/features/funds/components/network-tabs";
import { TokenList } from "@/features/funds/components/token-list";
import { QrScanSheet } from "@/features/funds/components/qr-scan-sheet";
import { useSendToken } from "@/hooks/use-withdraw";
import { AssetIcon } from "@/components/ui/asset-icon";
import { CoinBadge } from "@/components/ui/coin-badge";
import { QrScanIcon } from "@/components/ui/icons";
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
  SETTLE_CHAINS,
  txExplorerUrl,
  type AddressKind,
  type DepositToken,
  type WithdrawDestination,
} from "@/lib/deposit";
import {
  DETECTABLE_ADDRESS_KINDS,
  detectAddressKind,
  extractScannedAddress,
} from "@/lib/wallet-address";
import { friendlyError } from "@/lib/errors";
import { formatAmount, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";

const DECIMAL = /^\d*\.?\d*$/;
const QUOTE_DEBOUNCE_MS = 450;

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
    // Flipped the moment a transfer is handed to the wallet. Past that point a
    // failure cannot be reported as "not sent": the transfer may already be
    // on-chain, and inviting a retry would send real money twice.
    let broadcasting = false;
    // One processing toast that resolves in place; dismissed if we bail on a
    // validation check before anything is actually sent.
    const toastId = toast.loading(t("sendingWithdrawal"));
    try {
      const sendAmount = toBaseUnits(amount, source.decimals);
      if (isDirectSend) {
        broadcasting = true;
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
        toast.success(t("withdrewAmount", { amount: formatAmount(value) }), { id: toastId });
        return;
      }
      if (!refundTo) {
        setError(t("walletNotReady"));
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
      broadcasting = true;
      const hash = await sendToken({
        network: sourceNetwork,
        tokenAddress: source.usdc,
        decimals: source.decimals,
        to: fresh.data.depositAddress,
        amount: sendAmount,
      });
      setTxHash(hash);
      setDepositRequestId(fresh.data.depositRequestId);
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
      if (broadcasting) {
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
        <span className="ws-display tnum text-[20px] text-white">${formatAmount(balance)}</span>
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
          <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
            <span>
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
                setAmount(
                  usdcHolding
                    ? fromBaseUnits(BigInt(usdcHolding.rawBalance), usdcHolding.decimals)
                    : "0"
                )
              }
              disabled={submitting}
              className="tnum cursor-pointer text-white/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("maxBalance", { amount: formatAmount(balance) })}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="ws-display shrink-0 text-[28px] text-white/70">$</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
              disabled={submitting}
              className="ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30 disabled:opacity-50"
            />
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
            : destSymbol
              ? t("withdrawAsset", { symbol: destSymbol })
              : t("withdrawCryptoTitle")}
      </button>

      <QrScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(raw) => setTo(extractScannedAddress(raw))}
      />
    </div>
  );
}
