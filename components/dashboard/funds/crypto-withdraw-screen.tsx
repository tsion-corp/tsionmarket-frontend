"use client";

import { useState } from "react";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { ChainTokenPicker } from "@/components/dashboard/funds/chain-token-picker";
import { AmountInput } from "@/components/dashboard/funds/amount-input";
import { GasWarning } from "@/components/dashboard/funds/gas-warning";
import { DepositStatus } from "@/components/dashboard/funds/deposit-status";
import {
  useCreateQuote,
  useDepositStatus,
  useTerminalToast,
  useValidateAddress,
} from "@/hooks/use-deposit";
import { useGasStatus, useSendUsdc } from "@/hooks/use-withdraw";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fromBaseUnits } from "@/lib/trade/math";
import {
  DIRECT_NETWORKS,
  addressKindForChain,
  usdcBaseUnits,
  type DepositChain,
  type DepositToken,
} from "@/lib/deposit";
import { toast } from "@/lib/toast";

// Withdrawals draw from the user's USDC on Base, the primary settlement balance.
const SOURCE = DIRECT_NETWORKS.find((n) => n.chainType === "ethereum") ?? DIRECT_NETWORKS[0];

const WITHDRAW_TOASTS = {
  settled: "Withdrawal complete.",
  failed: "Withdrawal failed. Any funds are refunded to your wallet.",
  refunded: "Withdrawal refunded to your wallet.",
};

interface CryptoWithdrawScreenProps {
  onBack: () => void;
}

type Phase = "form" | "review" | "status";

export function CryptoWithdrawScreen({ onBack }: CryptoWithdrawScreenProps) {
  const { tokens, refetch } = usePortfolio();
  const quote = useCreateQuote();
  const validate = useValidateAddress();
  const status = useDepositStatus(quote.data?.depositRequestId ?? null);
  const gas = useGasStatus("ethereum");
  const { sendUsdc, sending } = useSendUsdc();

  const [phase, setPhase] = useState<Phase>("form");
  const [chain, setChain] = useState<DepositChain | null>(null);
  const [token, setToken] = useState<DepositToken | null>(null);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usdcBalance =
    tokens.find((t) => t.symbol === "USDC" && t.network === SOURCE.networkKey)?.balance ?? 0;
  const numeric = Number(amount);
  const amountOk = numeric > 0 && numeric <= usdcBalance;
  const formReady = Boolean(chain && token && address.trim() && amountOk && gas.hasGas);

  useTerminalToast(status.data, quote.data?.depositRequestId ?? null, WITHDRAW_TOASTS, refetch);

  const review = async () => {
    if (!chain || !token) return;
    setError(null);
    try {
      const check = await validate.mutateAsync({
        address: address.trim(),
        chainType: addressKindForChain(chain.chainId),
      });
      if (!check.valid) {
        setError(check.reason ?? "That address is not valid for this network.");
        return;
      }
      await quote.mutateAsync({
        originChainId: SOURCE.chainId,
        destinationChainId: chain.chainId,
        originAsset: SOURCE.asset,
        destinationAsset: token.address,
        amount: usdcBaseUnits(amount).toString(),
        recipient: address.trim(),
        static: false,
      });
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const confirm = async () => {
    if (!quote.data) return;
    setError(null);
    try {
      const hash = await sendUsdc({
        chainType: "ethereum",
        to: quote.data.depositAddress,
        amount: usdcBaseUnits(amount),
      });
      setTxHash(hash);
      setPhase("status");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The transfer was not sent.");
      toast.error("Withdrawal was not sent.");
    }
  };

  if (phase === "status" && quote.data && token && chain) {
    return (
      <div>
        <SheetNav
          title="Withdrawal sent"
          subtitle={`On its way to your ${chain.name} address.`}
          onBack={onBack}
        />
        <DepositStatus
          status={status.data?.status ?? quote.data.status}
          executionStatus={status.data?.executionStatus}
          isError={status.isError}
          onRetry={() => status.refetch()}
        />
        {txHash ? (
          <p className="tnum mt-3 text-[12px] font-normal break-all text-white/45">Tx {txHash}</p>
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

  if (phase === "review" && quote.data && token && chain) {
    const receive = fromBaseUnits(
      BigInt(quote.data.minAmountOut || quote.data.amountOut || "0"),
      token.decimals
    );
    return (
      <div>
        <SheetNav
          title="Confirm withdrawal"
          subtitle="Check the details before you send."
          onBack={() => setPhase("form")}
        />
        <div className="ws-inset flex flex-col gap-3 p-4 text-[13.5px] font-normal text-white/60">
          <div className="flex justify-between gap-4">
            <span>You send</span>
            <span className="text-white">{amount} USDC on Base</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>They receive (min)</span>
            <span className="text-white">
              {receive} {token.symbol}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Network</span>
            <span className="text-white">{chain.name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>To</span>
            <span className="tnum text-right break-all text-white">{address.trim()}</span>
          </div>
        </div>
        {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}
        <button
          onClick={confirm}
          disabled={sending}
          className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending" : `Send ${amount} USDC`}
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav
        title="Withdraw crypto"
        subtitle="Send to any wallet on almost any chain. We convert from your USDC."
        onBack={onBack}
      />
      <ChainTokenPicker
        chainLabel="To network"
        chain={chain}
        token={token}
        onChain={(c) => {
          setChain(c);
          setToken(null);
        }}
        onToken={setToken}
      />

      <div className="ws-inset mt-2 p-[15px]">
        <div className="mb-2 text-xs font-normal text-white/55">Destination address</div>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Paste the wallet address"
          className="tnum w-full border-none bg-transparent text-[14px] break-all text-white outline-none"
        />
      </div>

      <div className="mt-2">
        <AmountInput value={amount} onChange={setAmount} balance={usdcBalance} symbol="USDC" />
      </div>

      {!gas.loading && !gas.hasGas ? (
        <GasWarning nativeSymbol={gas.nativeSymbol} chainName="Base" />
      ) : null}

      {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}

      <button
        onClick={review}
        disabled={!formReady || validate.isPending || quote.isPending}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {validate.isPending || quote.isPending ? "Checking route" : "Review withdrawal"}
      </button>
    </div>
  );
}
