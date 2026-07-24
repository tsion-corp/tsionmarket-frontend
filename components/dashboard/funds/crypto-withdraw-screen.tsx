"use client";

import { useMemo, useState } from "react";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { HeldTokenSelect } from "@/components/dashboard/funds/held-token-select";
import { GasWarning } from "@/components/dashboard/funds/gas-warning";
import { useSendToken } from "@/hooks/use-withdraw";
import { usePortfolio, type TokenBalance } from "@/hooks/use-portfolio";
import { formatAmount, toBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";

const DECIMAL = /^\d*\.?\d*$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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
const isSolana = (network: string) => network === "solana-mainnet";

interface CryptoWithdrawScreenProps {
  onBack: () => void;
}

// Withdraw any held token — a stablecoin, native gas token, or other asset — to
// an external wallet on that token's own chain. A real self-custody send.
export function CryptoWithdrawScreen({ onBack }: CryptoWithdrawScreenProps) {
  const { tokens } = usePortfolio();
  const { sendToken, sending } = useSendToken();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const key = (t: TokenBalance) => `${t.symbol}-${t.network}`;
  const options = useMemo(() => tokens.filter((t) => t.balance > 0), [tokens]);
  const selected = options.find((t) => key(t) === selectedKey) ?? options[0] ?? null;

  const network = selected?.network ?? "";
  const balance = selected?.balance ?? 0;
  const nativeSym = NATIVE_SYMBOL[network] ?? "";
  const chainLabel = CHAIN_LABEL[network] ?? network;
  const hasGas = selected
    ? tokens.some(
        (t) =>
          t.network === network &&
          t.symbol.toUpperCase() === nativeSym.toUpperCase() &&
          t.balance > 0
      )
    : false;

  const addrOk = selected
    ? isSolana(network)
      ? SOL_ADDR.test(to.trim())
      : EVM_ADDR.test(to.trim())
    : false;
  const value = Number(amount) || 0;
  const overBalance = value > balance;
  const ready = Boolean(selected) && addrOk && value > 0 && !overBalance && !sending;

  const submit = async () => {
    if (!selected) return;
    setError(null);
    if (!hasGas) {
      setError(`You need a little ${nativeSym} on ${chainLabel} for the network fee`);
      return;
    }
    try {
      const hash = await sendToken({
        network: selected.network,
        tokenAddress: selected.address,
        decimals: selected.decimals,
        to: to.trim(),
        amount: toBaseUnits(amount, selected.decimals),
      });
      setTxHash(hash);
      toast.success(`Withdrew ${formatAmount(value)} ${selected.symbol}`);
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
        <div className="border-accent/20 bg-accent/8 mt-1 rounded-[14px] border px-4 py-4 text-[13px] leading-[1.5] font-normal text-white/80">
          Your {selected.symbol} is on its way to the address on {chainLabel}.
        </div>
        <p className="tnum mt-3 text-[12px] font-normal break-all text-white/45">Tx {txHash}</p>
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
        subtitle="Send any token you hold to an external wallet on its network."
        onBack={onBack}
      />

      <HeldTokenSelect
        options={options}
        selected={selected}
        onSelect={(t) => setSelectedKey(key(t))}
        label="Token to withdraw"
      />

      <div className="ws-inset mt-2 p-[15px]">
        <div className="mb-2 text-xs font-normal text-white/55">
          Destination address{selected ? ` (${chainLabel})` : ""}
        </div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={isSolana(network) ? "Solana address" : "0x address"}
          spellCheck={false}
          className="tnum w-full border-none bg-transparent text-[14px] break-all text-white outline-none"
        />
        {to.trim().length > 0 && !addrOk ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">
            Not a valid {chainLabel} address
          </div>
        ) : null}
      </div>

      <div className="ws-inset mt-2 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>Amount</span>
          <button
            onClick={() => setAmount(String(balance))}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            Balance {formatAmount(balance)} {selected?.symbol ?? ""}
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
            {selected?.symbol ?? ""}
          </span>
        </div>
        {overBalance ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">
            More than your {selected?.symbol} balance
          </div>
        ) : null}
      </div>

      {selected && !hasGas ? <GasWarning nativeSymbol={nativeSym} chainName={chainLabel} /> : null}
      {error ? <div className="text-down mt-3 text-[13px] font-normal">{error}</div> : null}

      <button
        onClick={() => void submit()}
        disabled={!ready}
        className="text-ink mt-[18px] w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending…" : `Withdraw ${selected?.symbol ?? ""}`}
      </button>
    </div>
  );
}
