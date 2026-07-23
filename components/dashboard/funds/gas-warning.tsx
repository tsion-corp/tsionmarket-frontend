interface GasWarningProps {
  nativeSymbol: string;
  chainName: string;
}

// Shown when the embedded wallet holds no native gas token. Sponsorship is off,
// so a send would fail on-chain. The submit button stays blocked while this is up.
export function GasWarning({ nativeSymbol, chainName }: GasWarningProps) {
  return (
    <div className="border-down/25 bg-down/10 mt-3 rounded-[14px] border px-4 py-3">
      <div className="text-down text-[13px] font-semibold">Network fee needed</div>
      <p className="mt-1 text-[12.5px] leading-[1.5] font-normal text-white/70">
        You need a little {nativeSymbol} in this wallet to cover the {chainName} network fee before
        you can send.
      </p>
    </div>
  );
}
