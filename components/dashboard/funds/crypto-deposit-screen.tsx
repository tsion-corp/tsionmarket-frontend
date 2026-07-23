"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { ChainTokenPicker } from "@/components/dashboard/funds/chain-token-picker";
import { AddressPanel } from "@/components/dashboard/funds/address-panel";
import { DepositStatus } from "@/components/dashboard/funds/deposit-status";
import { ClockIcon } from "@/components/ui/icons";
import { useCreateQuote, useDepositStatus, useTerminalToast } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import { toBaseUnits } from "@/lib/trade/math";
import {
  depositProgress,
  formatCountdown,
  settlementFor,
  type DepositChain,
  type DepositToken,
} from "@/lib/deposit";

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const DEPOSIT_TOASTS = {
  settled: "Deposit settled. Your balance is updated.",
  failed: "Deposit failed. Any funds are refunded to the sender.",
  refunded: "Deposit refunded to the sending wallet.",
};

interface CryptoDepositScreenProps {
  onBack: () => void;
}

export function CryptoDepositScreen({ onBack }: CryptoDepositScreenProps) {
  const { user } = usePrivy();
  const { refetch } = usePortfolio();
  const quote = useCreateQuote();

  const [chain, setChain] = useState<DepositChain | null>(null);
  const [token, setToken] = useState<DepositToken | null>(null);
  const [amount, setAmount] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const depositRequestId = quote.data?.depositRequestId ?? null;
  const status = useDepositStatus(depositRequestId);

  const settlement =
    getWalletAddress(user, "ethereum") !== null
      ? settlementFor("ethereum")
      : settlementFor("solana");
  const recipient = getWalletAddress(user, settlement.chainType);

  useTerminalToast(status.data, depositRequestId, DEPOSIT_TOASTS, refetch);

  // Advance the clock once a second so the expiry countdown re-renders. The
  // deadline is derived from the quote submit time, so this only supplies "now".
  useEffect(() => {
    if (!quote.data) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [quote.data]);

  const amountValid = Number(amount) > 0;
  const ready = Boolean(chain && token && amountValid && recipient);

  const generate = () => {
    if (!chain || !token || !recipient) return;
    quote.mutate({
      originChainId: chain.chainId,
      destinationChainId: settlement.chainId,
      originAsset: token.address,
      destinationAsset: settlement.asset,
      amount: toBaseUnits(amount, token.decimals).toString(),
      recipient,
      static: false,
    });
  };

  if (quote.data && token && chain) {
    const expiresInSeconds = quote.data.expiresInSeconds ?? 0;
    const hasExpiry = expiresInSeconds > 0;
    // Clamp to the quote window so a stale first "now" never shows more time
    // than the address actually has.
    const deadlineMs = quote.submittedAt + expiresInSeconds * 1000;
    const remaining = Math.max(
      0,
      Math.min(expiresInSeconds, Math.round((deadlineMs - now) / 1000))
    );
    const stage = depositProgress(
      status.data?.status ?? quote.data.status,
      status.data?.executionStatus
    ).stage;
    const expired = hasExpiry && remaining <= 0 && stage === "waiting";

    if (expired) {
      return (
        <div>
          <SheetNav
            title="Address expired"
            subtitle="Deposit windows are time-limited to lock in a rate."
            onBack={onBack}
          />
          <div className="border-down/25 bg-down/10 mt-1 rounded-[14px] border px-4 py-4">
            <div className="text-down text-[13px] font-semibold">
              This address is no longer active
            </div>
            <p className="mt-1 text-[12.5px] leading-[1.5] font-normal text-white/70">
              Generate a fresh address before sending. Funds sent to the expired address may not be
              credited.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={quote.isPending}
            className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {quote.isPending ? "Creating new address" : "Generate a new address"}
          </button>
        </div>
      );
    }

    return (
      <div>
        <SheetNav
          title="Send your deposit"
          subtitle={`We convert it to USDC on ${settlement.chainName} automatically.`}
          onBack={onBack}
        />
        <AddressPanel
          address={quote.data.depositAddress}
          tokenSymbol={token.symbol}
          chainName={chain.name}
        />
        {hasExpiry ? (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] font-normal">
            <span className={remaining < 60 ? "text-[#f2b544]" : "text-white/50"}>
              <ClockIcon size={13} />
            </span>
            <span className={remaining < 60 ? "text-[#f2b544]" : "text-white/55"}>
              Address expires in <span className="tnum">{formatCountdown(remaining)}</span>
            </span>
          </div>
        ) : null}
        <DepositStatus
          status={status.data?.status ?? quote.data.status}
          executionStatus={status.data?.executionStatus}
          isError={status.isError}
          onRetry={() => status.refetch()}
        />
        <button
          onClick={() => quote.reset()}
          className="mt-4 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
        >
          New deposit
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav
        title="Deposit crypto"
        subtitle="Send almost any token from any chain. It arrives as USDC in your wallet."
        onBack={onBack}
      />
      <ChainTokenPicker
        chainLabel="From network"
        chain={chain}
        token={token}
        onChain={(c) => {
          setChain(c);
          setToken(null);
        }}
        onToken={setToken}
      />

      {token ? (
        <div className="ws-inset mt-2 p-[15px]">
          <div className="mb-[9px] text-xs font-normal text-white/55">Amount to send</div>
          <div className="flex items-center justify-between gap-3">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "" || DECIMAL_INPUT.test(next)) setAmount(next);
              }}
              placeholder="0.00"
              className="ws-serif tnum w-full border-none bg-transparent text-[26px] text-white outline-none placeholder:text-white/30"
            />
            <span className="font-sans text-[14px] font-medium text-white/70">{token.symbol}</span>
          </div>
        </div>
      ) : null}

      {quote.isError ? (
        <div className="text-down mt-3 text-[13px] font-normal">
          {quote.error.message}{" "}
          <button onClick={generate} className="text-accent cursor-pointer underline">
            Try again
          </button>
        </div>
      ) : null}

      <button
        onClick={generate}
        disabled={!ready || quote.isPending}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {quote.isPending ? "Creating deposit address" : "Get deposit address"}
      </button>
    </div>
  );
}
