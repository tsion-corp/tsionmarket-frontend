import { useTranslations } from "next-intl";

interface GasWarningProps {
  nativeSymbol: string;
  chainName: string;
}

// Shown when the embedded wallet holds no native gas token. Sponsorship is off,
// so a send would fail on-chain. The submit button stays blocked while this is up.
export function GasWarning({ nativeSymbol, chainName }: GasWarningProps) {
  const t = useTranslations("fundsFlow");
  return (
    <div className="border-down/25 bg-down/10 mt-3 rounded-[14px] border px-4 py-3">
      <div className="text-down text-[13px] font-semibold">{t("gasWarningTitle")}</div>
      <p className="mt-1 text-[12.5px] leading-normal font-normal text-white/70">
        {t("gasWarningBody", { symbol: nativeSymbol, chain: chainName })}
      </p>
    </div>
  );
}
