"use client";

import { useState } from "react";
import { NetworkIcon } from "@/components/ui/network-icon";
import { ArrowRightIcon } from "@/components/ui/icons";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { AmountInput } from "@/components/dashboard/funds/amount-input";
import { GasWarning } from "@/components/dashboard/funds/gas-warning";
import { SuccessPanel } from "@/components/ui/success-panel";
import { useValidateAddress } from "@/hooks/use-deposit";
import { useGasStatus, useSendUsdc } from "@/hooks/use-withdraw";
import { usePortfolio } from "@/hooks/use-portfolio";
import {
  addressKindForChain,
  usdcBaseUnits,
  DIRECT_NETWORKS,
  type DirectNetwork,
} from "@/lib/deposit";
import { getWalletAddress } from "@/lib/user";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "@/lib/toast";

interface DirectWithdrawScreenProps {
  onBack: () => void;
  onDone: () => void;
}

type Phase = "pick" | "form" | "done";

export function DirectWithdrawScreen({ onBack, onDone }: DirectWithdrawScreenProps) {
  const { user } = usePrivy();
  const { tokens, refetch } = usePortfolio();
  const validate = useValidateAddress();
  const { sendUsdc, sending } = useSendUsdc();

  const [phase, setPhase] = useState<Phase>("pick");
  const [network, setNetwork] = useState<DirectNetwork | null>(null);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const gas = useGasStatus(network?.chainType ?? "ethereum");
  const available = DIRECT_NETWORKS.filter((n) => getWalletAddress(user, n.chainType) !== null);

  const balance = network
    ? (tokens.find((t) => t.symbol === "USDC" && t.network === network.networkKey)?.balance ?? 0)
    : 0;
  const numeric = Number(amount);
  const ready = Boolean(
    network && address.trim() && numeric > 0 && numeric <= balance && gas.hasGas
  );

  const send = async () => {
    if (!network) return;
    setError(null);
    try {
      const check = await validate.mutateAsync({
        address: address.trim(),
        chainType: addressKindForChain(network.chainId),
      });
      if (!check.valid) {
        setError(check.reason ?? "That address is not valid for this network.");
        return;
      }
      await sendUsdc({
        chainType: network.chainType,
        to: address.trim(),
        amount: usdcBaseUnits(amount),
      });
      toast.success("USDC sent.");
      refetch();
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The transfer was not sent.");
      toast.error("Withdrawal was not sent.");
    }
  };

  if (phase === "done" && network) {
    return (
      <SuccessPanel title="Sent" onDone={onDone}>
        {amount} USDC is on its way to your {network.chainName} address.
      </SuccessPanel>
    );
  }

  if (phase === "form" && network) {
    return (
      <div>
        <SheetNav
          title={`Withdraw on ${network.chainName}`}
          subtitle="Send USDC from your wallet to another address on the same network."
          onBack={() => setPhase("pick")}
        />
        <div className="ws-inset p-[15px]">
          <div className="mb-2 text-xs font-normal text-white/55">Destination address</div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={`${network.chainName} wallet address`}
            className="tnum w-full border-none bg-transparent text-[14px] break-all text-white outline-none"
          />
        </div>
        <div className="mt-2">
          <AmountInput value={amount} onChange={setAmount} balance={balance} symbol="USDC" />
        </div>

        {!gas.loading && !gas.hasGas ? (
          <GasWarning nativeSymbol={gas.nativeSymbol} chainName={network.chainName} />
        ) : null}

        {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}

        <button
          onClick={send}
          disabled={!ready || sending || validate.isPending}
          className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending || validate.isPending ? "Sending" : `Send ${amount || ""} USDC`.trim()}
        </button>
      </div>
    );
  }

  return (
    <div>
      <SheetNav
        title="Direct withdrawal"
        subtitle="Send USDC from your wallet to another address on the same network."
        onBack={onBack}
      />
      <div className="flex flex-col gap-2">
        {available.map((n) => (
          <button
            key={n.chainType}
            onClick={() => {
              setNetwork(n);
              setAddress("");
              setAmount("");
              setError(null);
              setPhase("form");
            }}
            className="flex w-full cursor-pointer items-center gap-3.5 rounded-[16px] border border-white/8 bg-white/4 px-4 py-3.5 text-left transition-colors hover:bg-white/8"
          >
            <NetworkIcon network={n.networkKey} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-[15px] font-semibold text-white">
                {n.chainName}
              </span>
              <span className="block text-[12.5px] font-normal text-white/55">
                Send {n.assetSymbol} on {n.chainName}
              </span>
            </span>
            <span className="text-white/35">
              <ArrowRightIcon size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
