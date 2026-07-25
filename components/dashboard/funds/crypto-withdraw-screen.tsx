"use client";

import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { HeldTokenSelect } from "@/components/dashboard/funds/held-token-select";
import { GasWarning } from "@/components/dashboard/funds/gas-warning";
import { DepositStatus } from "@/components/dashboard/funds/deposit-status";
import { NetworkTabs } from "@/components/dashboard/funds/network-tabs";
import { TokenList } from "@/components/dashboard/funds/token-list";
import { useSendToken, useReroutedWithdraw } from "@/hooks/use-withdraw";
import {
  useDepositChains,
  useDepositStatus,
  useOriginEligibleKeys,
  useTerminalToast,
  useWithdrawDestinations,
} from "@/hooks/use-deposit";
import { usePortfolio, type TokenBalance } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import {
  chainIdForNetwork,
  eligibilityKey,
  txExplorerUrl,
  type AddressKind,
  type DepositToken,
  type WalletChainType,
  type WithdrawDestination,
} from "@/lib/deposit";
import { detectAddressKind } from "@/lib/wallet-address";
import { formatAmount, toBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";

const DECIMAL = /^\d*\.?\d*$/;

const NATIVE_SYMBOL: Record<string, string> = {
  "base-mainnet": "ETH",
  "arb-mainnet": "ETH",
  "polygon-mainnet": "POL",
  "solana-mainnet": "SOL",
};
const CHAIN_LABEL: Record<string, string> = {
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
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
const isSolanaNetwork = (network: string) => network === "solana-mainnet";

interface CryptoWithdrawScreenProps {
  onBack: () => void;
}

// Withdraw any held token to an external wallet. A token Dextopus recognizes
// as a deposit origin (checked live, not hardcoded to USDC) can reroute to a
// different token and/or chain by reusing the deposit pipeline in reverse:
// the rest — native gas tokens, or a token Dextopus doesn't route — sends
// directly on its own chain, self-custody.
export function CryptoWithdrawScreen({ onBack }: CryptoWithdrawScreenProps) {
  const { user } = usePrivy();
  const { tokens } = usePortfolio();
  const { sendToken, sending } = useSendToken();
  const { withdraw: withdrawRerouted, quoting, sending: reroutedSending } = useReroutedWithdraw();
  const allChains = useDepositChains();
  const originEligible = useOriginEligibleKeys();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [destSymbol, setDestSymbol] = useState<string | null>(null);
  const [destChainId, setDestChainId] = useState<number | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [depositRequestId, setDepositRequestId] = useState<string | null>(null);

  const key = (t: TokenBalance) => `${t.symbol}-${t.network}`;
  const options = useMemo(() => tokens.filter((t) => t.balance > 0), [tokens]);
  const selected = options.find((t) => key(t) === selectedKey) ?? options[0] ?? null;

  const network = selected?.network ?? "";
  const balance = selected?.balance ?? 0;
  const nativeSym = NATIVE_SYMBOL[network] ?? "";
  const sourceChainLabel = CHAIN_LABEL[network] ?? network;
  const originChainId = chainIdForNetwork(network);
  const originChainType: WalletChainType = isSolanaNetwork(network) ? "solana" : "ethereum";
  const refundTo = getWalletAddress(user, originChainType);

  // Only a token Dextopus's live catalog recognizes as a deposit origin can
  // reroute to a different chain/token. Native gas balances (address is null)
  // never qualify — everything else falls back to a direct same-chain send.
  const isReroutable =
    Boolean(selected) &&
    selected!.address !== null &&
    originChainId !== null &&
    originEligible.data?.has(eligibilityKey(originChainId, selected!.address!)) === true;

  const destinationsOrigin =
    isReroutable && selected?.address && originChainId !== null
      ? { chainId: originChainId, address: selected.address }
      : null;
  const destinations = useWithdrawDestinations(destinationsOrigin);

  // One row per destination symbol (e.g. "USDC" once, even though it exists on
  // many chains) — picking the coin before the network matches the flow most
  // exchanges use, and reuses TokenList's search/list UI as-is.
  const symbolOptions = useMemo(() => {
    const list = destinations.data ?? [];
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
  }, [destinations.data]);
  const destSymbolAddress = symbolOptions.find((o) => o.symbol === destSymbol)?.address ?? null;

  const chainIdsForSymbol = useMemo(() => {
    const list = destinations.data ?? [];
    return new Set(list.filter((d) => d.symbol === destSymbol).map((d) => d.destinationChainId));
  }, [destinations.data, destSymbol]);

  const selectedDestination = useMemo(() => {
    const list = destinations.data ?? [];
    return (
      list.find((d) => d.symbol === destSymbol && d.destinationChainId === destChainId) ?? null
    );
  }, [destinations.data, destSymbol, destChainId]);

  const destChain = (allChains.data ?? []).find((c) => c.chainId === destChainId) ?? null;
  const destChainLabel = isReroutable
    ? (destChain?.name ?? selectedDestination?.blockchain ?? "")
    : sourceChainLabel;
  const destSymbolLabel = isReroutable
    ? (selectedDestination?.symbol ?? destSymbol ?? "")
    : (selected?.symbol ?? "");

  // The tx hash we get back immediately is always the send on the origin
  // chain — direct sends and rerouted ones alike.
  const originChain = (allChains.data ?? []).find((c) => c.chainId === originChainId) ?? null;
  const originExplorerUrl =
    txHash && originChainId !== null
      ? txExplorerUrl(originChainId, originChain?.blockExplorer ?? null, txHash)
      : null;

  const detectedKind = useMemo(() => detectAddressKind(to), [to]);
  const requiredKind: AddressKind | null = isReroutable
    ? (selectedDestination?.addressKind ?? null)
    : originChainType === "solana"
      ? "solana"
      : "evm";
  const addrOk = Boolean(selected) && detectedKind !== null && detectedKind === requiredKind;

  const hasGas = selected
    ? tokens.some(
        (t) =>
          t.network === network &&
          t.symbol.toUpperCase() === nativeSym.toUpperCase() &&
          t.balance > 0
      )
    : false;

  const value = Number(amount) || 0;
  const overBalance = value > balance;
  const busy = sending || quoting || reroutedSending;
  const destinationReady = !isReroutable || Boolean(selectedDestination);
  const ready =
    Boolean(selected) &&
    destinationReady &&
    addrOk &&
    value > 0 &&
    !overBalance &&
    !busy &&
    (!isReroutable || Boolean(refundTo));

  const status = useDepositStatus(depositRequestId);
  useTerminalToast(status.data, depositRequestId, {
    settled: "Withdrawal settled",
    failed: "Withdrawal failed, funds were refunded",
    refunded: "Withdrawal refunded",
  });

  // Once Dextopus settles a rerouted withdrawal, its status also carries the
  // destination-chain tx — a different hash on a different chain than the
  // origin send above.
  const destExplorerUrls =
    isReroutable && destChainId !== null
      ? (status.data?.destinationTransactionHashes ?? [])
          .map((hash) => txExplorerUrl(destChainId, destChain?.blockExplorer ?? null, hash))
          .filter((url): url is string => url !== null)
      : [];

  const submit = async () => {
    if (!selected) return;
    setError(null);
    if (!hasGas) {
      setError(`You need a little ${nativeSym} on ${sourceChainLabel} for the network fee`);
      return;
    }
    try {
      if (isReroutable) {
        if (!selectedDestination || originChainId === null || !selected.address) {
          setError("Pick a coin and network to withdraw to.");
          return;
        }
        if (!refundTo) {
          setError("Your wallet on this network isn't ready yet.");
          return;
        }
        const result = await withdrawRerouted({
          originNetwork: selected.network,
          originChainId,
          originTokenAddress: selected.address,
          originDecimals: selected.decimals,
          destinationChainId: selectedDestination.destinationChainId,
          destinationAsset: selectedDestination.currency,
          to: to.trim(),
          amount: toBaseUnits(amount, selected.decimals),
          refundTo,
        });
        setTxHash(result.txHash);
        setDepositRequestId(result.depositRequestId);
        toast.success(
          `Sending ${formatAmount(value)} ${selected.symbol} → ${selectedDestination.symbol} on ${destChainLabel}…`
        );
      } else {
        const hash = await sendToken({
          network: selected.network,
          tokenAddress: selected.address,
          decimals: selected.decimals,
          to: to.trim(),
          amount: toBaseUnits(amount, selected.decimals),
        });
        setTxHash(hash);
        toast.success(`Withdrew ${formatAmount(value)} ${selected.symbol}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The withdrawal was not sent.");
      toast.error("Withdrawal was not sent.");
    }
  };

  if (txHash && selected) {
    return (
      <div>
        <SheetNav
          title="Withdrawal sent"
          subtitle={`${amount} ${selected.symbol} on its way.`}
          onBack={onBack}
        />
        <div className="border-accent/20 bg-accent/8 mt-1 rounded-[14px] border px-4 py-4 text-[13px] leading-normal font-normal text-white/80">
          {isReroutable
            ? `Converting to ${destSymbolLabel} and sending to the address on ${destChainLabel}.`
            : `Your ${selected.symbol} is on its way to the address on ${destChainLabel}.`}
        </div>
        {originExplorerUrl ? (
          <a
            href={originExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tnum text-accent mt-3 block text-[12px] font-normal break-all underline"
          >
            Tx {txHash}
          </a>
        ) : (
          <p className="tnum mt-3 text-[12px] font-normal break-all text-white/45">Tx {txHash}</p>
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
                View on {destChainLabel}
              </a>
            ))}
          </div>
        ) : null}
        <button
          onClick={onBack}
          className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav
        title="Withdraw crypto"
        subtitle="Send any token you hold to an external wallet."
        onBack={onBack}
      />

      <HeldTokenSelect
        options={options}
        selected={selected}
        onSelect={(t) => {
          setSelectedKey(key(t));
          setDestSymbol(null);
          setDestChainId(null);
        }}
        label="Token to withdraw"
      />

      {isReroutable ? (
        <>
          <div className="mt-3">
            <div className="mb-2 text-xs font-normal text-white/55">Withdraw as</div>
            <TokenList
              tokens={symbolOptions}
              selectedAddress={destSymbolAddress}
              onSelect={(t) => {
                setDestSymbol(t.symbol);
                setDestChainId(null);
              }}
              loading={destinations.isPending}
              error={destinations.isError}
              onRetry={() => destinations.refetch()}
            />
          </div>

          {destSymbol ? (
            <div className="mt-3">
              <div className="mb-2 text-xs font-normal text-white/55">On network</div>
              <NetworkTabs
                chains={allChains.data ?? []}
                eligibleChainIds={chainIdsForSymbol}
                filterOrigin={false}
                selectedId={destChainId}
                onSelect={(c) => setDestChainId(c.chainId)}
                loading={allChains.isPending}
                error={allChains.isError}
                onRetry={() => allChains.refetch()}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {selected && destinationReady ? (
        <div className="ws-inset mt-3 p-[15px]">
          <div className="mb-2 text-xs font-normal text-white/55">
            Destination address{destChainLabel ? ` (${destChainLabel})` : ""}
          </div>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Paste a wallet address"
            spellCheck={false}
            className="tnum w-full border-none bg-transparent text-[14px] break-all text-white outline-none"
          />
          {to.trim().length > 0 ? (
            <div className="mt-1.5 text-[11px] font-normal text-white/45">
              {detectedKind
                ? `Detected: ${ADDRESS_KIND_LABEL[detectedKind]} address`
                : "Unrecognized address format"}
            </div>
          ) : null}
          {to.trim().length > 0 && !addrOk ? (
            <div className="text-down mt-1 text-[12px] font-normal">
              {requiredKind
                ? `This doesn't look like a ${ADDRESS_KIND_LABEL[requiredKind]} address, needed for ${destChainLabel}.`
                : "Pick a destination network first."}
            </div>
          ) : null}
        </div>
      ) : null}

      {selected && destinationReady ? (
        <div className="ws-inset mt-2 p-[15px]">
          <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
            <span>Amount</span>
            <button
              onClick={() => setAmount(String(balance))}
              className="tnum cursor-pointer text-white/55 hover:text-white"
            >
              Balance {formatAmount(balance)} {selected.symbol}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
              className="ws-serif tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 font-sans text-[14px] font-medium text-white/70">
              {selected.symbol}
            </span>
          </div>
          {overBalance ? (
            <div className="text-down mt-1.5 text-[12px] font-normal">
              More than your {selected.symbol} balance
            </div>
          ) : null}
        </div>
      ) : null}

      {selected && !hasGas ? (
        <GasWarning nativeSymbol={nativeSym} chainName={sourceChainLabel} />
      ) : null}
      {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}

      <button
        onClick={() => void submit()}
        disabled={!ready}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {quoting ? "Getting quote…" : busy ? "Sending…" : `Withdraw ${selected?.symbol ?? ""}`}
      </button>
    </div>
  );
}
