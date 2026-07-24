"use client";

import { useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSendUsdc } from "@/hooks/use-withdraw";
import { toast } from "@/lib/toast";
import { formatAmount, toBaseUnits } from "@/lib/trade/math";
import { SETTLE_CHAINS, SETTLE_ORDER, type SettleChain, type SettleChainKey } from "@/lib/deposit";

const DECIMAL = /^\d*\.?\d*$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validAddress(settle: SettleChain, addr: string): boolean {
  const a = addr.trim();
  return settle.chainType === "solana" ? SOL_ADDR.test(a) : EVM_ADDR.test(a);
}

// Transfers USDC from the user's wallet to any address on one of the four
// settlement chains. This is a real on-chain send (self-custody), gated on the
// user holding a little of the chain's native token for gas.
export function SendModal({ onConfirm }: { onConfirm: () => void }) {
  const { tokens } = usePortfolio();
  const { sendUsdc, sending } = useSendUsdc();
  const [settleKey, setSettleKey] = useState<SettleChainKey>("base");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const settle = SETTLE_CHAINS[settleKey];
  const usdcBalance =
    tokens.find((t) => t.network === settle.alchemyNetwork && t.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const hasGas = tokens.some(
    (t) =>
      t.network === settle.alchemyNetwork &&
      t.symbol.toUpperCase() === settle.nativeSymbol &&
      t.balance > 0
  );

  const value = Number(amount) || 0;
  const addrOk = validAddress(settle, to);
  const overBalance = value > usdcBalance;
  const ready = addrOk && value > 0 && !overBalance && !sending;

  const pickChain = (key: SettleChainKey) => {
    setSettleKey(key);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!hasGas) {
      setError(
        `You need a little ${settle.nativeSymbol} on ${settle.chainName} for the network fee`
      );
      return;
    }
    try {
      await sendUsdc({
        chainType: settle.chainType,
        to: to.trim(),
        amount: toBaseUnits(amount, settle.decimals),
        settle,
      });
      toast.success(`Sent ${formatAmount(value)} USDC`);
      onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    }
  };

  return (
    <div>
      <div className="ws-serif text-[24px] tracking-[-0.01em]">Transfer</div>
      <p className="mt-2 text-[13.5px] leading-[1.5] font-normal text-white/65">
        Transfer USDC to any wallet address. Choose the network to send on.
      </p>

      <div className="mt-[18px] flex gap-1.5">
        {SETTLE_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => pickChain(key)}
            className={`flex-1 cursor-pointer rounded-[11px] border px-2 py-2 font-sans text-[12.5px] font-semibold transition-colors ${
              key === settleKey
                ? "border-accent/40 bg-accent/14 text-white"
                : "border-white/10 bg-white/4 text-white/60 hover:text-white"
            }`}
          >
            {SETTLE_CHAINS[key].chainName}
          </button>
        ))}
      </div>

      <div className="ws-inset mt-3 p-[15px]">
        <div className="mb-2 text-xs font-normal text-white/55">Recipient wallet</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={settle.chainType === "solana" ? "Solana address" : "0x address"}
          spellCheck={false}
          className="w-full border-none bg-transparent font-sans text-[15px] break-all text-white outline-none"
        />
        {to.trim().length > 0 && !addrOk ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">
            Not a valid {settle.chainName} address
          </div>
        ) : null}
      </div>

      <div className="ws-inset mt-3 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>Amount</span>
          <button
            onClick={() => setAmount(String(usdcBalance))}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            Balance {formatAmount(usdcBalance)} USDC
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
          <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
            <AssetIcon sym="USDC" bg="#2775CA" size={22} />
            <span className="font-sans text-[13.5px] font-medium">USDC</span>
          </span>
        </div>
        {overBalance ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">
            More than your USDC balance on {settle.chainName}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="border-down/30 bg-down/10 text-down mt-3 rounded-[12px] border p-3 text-[12.5px] font-medium">
          {error}
        </div>
      ) : null}

      <button
        onClick={() => void submit()}
        disabled={!ready}
        className={`mt-[18px] w-full rounded-[14px] p-3.5 font-sans text-[15px] font-semibold ${
          ready
            ? "text-ink cursor-pointer bg-white hover:opacity-90"
            : "cursor-not-allowed bg-white/10 text-white/40"
        }`}
      >
        {sending ? "Sending…" : "Transfer USDC"}
      </button>
    </div>
  );
}
